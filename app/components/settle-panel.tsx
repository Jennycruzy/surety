"use client";

import { useState } from "react";
import { settlePolicy, type SettleResult } from "../lib/settle-action.js";

export default function SettlePanel({
  policyAddress,
  fixtureId,
  hasCapturedProof,
}: {
  policyAddress: string;
  fixtureId: string;
  hasCapturedProof: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<SettleResult | null>(null);

  async function handleSettle() {
    setPending(true);
    setResult(null);
    try {
      setResult(await settlePolicy(policyAddress));
    } catch (error) {
      setResult({ settled: false, reason: error instanceof Error ? error.message : "settlement failed" });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="field">
      <label>Permissionless settlement</label>
      <p className="lede" style={{ margin: "0 0 10px", fontSize: 13 }}>
        Anyone may settle this policy by submitting the authentic TxLINE Merkle proof for fixture{" "}
        <code>{fixtureId}</code>. The instruction CPIs into TxLINE&apos;s validator and pays out
        atomically only if the real proof verifies — the same path proven on devnet at Gate 4.
        {!hasCapturedProof && " No authentic proof for this fixture has been captured yet."}
      </p>
      <button className="primary-btn" onClick={handleSettle} disabled={pending}>
        {pending ? "Submitting proof…" : "Submit TxLINE proof & settle"}
      </button>
      {result?.settled === true && (
        <div className="notice success" style={{ marginTop: 12 }}>
          Settled atomically. Payout of {(Number(result.coverage) / 1_000_000).toLocaleString("en-US")} tUSDC released.{" "}
          <a href={`https://explorer.solana.com/tx/${result.signature}?cluster=devnet`} target="_blank" rel="noreferrer">
            View settlement transaction
          </a>
        </div>
      )}
      {result?.settled === false && (
        <div className="notice" style={{ marginTop: 12 }}>{result.reason}</div>
      )}
    </div>
  );
}
