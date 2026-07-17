"use server";

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PublicKey } from "@solana/web3.js";
import { compilePredicate } from "../../services/predicate/src/compiler.js";
import { oddsMessageHash, oddsMessageKey } from "@surety-tx/txline-verify";
import { verifiedQuoteHash } from "../../services/odds-validation/src/quote-commitment.js";
import { syncValidatedMarket } from "../../services/odds-validation/src/sync.js";
import { computeQuote, type BookState, type Outcome, type TxlineWinnerPacket } from "../../services/quote-engine/src/engine.js";
import { ASSET_MINT, FIXTURE_ID } from "./config.js";
import { bucketHashFor, bucketPda, validatedFixturePda, validatedOddsPda } from "./pda.js";
import { VAULT, getProgram, newConnection } from "./surety-client.js";

const ODDS_SNAPSHOT_FILE =
  process.env.SURETY_ODDS_SNAPSHOT_FILE ?? "phase0-18237038-odds-snapshot.raw.json";
if (path.basename(ODDS_SNAPSHOT_FILE) !== ODDS_SNAPSHOT_FILE) {
  throw new Error("SURETY_ODDS_SNAPSHOT_FILE must be a filename inside data/recordings");
}
const ODDS_SNAPSHOT_PATH = path.join(process.cwd(), "data", "recordings", ODDS_SNAPSHOT_FILE);
const REQUIRE_VALIDATED_ODDS = process.env.SURETY_REQUIRE_VALIDATED_ODDS === "1";

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
  auditQuoteHash: string;
  validatedOddsMessageKeyHex: string | null;
  validationMode: "txline-cpi" | "recorded-source";
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

  const synced = REQUIRE_VALIDATED_ODDS ? await syncValidatedMarket(FIXTURE_ID) : null;
  const sourceBytes = synced?.snapshotBytes ?? await readFile(ODDS_SNAPSHOT_PATH);
  const packets = synced ? [synced.packet] : JSON.parse(sourceBytes.toString()) as TxlineWinnerPacket[];
  const packet = packets.find((p) => p.SuperOddsType === "1X2_PARTICIPANT_RESULT" && p.MarketPeriod === null);
  if (!packet) throw new Error("no full-match 1X2 packet found in the TxLINE odds snapshot");
  if (BigInt(packet.FixtureId) !== FIXTURE_ID) throw new Error("odds snapshot fixture does not match the configured fixture");
  const packetSourceSha256 = createHash("sha256").update(sourceBytes).digest("hex");

  const bucketHashHex = createHash("sha256").update(bucketHashFor(FIXTURE_ID, input.outcome)).digest("hex");

  const connection = newConnection();
  const program = getProgram(connection, { publicKey: VAULT });

  const vault = await program.account.vault.fetch(VAULT);

  const bucketAddress = bucketPda(Buffer.from(bucketHashHex, "hex"));
  const bucket = await program.account.exposureBucket.fetchNullable(bucketAddress);
  const bucketExposure = BigInt(bucket?.lockedExposure.toString() ?? "0");

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

  let policyQuoteHash = quote.quoteHash;
  let validatedOddsMessageKeyHex: string | null = null;
  if (REQUIRE_VALIDATED_ODDS && quote.premium !== null) {
    const messageKey = oddsMessageKey(packet.MessageId);
    const receiptAddress = validatedOddsPda(messageKey);
    const fixtureReceiptAddress = validatedFixturePda(FIXTURE_ID);
    const fixtureReceipt = synced?.fixtureReceipt ?? await program.account.validatedFixture.fetch(fixtureReceiptAddress);
    const receipt = synced?.oddsReceipt ?? await program.account.validatedOdds.fetch(receiptAddress);
    if (BigInt(fixtureReceipt.fixtureId.toString()) !== FIXTURE_ID) {
      throw new Error("validated fixture receipt has the wrong fixture");
    }
    if (BigInt(receipt.fixtureId.toString()) !== FIXTURE_ID) throw new Error("validated odds receipt has the wrong fixture");
    if (Number(receipt.oddsTimestampMs.toString()) !== packet.Ts) throw new Error("validated odds receipt has the wrong timestamp");
    if (!Buffer.from(receipt.messageIdHash as number[]).equals(oddsMessageHash(packet.MessageId))) {
      throw new Error("validated odds receipt has the wrong message hash");
    }
    if (Date.now() - packet.Ts > 15 * 60 * 1_000 || packet.Ts - Date.now() > 30 * 1_000) {
      throw new Error("validated odds receipt is outside the on-chain freshness window");
    }
    policyQuoteHash = verifiedQuoteHash({
      vault: VAULT,
      validatedFixture: fixtureReceiptAddress,
      validatedOdds: receiptAddress,
      fixtureValidationReceiptHash: Buffer.from(fixtureReceipt.validationReceiptHash as number[]),
      oddsValidationReceiptHash: Buffer.from(receipt.validationReceiptHash as number[]),
      predicateHash: Buffer.from(compiled.hash, "hex"),
      bucketHash: Buffer.from(bucketHashHex, "hex"),
      coverage,
      premium: BigInt(quote.premium),
      probabilityPpm: quote.probabilityPpm,
    }).toString("hex");
    validatedOddsMessageKeyHex = messageKey.toString("hex");
  }

  return {
    predicateText: compiled.canonicalText,
    predicateHash: compiled.hash,
    predicateBytesHex: Buffer.from(compiled.canonicalBytes).toString("hex"),
    predicateLen: compiled.canonicalBytes.length,
    bucketHash: bucketHashHex,
    quoteHash: policyQuoteHash,
    auditQuoteHash: quote.quoteHash,
    validatedOddsMessageKeyHex,
    validationMode: validatedOddsMessageKeyHex ? "txline-cpi" : "recorded-source",
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
