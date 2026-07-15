import { PublicKey } from "@solana/web3.js";
import Nav from "../../components/nav.js";
import SettlePanel from "../../components/settle-panel.js";
import { decodePredicate } from "../../../services/predicate/src/compiler.js";
import { getSettlementAvailability } from "../../lib/settle-action.js";
import { getProgram, newConnection } from "../../lib/surety-client.js";

export const dynamic = "force-dynamic";

const usdc = (raw: string) => (Number(raw) / 1_000_000).toLocaleString("en-US", { maximumFractionDigits: 2 });

export default async function PolicyPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  const connection = newConnection();

  let policyKey: PublicKey;
  try {
    policyKey = new PublicKey(address);
  } catch {
    return <main><Nav active="coverage" /><div className="page"><h1>Invalid policy address</h1></div></main>;
  }

  const program = getProgram(connection, { publicKey: policyKey });
  let policy: Record<string, unknown>;
  try {
    policy = (await program.account.policy.fetch(policyKey)) as unknown as Record<string, unknown>;
  } catch {
    return <main><Nav active="coverage" /><div className="page"><h1>Policy not found</h1><p className="lede">No policy account exists at this address on devnet.</p></div></main>;
  }

  const predicateBytes = policy.predicateBytes as number[];
  const predicateLen = policy.predicateLen as number;
  let predicateText = "(undecodable predicate)";
  try {
    predicateText = decodePredicate(Uint8Array.from(predicateBytes.slice(0, predicateLen))).canonicalText;
  } catch {
    // leave placeholder
  }

  const statusObj = policy.status as { open?: object; triggered?: object; expired?: object };
  const status = statusObj.triggered ? "Triggered" : statusObj.expired ? "Expired" : "Open";
  const merkleReceiptHash = Buffer.from(policy.merkleReceiptHash as number[]).toString("hex");
  const hasReceipt = /[1-9a-f]/.test(merkleReceiptHash);

  const signatures = await connection.getSignaturesForAddress(policyKey, { limit: 5 }, "confirmed");
  const availability = status === "Open" ? await getSettlementAvailability(address) : null;

  return (
    <main>
      <Nav active="coverage" />
      <div className="page">
        <h1>Policy receipt</h1>
        <p className="lede" style={{ fontFamily: "monospace", fontSize: 13 }}>{address}</p>

        <div className="statgrid">
          <div className="stattile"><span>Status</span><strong className={`status-${status.toLowerCase()}`}>{status}</strong></div>
          <div className="stattile"><span>Coverage</span><strong>{usdc(String(policy.coverage))} tUSDC</strong></div>
          <div className="stattile"><span>Premium</span><strong>{usdc(String(policy.premium))} tUSDC</strong></div>
          <div className="stattile"><span>Predicate</span><strong style={{ fontSize: 15 }}>{predicateText}</strong></div>
        </div>

        <div className="formcard">
          <div className="field">
            <label>Merkle receipt hash</label>
            <input value={merkleReceiptHash} disabled style={{ fontFamily: "monospace" }} />
          </div>
          {!hasReceipt && status !== "Open" && (
            <div className="notice">
              No settlement proof recorded — this policy expired without a claim. The receipt hash
              only populates when a permissionless caller settles an open policy through{" "}
              <code>settle_policy</code>.
            </div>
          )}

          {availability && (
            <SettlePanel
              policyAddress={address}
              fixtureId={availability.fixtureId}
              hasCapturedProof={availability.hasCapturedProof}
            />
          )}

          <div className="field">
            <label>Recent on-chain activity</label>
            {signatures.length === 0 && <p className="lede" style={{ margin: 0 }}>No transactions found.</p>}
            {signatures.map((sig) => (
              <a key={sig.signature} href={`https://explorer.solana.com/tx/${sig.signature}?cluster=devnet`} target="_blank" rel="noreferrer" style={{ fontFamily: "monospace", fontSize: 13 }}>
                {sig.signature}
              </a>
            ))}
          </div>

          <a href={`https://explorer.solana.com/address/${address}?cluster=devnet`} target="_blank" rel="noreferrer" className="secondary-btn" style={{ textAlign: "center", textDecoration: "none" }}>
            View account on Solana Explorer
          </a>
        </div>
      </div>
    </main>
  );
}
