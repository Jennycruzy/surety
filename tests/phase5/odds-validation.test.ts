import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { buildIssuePolicyWithValidatedOddsTx } from "../../app/lib/surety-client.js";
import { compilePredicate } from "../../services/predicate/src/compiler.js";
import {
  assertProofMatchesPacket,
  dailyOddsRootPda,
  oddsMessageKey,
  type RawOddsValidation,
} from "../../services/odds-validation/src/txline.js";
import { buildRecordValidatedOddsTx } from "../../services/odds-validation/src/record.js";
import type { TxlineWinnerPacket } from "../../services/quote-engine/src/engine.js";

const proofPath = "data/recordings/phase0-18237038-message-000791-odds-proof.raw.json";
const proofBytes = readFileSync(proofPath);
const proof = JSON.parse(proofBytes.toString("utf8")) as RawOddsValidation;
const packets = JSON.parse(
  readFileSync("data/recordings/phase0-18237038-odds-snapshot.raw.json", "utf8"),
) as TxlineWinnerPacket[];
const packet = packets.find(
  (candidate) => candidate.SuperOddsType === "1X2_PARTICIPANT_RESULT" && candidate.MarketPeriod === null,
)!;

test("captured TxLINE odds proof is byte-pinned and matches the pricing packet", () => {
  assert.equal(
    createHash("sha256").update(proofBytes).digest("hex"),
    "98a580777e4ab036bad4c67f77884b422483123090d09eefa6bfd6c6d1ebb143",
  );
  assertProofMatchesPacket(proof, packet);
  assert.equal(dailyOddsRootPda(proof.odds.Ts).toBase58(), "9CrnWb2ZBtxX3B2C7GUDacb8AnjvySjyDtci7uy4gdoH");
});

test("real proof receipt and proof-backed issuance transactions fit Solana's limit", async () => {
  const connection = new Connection("http://127.0.0.1:18899", "confirmed");
  const payer = Keypair.generate();
  const recordTx = await buildRecordValidatedOddsTx(connection, payer.publicKey, proof);
  recordTx.feePayer = payer.publicKey;
  recordTx.recentBlockhash = PublicKey.unique().toBase58();
  recordTx.sign(payer);
  assert.equal(recordTx.serialize().length, 1_227);

  const compiled = compilePredicate("outcome(18237038) == WIN_HOME");
  const issueTx = await buildIssuePolicyWithValidatedOddsTx(connection, {
    holder: payer.publicKey,
    payoutAuthority: payer.publicKey,
    nonce: 1n,
    predicateBytes: Buffer.from(compiled.canonicalBytes),
    predicateLen: compiled.canonicalBytes.length,
    predicateHash: Buffer.from(compiled.hash, "hex"),
    quoteHash: Buffer.alloc(32, 2),
    bucketHash: createHash("sha256").update("match:18237038:WIN_HOME").digest(),
    coverage: 50_000_000n,
    premium: 26_940_150n,
    expiresAt: 2_000_000_000n,
    validatedOddsMessageKey: oddsMessageKey(proof.odds.MessageId),
  });
  issueTx.feePayer = payer.publicKey;
  issueTx.recentBlockhash = PublicKey.unique().toBase58();
  issueTx.sign(payer);
  assert(issueTx.serialize().length <= 1_232, `issue transaction is ${issueTx.serialize().length} bytes`);
});
