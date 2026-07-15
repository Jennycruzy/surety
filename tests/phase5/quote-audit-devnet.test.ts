import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { test } from "node:test";
import { AnchorProvider, BN, Program, setProvider } from "@anchor-lang/core";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { compilePredicate } from "../../services/predicate/src/compiler.js";
import { auditQuote, computeQuote, type BookState, type Outcome, type QuoteRequest, type TxlineWinnerPacket } from "../../services/quote-engine/src/engine.js";
import { storeRequest, type QuoteAuditRecord } from "../../services/quote-engine/src/cli.js";
import type { SuretyCore } from "../../target/types/surety_core.js";

const idl = JSON.parse(readFileSync("target/idl/surety_core.json", "utf8")) as SuretyCore;
const PROGRAM_ID = new PublicKey(idl.address);
const SCALE = 1_000_000;
const sourcePath = "data/recordings/phase0-18237038-odds-snapshot.raw.json";
const sourceBytes = readFileSync(sourcePath);
const sourceSha256 = createHash("sha256").update(sourceBytes).digest("hex");
const packet = (JSON.parse(sourceBytes.toString()) as TxlineWinnerPacket[]).find(
  (candidate) => candidate.SuperOddsType === "1X2_PARTICIPANT_RESULT" && candidate.MarketPeriod === null,
)!;

function digest(value: string | Uint8Array): Buffer {
  return createHash("sha256").update(value).digest();
}

function pda(...seeds: (Buffer | Uint8Array)[]): PublicKey {
  return PublicKey.findProgramAddressSync(seeds, PROGRAM_ID)[0];
}

function u64(value: bigint): Buffer {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(value);
  return bytes;
}

async function retry<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= 7 || !String(error).includes("429")) throw error;
      await new Promise((resolve) => setTimeout(resolve, Math.min(8_000, 500 * 2 ** attempt)));
    }
  }
}

async function submit(provider: AnchorProvider, payer: Keypair, transaction: Transaction): Promise<string> {
  const latest = await retry(() => provider.connection.getLatestBlockhash("confirmed"));
  transaction.feePayer = payer.publicKey;
  transaction.recentBlockhash = latest.blockhash;
  transaction.sign(payer);
  const signature = await retry(() =>
    provider.connection.sendRawTransaction(transaction.serialize(), { maxRetries: 5 }),
  );
  await retry(() => provider.connection.confirmTransaction({ signature, ...latest }, "confirmed"));
  return signature;
}

