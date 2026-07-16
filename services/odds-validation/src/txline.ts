import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { AnchorProvider, BN, Program, type Idl } from "@anchor-lang/core";
import { ComputeBudgetProgram, PublicKey } from "@solana/web3.js";
import type { TxlineWinnerPacket } from "../../quote-engine/src/engine.js";

// Pinned from txodds/tx-on-chain commit
// eba4cb4d578bdb5cfad3c22dfd134f012496e445, devnet IDL v1.5.6.
export const TXLINE_DEVNET_PROGRAM_ID = new PublicKey(
  "6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J",
);
export const DAILY_ODDS_ROOT_SEED = "daily_batch_roots";
export const TEN_DAILY_FIXTURES_ROOT_SEED = "ten_daily_fixtures_roots";
export const FIXTURE_ID_MASK = (1n << 48n) - 1n;

export type RawProofNode = { hash: number[]; isRightSibling: boolean };
export type RawOddsValidation = {
  odds: Omit<TxlineWinnerPacket, "Pct">;
  summary: {
    fixtureId: number;
    updateStats: { updateCount: number; minTimestamp: number; maxTimestamp: number };
    oddsSubTreeRoot: number[];
  };
  subTreeProof: RawProofNode[];
  mainTreeProof: RawProofNode[];
};

export type RawFixtureValidation = {
  snapshot: {
    Ts: number;
    StartTime: number;
    Competition: string;
    CompetitionId: number;
    FixtureGroupId: number;
    Participant1Id: number;
    Participant1: string;
    Participant2Id: number;
    Participant2: string;
    FixtureId: number;
    Participant1IsHome: boolean;
  };
  summary: {
    fixtureId: number;
    competitionId: number;
    competition: string;
    updateStats: { updateCount: number; minTimestamp: number; maxTimestamp: number };
    updateSubTreeRoot: number[];
  };
  subTreeProof: RawProofNode[];
  mainTreeProof: RawProofNode[];
};

export function pureFixtureId(packedFixtureId: number): bigint {
  assert(Number.isSafeInteger(packedFixtureId) && packedFixtureId > 0, "invalid packed fixture ID");
  return BigInt(packedFixtureId) & FIXTURE_ID_MASK;
}

export function oddsMessageHash(messageId: string): Buffer {
  return createHash("sha256").update(messageId).digest();
}

export function oddsMessageKey(messageId: string): Buffer {
  return oddsMessageHash(messageId).subarray(0, 16);
}

export function suretyOddsValidationInput(proof: RawOddsValidation) {
  const args = anchorArgs(proof, false);
  return {
    oddsSnapshot: args.odds,
    summary: args.summary,
    subTreeProof: args.subTreeProof,
    mainTreeProof: args.mainTreeProof,
  };
}

