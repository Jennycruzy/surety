"use server";

import { readFile } from "node:fs/promises";
import { PublicKey } from "@solana/web3.js";
import { decodePredicate } from "../../services/predicate/src/compiler.js";
import { settlementPayloadFromProof, type RawV2Proof } from "../../services/settlement/src/v2-payload.js";
import { loadDeployer } from "./deployer.js";
import { buildSettlePolicyTx, getProgram, newConnection } from "./surety-client.js";

// Fixtures for which SURETY holds an authentic, on-chain-verifiable TxLINE V2 proof
// (written directly from authenticated response bytes and accepted by TxLINE's deployed
// devnet validator at Gate 4). SURETY never fabricates proof bytes, so a fixture that is
// not listed here simply cannot be settled yet — see docs/GROUND_TRUTH.md.
const CAPTURED_PROOFS: Record<string, string> = {
  "18218149": "data/recordings/phase0-18218149-seq1087-final-proof-v2.raw.json",
};

function policyFixtureId(policy: { predicateBytes: number[]; predicateLen: number }): string {
  const predicate = decodePredicate(Uint8Array.from(policy.predicateBytes.slice(0, policy.predicateLen)));
  return predicate.clauses[0]!.fixtureId.toString();
}

export type SettlementAvailability = { fixtureId: string; hasCapturedProof: boolean };

// Server-side check used by the policy page to render an honest settlement panel.
export async function getSettlementAvailability(policyAddress: string): Promise<SettlementAvailability> {
  const connection = newConnection();
  const key = new PublicKey(policyAddress);
  const program = getProgram(connection, { publicKey: key });
  const policy = await program.account.policy.fetch(key);
  const fixtureId = policyFixtureId({
    predicateBytes: policy.predicateBytes as number[],
    predicateLen: policy.predicateLen as number,
  });
  return { fixtureId, hasCapturedProof: fixtureId in CAPTURED_PROOFS };
}

export type SettleResult =
  | { settled: true; signature: string; coverage: string }
  | { settled: false; reason: string };

// Permissionlessly settles an open policy by submitting the authentic TxLINE proof for
// its fixture. The deployer key is used only as the fee-paying caller; settle_policy has
// no admin path (Gate 4 proved a freshly generated caller settles identically), so this
// asserts no privileged authority over the outcome — TxLINE's validator does.
export async function settlePolicy(policyAddress: string): Promise<SettleResult> {
  const connection = newConnection();
  const key = new PublicKey(policyAddress);
  const program = getProgram(connection, { publicKey: key });
  const policy = await program.account.policy.fetch(key);

  if ((policy.status as { open?: object }).open === undefined) {
    return { settled: false, reason: "Policy is not open — it has already been settled or expired." };
  }

  const fixtureId = policyFixtureId({
    predicateBytes: policy.predicateBytes as number[],
    predicateLen: policy.predicateLen as number,
  });
  const proofPath = CAPTURED_PROOFS[fixtureId];
  if (!proofPath) {
    return {
      settled: false,
      reason:
        `No authentic TxLINE proof has been captured for fixture ${fixtureId}. Settlement is ` +
        `permissionless and will execute the moment a genuine final-outcome proof for this fixture ` +
        `is available. SURETY never synthesizes proof bytes to force a payout.`,
    };
  }

  const proof = JSON.parse(await readFile(proofPath, "utf8")) as RawV2Proof;
  const payload = settlementPayloadFromProof(proof);
  const caller = loadDeployer();

  const tx = await buildSettlePolicyTx(connection, { caller: caller.publicKey, policyAddress: key, payload });
  const latest = await connection.getLatestBlockhash("confirmed");
  tx.feePayer = caller.publicKey;
  tx.recentBlockhash = latest.blockhash;
  tx.sign(caller);

  const signature = await connection.sendRawTransaction(tx.serialize(), { maxRetries: 5 });
  await connection.confirmTransaction({ signature, ...latest }, "confirmed");

  return { settled: true, signature, coverage: (policy.coverage as { toString(): string }).toString() };
}
