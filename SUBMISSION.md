# SURETY — Submission Technical Documentation

## Core idea

SURETY is an on-chain **prize-indemnity and parametric prop-settlement protocol** on Solana
devnet. A merchant, sportsbook, or promoter can buy a **fully collateralized** policy —
"pay out if France wins" — and an LP vault backs it. The novel part is settlement: SURETY
does not trust a keeper, an admin, or its own dashboard to declare the result. It **CPIs
directly into TxLINE's on-chain `validate_stat_v2` validator**, which cryptographically
proves the final score against TxLINE's anchored Merkle root, and pays out **atomically in
the same transaction**. There is no path where a failed proof releases escrow, and no
privileged party can force one.

The protocol is deliberately "glass": every liability is continuously re-marked from real
TxLINE consensus odds and written to a tamper-evident, hash-chained on-chain balance sheet.

## Technical highlights

- **Atomic, permissionless settlement via TxLINE CPI.** `settle_policy` reconstructs the
  validator predicate from the policy's committed bytes, invokes TxLINE program
  `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J`, requires its boolean `true` return, and
  transfers escrow — all atomically. Proven on devnet with an authentic payout **and** a
  one-bit-tampered proof that is rejected while escrow stays locked.
- **No fabricated data, ever.** Odds, scores, and Merkle proofs are authentic TxLINE
  captures written straight from response bytes. During self-audit one capture was found to
  contain placeholder bytes; it was **removed**, not patched over (see `docs/FRICTION_LOG.md`).
- **Deterministic, verifiable pricing.** Premiums are a pure fixed-point function of one
  recorded TxLINE StablePrice packet and live vault state; the inputs are committed by an
  on-chain quote hash anyone can recompute.
- **Reproducible program.** The current 541,960-byte deployed SBF payload hashes to
  `6dcc0919a99fb94ebc9af7959a4123e699a66c6b3cd6bf83451e50ac939dc1fe`; those exact leading
  bytes match the live program-data account (whose unused preallocated tail is zero-filled).
- **Fully collateralized vault** with LP shares, per-outcome exposure-bucket caps,
  policy-specific SPL escrows, epoch-gated withdrawals, and permissionless expiry.
- **Trustless broker distribution.** A coverage link can bind a broker-of-record token
  account. At issuance the program atomically routes 5% of the validated premium to that
  broker and the net premium to carrier reserves; no-broker remains backward compatible,
  and self-referral is rejected.
- **Period-scoped products.** Predicate availability is generated from an authenticated
  TxLINE provability matrix. A halftime-goals policy has settled on devnet at the halftime
  sequence while later second-half events remained in the replay.
- **Glass balance sheet:** a ten-record hash chain posted on devnet, each record committing
  the prior hash, raw odds-packet hash, book snapshot, reserves, liabilities, and solvency
  ratio; `verify-chain` matches every local field to every on-chain account.

## Business highlights

- Turns "we'll refund everyone if X happens" promotions into a **pre-funded, provable**
  liability instead of a balance-sheet risk — the payout is escrowed at issuance.
- LPs earn premiums for underwriting real, cryptographically-settled event risk with
  bounded, per-outcome concentration caps.
- Buyers get a settlement they can verify themselves — the payout is decided by TxLINE's
  validator, not by SURETY.

## TxLINE endpoints and interfaces used

| Interface | Where | Use |
|---|---|---|
| On-chain `subscribe(serviceLevelId, durationWeeks)` | devnet | Activated the free World Cup tier |
| `POST /auth/guest/start` | `services/feed-ingest/src/auth.ts` | Guest JWT for data access |
| `POST /api/token/activate` | auth flow | Activated the API token |
| `GET /api/odds/stream` | `packages/txline-verify/src/recorder.ts` | Live consensus odds capture |
| `GET /api/scores/stream` | recorder | Live score-event capture |
| `GET /api/odds/snapshot/{fixtureId}` | capture | Full-match odds snapshot used by the quote engine |
| `GET /api/scores/snapshot/{fixtureId}` | capture | Score snapshot |
| `GET /api/scores/historical/{fixtureId}` | capture | Historical score transcript |
| `GET /api/scores/stat-validation` (V2) | capture | The authentic final-outcome Merkle proof |
| On-chain `validate_stat_v2` (TxLINE program) | `crates/txline-cpi` + `programs/surety_core/src/lib.rs` | The atomic settlement oracle |

Exact interfaces, discriminators, and captured schemas are pinned in `docs/GROUND_TRUTH.md`.

## Feedback on the TxLINE API

**What we liked most.** The on-chain validator is the standout. Being able to CPI into
`validate_stat_v2` and get a trustless boolean over an anchored Merkle root is exactly what
a settlement protocol needs — it let us build atomic, keeper-free payout with cryptographic
finality rather than a trusted feed. The streaming odds/scores were authentic and rich, and
the free World Cup tier made real end-to-end testing possible.

**Where we hit friction** (full dated log in `docs/FRICTION_LOG.md`):

- The stat-validation response exposes both a top-level timestamp and the stat summary's
  minimum timestamp. Only `summary.updateStats.minTimestamp` satisfies the deployed
  validator; using the plausible top-level field fails with `TimestampMismatch`.
- `GET /api/scores/historical/{fixtureId}` returns an SSE transcript, but the rendered
  streaming guide treats the response like a JSON array — a client following it literally
  breaks. We reused the SSE parser and kept the raw bytes for checksums.
- The rendered validation guide lags the newest devnet IDL (v1.5.6 adds `validate_stat_v3`
  with multiproofs); integrators reading only the guide miss the lower-duplication path.
- A V2 settlement proof for a two-stat final outcome serialized to 1,185 bytes — close to
  Solana's transaction ceiling, so large compound predicates will need the V3 multiproof.

These were all workable, and none were blockers to shipping the atomic-settlement thesis.

The friction we hit integrating the proof timestamp and CPI wire format is now packaged as
[`@surety/txline-verify`](https://www.npmjs.com/package/@surety/txline-verify) and
[`txline-cpi`](https://crates.io/crates/txline-cpi), so future TxLINE developers can skip it.
The repository already consumes those extracted workspaces; registry publication and the
public-install integrity gate remain pending maintainer npm/crates credentials and are not
claimed complete.

The period probe also produced two concrete TxLINE extension requests: document a
validator-backed goal-timestamp key/path, and expose penalties/shootout decision through an
on-chain validation path. Until then SURETY deliberately refuses time-bound predicates and
`decided_by = PENALTIES` rather than deriving them from unvalidated raw events.

## Links

- **Public repo:** https://github.com/Jennycruzy/surety
- **Deployed app:** https://surety-tx.vercel.app
- **Program (devnet):** `3e5rBR2J9uHPHHn6tP8HF6mPbEJsJWtzQEyicv6v8qVW`
- **Demo video:** _(add your Loom/YouTube URL; scene-by-scene script in `DEMO_SCRIPT.md`)_