// A minimal, exact subset of TxLINE's official devnet IDL. Keeping only the
// validate_odds surface makes interface drift visible without vendoring unrelated
// trading instructions. The discriminator and field order match IDL v1.5.6.
const txlineValidationIdl = {
  address: TXLINE_DEVNET_PROGRAM_ID.toBase58(),
  metadata: {
    name: "txoracle",
    version: "1.5.6",
    spec: "0.1.0",
    description: "Pinned TxLINE devnet validate_odds interface",
  },
  instructions: [
    {
      name: "validate_fixture",
      discriminator: [231, 129, 218, 86, 223, 114, 21, 126],
      accounts: [{ name: "ten_daily_fixtures_roots" }],
      args: [
        { name: "snapshot", type: { defined: { name: "Fixture" } } },
        { name: "summary", type: { defined: { name: "FixtureBatchSummary" } } },
        { name: "sub_tree_proof", type: { vec: { defined: { name: "ProofNode" } } } },
        { name: "main_tree_proof", type: { vec: { defined: { name: "ProofNode" } } } },
      ],
      returns: "bool",
    },
    {
      name: "validate_odds",
      discriminator: [192, 19, 91, 138, 104, 100, 212, 86],
      accounts: [{ name: "daily_odds_merkle_roots" }],
      args: [
        { name: "ts", type: "i64" },
        { name: "odds_snapshot", type: { defined: { name: "Odds" } } },
        { name: "summary", type: { defined: { name: "OddsBatchSummary" } } },
        { name: "sub_tree_proof", type: { vec: { defined: { name: "ProofNode" } } } },
        { name: "main_tree_proof", type: { vec: { defined: { name: "ProofNode" } } } },
      ],
      returns: "bool",
    },
  ],
  types: [
    {
      name: "Fixture",
      type: {
        kind: "struct",
        fields: [
          { name: "ts", type: "i64" },
          { name: "start_time", type: "i64" },
          { name: "competition", type: "string" },
          { name: "competition_id", type: "i32" },
          { name: "fixture_group_id", type: "i32" },
          { name: "participant1_id", type: "i32" },
          { name: "participant1", type: "string" },
          { name: "participant2_id", type: "i32" },
          { name: "participant2", type: "string" },
          { name: "fixture_id", type: "i64" },
          { name: "participant1_is_home", type: "bool" },
        ],
      },
    },
    {
      name: "FixtureUpdateStats",
      type: {
        kind: "struct",
        fields: [
          { name: "update_count", type: "u32" },
          { name: "min_timestamp", type: "i64" },
          { name: "max_timestamp", type: "i64" },
        ],
      },
    },
    {
      name: "FixtureBatchSummary",
      type: {
        kind: "struct",
        fields: [
          { name: "fixture_id", type: "i64" },
          { name: "competition_id", type: "i32" },
          { name: "competition", type: "string" },
          { name: "update_stats", type: { defined: { name: "FixtureUpdateStats" } } },
          { name: "update_sub_tree_root", type: { array: ["u8", 32] } },
        ],
      },
    },
    {
      name: "Odds",
      type: {
        kind: "struct",
        fields: [
          { name: "fixture_id", type: "i64" },
          { name: "message_id", type: "string" },
          { name: "ts", type: "i64" },
          { name: "bookmaker", type: "string" },
          { name: "bookmaker_id", type: "i32" },
          { name: "super_odds_type", type: "string" },
          { name: "game_state", type: { option: "string" } },
          { name: "in_running", type: "bool" },
          { name: "market_parameters", type: { option: "string" } },
          { name: "market_period", type: { option: "string" } },
          { name: "price_names", type: { vec: "string" } },
          { name: "prices", type: { vec: "i32" } },
        ],
      },
    },
    {
      name: "OddsUpdateStats",
      type: {
        kind: "struct",
        fields: [
          { name: "update_count", type: "i32" },
          { name: "min_timestamp", type: "i64" },
          { name: "max_timestamp", type: "i64" },
        ],
      },
    },
    {
      name: "OddsBatchSummary",
      type: {
        kind: "struct",
        fields: [
          { name: "fixture_id", type: "i64" },
          { name: "update_stats", type: { defined: { name: "OddsUpdateStats" } } },
          { name: "odds_sub_tree_root", type: { array: ["u8", 32] } },
        ],
      },
    },
    {
      name: "ProofNode",
      type: {
        kind: "struct",
        fields: [
          { name: "hash", type: { array: ["u8", 32] } },
          { name: "is_right_sibling", type: "bool" },
        ],
      },
    },
  ],
} as unknown as Idl;

function assertBytes32(label: string, value: number[]): void {
  assert.equal(value.length, 32, `${label} must contain 32 bytes`);
  assert(value.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255), `${label} contains a non-byte value`);
}

export function assertAuthenticProofShape(proof: RawOddsValidation): void {
  assert.equal(proof.odds.FixtureId, proof.summary.fixtureId, "odds and summary fixture IDs differ");
  assert(Number.isSafeInteger(proof.odds.Ts) && proof.odds.Ts > 0, "odds timestamp is invalid");
  assert(proof.odds.MessageId.length > 0, "odds message ID is missing");
  assert(
    proof.summary.updateStats.minTimestamp <= proof.odds.Ts &&
      proof.odds.Ts <= proof.summary.updateStats.maxTimestamp,
    "odds timestamp is outside its batch summary",
  );
  assertBytes32("oddsSubTreeRoot", proof.summary.oddsSubTreeRoot);
  assert(proof.subTreeProof.length > 0 && proof.subTreeProof.length <= 32, "invalid odds subtree proof length");
  assert(proof.mainTreeProof.length > 0 && proof.mainTreeProof.length <= 32, "invalid odds main-tree proof length");
  for (const [group, nodes] of [["subTreeProof", proof.subTreeProof], ["mainTreeProof", proof.mainTreeProof]] as const) {
    nodes.forEach((node, index) => assertBytes32(`${group}[${index}].hash`, node.hash));
  }
}

