import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PublicKey } from "@solana/web3.js";
import { compilePredicate } from "../../services/predicate/src/compiler.js";
import { verifiedQuoteHash } from "../../services/odds-validation/src/quote-commitment.js";
import { oddsMessageKey } from "@surety/txline-verify";
import { validatedFixturePda, validatedOddsPda } from "../../app/lib/pda.js";
import {
  auditQuote,
  computeQuote,
  normalizedProbabilitiesPpm,
  type BookState,
  type TxlineWinnerPacket,
} from "../../services/quote-engine/src/engine.js";

const source = "data/recordings/phase0-18237038-odds-snapshot.raw.json";
const sourceBytes = readFileSync(source);
const packets = JSON.parse(sourceBytes.toString()) as TxlineWinnerPacket[];
const packet = packets.find(
  (candidate) =>
    candidate.SuperOddsType === "1X2_PARTICIPANT_RESULT" && candidate.MarketPeriod === null,
)!;
const sourceSha256 = createHash("sha256").update(sourceBytes).digest("hex");
const predicateHash = compilePredicate("outcome(18237038) == WIN_HOME").hash;
const bucketHash = createHash("sha256").update("match:18237038:WIN_HOME").digest("hex");

function book(bucketExposure: bigint): BookState {
  return {
    vault: "11111111111111111111111111111111",
    totalCapital: 1_000_000_000n,
    freeReserves: 900_000_000n,
    lockedLiabilities: 100_000_000n,
    bucketHash,
    bucketExposure,
    maxBucketBps: 2_000,
  };
}

test("odds normalization matches TxLINE's demargined percentages", () => {
  const probabilities = normalizedProbabilitiesPpm(packet.Prices);
  assert.deepEqual(probabilities, [359_202, 336_933, 303_865]);
  assert.equal(probabilities.reduce((sum, value) => sum + value, 0), 1_000_000);
});

test("quote verdicts deterministically cover accept, surcharge, and reject", () => {
  const base = {
    packet,
    packetSourceSha256: sourceSha256,
    predicateHash,
    outcome: "WIN_HOME" as const,
    coverage: 50_000_000n,
    marginBps: 15_000,
  };
  const accepted = computeQuote({ ...base, book: book(0n) });
  const surcharged = computeQuote({ ...base, book: book(50_000_000n) });
  const rejected = computeQuote({ ...base, book: book(150_000_000n) });
  assert.equal(accepted.verdict, "ACCEPT");
  assert.equal(accepted.surchargeBps, 10_000);
  assert.equal(surcharged.verdict, "SURCHARGE");
  assert.equal(surcharged.surchargeBps, 11_666);
  assert.equal(rejected.verdict, "REJECT");
  assert.equal(rejected.premium, null);
  assert.equal(auditQuote({ ...base, book: book(0n) }, accepted).quoteHash, accepted.quoteHash);
});

test("quote hash changes when packet, book, or coverage changes", () => {
  const request = {
    packet,
    packetSourceSha256: sourceSha256,
    predicateHash,
    outcome: "WIN_HOME" as const,
    coverage: 50_000_000n,
    marginBps: 15_000,
    book: book(0n),
  };
  const original = computeQuote(request);
  assert.equal(computeQuote(request).quoteHash, original.quoteHash);
  assert.notEqual(computeQuote({ ...request, coverage: 50_000_001n }).quoteHash, original.quoteHash);
  assert.notEqual(
    computeQuote({ ...request, book: { ...request.book, bucketExposure: 1n } }).quoteHash,
    original.quoteHash,
  );
  assert.notEqual(
    computeQuote({ ...request, packet: { ...packet, Ts: packet.Ts + 1 } }).quoteHash,
    original.quoteHash,
  );
});

test("verified quote commitment matches the Rust on-chain test vector", () => {
  // This is a pinned cross-language vector, not the app's mutable live-vault default.
  const vectorVault = new PublicKey("CDyQxhDHsaWYNBvjJgGPVFZdsBD3mC28VEX5DkCZkqEC");
  const validatedOdds = validatedOddsPda(
    oddsMessageKey("1837782566:00003:000791-10021-stab"),
  );
  const validatedFixture = validatedFixturePda(18_237_038n);
  const commitment = verifiedQuoteHash({
    vault: vectorVault,
    validatedFixture,
    validatedOdds,
    fixtureValidationReceiptHash: Buffer.alloc(32, 3),
    oddsValidationReceiptHash: Buffer.alloc(32, 4),
    predicateHash: Buffer.from(predicateHash, "hex"),
    bucketHash: Buffer.from(bucketHash, "hex"),
    coverage: 50_000_000n,
    premium: 26_940_150n,
    probabilityPpm: 359_202,
  });
  assert.equal(validatedOdds.toBase58(), "24Fkoixd9C1sFFmkknWmu5N52MyV5cwpPs29aAN8AUJG");
  assert.equal(commitment.toString("hex"), "deb9b924e9b314ef08dd5db77876dfe772e521876caed1d160470fcb3275939f");
});
