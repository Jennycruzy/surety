"use client";

import { useEffect, useMemo, useState } from "react";
import Nav from "./components/nav.js";

export type BucketMark = { marked: string; utilizationBps: number };
export type DashboardRecord = {
  seq: number;
  hash: string;
  prevHash: string;
  oddsPacketRef: string;
  markedLiabilities: string;
  reserves: string;
  lockedCollateral: string;
  solvencyRatioBps: string;
  timestampMs: string;
  attestationPda: string;
  transactionSignature: string;
  bucketMarks: Record<string, BucketMark>;
};

const GOAL_TS = 1_784_060_376_027;
const BUCKET_LABELS: Record<string, string> = {
  "match:18237038:WIN_HOME": "France win",
  "match:18237038:DRAW": "Draw",
  "match:18237038:WIN_AWAY": "Spain win",
};
const short = (value: string) => `${value.slice(0, 6)}…${value.slice(-5)}`;
const usdc = (value: string) => (Number(value) / 1_000_000).toLocaleString("en-US", { maximumFractionDigits: 2 });

export default function Dashboard({ records }: { records: DashboardRecord[] }) {
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(true);
  const current = records[position]!;
  const goalLanded = Number(current.timestampMs) >= GOAL_TS;
  useEffect(() => {
    if (!playing || records.length < 2) return;
    const timer = window.setInterval(() => setPosition((value) => (value + 1) % records.length), 3000);
    return () => window.clearInterval(timer);
  }, [playing, records.length]);
  const ratio = Number(current.solvencyRatioBps) / 10_000;
  const ratioPct = Math.min(100, ratio * 10);
  const liabilitySeries = useMemo(() => records.map((record) => Number(record.markedLiabilities) / 1_000_000), [records]);
  const low = Math.min(...liabilitySeries) * 0.98;
  const high = Math.max(...liabilitySeries) * 1.02;

  return <main>
    <Nav active="dashboard" />

    <section className="hero">
      <div><p className="eyebrow"><span className="live-dot" /> LIVE REPLAY · FRANCE v SPAIN</p><h1>Every liability.<br/><em>Visible.</em></h1><p className="lede">TxLINE consensus odds continuously re-mark ten fully collateralized policies. Every state is chained and written to Solana.</p></div>
      <div className={`event-card ${goalLanded ? "landed" : ""}`}>
        <span>{goalLanded ? "GOAL CONFIRMED" : "MATCH IN PLAY"}</span><strong>{goalLanded ? "Spain scores" : "Awaiting event"}</strong><small>{goalLanded ? "TxLINE score packet · 57:35" : "Recorded TxLINE stream"}</small>
      </div>
    </section>

    <section className="grid">
      <article className="panel ratio-panel">
        <div className="panel-head"><div><span className="label">SOLVENCY RATIO</span><h2>{ratio.toFixed(4)}×</h2></div><span className="healthy">● HEALTHY</span></div>
        <div className="gauge"><div className="gauge-track"><div className="gauge-fill" style={{ width: `${ratioPct}%` }} /></div><div className="gauge-labels"><span>1.0× minimum</span><span>10.0×+</span></div></div>
        <div className="metrics"><div><span>Total reserves</span><strong>{usdc(current.reserves)} <small>tUSDC</small></strong></div><div><span>Marked liability</span><strong>{usdc(current.markedLiabilities)} <small>tUSDC</small></strong></div><div><span>Locked collateral</span><strong>{usdc(current.lockedCollateral)} <small>tUSDC</small></strong></div></div>
      </article>

      <article className="panel chart-panel">
        <div className="panel-head"><div><span className="label">MARKED LIABILITY</span><h3>Goal-window re-mark</h3></div><span className="delta">ON-CHAIN</span></div>
        <div className="bars">{records.map((record, index) => {
          const value = liabilitySeries[index]!; const height = 24 + ((value - low) / (high - low)) * 118;
          return <button key={record.seq} onClick={() => { setPosition(index); setPlaying(false); }} className={index === position ? "selected" : ""}><span style={{ height }} /><small>#{record.seq}</small></button>;
        })}</div>
        <div className="goal-line"><span>⚽ goal packet</span></div>
      </article>

      <article className="panel buckets">
        <div className="panel-head"><div><span className="label">OUTCOME BUCKETS</span><h3>Exposure concentration</h3></div><span>10 open policies</span></div>
        {Object.entries(current.bucketMarks).map(([bucket, mark]) => <div className="bucket" key={bucket}><div><span>{BUCKET_LABELS[bucket] ?? bucket}</span><strong>{usdc(mark.marked)} tUSDC</strong></div><div className="bucket-track"><span style={{width:`${Math.min(100, mark.utilizationBps / 100)}%`}} /></div></div>)}
      </article>

      <article className="panel chain">
        <div className="panel-head"><div><span className="label">ATTESTATION CHAIN</span><h3>Proof, not promises</h3></div><button onClick={() => setPlaying(!playing)}>{playing ? "Pause replay" : "Resume replay"}</button></div>
        <div className="chain-list">{records.slice(0, position + 1).reverse().map((record, index) => <a key={record.seq} href={`https://explorer.solana.com/address/${record.attestationPda}?cluster=devnet`} target="_blank"><span className={index === 0 ? "chain-dot newest" : "chain-dot"}/><div><strong>Attestation #{record.seq}</strong><small>{short(record.hash)}</small></div><time>{new Date(Number(record.timestampMs)).toISOString().slice(11,19)} UTC</time></a>)}</div>
      </article>
    </section>
    <footer><span>Powered by <strong>TxLINE</strong> consensus odds</span><span>Vault {short("CDyQxhDHsaWYNBvjJgGPVFZdsBD3mC28VEX5DkCZkqEC")}</span><span>Program {short("3e5rBR2J9uHPHHn6tP8HF6mPbEJsJWtzQEyicv6v8qVW")}</span></footer>
  </main>;
}