export function assertProofMatchesPacket(proof: RawOddsValidation, packet: TxlineWinnerPacket): void {
  const { Pct: _pct, ...committedPacket } = packet;
  assert.deepEqual(proof.odds, committedPacket, "TxLINE proof returned a different odds packet");
}

export function dailyOddsRootPda(timestampMs: number): PublicKey {
  assert(Number.isSafeInteger(timestampMs) && timestampMs >= 0, "invalid proof timestamp");
  const epochDay = Math.floor(timestampMs / 86_400_000);
  assert(epochDay <= 0xffff, "proof timestamp exceeds TxLINE's u16 epoch-day range");
  const day = Buffer.alloc(2);
  day.writeUInt16LE(epochDay);
  return PublicKey.findProgramAddressSync(
    [Buffer.from(DAILY_ODDS_ROOT_SEED), day],
    TXLINE_DEVNET_PROGRAM_ID,
  )[0];
}

export function tenDailyFixturesRootPda(timestampMs: number): PublicKey {
  assert(Number.isSafeInteger(timestampMs) && timestampMs >= 0, "invalid fixture proof timestamp");
  const epochDay = Math.floor(timestampMs / 86_400_000);
  const windowStartDay = Math.floor(epochDay / 10) * 10;
  assert(windowStartDay <= 0xffff, "fixture proof timestamp exceeds TxLINE's u16 epoch-day range");
  const day = Buffer.alloc(2);
  day.writeUInt16LE(windowStartDay);
  return PublicKey.findProgramAddressSync(
    [Buffer.from(TEN_DAILY_FIXTURES_ROOT_SEED), day],
    TXLINE_DEVNET_PROGRAM_ID,
  )[0];
}

export function assertAuthenticFixtureProofShape(proof: RawFixtureValidation): void {
  assert.equal(pureFixtureId(proof.snapshot.FixtureId), pureFixtureId(proof.summary.fixtureId));
  assert(Number.isSafeInteger(proof.snapshot.Ts) && proof.snapshot.Ts > 0, "fixture timestamp is invalid");
  assert(Number.isSafeInteger(proof.snapshot.StartTime) && proof.snapshot.StartTime > 0, "fixture start time is invalid");
  assert.equal(proof.snapshot.CompetitionId, proof.summary.competitionId, "fixture competition IDs differ");
  assert.equal(proof.snapshot.Competition, proof.summary.competition, "fixture competition names differ");
  assertBytes32("updateSubTreeRoot", proof.summary.updateSubTreeRoot);
  assert(proof.subTreeProof.length <= 32, "invalid fixture subtree proof length");
  assert(proof.mainTreeProof.length <= 32, "invalid fixture main-tree proof length");
  for (const [group, nodes] of [["subTreeProof", proof.subTreeProof], ["mainTreeProof", proof.mainTreeProof]] as const) {
    nodes.forEach((node, index) => assertBytes32(`${group}[${index}].hash`, node.hash));
  }
}

export function suretyFixtureValidationInput(proof: RawFixtureValidation) {
  const args = fixtureAnchorArgs(proof, false);
  return {
    snapshot: args.snapshot,
    summary: args.summary,
    subTreeProof: args.subTreeProof,
    mainTreeProof: args.mainTreeProof,
  };
}

function fixtureAnchorArgs(proof: RawFixtureValidation, tamperFirstProofBit: boolean) {
  const mapProof = (nodes: RawProofNode[]) =>
    nodes.map((node) => ({ hash: [...node.hash], isRightSibling: node.isRightSibling }));
  const subTreeProof = mapProof(proof.subTreeProof);
  if (tamperFirstProofBit && subTreeProof[0]) subTreeProof[0].hash[0] = subTreeProof[0].hash[0]! ^ 1;
  return {
    snapshot: {
      ts: new BN(proof.snapshot.Ts),
      startTime: new BN(proof.snapshot.StartTime),
      competition: proof.snapshot.Competition,
      competitionId: proof.snapshot.CompetitionId,
      fixtureGroupId: proof.snapshot.FixtureGroupId,
      participant1Id: proof.snapshot.Participant1Id,
      participant1: proof.snapshot.Participant1,
      participant2Id: proof.snapshot.Participant2Id,
      participant2: proof.snapshot.Participant2,
      fixtureId: new BN(proof.snapshot.FixtureId),
      participant1IsHome: proof.snapshot.Participant1IsHome,
    },
    summary: {
      fixtureId: new BN(proof.summary.fixtureId),
      competitionId: proof.summary.competitionId,
      competition: proof.summary.competition,
      updateStats: {
        updateCount: proof.summary.updateStats.updateCount,
        minTimestamp: new BN(proof.summary.updateStats.minTimestamp),
        maxTimestamp: new BN(proof.summary.updateStats.maxTimestamp),
      },
      updateSubTreeRoot: proof.summary.updateSubTreeRoot,
    },
    subTreeProof,
    mainTreeProof: mapProof(proof.mainTreeProof),
  };
}

