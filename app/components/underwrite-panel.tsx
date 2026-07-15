"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";
import { getVaultStats } from "../lib/quote-action.js";
import { buildExecuteWithdrawalTx, buildLpDepositTx, buildRequestWithdrawalTx } from "../lib/surety-client.js";
import { listWithdrawalRequests, type WithdrawalRequestView } from "../lib/withdrawal-action.js";

type VaultStats = Awaited<ReturnType<typeof getVaultStats>>;

const usdc = (raw: string) => (Number(raw) / 1_000_000).toLocaleString("en-US", { maximumFractionDigits: 2 });

export default function UnderwritePanel({ initialStats }: { initialStats: VaultStats }) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [stats, setStats] = useState(initialStats);
  const [depositAmount, setDepositAmount] = useState("1000");
  const [withdrawShares, setWithdrawShares] = useState("100");
  const [requests, setRequests] = useState<WithdrawalRequestView[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  async function refresh() {
    setStats(await getVaultStats());
    if (publicKey) setRequests(await listWithdrawalRequests(publicKey.toBase58()));
  }

  useEffect(() => { if (publicKey) void refresh(); }, [publicKey]);

  async function submit(name: string, build: () => Promise<import("@solana/web3.js").Transaction>) {
    if (!publicKey) return;
    setPending(name);
    setNotice(null);
    try {
      const tx = await build();
      const latest = await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = latest.blockhash;
      tx.feePayer = publicKey;
      const signature = await sendTransaction(tx, connection);
      await connection.confirmTransaction({ signature, ...latest }, "confirmed");
      setNotice({ kind: "success", text: `${name} confirmed: ${signature.slice(0, 20)}…` });
      await refresh();
    } catch (e) {
      setNotice({ kind: "error", text: e instanceof Error ? e.message : `${name} failed` });
    } finally {
      setPending(null);
    }
  }

  const sharePrice = Number(stats.sharePriceMicros) / 1_000_000;

  return (
    <>
      <div className="statgrid">
        <div className="stattile"><span>Total capital</span><strong>{usdc(stats.totalCapital)} tUSDC</strong></div>
        <div className="stattile"><span>Free reserves</span><strong>{usdc(stats.freeReserves)} tUSDC</strong></div>
        <div className="stattile"><span>Locked liabilities</span><strong>{usdc(stats.lockedLiabilities)} tUSDC</strong></div>
        <div className="stattile"><span>Open policies</span><strong>{stats.policyCount}</strong></div>
        <div className="stattile"><span>Share price</span><strong>{sharePrice.toFixed(4)} tUSDC</strong></div>
        <div className="stattile"><span>Bucket cap</span><strong>{(stats.maxBucketBps / 100).toFixed(1)}%</strong></div>
      </div>

      {notice && <div className={`notice ${notice.kind}`}>{notice.text}</div>}

      <div className="formcard" style={{ marginBottom: 20 }}>
        <div className="field">
          <label>Deposit amount (tUSDC)</label>
          <input type="number" min="1" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} />
        </div>
        <div className="actionrow">
          <button
            className="primary-btn"
            disabled={!publicKey || pending !== null}
            onClick={() => submit("Deposit", () => buildLpDepositTx(connection, { lp: publicKey!, assets: BigInt(Math.round(Number(depositAmount) * 1_000_000)) }))}
          >
            {pending === "Deposit" ? "Confirm in wallet…" : publicKey ? "Deposit and mint shares" : "Connect a wallet to deposit"}
          </button>
        </div>
      </div>

      <div className="formcard">
        <div className="field">
          <label>Withdraw shares</label>
          <input type="number" min="1" value={withdrawShares} onChange={(e) => setWithdrawShares(e.target.value)} />
        </div>
        <div className="actionrow">
          <button
            className="secondary-btn"
            disabled={!publicKey || pending !== null}
            onClick={() => submit("Withdrawal request", () => buildRequestWithdrawalTx(connection, { lp: publicKey!, requestId: BigInt(Date.now()), shares: BigInt(Math.round(Number(withdrawShares) * 1_000_000)) }))}
          >
            {pending === "Withdrawal request" ? "Confirm in wallet…" : "Request withdrawal"}
          </button>
        </div>
        <p className="lede" style={{ margin: 0, fontSize: 13 }}>
          Withdrawals only execute from free reserves after the vault's epoch boundary ({(Number(stats.epochSeconds) / 3600).toFixed(0)}h) —
          LPs cannot flee ahead of a final they're exposed to.
        </p>
      </div>

      {publicKey && requests.length > 0 && (
        <div className="tablecard" style={{ marginTop: 20 }}>
          <table>
            <thead><tr><th>Request</th><th>Shares</th><th>Unlocks</th><th>Status</th><th /></tr></thead>
            <tbody>
              {requests.map((r) => {
                const unlocked = Date.now() >= Number(r.unlockTs) * 1000;
                return (
                  <tr key={r.address}>
                    <td style={{ fontFamily: "monospace" }}>{r.address.slice(0, 8)}…</td>
                    <td>{(Number(r.shares) / 1_000_000).toFixed(2)}</td>
                    <td>{new Date(Number(r.unlockTs) * 1000).toLocaleString()}</td>
                    <td>{r.status === "Pending" ? (unlocked ? "Unlocked" : "Pending") : "Executed"}</td>
                    <td>
                      {r.status === "Pending" && unlocked && (
                        <button
                          className="secondary-btn"
                          disabled={pending !== null}
                          onClick={() => submit("Execute withdrawal", () => buildExecuteWithdrawalTx(connection, { caller: publicKey!, lp: publicKey!, requestId: BigInt(r.requestId) }))}
                        >
                          Execute
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
