import Nav from "../components/nav.js";
import PolicyComposer from "../components/policy-composer.js";
import { SETTLEMENT_DEMO_POLICY } from "../lib/config.js";

export default function CoveragePage() {
  return (
    <main>
      <Nav active="coverage" />
      <div className="page">
        <h1>Buy coverage.</h1>
        <p className="lede">
          Merchants back a real-world promotion — "pay 5,000 tUSDC if France wins" — with a fully
          collateralized on-chain policy. Coverage is priced from captured TxLINE StablePrice odds and
          the vault's current book state, then locked in a policy-specific escrow the moment you pay.
        </p>
        <a href={`/policy/${SETTLEMENT_DEMO_POLICY}`} className="notice" style={{ display: "block", textDecoration: "none", marginBottom: 20 }}>
          ▸ See a claim settle end-to-end — an open Spain–Belgium policy backed by an authentic
          TxLINE proof. Submit the proof and watch the atomic on-chain payout.
        </a>
        <PolicyComposer skin="merchant" />
      </div>
    </main>
  );
}
