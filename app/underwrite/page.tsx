import Nav from "../components/nav.js";
import UnderwritePanel from "../components/underwrite-panel.js";
import { getVaultStats } from "../lib/quote-action.js";

// Reads live devnet vault state on every request; never statically prerendered.
export const dynamic = "force-dynamic";

export default async function UnderwritePage() {
  const stats = await getVaultStats();
  return (
    <main>
      <Nav active="underwrite" />
      <div className="page">
        <h1>Underwrite the book.</h1>
        <p className="lede">
          Deposit tUSDC and receive vault shares. Your capital collateralizes every open policy;
          you earn every premium and pay every claim. Withdrawals are epoch-gated so LPs can't
          flee ahead of a final they're exposed to.
        </p>
        <UnderwritePanel initialStats={stats} />
      </div>
    </main>
  );
}
