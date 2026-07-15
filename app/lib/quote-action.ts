"use server";

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PublicKey } from "@solana/web3.js";
import { compilePredicate } from "../../services/predicate/src/compiler.js";
import { computeQuote, type BookState, type Outcome, type TxlineWinnerPacket } from "../../services/quote-engine/src/engine.js";
import { ASSET_MINT, FIXTURE_ID } from "./config.js";
import { bucketHashFor, bucketPda } from "./pda.js";
import { VAULT, getProgram, newConnection } from "./surety-client.js";

const ODDS_SNAPSHOT_PATH = "data/recordings/phase0-18237038-odds-snapshot.raw.json";

export type QuoteRequestInput = {
  outcome: Outcome;
  coverage: string; // decimal string in whole test-USDC (e.g. "100")
};

export type QuoteResult = {
  predicateText: string;
  predicateHash: string;
  predicateBytesHex: string;
  predicateLen: number;
  bucketHash: string;
  quoteHash: string;
  verdict: "ACCEPT" | "SURCHARGE" | "REJECT";
  probabilityPpm: number;
  premium: string | null;
  coverage: string;
  surchargeBps: number | null;
  projectedUtilizationBps: number;
  assetMint: string;
  assetDecimals: number;
};

export async function requestQuote(input: QuoteRequestInput): Promise<QuoteResult> {
  const coverage = BigInt(Math.round(Number(input.coverage) * 1_000_000));
  if (coverage <= 0n) throw new Error("coverage must be greater than zero");

  const predicateText = `outcome(${FIXTURE_ID}) == ${input.outcome}`;
  const compiled = compilePredicate(predicateText);

  const sourceBytes = await readFile(ODDS_SNAPSHOT_PATH);
  const packets = JSON.parse(sourceBytes.toString()) as TxlineWinnerPacket[];
  const packet = packets.find((p) => p.SuperOddsType === "1X2_PARTICIPANT_RESULT" && p.MarketPeriod === null);
  if (!packet) throw new Error("no full-match 1X2 packet found in recorded odds snapshot");
  const packetSourceSha256 = createHash("sha256").update(sourceBytes).digest("hex");

  const bucketHashHex = createHash("sha256").update(bucketHashFor(FIXTURE_ID, input.outcome)).digest("hex");

  const connection = newConnection();
  const program = getProgram(connection, { publicKey: VAULT });

  const vault = await program.account.vault.fetch(VAULT);

  const bucketAddress = bucketPda(Buffer.from(bucketHashHex, "hex"));
  let bucketExposure = 0n;
  try {
    const bucket = await program.account.exposureBucket.fetch(bucketAddress);
    bucketExposure = BigInt(bucket.lockedExposure.toString());
  } catch {
    // Bucket PDA is created lazily on first issuance; absent means zero exposure.
    bucketExposure = 0n;
  }

  const book: BookState = {
    vault: VAULT.toBase58(),
    totalCapital: BigInt(vault.totalCapital.toString()),
    freeReserves: BigInt(vault.freeReserves.toString()),
    lockedLiabilities: BigInt(vault.lockedLiabilities.toString()),
    bucketHash: bucketHashHex,
    bucketExposure,
    maxBucketBps: vault.maxBucketBps,
  };

  const quote = computeQuote({
    packet,
    packetSourceSha256,
    predicateHash: compiled.hash,
    outcome: input.outcome,
    coverage,
    marginBps: vault.marginBps,
    book,
  });

  return {
    predicateText: compiled.canonicalText,
    predicateHash: compiled.hash,
    predicateBytesHex: Buffer.from(compiled.canonicalBytes).toString("hex"),
    predicateLen: compiled.canonicalBytes.length,
    bucketHash: bucketHashHex,
    quoteHash: quote.quoteHash,
    verdict: quote.verdict,
    probabilityPpm: quote.probabilityPpm,
    premium: quote.premium,
    coverage: coverage.toString(),
    surchargeBps: quote.surchargeBps,
    projectedUtilizationBps: quote.projectedUtilizationBps,
    assetMint: ASSET_MINT.toBase58(),
    assetDecimals: 6,
  };
}

export async function getVaultStats() {
  const connection = newConnection();
  const program = getProgram(connection, { publicKey: VAULT });
  const vault = await program.account.vault.fetch(VAULT);
  const totalCapital = BigInt(vault.totalCapital.toString());
  const shareMintInfo = await connection.getParsedAccountInfo(new PublicKey(String(vault.shareMint)), "confirmed");
  const supplyRaw = (shareMintInfo.value?.data as { parsed?: { info?: { supply?: string } } })?.parsed?.info?.supply ?? "0";
  const supply = BigInt(supplyRaw);
  return {
    totalCapital: totalCapital.toString(),
    freeReserves: vault.freeReserves.toString(),
    lockedLiabilities: vault.lockedLiabilities.toString(),
    policyCount: vault.policyCount.toString(),
    maxBucketBps: vault.maxBucketBps,
    epochSeconds: vault.epochSeconds.toString(),
    shareSupply: supply.toString(),
    sharePriceMicros: supply === 0n ? "1000000" : ((totalCapital * 1_000_000n) / supply).toString(),
  };
}
