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
const oddsValidationIdl = {
  address: TXLINE_DEVNET_PROGRAM_ID.toBase58(),
  metadata: {
    name: "txoracle",
    version: "1.5.6",
    spec: "0.1.0",
    description: "Pinned TxLINE devnet validate_odds interface",
  },
  instructions: [
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
  const program = new Program(oddsValidationIdl, provider);
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
