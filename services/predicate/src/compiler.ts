import { createHash } from "node:crypto";
import matrix from "../../../docs/provability-matrix.json" with { type: "json" };

export const CANONICAL_VERSION = 1;

const STAT_IDS = {
  goals_home: 1,
  goals_away: 2,
  yellow_cards_home: 3,
  yellow_cards_away: 4,
  red_cards_home: 5,
  red_cards_away: 6,
  corners_home: 7,
  corners_away: 8,
  goals_total: 9,
  yellow_cards_total: 10,
  red_cards_total: 11,
  corners_total: 12,
} as const;

const OP_IDS = { "==": 0, ">": 1, ">=": 2, "<": 3, "<=": 4 } as const;
const OUTCOME_IDS = { WIN_HOME: 0, DRAW: 1, WIN_AWAY: 2 } as const;
export type StatName = keyof typeof STAT_IDS;
export type Operator = keyof typeof OP_IDS;
export type Outcome = keyof typeof OUTCOME_IDS;
const ID_STATS = new Map<number, StatName>(Object.entries(STAT_IDS).map(([name, id]) => [id, name as StatName]));
const ID_OPS = new Map<number, Operator>(Object.entries(OP_IDS).map(([op, id]) => [id, op as Operator]));
const ID_OUTCOMES = new Map<number, Outcome>(Object.entries(OUTCOME_IDS).map(([name, id]) => [id, name as Outcome]));

export type StatClause = { kind: "stat"; fixtureId: bigint; stat: StatName; operator: Operator; value: number };
export type OutcomeClause = { kind: "outcome"; fixtureId: bigint; operator: "=="; value: Outcome };
export type PeriodStatClause = { kind: "period_stat"; fixtureId: bigint; period: "HT"; stat: "goals_home" | "goals_away"; statKey: number; operator: Operator; value: number };
export type Clause = StatClause | OutcomeClause | PeriodStatClause;
export type CompiledPredicate = {
  clauses: Clause[];
  canonicalBytes: Uint8Array;
  canonicalText: string;
  hash: string;
};

export class PredicateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PredicateError";
  }
}

function parseFixtureId(raw: string): bigint {
  if (!/^\d+$/.test(raw)) throw new PredicateError(`invalid match_id '${raw}': expected an unsigned integer`);
  const value = BigInt(raw);
  if (value < 1n || value > 18_446_744_073_709_551_615n) {
    throw new PredicateError(`invalid match_id '${raw}': outside u64 range`);
  }
  return value;
}

function parseStatClause(text: string): StatClause | null {
  const match = /^stat\s*\(\s*([^,]+)\s*,\s*([a-zA-Z0-9_]+)\s*\)\s*(==|>=|<=|>|<)\s*(-?\d+)$/i.exec(text);
  if (!match) return null;
  const fixtureRaw = match[1]!;
  const statRaw = match[2]!;
  const operatorRaw = match[3]!;
  const valueRaw = match[4]!;
  const requested = statRaw.toLowerCase();
  if (!(requested in STAT_IDS)) {
    throw new PredicateError(`illegal stat '${statRaw}': TxLINE proof-backed fields are ${Object.keys(STAT_IDS).join(", ")}`);
  }
  const value = Number(valueRaw);
  if (!Number.isSafeInteger(value) || value < -2_147_483_648 || value > 2_147_483_647) {
    throw new PredicateError(`stat value '${valueRaw}' is outside the signed 32-bit proof value range`);
  }
  return {
    kind: "stat",
    fixtureId: parseFixtureId(fixtureRaw.trim()),
    stat: requested as StatName,
    operator: operatorRaw as Operator,
    value,
  };
}

const provedPeriodKeys = new Set(
  matrix.results
    .filter((row) => row.status === "proof-returned")
    .map((row) => `${row.prefix}:${row.baseKey}`),
);
export const PERIOD_PREDICATE_MENU = Object.freeze(
  [
    { period: "HT" as const, prefix: 2_000, baseKey: 1, stat: "goals_home" as const, market: "half=1 participant goals" },
    { period: "HT" as const, prefix: 2_000, baseKey: 2, stat: "goals_away" as const, market: "half=1 participant goals" },
  ].filter((item) => provedPeriodKeys.has(`${item.prefix}:${item.baseKey}`)),
);

