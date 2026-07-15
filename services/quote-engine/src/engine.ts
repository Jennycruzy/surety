import { createHash } from "node:crypto";

export const QUOTE_FORMULA_VERSION = 1;
export const PROBABILITY_SCALE = 1_000_000n;
export const BPS_SCALE = 10_000n;

export type Outcome = "WIN_HOME" | "DRAW" | "WIN_AWAY";
export type Verdict = "ACCEPT" | "SURCHARGE" | "REJECT";

export type TxlineWinnerPacket = {
  FixtureId: number;
  MessageId: string;
  Ts: number;
  Bookmaker: string;
  BookmakerId: number;
  SuperOddsType: string;
  GameState: string | null;
  InRunning: boolean;
  MarketParameters: string | null;
  MarketPeriod: string | null;
  PriceNames: string[];
  Prices: number[];
  Pct?: string[];
};

export type BookState = {
  vault: string;
  totalCapital: bigint;
  freeReserves: bigint;
  lockedLiabilities: bigint;
  bucketHash: string;
  bucketExposure: bigint;
  maxBucketBps: number;
};

export type QuoteRequest = {
  packet: TxlineWinnerPacket;
  packetSourceSha256: string;
  predicateHash: string;
  outcome: Outcome;
  coverage: bigint;
  marginBps: number;
  book: BookState;
};

export type QuoteCommitment = {
  formulaVersion: number;
  oddsPacket: {
    fixtureId: number;
    messageId: string;
    timestampMs: number;
    sourceSha256: string;
    packetSha256: string;
  };
  predicateHash: string;
  outcome: Outcome;
  coverage: string;
  probabilityPpm: number;
  marginBps: number;
  bookSnapshotHash: string;
  bucketCap: string;
  projectedBucketExposure: string;
  projectedUtilizationBps: number;
  surchargeBps: number | null;
  premium: string | null;
  verdict: Verdict;
};

