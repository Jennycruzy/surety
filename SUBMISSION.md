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
- **Reproducible program.** The deployed SBF binary hashes to
  `afd0962c90732c7cdcc624bf753ed36066364fa902648a5e1b7cbc3607ef95cd`, matching both a fresh
  `anchor build` and a live on-chain dump — byte for byte.
- **Fully collateralized vault** with LP shares, per-outcome exposure-bucket caps,
  policy-specific SPL escrows, epoch-gated withdrawals, and permissionless expiry.
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
| `GET /api/odds/stream` | `services/feed-ingest/src/recorder.ts` | Live consensus odds capture |
| `GET /api/scores/stream` | recorder | Live score-event capture |
| `GET /api/odds/snapshot/{fixtureId}` | capture | Full-match odds snapshot used by the quote engine |
| `GET /api/scores/snapshot/{fixtureId}` | capture | Score snapshot |
| `GET /api/scores/historical/{fixtureId}` | capture | Historical score transcript |
| `GET /api/scores/stat-validation` (V2) | capture | The authentic final-outcome Merkle proof |
| On-chain `validate_stat_v2` (TxLINE program) | `programs/surety_core/src/lib.rs` CPI | The atomic settlement oracle |

Exact interfaces, discriminators, and captured schemas are pinned in `docs/GROUND_TRUTH.md`.

## Feedback on the TxLINE API

**What we liked most.** The on-chain validator is the standout. Being able to CPI into
`validate_stat_v2` and get a trustless boolean over an anchored Merkle root is exactly what
a settlement protocol needs — it let us build atomic, keeper-free payout with cryptographic
finality rather than a trusted feed. The streaming odds/scores were authentic and rich, and
the free World Cup tier made real end-to-end testing possible.

**Where we hit friction** (full dated log in `docs/FRICTION_LOG.md`):

- The exact request shape for `GET /api/scores/stat-validation` was not pinned in the docs
  we had, which made re-capturing a genuine proof for a specific fixture/sequence hard —
  we chose to remove an unverifiable capture rather than guess.
- `GET /api/scores/historical/{fixtureId}` returns an SSE transcript, but the rendered
  streaming guide treats the response like a JSON array — a client following it literally
  breaks. We reused the SSE parser and kept the raw bytes for checksums.
- The rendered validation guide lags the newest devnet IDL (v1.5.6 adds `validate_stat_v3`
  with multiproofs); integrators reading only the guide miss the lower-duplication path.
- A V2 settlement proof for a two-stat final outcome serialized to 1,185 bytes — close to
  Solana's transaction ceiling, so large compound predicates will need the V3 multiproof.

These were all workable, and none were blockers to shipping the atomic-settlement thesis.

## Links

- **Public repo:** _(add your GitHub URL)_
- **Deployed app / devnet endpoint:** _(see `DEPLOY.md`; the program is live on devnet at
  `3e5rBR2J9uHPHHn6tP8HF6mPbEJsJWtzQEyicv6v8qVW`)_
- **Demo video:** _(add your Loom/YouTube URL; see `DEMO_SCRIPT.md`)_
