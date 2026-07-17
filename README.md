# SURETY

**On-chain prize-indemnity and parametric prop-settlement for Solana.** SURETY lets a
merchant, sportsbook, or promoter buy a *fully collateralized* policy on a real-world
outcome — a home win, a draw, or an away win for a given fixture — that an LP vault backs.
Its distinguishing property is settlement: SURETY never trusts a keeper, an admin, or its
own dashboard to declare a result. It CPIs directly into TxLINE's on-chain
`validate_stat_v2` validator, which proves the final outcome against TxLINE's anchored
Merkle root, and pays out **atomically in the same transaction**. No path releases escrow on
a failed proof, and no privileged party can force one.

The protocol is deliberately *glass*: every liability is continuously re-marked from real
TxLINE consensus odds and written to a tamper-evident, hash-chained on-chain balance sheet.

Insurance has always been sold through commissioned brokers. SURETY models that faithfully:
any wallet that distributes a coverage link is a broker of record, and the protocol pays
broker commission on-chain, atomically, at bind time. This is not a growth hack bolted on —
it is the industry's actual distribution economics made trustless. Commission comes out of
the validated premium: the buyer's price is unchanged, the carrier reserve receives the net
premium, and the broker receives 5% in the same transaction.

- **Live app:** https://surety-tx.vercel.app
- **Program (devnet):** `3e5rBR2J9uHPHHn6tP8HF6mPbEJsJWtzQEyicv6v8qVW`
- **TxLINE validator (devnet):** `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J`

### Build on TxLINE faster

