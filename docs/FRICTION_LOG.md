# TxLINE Integration Friction Log

This is an append-only record of issues encountered while using the real TxLINE
documentation, examples, API, and Solana programs. Resolved items remain here because
the hackathon submission requires authentic product feedback.

## 2026-07-14 — Devnet toolchain absent from build environment

- **Observed:** Node.js 24.14.0 and npm 11.9.0 were available, but `rustc`, `cargo`,
  `anchor`, and `solana` were not installed.
- **Impact:** Documentation and TypeScript examples can run; Anchor compilation and
  deployment cannot begin until the pinned toolchain is installed.
- **Status:** Partially resolved. Rust 1.97.0 and Solana CLI 4.1.1 are installed.
  Anchor remains pending because its installation was interrupted before completion.
  This is environment friction, not a TxLINE defect.

## 2026-07-14 — Official Solana devnet faucet unavailable

- **Observed:** `requestAirdrop` for 1 SOL returned `Internal error`. A retry for
  0.2 SOL returned HTTP/RPC 429 after exponential retries, reporting that the daily
  limit was reached or the faucet was dry.
- **Impact:** The free TxLINE subscription still requires transaction fees, so API
  activation and real capture are temporarily blocked for the newly generated Phase 0
  wallet `G1EK8zLzTD1xofBgqxThB8q1mdrW3Y18C9G8RW1kHAJq`.
- **Attempted:** Official public devnet RPC with both 1 SOL and 0.2 SOL requests.
- **Attempted:** Installed Solana's documented `devnet-pow` client and attempted the
  recommended proof-of-work flow. Claiming a mined reward still requires an initial
  transaction fee, and its bootstrap airdrop hit the same public faucet limit.
- **Status:** Open; the Phase 0 wallet needs a small initial devnet SOL transfer from
  an independently funded devnet wallet or authenticated provider faucet.

### Resolution

The operator funded the Phase 0 wallet with devnet SOL. The free subscription then
confirmed successfully. This did not resolve the public faucet issue itself.

## 2026-07-14 — Documentation lags the newest devnet example

- **Observed:** The on-chain validation guide calls V2 the current multi-stat path,
  while the official repository's latest devnet IDL is version 1.5.6 and includes
  `validate_stat_v3`. The repository also includes a newly updated V3 script using
  `/scores/stat-validation-v3`.
- **Impact:** Integrators reading only the rendered validation guide may miss the
  lower-duplication V3 multiproof path.
- **Status:** Under evaluation. SURETY will test both against live devnet and pin the
  exact version that passes CPI constraints.

## 2026-07-14 — Historical scores response is an SSE transcript

- **Observed:** `GET /api/scores/historical/18218149` returned HTTP 200 with a
  1,101,803-byte `data:`/`id:` event transcript rather than a JSON array. The rendered
  streaming guide's example treats `historicalScores.data` like an array and accesses
  `.length` and `.forEach` directly.
- **Impact:** A client following that snippet literally will count string characters
  or fail on `.forEach`. The replay recorder must preserve and parse the SSE framing.
- **Status:** Workaround confirmed: use the same SSE block parser as the live stream,
  while retaining the original response bytes for checksum verification.

## 2026-07-15 — Public devnet RPC dropped program-data write batches

- **Observed:** Two 415 KiB uploads through `api.devnet.solana.com` exhausted five
  and then ten blockhash retry windows with `Data writes to account failed: Max
  retries exceeded`. Account-read bursts also received HTTP 429 responses.
- **Impact:** The first upload left an incomplete buffer holding about 2.96 devnet
  SOL. Its downloaded checksum differed from the local SBF binary, so it was never
  deployed.
- **Attempted:** Reclaimed the incomplete buffer rent; retried with a persistent
  buffer keypair, RPC transport, skipped preflight, priority fee, and ten attempts.
- **Resolution:** Resumed the persistent buffer through the TPU client. The final
  deployed binary matches the local build byte-for-byte. The lifecycle runner now
  retains signatures itself and backs off on HTTP 429 account/status reads.
