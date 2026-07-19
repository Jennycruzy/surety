import type { Metadata } from "next";
import Nav from "../components/nav.js";

export const metadata: Metadata = {
  title: "SURETY — Documentation",
  description:
    "How SURETY prices, collateralizes, and cryptographically settles real-world promotions on Solana using TxLINE odds and Merkle proofs.",
};

const SECTIONS = [
  ["overview", "Overview"],
  ["how-it-works", "How it works"],
  ["settlement", "Settlement (the core)"],
  ["txline", "TxLINE integration"],
  ["predicates", "Predicate grammar"],
  ["pricing", "Quote engine"],
  ["app", "Using the app"],
  ["package", "npm package"],
  ["onchain", "On-chain references"],
  ["evidence", "Evidence & gates"],
] as const;

export default function Docs() {
  return (
    <main>
      <Nav active="docs" />
      <div className="docs-shell">
        <aside className="docs-toc">
          <span className="label">DOCUMENTATION</span>
          <nav>
            {SECTIONS.map(([id, label]) => (
              <a key={id} href={`#${id}`}>
                {label}
              </a>
            ))}
          </nav>
          <a
            className="docs-toc-ext"
            href="https://github.com/Jennycruzy/surety"
            target="_blank"
            rel="noreferrer"
          >
            GitHub repo →
          </a>
        </aside>

        <div className="docs-main">
          <header className="docs-hero">
            <span className="eyebrow">
              <span className="live-dot" /> SOLANA DEVNET · POWERED BY TxLINE
            </span>
            <h1>SURETY documentation</h1>
            <p className="lede">
              A shop runs a promo: "if France wins the final, everyone gets their money back." That&apos;s a real
              bill they might have to pay, and usually nobody has set the money aside for it. SURETY lets them
              lock up the full payout in advance and have it released automatically once the result is proven
              on-chain. Prices come from TxLINE&apos;s odds, and the payout is released by TxLINE&apos;s own
              validator, so no middleman decides who won.
            </p>
          </header>

          <section id="overview" className="docs-section">
            <h2>Overview</h2>
            <p>
              A promo like "refund everyone if France wins" is money the business may owe but hasn&apos;t set
              aside. Right now these get settled by hand: someone checks the result and decides whether to pay.
              SURETY handles it three ways instead.
            </p>
            <div className="docs-cards">
              <div className="docs-card">
                <b>Money is set aside first</b>
                <p>When a policy is bound, the whole payout goes into an escrow account for that policy. It&apos;s there before anyone needs it.</p>
              </div>
              <div className="docs-card">
                <b>Re-priced as it plays</b>
                <p>Open policies are re-priced from TxLINE&apos;s live odds while the match runs, and each figure is written to Solana so the history is there to check.</p>
              </div>
              <div className="docs-card">
                <b>Paid on proof</b>
                <p>A policy only pays out after TxLINE&apos;s on-chain program checks the Merkle proof and confirms the result.</p>
              </div>
            </div>
          </section>

          <section id="how-it-works" className="docs-section">
            <h2>How it works</h2>
            <p>Four steps, all built on real TxLINE data:</p>
            <ol className="docs-steps">
              <li>
                <b>Ingest.</b> TxLINE streams odds and scores over SSE. We save the exact bytes, so the same
                data can be replayed later byte for byte.
              </li>
              <li>
                <b>Quote.</b> The price depends on two things only: one saved TxLINE odds packet and the
                vault&apos;s current book. We publish a hash of the quote so anyone can recompute it and check
                the number wasn&apos;t changed.
              </li>
              <li>
                <b>Bind.</b> When you pay, the full coverage is locked in an escrow account for that one policy.
                If a broker referred the sale, their 5% is paid in the same transaction.
              </li>
              <li>
                <b>Settle.</b> Anyone can submit the TxLINE proof. Our program calls TxLINE&apos;s validator, and
                if it returns <code>true</code> the escrow pays out in the same transaction.
              </li>
            </ol>
          </section>

          <section id="settlement" className="docs-section">
            <h2>Settlement (the core)</h2>
            <p>
              Nothing in SURETY gets to decide the result on its own, not a keeper and not the program itself.
              <code>settle_policy</code> hands the proof to TxLINE&apos;s <code>validate_stat_v2</code> program
              and only pays out if TxLINE says the proof is good. Here is what it does:
            </p>
            <pre className="docs-code">
              <code>{`// programs/surety_core/src/lib.rs — settle_policy (condensed)

// 1. Confirm the score-root account is really owned by TxLINE
require_keys_eq!(*daily_scores_merkle_roots.owner, txline::PROGRAM_ID, ...);

// 2. CPI into TxLINE's on-chain validator with the authentic proof
invoke(&validation_ix, &[daily_scores_merkle_roots, txline_program])?;

// 3. Require the boolean return data to come from TxLINE and be true
let (return_program, return_bytes) = get_return_data().ok_or(...)?;
require_keys_eq!(return_program, txline::PROGRAM_ID, ...);
require!(return_bytes.as_slice() == [1u8], SuretyError::TxlinePredicateRejected);

// 4. Atomic payout in the SAME instruction
transfer_tokens(&policy_escrow, &payout_account, policy.coverage, ...)?;`}</code>
            </pre>
            <div className="docs-callout">
              Change a single bit of the proof and TxLINE returns <code>false</code>. The <code>require!</code>{" "}
              fails, the transaction is thrown out, and the money stays in escrow. It is TxLINE&apos;s Merkle root
              doing the checking, not us.
            </div>
          </section>

          <section id="txline" className="docs-section">
            <h2>TxLINE integration</h2>
            <p>Network ground truth (Solana devnet):</p>
            <div className="docs-tablewrap">
              <table className="docs-table">
                <tbody>
                  <tr><td>RPC</td><td><code>https://api.devnet.solana.com</code></td></tr>
                  <tr><td>API origin</td><td><code>https://txline-dev.txodds.com</code></td></tr>
                  <tr><td>TxLINE program</td><td><code>6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J</code></td></tr>
                </tbody>
              </table>
            </div>
            <p>On-chain validation instructions (each returns a Borsh <code>bool</code> via Solana return data):</p>
            <div className="docs-tablewrap">
              <table className="docs-table">
                <thead><tr><th>Instruction</th><th>Required account</th><th>Purpose</th></tr></thead>
                <tbody>
                  <tr><td><code>validate_odds</code></td><td><code>daily_odds_merkle_roots</code></td><td>Prove a quoted odds packet is in the anchored root</td></tr>
                  <tr><td><code>validate_stat</code></td><td><code>daily_scores_merkle_roots</code></td><td>Prove a single/binary score predicate</td></tr>
                  <tr><td><code>validate_stat_v2</code></td><td><code>daily_scores_merkle_roots</code></td><td>SURETY&apos;s settlement path (StatValidationInput)</td></tr>
                  <tr><td><code>validate_stat_v3</code></td><td><code>daily_scores_merkle_roots</code></td><td>Multiproof optimization candidate</td></tr>
                </tbody>
              </table>
            </div>
            <p>
              We only allow a bet type when two things are true: TxLINE can prove that stat, and the fixture
              actually has a matching odds market. Not every match quotes corners, cards, or player props, so we
              read the real odds for each fixture instead of assuming they exist.
            </p>
          </section>

          <section id="predicates" className="docs-section">
            <h2>Predicate grammar</h2>
            <p>
              A policy is stored as a fixed binary format, not the text you typed. That way two policies that
              mean the same thing get the same identity even if the spacing, capitalization, or clause order is
              different. Allowed forms:
            </p>
            <pre className="docs-code">
              <code>{`outcome(match_id) == WIN_HOME | DRAW | WIN_AWAY
stat(match_id, stat_name) op i32          // op ∈ >, >=, <, <=, ==
stat(match_id, period, stat_name) op i32  // period is matrix-gated
// at most two comparisons, joined by AND`}</code>
            </pre>
            <p>Proof-backed stat names:</p>
            <p className="docs-tags">
              {[
                "goals_home", "goals_away", "goals_total",
                "yellow_cards_home", "yellow_cards_away", "yellow_cards_total",
                "red_cards_home", "red_cards_away", "red_cards_total",
                "corners_home", "corners_away", "corners_total",
              ].map((s) => (
                <span key={s} className="docs-tag">{s}</span>
              ))}
            </p>
            <p>
              The SHA-256 of those bytes is the predicate hash, which is part of the policy&apos;s on-chain
              address. Worked example:
            </p>
            <pre className="docs-code">
              <code>{`text:   outcome(18237038) == WIN_HOME
bytes:  0101026e46160100000000000000000000
sha256: e74f3d39032f9c393744a58851631954bcf77a87f404e118d4b89b37700f1fa8`}</code>
            </pre>
          </section>

          <section id="pricing" className="docs-section">
            <h2>Quote engine</h2>
            <p>
              The premium comes from two inputs and nothing else: one saved TxLINE odds packet and the
              vault&apos;s current book. A quote comes back with a <b>verdict</b> (accept, surcharge, or reject),
              the <b>implied probability</b>, how much of the <b>bucket</b> it would use, the <b>premium</b>, and
              a <b>commitment hash</b>. Feed the same packet and book back in and you get the same hash, so you
              can check the price yourself.
            </p>
            <div className="docs-callout">
              TxLINE being able to prove a stat does not mean we can price it. If the chosen fixture has no
              matching odds market, the quote is rejected even though the result would settle fine.
            </div>
          </section>

          <section id="app" className="docs-section">
            <h2>Using the app</h2>
            <div className="docs-tablewrap">
              <table className="docs-table">
                <thead><tr><th>Route</th><th>What it does</th></tr></thead>
                <tbody>
                  <tr><td><a href="/dashboard">/dashboard</a></td><td>Glass balance sheet — solvency and liabilities re-marked live, hash-chained to Solana</td></tr>
                  <tr><td><a href="/coverage">/coverage</a></td><td>Buy coverage: pick an outcome, get a TxLINE quote, pay, and issue a collateralized policy</td></tr>
                  <tr><td><a href="/underwrite">/underwrite</a></td><td>Vault stats decoded live on-chain; deposit capital and mint test USDC</td></tr>
                  <tr><td><a href="/props">/props</a></td><td>Prop-style predicate policies (goals, cards, corners) where a market exists</td></tr>
                </tbody>
              </table>
            </div>
            <p>
              You&apos;ll need a Wallet-Standard wallet (Phantom, Solflare, or Backpack) set to <b>Devnet</b>,
              plus a little devnet SOL for fees. The <b>Get test USDC</b> button in the nav mints 2,000 tUSDC.
              It&apos;s devnet play money with no real value.
            </p>
          </section>

          <section id="package" className="docs-section">
            <h2>npm package</h2>
            <p>
              The part that verifies and replays TxLINE data is published on npm under MIT, so you can use it
              without pulling in the rest of SURETY. It has none of our pricing or insurance code in it.
            </p>
            <pre className="docs-code">
              <code>{`npm install @surety-tx/txline-verify @anchor-lang/core @solana/web3.js`}</code>
            </pre>
            <pre className="docs-code">
              <code>{`import { readFile } from "node:fs/promises";
import { assertAuthenticProofShape, type RawOddsValidation } from "@surety-tx/txline-verify";

const proof = JSON.parse(
  await readFile("txline-odds-proof.json", "utf8"),
) as RawOddsValidation;

assertAuthenticProofShape(proof);
console.log(proof.odds.MessageId, "has a valid, bounded proof payload");`}</code>
            </pre>
            <p>
              Pass an Anchor provider to <code>validateOddsOnDevnet</code> or{" "}
              <code>validateFixtureOnDevnet</code> and it asks TxLINE&apos;s deployed validator to check the
              proof for you.{" "}
              <a href="https://www.npmjs.com/package/@surety-tx/txline-verify" target="_blank" rel="noreferrer">
                View on npm →
              </a>
            </p>
          </section>

          <section id="onchain" className="docs-section">
            <h2>On-chain references</h2>
            <div className="docs-tablewrap">
              <table className="docs-table">
                <thead><tr><th>What</th><th>Reference</th></tr></thead>
                <tbody>
                  <tr>
                    <td>SURETY program</td>
                    <td>
                      <a href="https://explorer.solana.com/address/3e5rBR2J9uHPHHn6tP8HF6mPbEJsJWtzQEyicv6v8qVW?cluster=devnet" target="_blank" rel="noreferrer">
                        3e5rBR2J…v8qVW
                      </a>
                    </td>
                  </tr>
                  <tr>
                    <td>Authentic settlement</td>
                    <td>
                      <a href="https://explorer.solana.com/tx/5VeJNDvujC9EgXPY3GrWdJZJFoKqHK1Kp15FpWmDxQ28ubByZcxrSo4tovqNCV9ojFFTdo6GyrrJaSLY1JZ3ux8q?cluster=devnet" target="_blank" rel="noreferrer">
                        Proof verified → payout
                      </a>
                    </td>
                  </tr>
                  <tr>
                    <td>Tampered proof rejected</td>
                    <td>
                      <a href="https://explorer.solana.com/tx/Zvv5umPkM9ku19N1DMCRFsnwUcYUy9MJEDa8PjP8v6YKr5zRacv4LEY4xW2EK9QTsEBHaYCuh7So2cRSsxXfarW?cluster=devnet" target="_blank" rel="noreferrer">
                        One bit flipped → denied
                      </a>
                    </td>
                  </tr>
                  <tr>
                    <td>Broker split issuance</td>
                    <td>
                      <a href="https://explorer.solana.com/tx/5iZJ5HtxbQukdcYjqtQzb5ihXKKLbhTVY92xhHfJYy3qX7HQYutBUSjfR5bzMethihHSYSpk9RGV1aUcW3poqkdJ?cluster=devnet" target="_blank" rel="noreferrer">
                        Premium split → broker wallet
                      </a>
                    </td>
                  </tr>
                  <tr>
                    <td>Halftime settlement</td>
                    <td>
                      <a href="https://explorer.solana.com/tx/5oAEpxzLcVSd62eFxH9r6aoMjjYE5xuBEwu9uVqR7mZF3GSq4b3iD96ewuYakP4JXFgUNTgKFCt11i5f6UrcsG1E?cluster=devnet" target="_blank" rel="noreferrer">
                        Period settled mid-match
                      </a>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section id="evidence" className="docs-section">
            <h2>Evidence &amp; gates</h2>
            <p>We track what&apos;s actually been proven in <code>EVIDENCE.md</code>, one numbered gate per piece:</p>
            <div className="docs-tablewrap">
              <table className="docs-table">
                <thead><tr><th>Gate</th><th>Proves</th><th>Status</th></tr></thead>
                <tbody>
                  <tr><td>0</td><td>Ground truth against TxLINE docs</td><td><span className="docs-pass">PASS</span></td></tr>
                  <tr><td>1</td><td>Feed ingest + byte-exact replay</td><td><span className="docs-pass">PASS</span></td></tr>
                  <tr><td>2</td><td>Predicate grammar + canonical compiler</td><td><span className="docs-pass">PASS</span></td></tr>
                  <tr><td>3</td><td>Vault + collateralized policy lifecycle</td><td><span className="docs-pass">PASS</span></td></tr>
                  <tr><td>4</td><td>Atomic settlement via TxLINE CPI</td><td><span className="docs-pass">PASS</span></td></tr>
                  <tr><td>5</td><td>Deterministic quote engine + verdict gate</td><td><span className="docs-pass">PASS</span></td></tr>
                  <tr><td>6</td><td>Glass balance sheet</td><td><span className="docs-pass">PASS</span></td></tr>
                  <tr><td>7</td><td>Application layer + permissionless settlement</td><td><span className="docs-pass">PASS</span></td></tr>
                </tbody>
              </table>
            </div>
          </section>

          <footer className="docs-foot">
            <a className="primary-btn lp-btn" href="/dashboard">Open the balance sheet →</a>
            <span>SURETY · Solana devnet · not for monetary value</span>
          </footer>
        </div>
      </div>
    </main>
  );
}
