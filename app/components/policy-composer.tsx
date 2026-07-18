"use client";

import { PublicKey } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useState } from "react";
import { requestQuote, type QuoteResult } from "../lib/quote-action.js";
import { buildIssuePolicyTx, buildIssuePolicyWithValidatedOddsTx } from "../lib/surety-client.js";
import { AWAY_TEAM, FIXTURE_ID, FIXTURE_LABEL, HOME_TEAM } from "../lib/config.js";

type Outcome = "WIN_HOME" | "DRAW" | "WIN_AWAY";
const OUTCOME_LABEL: Record<Outcome, { merchant: string; prop: string }> = {
  WIN_HOME: { merchant: `${HOME_TEAM} wins the match`, prop: `Back ${HOME_TEAM} to win` },
  DRAW: { merchant: "Match ends in a draw", prop: "Back the draw" },
  WIN_AWAY: { merchant: `${AWAY_TEAM} wins the match`, prop: `Back ${AWAY_TEAM} to win` },
};
const EXPIRY_SECONDS = 30 * 24 * 60 * 60; // 30 days — well past the fixture's resolution

export default function PolicyComposer({ skin }: { skin: "merchant" | "prop" }) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [outcome, setOutcome] = useState<Outcome>("WIN_HOME");
  // Keep the demo default comfortably below the live vault's exposure cap. A 500 tUSDC
  // request currently rejects correctly on-chain, but that makes the issuance step look
  // absent during a first-time walkthrough.
  const [coverage, setCoverage] = useState(skin === "merchant" ? "100" : "25");
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ policy: string; signature: string } | null>(null);
  const [shared, setShared] = useState<string | null>(null);

  async function shareAsBroker() {
    if (!publicKey) return;
    // Send recipients to SURETY directly. The previous dial.to wrapper is an external
    // dependency and currently returns a Cloudflare 403, even though our Action is live.
    const link = new URL("/coverage", window.location.origin);
    link.searchParams.set("broker", publicKey.toBase58());
    await navigator.clipboard.writeText(link.toString());
    setShared(link.toString());
  }

  async function getQuote() {
    setError(null);
    setQuote(null);
    setIssued(null);
    setQuoting(true);
    try {
      const result = await requestQuote({ outcome, coverage });
      setQuote(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "quote failed");
    } finally {
      setQuoting(false);
    }
  }

  async function confirm() {
    if (!quote || !publicKey) return;
    setError(null);
    setSubmitting(true);
    try {
      const nonce = BigInt(Date.now());
      const brokerRaw = new URLSearchParams(window.location.search).get("broker");
      const broker = brokerRaw ? new PublicKey(brokerRaw) : undefined;
      if (broker?.equals(publicKey)) throw new Error("self-referral is not allowed");
      const issueInput = {
        holder: publicKey,
        payoutAuthority: publicKey,
        nonce,
        predicateBytes: Buffer.from(quote.predicateBytesHex, "hex"),
        predicateLen: quote.predicateLen,
        predicateHash: Buffer.from(quote.predicateHash, "hex"),
        quoteHash: Buffer.from(quote.quoteHash, "hex"),
        bucketHash: Buffer.from(quote.bucketHash, "hex"),
        coverage: BigInt(quote.coverage),
        premium: BigInt(quote.premium!),
        expiresAt: BigInt(Math.floor(Date.now() / 1000) + EXPIRY_SECONDS),
        broker,
      };
      const tx = quote.validatedOddsMessageKeyHex
          ? await buildIssuePolicyWithValidatedOddsTx(connection, {
            ...issueInput,
            fixtureId: FIXTURE_ID,
            validatedOddsMessageKey: Buffer.from(quote.validatedOddsMessageKeyHex, "hex"),
          })
        : await buildIssuePolicyTx(connection, issueInput);
      const { policyPda } = await import("../lib/pda.js");
      const policy = policyPda(publicKey, Buffer.from(quote.predicateHash, "hex"), nonce);
      const latest = await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = latest.blockhash;
      tx.feePayer = publicKey;
      const signature = await sendTransaction(tx, connection);
      await connection.confirmTransaction({ signature, ...latest }, "confirmed");
      setIssued({ policy: policy.toBase58(), signature });
      setQuote(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "transaction failed");
    } finally {
      setSubmitting(false);
    }
  }

  const verdictClass = quote ? `verdict-${quote.verdict.toLowerCase()}` : "";
  const unit = skin === "merchant" ? "coverage" : "stake";

  return (
    <div className="formcard">
      <div className="field">
        <label>Fixture</label>
        <input value={`${FIXTURE_ID} · ${FIXTURE_LABEL}`} disabled />
      </div>
      <div className="field">
        <label>{skin === "merchant" ? "Outcome to insure against" : "Outcome to back"}</label>
        <div className="pillrow">
          {(Object.keys(OUTCOME_LABEL) as Outcome[]).map((key) => (
            <button
              key={key}
              type="button"
              className={`pill ${outcome === key ? "selected" : ""}`}
              onClick={() => { setOutcome(key); setQuote(null); setIssued(null); }}
            >
              {OUTCOME_LABEL[key][skin]}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label>{unit === "coverage" ? "Coverage amount (tUSDC)" : "Stake amount (tUSDC)"}</label>
        <input
          type="number"
          min="1"
          value={coverage}
          onChange={(e) => { setCoverage(e.target.value); setQuote(null); setIssued(null); }}
        />
      </div>

      {error && <div className="notice error">{error}</div>}

      <div className="actionrow">
        <button className="secondary-btn" onClick={shareAsBroker} disabled={!publicKey}>
          {publicKey ? "Share as broker link" : "Connect wallet to share as broker"}
        </button>
      </div>
      {shared && (
        <div className="notice success">
          Broker coverage link copied. You earn 5% of premium bound through it, paid on-chain at issuance. <a href={shared}>Open link</a>
        </div>
      )}

      {!quote && !issued && (
        <div className="actionrow">
          <button className="primary-btn" onClick={getQuote} disabled={quoting}>
            {quoting ? "Pricing from TxLINE odds…" : "Get TxLINE quote"}
          </button>
          <span className="action-hint">Then connect your wallet to pay and issue the policy.</span>
        </div>
      )}

      {quote && (
        <div className="quote-box">
          <span className={`verdict-pill ${verdictClass}`}>{quote.verdict}</span>
          <div className="quote-row"><span>Implied probability</span><strong>{(quote.probabilityPpm / 10_000).toFixed(2)}%</strong></div>
          <div className="quote-row"><span>Bucket utilization (projected)</span><strong>{(quote.projectedUtilizationBps / 100).toFixed(2)}%</strong></div>
          {quote.premium && (
            <div className="quote-row"><span>Premium</span><strong>{(Number(quote.premium) / 1_000_000).toFixed(2)} tUSDC</strong></div>
          )}
          <div className="quote-row"><span>Quote commitment</span><strong style={{ fontFamily: "monospace", fontSize: 12 }}>{quote.quoteHash.slice(0, 16)}…</strong></div>
          {quote.validationMode === "txline-cpi" && (
            <div className="quote-row"><span>Odds integrity</span><strong>TxLINE CPI validated</strong></div>
          )}
          {quote.verdict === "REJECT" ? (
            <div className="notice">This bucket is at its exposure cap — rejected before any funds move. Try a smaller amount or a different outcome.</div>
          ) : (
            <div className="actionrow">
              <button className="primary-btn" onClick={confirm} disabled={submitting || !publicKey}>
                {submitting
                  ? "Confirm in wallet…"
                  : publicKey
                    ? `Pay ${(Number(quote.premium) / 1_000_000).toFixed(2)} tUSDC & issue policy`
                    : "Connect a wallet to issue"}
              </button>
              <button className="secondary-btn" onClick={() => setQuote(null)} disabled={submitting}>Cancel</button>
            </div>
          )}
        </div>
      )}

      {issued && (
        <div className="notice success">
          Policy issued: <a href={`/policy/${issued.policy}`}>{issued.policy}</a><br />
          Transaction: <a href={`https://explorer.solana.com/tx/${issued.signature}?cluster=devnet`} target="_blank" rel="noreferrer">{issued.signature.slice(0, 20)}…</a>
        </div>
      )}
    </div>
  );
}
