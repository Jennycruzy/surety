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
