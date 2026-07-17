import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { test } from "node:test";
import { AnchorProvider, BN, Program, setProvider } from "@anchor-lang/core";
import { Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { buildChain, type MarkerInput } from "../../services/marker/src/marker.js";
import { canonicalJson, normalizedProbabilitiesPpm, type TxlineWinnerPacket } from "../../services/quote-engine/src/engine.js";
import type { QuoteAuditRecord } from "../../services/quote-engine/src/cli.js";
import { SseFrameDecoder } from "@surety/txline-verify";
import type { SuretyCore } from "../../target/types/surety_core.js";

const idl = JSON.parse(readFileSync("target/idl/surety_core.json", "utf8")) as SuretyCore;
const PROGRAM_ID = new PublicKey(idl.address);

function pda(...seeds: Buffer[]): PublicKey {
  return PublicKey.findProgramAddressSync(seeds, PROGRAM_ID)[0];
}

function u64(value: bigint): Buffer {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(value);
  return bytes;
}

async function retry<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try { return await operation(); }
    catch (error) {
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
  const signature = await retry(() => provider.connection.sendRawTransaction(transaction.serialize(), { maxRetries: 5 }));
  await retry(() => provider.connection.confirmTransaction({ signature, ...latest }, "confirmed"));
  return signature;
}

function realUpdates() {
  const decoder = new SseFrameDecoder();
  const frames = decoder.push(readFileSync("data/recordings/worldcup-18237038-20260714-live-odds.raw.sse"));
  const updates = frames.flatMap((frame) => {
    let packet: TxlineWinnerPacket;
    try { packet = JSON.parse(frame.data) as TxlineWinnerPacket; } catch { return []; }
    if (packet.SuperOddsType !== "1X2_PARTICIPANT_RESULT" || packet.MarketPeriod !== null) return [];
    if (!Array.isArray(packet.Prices) || packet.Prices.length !== 3 || packet.Prices.some((price) => !Number.isInteger(price) || price <= 0)) return [];
    const probabilities = normalizedProbabilitiesPpm(packet.Prices);
    return [{
      packetRef: packet.MessageId,
      packetHash: createHash("sha256").update(canonicalJson(packet)).digest("hex"),
      probabilityPpmByBucket: {
        "match:18237038:WIN_HOME": probabilities[0]!,
        "match:18237038:DRAW": probabilities[1]!,
        "match:18237038:WIN_AWAY": probabilities[2]!,
      },
      timestampMs: String(packet.Ts),
    }];
  });
  const goalTimestamp = 1_784_060_376_027;
  const before = updates.filter((update) => Number(update.timestampMs) < goalTimestamp).slice(-2);
  const after = updates.filter((update) => Number(update.timestampMs) >= goalTimestamp).slice(0, 3);
  return [...before, ...after];
}

test("real replay posts a deterministic on-chain Glass Balance Sheet chain", async () => {
  assert.match(process.env.ANCHOR_PROVIDER_URL ?? "", /devnet/i, "Gate 6 requires devnet");
  const provider = AnchorProvider.env();
  setProvider(provider);
  const program = new Program<SuretyCore>(idl, provider);
  const payer = (provider.wallet as unknown as { payer: Keypair }).payer;
  const records = readFileSync("data/quotes/gate5-quotes.jsonl", "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as QuoteAuditRecord);
  assert.ok(records.length >= 3);
  const firstPolicy = await program.account.policy.fetch(new PublicKey(records[0]!.policy));
  const vault = firstPolicy.vault;
  const vaultState = await program.account.vault.fetch(vault);
  const startSeq = Number(vaultState.attestationSeq.toString());
  const startHash = Buffer.from(vaultState.latestAttestationHash).toString("hex");
  const existing = startSeq === 0
    ? []
    : readFileSync("data/attestations-gate6.jsonl", "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  assert.equal(existing.length, startSeq, "local chain must match the existing on-chain sequence");
  if (existing.length > 0) assert.equal(existing.at(-1).hash, startHash);
  const input: MarkerInput = {
    vault: vault.toBase58(),
    reserves: vaultState.totalCapital.toString(),
    lockedCollateral: vaultState.lockedLiabilities.toString(),
    maxBucketBps: vaultState.maxBucketBps,
    policies: records.map((record) => ({
      id: record.policy,
      coverage: record.request.coverage,
      bucket: `match:18237038:${record.request.outcome}`,
    })),
    updates: realUpdates(),
  };
  assert.equal(input.updates.length, 5);
  const chain = buildChain(input, { seq: startSeq, prevHash: startHash });
  assert.deepEqual(chain, buildChain(input, { seq: startSeq, prevHash: startHash }), "double replay must be byte-identical before posting");
  for (const record of chain) {
    const attestationPda = pda(Buffer.from("attestation"), vault.toBuffer(), u64(BigInt(record.seq)));
    const transaction = await program.methods
      .postAttestation({
        seq: new BN(record.seq),
        prevHash: [...Buffer.from(record.prevHash, "hex")],
        recordHash: [...Buffer.from(record.hash, "hex")],
        oddsPacketHash: [...Buffer.from(record.oddsPacketHash, "hex")],
        bookSnapshotHash: [...Buffer.from(record.bookSnapshotHash, "hex")],
        reserves: new BN(record.reserves),
        lockedCollateral: new BN(record.lockedCollateral),
        markedLiabilities: new BN(record.markedLiabilities),
        solvencyRatioBps: new BN(record.solvencyRatioBps),
        observedAtMs: new BN(record.timestampMs),
      })
      .accountsStrict({ attestor: payer.publicKey, vault, attestation: attestationPda, systemProgram: SystemProgram.programId })
      .transaction();
    record.transactionSignature = await submit(provider, payer, transaction);
    record.attestationPda = attestationPda.toBase58();
    const onChain = await program.account.solvencyAttestation.fetch(attestationPda);
    assert.equal(Buffer.from(onChain.recordHash).toString("hex"), record.hash);
  }
  const finalVault = await program.account.vault.fetch(vault);
  assert.equal(finalVault.attestationSeq.toString(), String(startSeq + chain.length));
  assert.equal(Buffer.from(finalVault.latestAttestationHash).toString("hex"), chain.at(-1)!.hash);
  const fullChain = [...existing, ...chain];
  writeFileSync("data/attestations-gate6.jsonl", `${fullChain.map((record) => JSON.stringify(record)).join("\n")}\n`);
  writeFileSync("data/marker-input-gate6.json", `${JSON.stringify(input)}\n`);
  console.log(`PASS: posted ${chain.length} chained attestations for ${input.policies.length} open policies in vault ${vault.toBase58()}`);
  console.log("PASS: double replay produced byte-identical pre-post chains");
});
