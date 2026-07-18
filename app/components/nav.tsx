"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useState } from "react";
import { fundTestUsdc } from "../lib/faucet-action.js";

export default function Nav({ active }: { active: "dashboard" | "coverage" | "props" | "underwrite" }) {
  const { publicKey } = useWallet();
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleFaucet() {
    if (!publicKey) return;
    setPending(true);
    setStatus(null);
    try {
      const result = await fundTestUsdc(publicKey.toBase58());
      if (!result.ok) {
        setStatus(result.error);
        return;
      }
      setStatus(`+${(Number(result.amount) / 1_000_000).toLocaleString()} tUSDC · ${result.signature.slice(0, 8)}…`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "faucet failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brandmark">S</span>
        <span>SURETY</span>
        <small>DEVNET</small>
      </div>
      <nav>
        <a href="/" className={active === "dashboard" ? "active" : ""}>Glass balance sheet</a>
        <a href="/coverage" className={active === "coverage" ? "active" : ""}>Coverage</a>
        <a href="/props" className={active === "props" ? "active" : ""}>Props</a>
        <a href="/underwrite" className={active === "underwrite" ? "active" : ""}>Underwrite</a>
      </nav>
      <div className="navactions">
        {publicKey && (
          <button className="faucet" onClick={handleFaucet} disabled={pending} title="Devnet test-USDC, no monetary value">
            {pending ? "Minting…" : status ?? "Get test USDC"}
          </button>
        )}
        <WalletMultiButton />
      </div>
    </header>
  );
}
