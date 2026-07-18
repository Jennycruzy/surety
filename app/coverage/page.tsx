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
        <section className="demo-callout">
          <span className="label">LIVE SETTLEMENT DEMO</span>
          <h2>Spain–Belgium claim</h2>
          <p>
            Open a funded policy with an authentic captured TxLINE proof, then submit the proof
            and watch settlement execute atomically on devnet.
          </p>
          <a href={`/policy/${SETTLEMENT_DEMO_POLICY}`} className="primary-btn">
            Open policy &amp; submit TxLINE proof
          </a>
        </section>
        <PolicyComposer skin="merchant" />
      </div>
    </main>
  );
}