export type Quote = QuoteCommitment & { quoteHash: string };

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
    .join(",")}}`;
}

function divideRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error("division denominator must be positive");
  return (numerator + denominator / 2n) / denominator;
}

function divideCeil(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error("division denominator must be positive");
  return (numerator + denominator - 1n) / denominator;
}

function assertHex32(label: string, value: string): void {
  if (!/^[0-9a-f]{64}$/i.test(value)) throw new Error(`${label} must be a 32-byte hex string`);
}

function validatePacket(packet: TxlineWinnerPacket): void {
  if (!Number.isSafeInteger(packet.FixtureId) || packet.FixtureId <= 0) {
    throw new Error("TxLINE FixtureId must be a positive safe integer");
  }
  if (!Number.isSafeInteger(packet.Ts) || packet.Ts <= 0 || !packet.MessageId) {
    throw new Error("TxLINE packet is missing its timestamp or message id");
  }
  if (
    packet.Bookmaker !== "TXLineStablePriceDemargined" ||
    packet.SuperOddsType !== "1X2_PARTICIPANT_RESULT" ||
    packet.MarketPeriod !== null ||
    packet.MarketParameters !== null
  ) {
    throw new Error("packet is not a full-match TxLINE StablePrice 1X2 market");
  }
  if (
    packet.PriceNames.length !== 3 ||
    packet.PriceNames.join(",") !== "part1,draw,part2" ||
    packet.Prices.length !== 3 ||
    packet.Prices.some((price) => !Number.isSafeInteger(price) || price <= 0)
  ) {
    throw new Error("packet does not contain the canonical part1/draw/part2 price set");
  }
}

export function normalizedProbabilitiesPpm(prices: number[]): number[] {
  if (prices.length < 2 || prices.some((price) => !Number.isSafeInteger(price) || price <= 0)) {
    throw new Error("prices must contain at least two positive integers");
  }
  const bigintPrices = prices.map(BigInt);
  const product = bigintPrices.reduce((value, price) => value * price, 1n);
  const reciprocalWeights = bigintPrices.map((price) => product / price);
  const total = reciprocalWeights.reduce((value, weight) => value + weight, 0n);
  return reciprocalWeights.map((weight) =>
    Number(divideRoundHalfUp(weight * PROBABILITY_SCALE, total)),
  );
}

export function hashBookState(book: BookState): string {
  assertHex32("bucketHash", book.bucketHash);
  return sha256(
    canonicalJson({
      vault: book.vault,
      totalCapital: book.totalCapital.toString(),
      freeReserves: book.freeReserves.toString(),
      lockedLiabilities: book.lockedLiabilities.toString(),
      bucketHash: book.bucketHash.toLowerCase(),
      bucketExposure: book.bucketExposure.toString(),
      maxBucketBps: book.maxBucketBps,
    }),
  );
}

export function computeQuote(request: QuoteRequest): Quote {
  validatePacket(request.packet);
  assertHex32("packetSourceSha256", request.packetSourceSha256);
  assertHex32("predicateHash", request.predicateHash);
  if (request.coverage <= 0n) throw new Error("coverage must be positive");
  if (!Number.isInteger(request.marginBps) || request.marginBps < 10_000) {
    throw new Error("marginBps must be an integer of at least 10,000");
  }
  if (
    request.book.totalCapital <= 0n ||
    request.book.freeReserves < 0n ||
    request.book.lockedLiabilities < 0n ||
    request.book.freeReserves + request.book.lockedLiabilities !== request.book.totalCapital
  ) {
    throw new Error("book state violates the vault accounting invariant");
  }
  if (
    !Number.isInteger(request.book.maxBucketBps) ||
    request.book.maxBucketBps <= 0 ||
    request.book.maxBucketBps > 10_000
  ) {
    throw new Error("maxBucketBps is outside 1..10,000");
  }

  const outcomeIndex = { WIN_HOME: 0, DRAW: 1, WIN_AWAY: 2 }[request.outcome];
  const probabilityPpm = normalizedProbabilitiesPpm(request.packet.Prices)[outcomeIndex]!;
  const bucketCap =
    (request.book.totalCapital * BigInt(request.book.maxBucketBps)) / BPS_SCALE;
  const projectedExposure = request.book.bucketExposure + request.coverage;
  const projectedUtilizationBps = Number(
    divideCeil(projectedExposure * BPS_SCALE, bucketCap),
  );
  const verdict: Verdict =
    projectedExposure >= bucketCap
      ? "REJECT"
      : projectedUtilizationBps < 4_000
        ? "ACCEPT"
        : "SURCHARGE";
  const surchargeBps =
    verdict === "REJECT"
      ? null
      : projectedUtilizationBps < 4_000
        ? 10_000
        : 10_000 + Math.floor(((projectedUtilizationBps - 4_000) * 10_000) / 6_000);
  const premium =
    surchargeBps === null
      ? null
      : divideCeil(
          request.coverage *
            BigInt(probabilityPpm) *
            BigInt(request.marginBps) *
            BigInt(surchargeBps),
          PROBABILITY_SCALE * BPS_SCALE * BPS_SCALE,
        );
  const commitment: QuoteCommitment = {
    formulaVersion: QUOTE_FORMULA_VERSION,
    oddsPacket: {
      fixtureId: request.packet.FixtureId,
      messageId: request.packet.MessageId,
      timestampMs: request.packet.Ts,
      sourceSha256: request.packetSourceSha256.toLowerCase(),
      packetSha256: sha256(canonicalJson(request.packet)),
    },
    predicateHash: request.predicateHash.toLowerCase(),
    outcome: request.outcome,
    coverage: request.coverage.toString(),
    probabilityPpm,
    marginBps: request.marginBps,
    bookSnapshotHash: hashBookState(request.book),
    bucketCap: bucketCap.toString(),
    projectedBucketExposure: projectedExposure.toString(),
    projectedUtilizationBps,
    surchargeBps,
    premium: premium?.toString() ?? null,
    verdict,
  };
  return { ...commitment, quoteHash: sha256(canonicalJson(commitment)) };
}

export function auditQuote(request: QuoteRequest, expected: Quote): Quote {
  const recomputed = computeQuote(request);
  if (canonicalJson(recomputed) !== canonicalJson(expected)) {
    throw new Error(`quote audit mismatch: expected ${expected.quoteHash}, got ${recomputed.quoteHash}`);
  }
  return recomputed;
}