function parsePeriodStatClause(text: string): PeriodStatClause | null {
  const match = /^stat\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([a-zA-Z0-9_]+)\s*\)\s*(==|>=|<=|>|<)\s*(-?\d+)$/i.exec(text);
  if (!match) return null;
  const period = match[2]!.toUpperCase();
  if (period !== "HT") throw new PredicateError(`period '${match[2]}' was not admitted by the committed provability matrix`);
  const stat = match[3]!.toLowerCase();
  const baseKey = stat === "goals_home" ? 1 : stat === "goals_away" ? 2 : STAT_IDS[stat as StatName];
  if (!baseKey || !provedPeriodKeys.has(`2000:${baseKey}`)) {
    throw new PredicateError(`stat(${period},${stat}) was not proved for both recorded fixtures in the committed provability matrix`);
  }
  if (!PERIOD_PREDICATE_MENU.some((item) => item.baseKey === baseKey)) {
    throw new PredicateError(`stat(${period},${stat}) is proof-backed but unpriceable: the captured consensus feed has no deterministic period market for this field`);
  }
  const value = Number(match[5]);
  if (!Number.isSafeInteger(value) || value < -2_147_483_648 || value > 2_147_483_647) throw new PredicateError(`stat value '${match[5]}' is outside the signed 32-bit proof value range`);
  const pricedStat = baseKey === 1 ? "goals_home" : "goals_away";
  return { kind: "period_stat", fixtureId: parseFixtureId(match[1]!.trim()), period: "HT", stat: pricedStat, statKey: 2_000 + baseKey, operator: match[4] as Operator, value };
}

function parseOutcomeClause(text: string): OutcomeClause | null {
  const match = /^outcome\s*\(\s*([^)]*)\s*\)\s*(==|>=|<=|>|<)\s*([a-zA-Z_]+)$/i.exec(text);
  if (!match) return null;
  const fixtureRaw = match[1]!;
  const operatorRaw = match[2]!;
  const outcomeRaw = match[3]!;
  if (operatorRaw !== "==") throw new PredicateError("outcome predicates support only the == operator");
  const requested = outcomeRaw.toUpperCase();
  if (!(requested in OUTCOME_IDS)) {
    throw new PredicateError(`illegal outcome '${outcomeRaw}': expected WIN_HOME, DRAW, or WIN_AWAY`);
  }
  return {
    kind: "outcome",
    fixtureId: parseFixtureId(fixtureRaw.trim()),
    operator: "==",
    value: requested as Outcome,
  };
}

