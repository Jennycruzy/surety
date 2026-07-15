import { BN } from "@anchor-lang/core";

// Shape of an authentic TxLINE `validate_stat_v2` proof capture, exactly as written
// from the authenticated HTTP response bytes (see docs/GROUND_TRUTH.md). This is the
// on-chain-proven mapping used by both the Gate 4 devnet settlement test and the app's
// permissionless settle action, so the UI settlement path is byte-for-byte the path
// already accepted by TxLINE's deployed validator on devnet.
export type RawProofNode = { hash: number[]; isRightSibling: boolean };
export type RawScoreStat = { key: number; value: number; period: number };
export type RawV2Proof = {
  ts: number;
  statsToProve: RawScoreStat[];
  eventStatRoot: number[];
  summary: {
    fixtureId: number;
    updateStats: { updateCount: number; minTimestamp: number; maxTimestamp: number };
    eventStatsSubTreeRoot: number[];
  };
  statProofs: RawProofNode[][];
  subTreeProof: RawProofNode[];
  mainTreeProof: RawProofNode[];
};

const mapProof = (nodes: RawProofNode[]) => nodes.map((node) => ({ hash: node.hash, isRightSibling: node.isRightSibling }));

// Build the `StatValidationInput` Anchor payload from a raw capture. `tamperMainProof`
// flips one bit of the first main-tree hash to prove that a mutated proof is rejected
// (Gate 4's negative case) — it is never used by real settlement.
export function settlementPayloadFromProof(proof: RawV2Proof, opts: { tamperMainProof?: boolean } = {}) {
  const mainTreeProof = mapProof(proof.mainTreeProof);
  if (opts.tamperMainProof) {
    const first = mainTreeProof[0];
    if (!first) throw new Error("proof has no main-tree nodes to tamper");
    const hash = [...first.hash];
    hash[0] = hash[0]! ^ 1;
    mainTreeProof[0] = { ...first, hash };
  }
  return {
    ts: new BN(proof.ts),
    fixtureSummary: {
      fixtureId: new BN(proof.summary.fixtureId),
      updateStats: {
        updateCount: proof.summary.updateStats.updateCount,
        minTimestamp: new BN(proof.summary.updateStats.minTimestamp),
        maxTimestamp: new BN(proof.summary.updateStats.maxTimestamp),
      },
      eventsSubTreeRoot: proof.summary.eventStatsSubTreeRoot,
    },
    fixtureProof: mapProof(proof.subTreeProof),
    mainTreeProof,
    eventStatRoot: proof.eventStatRoot,
    stats: proof.statsToProve.slice(0, 2).map((stat, index) => ({
      stat,
      statProof: mapProof(proof.statProofs[index]!),
    })),
  };
}
