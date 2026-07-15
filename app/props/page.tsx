import Nav from "../components/nav.js";
import PolicyComposer from "../components/policy-composer.js";

export default function PropsPage() {
  return (
    <main>
      <Nav active="props" />
      <div className="page">
        <h1>Back a prop.</h1>
        <p className="lede">
          Same predicate engine, same escrow, same settlement path as merchant coverage — just a
          consumer skin. Stake tUSDC on a match outcome; if it lands, TxLINE's own on-chain proof
          releases your payout, no keeper or admin required.
        </p>
        <PolicyComposer skin="prop" />
      </div>
    </main>
  );
}