- [`@surety/txline-verify` on npm](https://www.npmjs.com/package/@surety/txline-verify) — connect, verify, record, and replay TxLINE packets.
- [`txline-cpi` on crates.io](https://crates.io/crates/txline-cpi) — Anchor-compatible types and helpers for one-CPI settlement against `validate_stat_v2`.

Both packages are extracted from the code SURETY runs. The repository consumes the same
workspace packages, and `make verify-sdk` installs the public artifacts and compares them
against a committed packet. Registry publication is pending maintainer credentials; the
links and integrity gate must not be represented as live until that publish succeeds.

---

## Table of contents

- [How settlement works](#how-settlement-works)
- [Proof-backed live issuance](#proof-backed-live-issuance)
- [Deterministic pricing](#deterministic-pricing)
- [Continuous odds validation](#continuous-odds-validation)
- [The vault](#the-vault)
- [Architecture](#architecture)
- [Quick start](#quick-start)
- [Verification](#verification)
- [Deployment](#deployment)
- [Test token & devnet notes](#test-token--devnet-notes)
- [Further reading](#further-reading)

---

## How settlement works

`settle_policy` is permissionless — anyone can call it, and the result cannot be influenced
by who does. In a single atomic transaction it:

1. Reconstructs the validator predicate from the policy's on-chain committed bytes.
2. CPIs into the TxLINE program `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J`, which
   verifies the final outcome against TxLINE's anchored Merkle root.
3. Requires the validator's boolean `true` return, then transfers the escrowed payout.

Because verification and payout share one transaction, there is no window in which a
rejected proof can release funds. This is demonstrated on devnet with **both** an authentic
final-outcome payout **and** a one-bit-tampered proof that TxLINE rejects while the escrow
stays locked. A dedicated, genuinely settleable demo policy
(`Axs7Tf6B2DbsDQ3EwLF4tvVrmhkb39hPR5FbrjUeUUon`) can be settled by anyone from the app.

The deployed SBF binary is reproducible: it hashes to
`6dcc0919a99fb94ebc9af7959a4123e699a66c6b3cd6bf83451e50ac939dc1fe`.
The live program-data account is a larger preallocated buffer; its first 541,960 bytes match
the local release binary exactly, while unused trailing allocation bytes are not part of
the artifact hash.

Period-scoped predicates are proof-gated from the committed provability matrix. Halftime
goals use TxLINE keys 2001/2002 and can settle as soon as the halftime phase is anchored;
an authentic devnet policy has done so while the recorded replay continued. Goal timestamps
and `decided_by = PENALTIES` remain designed refusals: the former has no confirmed stat key,
and the latter appears in raw events without a known on-chain validation path.

## Proof-backed live issuance

Beyond the recorded-odds demo, the deployed program supports a fully proof-backed issuance
path for live fixtures (formula version 2):

1. Prove fixture identity once via TxLINE `validate_fixture`, storing a `ValidatedFixture`
   receipt.
2. Fetch renewable price proofs and CPI into TxLINE `validate_odds`, storing a
   `ValidatedOdds` receipt.
3. Issue a policy against both receipts. The program checks proof freshness, matches the
   proved fixture/outcome, binds the exposure bucket on-chain, and recomputes the premium
   from the proved prices and current vault exposure.

Formula version 2 rejects the legacy issuance instruction on-chain and requires both
receipts. Formula version 1 demo vaults remain backward compatible. This path was deployed
and exercised on devnet for the France–England fixture `18257865`.

## Deterministic pricing

Any of three outcomes — **home win, draw, away win** — can be priced and insured for a
configured fixture. For a full-match 1X2 packet, each integer decimal price `dᵢ` becomes a
normalized probability `pᵢ = (1/dᵢ) / Σ(1/dⱼ)`, rounded half-up to parts per million.
Premiums use integer arithmetic only:

```text
premium = ceil(coverage × probability_ppm × margin_bps × surcharge_bps
               / (1,000,000 × 10,000 × 10,000))
```

Projected bucket utilization below 40% carries a 1.0× surcharge; from 40% to the hard cap
it rises linearly toward 2.0×, and a quote that reaches or crosses the cap is rejected. The
packet identity and source checksum, predicate, coverage, formula version, normalized
probability, full book-state hash, utilization, surcharge, verdict, and premium are all
committed by the policy's on-chain quote hash — anyone can recompute it.

## Continuous odds validation

In proof-required mode (`SURETY_REQUIRE_VALIDATED_ODDS=1`), the quote server synchronizes
the latest authenticated TxLINE packet on demand, so correctness never depends on a
background process. To *pre-warm* receipts and cut quote latency, a lightweight keeper runs
one validation tick — fetch the latest TxLINE packet, validate fixture + odds on devnet,
and record any missing receipts:

- **As a loop:** `npm run keeper:odds -- --fixture 18257865 --interval 60`
- **As an HTTP endpoint:** `GET /api/keeper?fixture=<id>` (authenticated), designed to be
  driven by any external scheduler so no persistent worker is required.

See [`DEPLOY.md`](DEPLOY.md) for the hosted keeper + scheduler setup.

## The vault

A fully collateralized LP vault with:

- LP share mint with deposit/withdraw and share-price accounting.
- Per-outcome exposure-bucket caps that bound concentration.
- Policy-specific SPL-token escrows funded at issuance.
- Epoch-gated withdrawals and permissionless expiry.
- A hash-chained on-chain balance sheet: each record commits the prior hash, raw
  odds-packet hash, book snapshot, reserves, liabilities, and solvency ratio;
  `verify-chain` matches every local field to every on-chain account.

## Architecture

```
programs/surety_core/    Anchor program: vault, issuance, settlement, TxLINE CPI
  src/lib.rs             Instructions and account state

crates/txline-cpi/       Publishable Rust CPI types/helpers used by surety_core
packages/txline-verify/  Publishable TypeScript verification/record/replay toolkit

services/                TypeScript services (run via tsx)
  feed-ingest/           TxLINE auth + CLI integration
  replay/                Replay CLI integration
  predicate/             Settleability-gated predicate compiler
  quote-engine/          Deterministic fixed-point pricing
  odds-validation/       validate_fixture / validate_odds + receipt sync + keeper
  settlement/            Settlement payload construction
  marker/                Hash-chained balance-sheet marker + verify-chain
  shared/                SURETY-only shared helpers

app/                     Next.js 16 web app (the "Glass Balance Sheet")
  api/keeper/            Authenticated pre-warm endpoint
  lib/                   On-chain client, config, server actions
  underwrite/ policy/ props/ coverage/   UI routes

data/                    Authentic TxLINE captures, quotes, attestations, evidence
docs/                    Ground-truth interfaces, predicate grammar, friction log
tests/                   Test suites per capability area
```

## Quick start

Requires Node.js ≥ 20.

```bash
npm install
npm run dev            # http://localhost:3000 — the Glass Balance Sheet
npm run build:web      # production build check
npm run typecheck      # TypeScript, no emit
```

The default configuration preserves the historical France–Spain recorded-odds demo. To run
a proof-required live-fixture build, copy `.env.example`, set the fixture ID/label, the team
names, a formula-v2 vault, the API/deployer credentials, and
`SURETY_REQUIRE_VALIDATED_ODDS=1`. Outcome-button team names come from
`NEXT_PUBLIC_SURETY_HOME_TEAM` / `NEXT_PUBLIC_SURETY_AWAY_TEAM` and fall back to neutral
"Home team" / "Away team" wording when unset.

## Verification

Plain-English PASS lines and Explorer links are in [`EVIDENCE.md`](EVIDENCE.md); pinned
TxLINE interfaces and captured schemas are in
[`docs/GROUND_TRUTH.md`](docs/GROUND_TRUTH.md).

```bash
make verify-phase1     # deterministic recording/replay
make verify-phase2     # predicate grammar
make verify-phase3     # program unit + localnet Anchor tests
ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
  ANCHOR_WALLET=.secrets/devnet-deployer.json make verify-phase4   # devnet settlement
make verify-phase5     # quote engine + devnet quote audit
make verify-phase6     # marker + on-chain hash-chain verification
```

Confirm TxLINE's deployed validator accepts an authentic odds proof and rejects a one-bit
mutation:

```bash
ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
  ANCHOR_WALLET=.secrets/devnet-deployer.json \
  npm run validate:odds-proof:devnet
```

## Deployment

The app is a standard Next.js 16 app and hosts on any serverless Next platform — no VPS
required. Full instructions, required environment variables, and the hosted keeper +
scheduler setup are in [`DEPLOY.md`](DEPLOY.md).

## Test token & devnet notes

Pricing and settlement use a six-decimal, program-minted devnet **test USDC** for
reproducibility. It is **not** Circle USDC and has **no monetary value**. TxLINE's credit
token is never used by the SURETY program or user flows. All addresses and transactions
referenced here are on Solana **devnet**.

## Further reading

- [`DEPLOY.md`](DEPLOY.md) — hosting the app and the keeper.
- [`EVIDENCE.md`](EVIDENCE.md) — verifiable claims with Explorer links.
- [`SUBMISSION.md`](SUBMISSION.md) — technical + business overview and TxLINE integration.
- [`DEMO_SCRIPT.md`](DEMO_SCRIPT.md) — walkthrough script for the live demo.
- [`docs/GROUND_TRUTH.md`](docs/GROUND_TRUTH.md) — pinned TxLINE interfaces and schemas.
- [`docs/PREDICATE_GRAMMAR.md`](docs/PREDICATE_GRAMMAR.md) — the settleability predicate grammar.
- [`docs/FRICTION_LOG.md`](docs/FRICTION_LOG.md) — dated integration notes.
</content>