export async function validateFixtureOnDevnet(
  provider: AnchorProvider,
  proof: RawFixtureValidation,
  options: { tamperFirstProofBit?: boolean } = {},
): Promise<boolean> {
  assertAuthenticFixtureProofShape(proof);
  const roots = tenDailyFixturesRootPda(proof.snapshot.Ts);
  const account = await provider.connection.getAccountInfo(roots, "confirmed");
  assert(account, `TxLINE ten-day fixture root account ${roots.toBase58()} is absent`);
  assert(account.owner.equals(TXLINE_DEVNET_PROGRAM_ID), "fixture root has the wrong owner");
  const args = fixtureAnchorArgs(proof, options.tamperFirstProofBit ?? false);
  const program = new Program(txlineValidationIdl, provider);
  const validateFixture = program.methods.validateFixture;
  assert(validateFixture, "pinned TxLINE IDL did not expose validateFixture");
  return validateFixture(args.snapshot, args.summary, args.subTreeProof, args.mainTreeProof)
    .accountsStrict({ tenDailyFixturesRoots: roots })
    .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 })])
    .view() as Promise<boolean>;
}

function anchorArgs(proof: RawOddsValidation, tamperFirstProofBit: boolean) {
  const mapProof = (nodes: RawProofNode[]) =>
    nodes.map((node) => ({ hash: [...node.hash], isRightSibling: node.isRightSibling }));
  const subTreeProof = mapProof(proof.subTreeProof);
  if (tamperFirstProofBit) subTreeProof[0]!.hash[0] = subTreeProof[0]!.hash[0]! ^ 1;
  return {
    odds: {
      fixtureId: new BN(proof.odds.FixtureId),
      messageId: proof.odds.MessageId,
      ts: new BN(proof.odds.Ts),
      bookmaker: proof.odds.Bookmaker,
      bookmakerId: proof.odds.BookmakerId,
      superOddsType: proof.odds.SuperOddsType,
      gameState: proof.odds.GameState,
      inRunning: proof.odds.InRunning,
      marketParameters: proof.odds.MarketParameters,
      marketPeriod: proof.odds.MarketPeriod,
      priceNames: proof.odds.PriceNames,
      prices: proof.odds.Prices,
    },
    summary: {
      fixtureId: new BN(proof.summary.fixtureId),
      updateStats: {
        updateCount: proof.summary.updateStats.updateCount,
        minTimestamp: new BN(proof.summary.updateStats.minTimestamp),
        maxTimestamp: new BN(proof.summary.updateStats.maxTimestamp),
      },
      oddsSubTreeRoot: proof.summary.oddsSubTreeRoot,
    },
    subTreeProof,
    mainTreeProof: mapProof(proof.mainTreeProof),
  };
}

export async function validateOddsOnDevnet(
  provider: AnchorProvider,
  proof: RawOddsValidation,
  options: { tamperFirstProofBit?: boolean } = {},
): Promise<boolean> {
  assertAuthenticProofShape(proof);
  const roots = dailyOddsRootPda(proof.odds.Ts);
  const account = await provider.connection.getAccountInfo(roots, "confirmed");
  assert(account, `TxLINE daily odds root account ${roots.toBase58()} is absent`);
  assert(account.owner.equals(TXLINE_DEVNET_PROGRAM_ID), "daily odds root has the wrong owner");
  const args = anchorArgs(proof, options.tamperFirstProofBit ?? false);
  const program = new Program(txlineValidationIdl, provider);
  const validateOdds = program.methods.validateOdds;
  assert(validateOdds, "pinned TxLINE IDL did not expose validateOdds");
  return validateOdds(
      new BN(proof.odds.Ts),
      args.odds,
      args.summary,
      args.subTreeProof,
      args.mainTreeProof,
    )
    .accountsStrict({ dailyOddsMerkleRoots: roots })
    .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })])
    .view() as Promise<boolean>;
}