- **Status:** Resolved. This is Solana public-devnet infrastructure friction, not a
  TxLINE API defect.

## 2026-07-15 — Retained Gate 0 proof capture found to be non-authentic

- **Observed:** During a self-audit, `data/recordings/phase0-18237038-seq111-proof-v2.raw.json`
  (cited in `docs/GROUND_TRUTH.md` and `EVIDENCE.md` Gate 0 as an authentic
  `validate_stat_v2` proof for fixture 18237038 sequence 111) was found to contain
  Merkle proof nodes with non-cryptographic, hand-patterned byte runs (e.g. repeated
  `0xFF` and `0xBB` sequences across three of its four stat proofs) rather than the
  effectively-random output real SHA-256/on-chain hashing produces. This contradicted
  the file's own "nothing was synthesized or edited" provenance claim.
- **Impact:** One Gate 0 narrative bullet ("an authentic proof for observed semifinal
  sequence 111 ... validated through TxLINE `validate_stat_v2`") was not backed by
  what it claimed. No test in the repository depended on this specific file — the
  actually-exercised settlement proof (`phase0-18218149-seq1087-final-proof-v2.raw.json`,
  used by `tests/phase4/settlement.test.ts` and independently accepted by TxLINE's
  real deployed devnet validator, including a correct rejection of a one-bit-tampered
  copy) was unaffected and remains genuine.
- **Attempted:** Re-authenticated against TxLINE devnet (`X-Api-Token` + guest JWT,
  same pattern now extracted to `packages/txline-verify/src/recorder.ts`) to re-capture a genuine
  replacement proof for the same fixture/sequence. Authentication succeeded, but the
  exact request shape for `GET /api/scores/stat-validation` (query parameters or body
  identifying which stat predicate to prove) is not pinned anywhere in this repo's
  Gate 0 notes, and guessing it by trial and error risked producing exactly the kind
  of unverified, possibly-malformed data this entry is about.
- **Resolution:** Removed the file and corrected the citations in `docs/GROUND_TRUTH.md`
  and `EVIDENCE.md` rather than guess-replace it. The Gate 0 CPI-viability claim is
  fully covered by Gate 4's two real on-chain transactions (genuine proof accepted,
  tampered proof rejected), which is stronger evidence than a local simulation would
  have been anyway.
- **Status:** Resolved by correction. If the exact `stat-validation` request shape is
  ever pinned from the official docs, re-capturing a genuine sequence-111 proof would
  let this note be closed out with a real replacement instead.

## 2026-07-15 — V2 settlement proof approaches Solana's transaction ceiling

- **Observed:** The complete SURETY settlement transaction for a two-stat final
  outcome proof serialized to 1,185 bytes. Solana's transaction limit leaves only a
  small margin for additional accounts or proof nodes.
- **Impact:** V2 is sufficient for the binary World Cup outcome gate, but larger
  compound predicates may not fit even though TxLINE accepts them computationally.
- **Workaround:** SURETY requests and submits only the leaves required by the exact
  policy predicate and reconstructs the V2 strategy on-chain. It does not attach
  unused stats from the proof response.
- **Status:** Gate 4 passed with V2. The documented V3 multiproof is the planned path
  for larger compound settlements; it must be independently verified before use.

## 2026-07-15 — Odds-validation CPI requires a separate receipt transaction

- **Observed:** TxLINE's current OpenAPI documents `GET /api/odds/validation`, and the
  devnet IDL exposes `validate_odds`. The exact SURETY pricing packet returned a genuine
  proof and passed the deployed validator. A direct validation transaction serialized to
  1,119 bytes. Combining that proof with all policy-issuance accounts exceeded Solana's
  1,232-byte transaction limit.
- **Impact:** Odds proof validation and policy issuance cannot safely be packed into one
  legacy transaction for this real 19-node proof.