test("ten issued policies audit against deterministic committed quote inputs", async () => {
  assert.match(process.env.ANCHOR_PROVIDER_URL ?? "", /devnet/i, "Gate 5 devnet audit requires devnet");
  const provider = AnchorProvider.env();
  setProvider(provider);
  const program = new Program<SuretyCore>(idl, provider);
  const payer = (provider.wallet as unknown as { payer: Keypair }).payer;
  const assetMint = await createMint(provider.connection, payer, payer.publicKey, null, 6);
  const holderAssets = await getOrCreateAssociatedTokenAccount(provider.connection, payer, assetMint, payer.publicKey);
  await mintTo(provider.connection, payer, assetMint, holderAssets.address, payer, 5_000n * BigInt(SCALE));

  const runId = process.env.SURETY_RUN_ID ?? `gate5-${Date.now()}`;
  const vaultId = digest(`surety:${runId}`);
  const vault = pda(Buffer.from("vault"), vaultId);
  const reserve = pda(Buffer.from("reserve"), vault.toBuffer());
  const shareMint = pda(Buffer.from("share_mint"), vault.toBuffer());
  await submit(
    provider,
    payer,
    await program.methods
      .initializeVault([...vaultId], 3_000, new BN(172_800), 15_000, 1)
      .accountsStrict({ authority: payer.publicKey, vault, assetMint, reserve, shareMint, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId })
      .transaction(),
  );
  const lpShares = await getOrCreateAssociatedTokenAccount(provider.connection, payer, shareMint, payer.publicKey);
  await submit(
    provider,
    payer,
    await program.methods
      .lpDeposit(new BN(1_000 * SCALE))
      .accountsStrict({ lp: payer.publicKey, vault, assetMint, reserve, shareMint, lpAssetAccount: holderAssets.address, lpShareAccount: lpShares.address, tokenProgram: TOKEN_PROGRAM_ID })
      .transaction(),
  );
  const slot = await provider.connection.getSlot("confirmed");
  const now = await provider.connection.getBlockTime(slot);
  if (now === null) throw new Error("devnet did not return block time");

  const outcomes: Outcome[] = ["WIN_HOME", "DRAW", "WIN_AWAY", "WIN_HOME", "DRAW", "WIN_AWAY", "WIN_HOME", "DRAW", "WIN_AWAY", "WIN_HOME"];
  const records: QuoteAuditRecord[] = [];
  const verdicts: unknown[] = [];
  for (const [index, outcome] of outcomes.entries()) {
    const compiled = compilePredicate(`outcome(18237038) == ${outcome}`);
    const predicateHash = Buffer.from(compiled.hash, "hex");
    const bucketHash = digest(`match:18237038:${outcome}`);
    const bucket = pda(Buffer.from("bucket"), vault.toBuffer(), bucketHash);
    const vaultState = await program.account.vault.fetch(vault);
    const bucketState = await program.account.exposureBucket.fetchNullable(bucket);
    const book: BookState = {
      vault: vault.toBase58(),
      totalCapital: BigInt(vaultState.totalCapital.toString()),
      freeReserves: BigInt(vaultState.freeReserves.toString()),
      lockedLiabilities: BigInt(vaultState.lockedLiabilities.toString()),
      bucketHash: bucketHash.toString("hex"),
      bucketExposure: BigInt(bucketState?.lockedExposure.toString() ?? "0"),
      maxBucketBps: vaultState.maxBucketBps,
    };
    const request: QuoteRequest = {
      packet,
      packetSourceSha256: sourceSha256,
      predicateHash: compiled.hash,
      outcome,
      coverage: 40n * BigInt(SCALE),
      marginBps: vaultState.marginBps,
      book,
    };
    const quote = computeQuote(request);
    assert.notEqual(quote.verdict, "REJECT");
    const nonce = BigInt(index + 1);
    const policy = pda(Buffer.from("policy"), vault.toBuffer(), payer.publicKey.toBuffer(), predicateHash, u64(nonce));
    const policyEscrow = pda(Buffer.from("policy_escrow"), policy.toBuffer());
    const bytes = Buffer.alloc(32);
    bytes.set(compiled.canonicalBytes);
    const signature = await submit(
      provider,
      payer,
      await program.methods
        .issuePolicy({
          nonce: new BN(nonce.toString()),
          predicateLen: compiled.canonicalBytes.length,
          predicateBytes: [...bytes],
          predicateHash: [...predicateHash],
          quoteHash: [...Buffer.from(quote.quoteHash, "hex")],
          bucketHash: [...bucketHash],
          payoutAuthority: payer.publicKey,
          coverage: new BN(request.coverage.toString()),
          premium: new BN(quote.premium!),
          expiresAt: new BN(now + 86_400),
        })
        .accountsStrict({ holder: payer.publicKey, vault, assetMint, reserve, holderAssetAccount: holderAssets.address, bucket, policy, policyEscrow, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId })
        .transaction(),
    );
    const onChain = await program.account.policy.fetch(policy);
    assert.equal(Buffer.from(onChain.quoteHash).toString("hex"), quote.quoteHash);
    auditQuote(request, quote);
    records.push({ policy: policy.toBase58(), request: storeRequest(request), quote });
    verdicts.push({ policy: policy.toBase58(), signature, verdict: quote.verdict, quoteHash: quote.quoteHash, projectedUtilizationBps: quote.projectedUtilizationBps, surchargeBps: quote.surchargeBps, premium: quote.premium });
  }

  const finalVault = await program.account.vault.fetch(vault);
  const homeBucketHash = digest("match:18237038:WIN_HOME");
  const homeBucket = pda(Buffer.from("bucket"), vault.toBuffer(), homeBucketHash);
  const homeState = await program.account.exposureBucket.fetch(homeBucket);
  const cap = (BigInt(finalVault.totalCapital.toString()) * BigInt(finalVault.maxBucketBps)) / 10_000n;
  const rejectCoverage = cap - BigInt(homeState.lockedExposure.toString());
  const rejectRequest: QuoteRequest = {
    packet,
    packetSourceSha256: sourceSha256,
    predicateHash: compilePredicate("outcome(18237038) == WIN_HOME").hash,
    outcome: "WIN_HOME",
    coverage: rejectCoverage,
    marginBps: finalVault.marginBps,
    book: {
      vault: vault.toBase58(),
      totalCapital: BigInt(finalVault.totalCapital.toString()),
      freeReserves: BigInt(finalVault.freeReserves.toString()),
      lockedLiabilities: BigInt(finalVault.lockedLiabilities.toString()),
      bucketHash: homeBucketHash.toString("hex"),
      bucketExposure: BigInt(homeState.lockedExposure.toString()),
      maxBucketBps: finalVault.maxBucketBps,
    },
  };
  const rejected = computeQuote(rejectRequest);
  assert.equal(rejected.verdict, "REJECT");
  assert.ok(verdicts.some((entry) => (entry as { verdict: string }).verdict === "ACCEPT"));
  assert.ok(verdicts.some((entry) => (entry as { verdict: string }).verdict === "SURCHARGE"));
  verdicts.push({ policy: null, verdict: rejected.verdict, quoteHash: rejected.quoteHash, projectedUtilizationBps: rejected.projectedUtilizationBps, surchargeBps: rejected.surchargeBps, premium: rejected.premium });

  mkdirSync("data/quotes", { recursive: true });
  mkdirSync("data/verdicts", { recursive: true });
  writeFileSync("data/quotes/gate5-quotes.jsonl", `${records.map((record) => JSON.stringify(record)).join("\n")}\n`);
  writeFileSync("data/verdicts/gate5-verdicts.jsonl", `${verdicts.map((record) => JSON.stringify(record)).join("\n")}\n`);
  console.log(`PASS: 10 issued quote hashes recomputed and matched on-chain in vault ${vault.toBase58()}`);
  console.log("PASS: verdict log contains ACCEPT, SURCHARGE, and REJECT with committed inputs");
});