function rejectUnprovenField(text: string): never {
  const field = /^([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/.exec(text)?.[1]?.toLowerCase() ?? text;
  if (field === "tournament_result") {
    throw new PredicateError("tournament_result is unsettleable: TxLINE stage-tag proof metadata was not proven in Gate 0");
  }
  if (field === "decided_by") {
    throw new PredicateError("decided_by is unsettleable: no proof-backed decision-method field was proven in Gate 0");
  }
  throw new PredicateError(`illegal field or malformed comparison '${text}'`);
}

function clauseBytes(clause: Clause): Buffer {
  if (clause.kind === "period_stat") {
    const bytes = Buffer.alloc(16);
    bytes.writeUInt8(3, 0);
    bytes.writeBigUInt64LE(clause.fixtureId, 1);
    bytes.writeUInt16LE(clause.statKey, 9);
    bytes.writeUInt8(OP_IDS[clause.operator], 11);
    bytes.writeInt32LE(clause.value, 12);
    return bytes;
  }
  const bytes = Buffer.alloc(15);
  bytes.writeUInt8(clause.kind === "stat" ? 1 : 2, 0);
  bytes.writeBigUInt64LE(clause.fixtureId, 1);
  if (clause.kind === "stat") {
    bytes.writeUInt8(STAT_IDS[clause.stat], 9);
    bytes.writeUInt8(OP_IDS[clause.operator], 10);
    bytes.writeInt32LE(clause.value, 11);
  } else {
    bytes.writeUInt8(OP_IDS[clause.operator], 10);
    bytes.writeUInt8(OUTCOME_IDS[clause.value], 11);
  }
  return bytes;
}

function formatClause(clause: Clause): string {
  return clause.kind === "period_stat"
    ? `stat(${clause.fixtureId},${clause.period},${clause.stat}) ${clause.operator} ${clause.value}`
    : clause.kind === "stat"
    ? `stat(${clause.fixtureId},${clause.stat}) ${clause.operator} ${clause.value}`
    : `outcome(${clause.fixtureId}) == ${clause.value}`;
}

export function compilePredicate(text: string): CompiledPredicate {
  const source = text.trim();
  if (!source) throw new PredicateError("predicate is empty");
  const pieces = source.split(/\s+AND\s+/i);
  if (pieces.length > 2) throw new PredicateError("v1 supports at most two comparisons joined by AND");
  if (pieces.some((piece) => !piece.trim())) throw new PredicateError("AND requires a comparison on each side");
  const encoded = pieces.map((piece) => {
    const trimmed = piece.trim();
    const clause = parsePeriodStatClause(trimmed) ?? parseStatClause(trimmed) ?? parseOutcomeClause(trimmed) ?? rejectUnprovenField(trimmed);
    return { clause, bytes: clauseBytes(clause) };
  });
  encoded.sort((left, right) => Buffer.compare(left.bytes, right.bytes));
  if (encoded.some(({ clause }) => clause.kind === "period_stat") && encoded.length !== 1) {
    throw new PredicateError("period-scoped predicates currently support exactly one comparison");
  }
  if (encoded.length === 2 && encoded[0]!.bytes.equals(encoded[1]!.bytes)) {
    throw new PredicateError("duplicate comparisons are not allowed");
  }
  const canonicalBytes = Buffer.concat([
    Buffer.from([encoded[0]!.clause.kind === "period_stat" ? 2 : CANONICAL_VERSION, encoded.length]),
    ...encoded.map(({ bytes }) => bytes),
  ]);
  const clauses = encoded.map(({ clause }) => clause);
  return {
    clauses,
    canonicalBytes,
    canonicalText: clauses.map(formatClause).join(" AND "),
    hash: createHash("sha256").update(canonicalBytes).digest("hex"),
  };
}

export function decodePredicate(input: Uint8Array): CompiledPredicate {
  const bytes = Buffer.from(input);
  if (bytes.length < 2) throw new PredicateError("canonical predicate is truncated");
  const version = bytes.readUInt8(0);
  if (version === 2) {
    if (bytes.length !== 18 || bytes[1] !== 1 || bytes[2] !== 3) throw new PredicateError("canonical period predicate has an invalid shape");
    const fixtureId = bytes.readBigUInt64LE(3);
    const statKey = bytes.readUInt16LE(11);
    const operator = ID_OPS.get(bytes.readUInt8(13));
    const stat = statKey === 2001 ? "goals_home" : statKey === 2002 ? "goals_away" : undefined;
    if (!operator || !stat) throw new PredicateError("canonical period predicate contains an unpriced field or operator");
    const clauses: Clause[] = [{ kind: "period_stat", fixtureId, period: "HT", stat, statKey, operator, value: bytes.readInt32LE(14) }];
    return { clauses, canonicalBytes: bytes, canonicalText: clauses.map(formatClause).join(" AND "), hash: createHash("sha256").update(bytes).digest("hex") };
  }
  if (version !== CANONICAL_VERSION) throw new PredicateError(`unsupported canonical predicate version ${version}`);
  const count = bytes.readUInt8(1);
  if (count < 1 || count > 2 || bytes.length !== 2 + count * 15) {
    throw new PredicateError("canonical predicate has an invalid clause count or length");
  }
  const clauses: Clause[] = [];
  let previous: Buffer | undefined;
  for (let index = 0; index < count; index += 1) {
    const encoded = bytes.subarray(2 + index * 15, 17 + index * 15);
    if (previous && Buffer.compare(previous, encoded) >= 0) {
      throw new PredicateError("canonical predicate clauses are not strictly sorted");
    }
    previous = encoded;
    const fixtureId = encoded.readBigUInt64LE(1);
    const operator = ID_OPS.get(encoded.readUInt8(10));
    if (operator === undefined) throw new PredicateError("canonical predicate contains an unknown operator");
    if (encoded.readUInt8(0) === 1) {
      const stat = ID_STATS.get(encoded.readUInt8(9));
      if (!stat) throw new PredicateError("canonical predicate contains an unknown stat");
      clauses.push({ kind: "stat", fixtureId, stat, operator, value: encoded.readInt32LE(11) });
    } else if (encoded.readUInt8(0) === 2) {
      if (encoded.readUInt8(9) !== 0 || operator !== "==" || encoded.readUInt8(12) !== 0 || encoded.readUInt8(13) !== 0 || encoded.readUInt8(14) !== 0) {
        throw new PredicateError("canonical outcome clause contains non-canonical bytes");
      }
      const value = ID_OUTCOMES.get(encoded.readUInt8(11));
      if (!value) throw new PredicateError("canonical predicate contains an unknown outcome");
      clauses.push({ kind: "outcome", fixtureId, operator: "==", value });
    } else {
      throw new PredicateError("canonical predicate contains an unknown field kind");
    }
  }
  return {
    clauses,
    canonicalBytes: bytes,
    canonicalText: clauses.map(formatClause).join(" AND "),
    hash: createHash("sha256").update(bytes).digest("hex"),
  };
}
