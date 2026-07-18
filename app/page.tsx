import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "SURETY — Promises, fully collateralized",
  description:
    "SURETY turns real-world promotions into fully collateralized, cryptographically settled insurance on Solana — priced and settled with real TxLINE odds and Merkle proofs.",
};

type Attestation = { seq: number; solvencyRatioBps: string; reserves: string; markedLiabilities: string };

function latestSolvency() {
  const rows = readFileSync(path.join(process.cwd(), "data/attestations-gate6.jsonl"), "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Attestation);
  const current = rows[rows.length - 1]!;
  const ratio = Number(current.solvencyRatioBps) / 10_000; // e.g. 9.916×
  const usdc = (value: string) =>
    (Number(value) / 1_000_000).toLocaleString("en-US", { maximumFractionDigits: 0 });
  return {
    ratioLabel: `${ratio.toFixed(2)}×`,
    gaugePct: Math.min(100, ratio * 10), // 1×–10× scale, matches the dashboard gauge
    reserves: usdc(current.reserves),
    liabilities: usdc(current.markedLiabilities),
  };
}

export default function Landing() {
  const solvency = latestSolvency();
  return (
    <main className="lp">
      <header className="lp-top">
        <div className="brand">
          <span className="brandmark">S</span>
          <span>SURETY</span>
          <small>DEVNET</small>
        </div>
        <div className="lp-topnav">
          <a href="https://www.npmjs.com/package/@surety-tx/txline-verify" target="_blank" rel="noreferrer">
            npm package
          </a>
          <a href="/docs">Docs</a>
          <a href="/coverage">Coverage</a>
          <a className="lp-enter-sm" href="/dashboard">
            Enter app →
          </a>
        </div>
      </header>

      <section className="lp-hero">
        <div className="lp-hero-copy">
          <span className="eyebrow">
            <span className="live-dot" /> FULLY COLLATERALIZED · SETTLED ON SOLANA
          </span>
          <h1>
            Promises you can <em>prove</em>.
          </h1>
          <p className="lede">
            "We&apos;ll refund every customer if France wins the final" is a real, unhedged liability.
            Today it settles on trust. SURETY makes that promise fully collateralized and cryptographically
            settled on-chain — priced from real TxLINE consensus odds, paid out by TxLINE&apos;s own on-chain
            validator. No invented feeds. No trusted oracle in the middle.
          </p>
          <div className="lp-cta-row">
            <a className="primary-btn lp-btn" href="/dashboard">
              Enter the balance sheet →
            </a>
            <a className="secondary-btn lp-btn" href="/coverage">
              Buy coverage
            </a>
          </div>
          <div className="lp-stats">
            <div>
              <strong>100%</strong>
              <span>Collateralized in escrow</span>
            </div>
            <div>
              <strong>On-chain</strong>
              <span>TxLINE validator settlement</span>
            </div>
            <div>
              <strong>Live</strong>
              <span>Solana devnet</span>
            </div>
          </div>
        </div>

        <aside className="lp-card">
          <span className="lp-card-label">SOLVENCY RATIO · ON-CHAIN</span>
          <strong className="lp-card-ratio">{solvency.ratioLabel}</strong>
          <small>Reserves vs. marked liabilities</small>
          <div className="gauge-track">
            <span className="gauge-fill" style={{ width: `${solvency.gaugePct}%` }} />
          </div>
          <div className="lp-card-rows">
            <div>
              <span>Free reserves</span>
              <b>{solvency.reserves} tUSDC</b>
            </div>
            <div>
              <span>Marked liabilities</span>
              <b>{solvency.liabilities} tUSDC</b>
            </div>
            <div>
              <span>Every state</span>
              <b>hash-chained to Solana</b>
            </div>
          </div>
        </aside>
      </section>

      <section className="lp-features">
        <article className="lp-feature">
          <span className="lp-feature-num">01</span>
          <h3>Continuously marked</h3>
          <p>
            Every open policy is re-marked from live TxLINE consensus odds. When a goal lands, liabilities
            and the solvency ratio move — and every state is hash-chained and written to Solana.
          </p>
        </article>
        <article className="lp-feature">
          <span className="lp-feature-num">02</span>
          <h3>Settled by cryptography</h3>
          <p>
            SURETY doesn&apos;t trust a keeper or itself to declare a result. It submits the authentic TxLINE
            Merkle proof and CPIs into TxLINE&apos;s on-chain validator. It returns true, the payout moves in
            the same transaction — or the escrow stays locked.
          </p>
        </article>
        <article className="lp-feature">
          <span className="lp-feature-num">03</span>
          <h3>Fully collateralized</h3>
          <p>
            The moment coverage is bound, the full payout is locked in a policy-specific escrow. No fractional
            reserves, no IOUs — solvency you can audit on the explorer, block by block.
          </p>
        </article>
      </section>

      <section className="lp-proof">
        <div className="lp-proof-head">
          <span className="label">VERIFIABLE, NOT MARKETING</span>
          <h2>Everything here is on-chain and reproducible.</h2>
        </div>
        <div className="lp-proof-grid">
          <a
            className="lp-proof-item"
            href="https://explorer.solana.com/address/3e5rBR2J9uHPHHn6tP8HF6mPbEJsJWtzQEyicv6v8qVW?cluster=devnet"
            target="_blank"
            rel="noreferrer"
          >
            <span>Deployed program</span>
            <b>3e5rBR2J…v8qVW</b>
            <small>Solana devnet · executable</small>
          </a>
          <a
            className="lp-proof-item"
            href="https://www.npmjs.com/package/@surety-tx/txline-verify"
            target="_blank"
            rel="noreferrer"
          >
            <span>Open verification layer</span>
            <b>@surety-tx/txline-verify</b>
            <small>Published on npm · MIT</small>
          </a>
          <a
            className="lp-proof-item"
            href="https://explorer.solana.com/tx/5VeJNDvujC9EgXPY3GrWdJZJFoKqHK1Kp15FpWmDxQ28ubByZcxrSo4tovqNCV9ojFFTdo6GyrrJaSLY1JZ3ux8q?cluster=devnet"
            target="_blank"
            rel="noreferrer"
          >
            <span>Authentic settlement</span>
            <b>Proof verified → payout</b>
            <small>Real devnet transaction</small>
          </a>
          <a
            className="lp-proof-item"
            href="https://explorer.solana.com/tx/Zvv5umPkM9ku19N1DMCRFsnwUcYUy9MJEDa8PjP8v6YKr5zRacv4LEY4xW2EK9QTsEBHaYCuh7So2cRSsxXfarW?cluster=devnet"
            target="_blank"
            rel="noreferrer"
          >
            <span>Tampered proof rejected</span>
            <b>One bit flipped → denied</b>
            <small>Escrow stays locked</small>
          </a>
        </div>
      </section>

      <section className="lp-final">
        <h2>
          Fully collateralized. Continuously marked. <em>Settled by cryptography.</em>
        </h2>
        <a className="primary-btn lp-btn" href="/dashboard">
          Enter the balance sheet →
        </a>
      </section>

      <footer>
        <span>SURETY · Powered by TxLINE — TxODDS World Cup Hackathon</span>
        <span>Solana devnet · not for monetary value</span>
      </footer>
    </main>
  );
}