- **Resolution:** The additive design uses two real on-chain transactions. The first CPIs
  into TxLINE and stores a SURETY `ValidatedOdds` receipt; the second consumes the receipt,
  checks a 15-minute freshness window, matches fixture/outcome, and recomputes premium from
  current vault state. The two serialized transaction sizes are 1,227 and 702 bytes.
- **Status:** Resolved on 2026-07-16. Fixture, odds, and issuance transactions measured
  750, 1,095, and 735 bytes in the cloned-program local lifecycle; the deployed live proof
  varied to 963 bytes according to its Merkle path.

## 2026-07-16 — Live Merkle levels can legitimately be empty

- **Observed:** A fresh TxLINE odds validation response contained an empty subtree-proof
  vector because its record was already the subtree root. TxLINE's on-chain validator and
  SURETY's Rust bounds accepted this shape, but the initial TypeScript guard required at
  least one node.
- **Impact:** The first deployed keeper tick rejected a genuine proof before CPI.
- **Resolution:** Off-chain guards now cap proof lengths without requiring a non-empty
  level; cryptographic validity remains exclusively decided by TxLINE `validate_odds`.
- **Status:** Fixed, regression-tested, and followed by a successful deployed keeper CPI.

## 2026-07-16 — Exposure bucket must be derived on-chain

- **Observed:** The initial validated quote committed to a caller-provided bucket hash but
  did not recompute that hash from the proved fixture and predicate outcome.
- **Impact:** A direct caller could have selected a fresh bucket per policy and bypassed the
  per-outcome exposure cap even though each individual quote hash was internally consistent.
- **Resolution:** `issue_policy_with_validated_odds` now derives
  `sha256("match:<fixture>:<outcome>")` on-chain and rejects any other bucket. The local
  lifecycle submits the former attack and verifies atomic rejection.
- **Status:** Fixed before devnet deployment.

## 2026-07-17 — Stat proof timestamp field is ambiguous

- **Observed:** The stat-validation API returned both a top-level `ts` and
  `summary.updateStats.minTimestamp`. Building `StatValidationInput.timestamp` from `ts`
  produced TxLINE `TimestampMismatch` (6010), even though the proof was otherwise intact.
- **Impact:** A structurally valid halftime proof failed the deployed validator until the
  CPI payload used the timestamp committed by the stat summary.
- **Resolution:** The converter now passes `summary.updateStats.minTimestamp`; the same
  authentic key-2001 proof then passed `validate_stat_v2` and settled a halftime SURETY
  policy on devnet. The fix lives in the extracted `@surety/txline-verify` package so future
  TxLINE developers do not have to rediscover it. The companion `txline-cpi` crate packages
  the pinned CPI wire types. Registry targets:
  [npm](https://www.npmjs.com/package/@surety/txline-verify) and
  [crates.io](https://crates.io/crates/txline-cpi); publication is pending maintainer
  credentials, so this entry does not claim the registry artifacts are live yet.
- **Status:** Integration fixed and regression-tested; public-package gate pending auth.

## 2026-07-17 — Period proof coverage exceeds the documented market map

- **Observed:** Authenticated probes across two recorded fixtures returned verifiable proof
  structures for all 48 tested combinations of prefixes 1000/2000/3000 and base keys 1–8,
  including halftime goals at keys 2001/2002. Goal timestamps had no confirmed stat key,
  while penalties/shootouts appeared only in raw events with no known validation route.
- **Impact:** Cryptographic settleability alone cannot define the product grammar: some
  period stats still lack a deterministic consensus market for premium calculation.
- **Resolution:** `docs/provability-matrix.json` generates the proof menu, and the compiler
  applies a separate captured-market pricing gate. Goal timestamps and
  `decided_by = PENALTIES` are explicit designed refusals rather than inferred promises.
- **Extension request:** Document a validated goal-timestamp key/path and expose a
  validator-backed shootout decision field, plus publish the period-key/market mapping.
- **Status:** Probe and halftime settlement complete; unsupported claims remain excluded.
