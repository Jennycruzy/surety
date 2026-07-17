# SURETY Evidence

- **Live app:** https://surety-tx.vercel.app
- **Program (devnet):** `3e5rBR2J9uHPHHn6tP8HF6mPbEJsJWtzQEyicv6v8qVW`
- **TxLINE validator (devnet):** `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J`

Evidence is recorded only after a gate is actually satisfied. A documented design or
an unexecuted test is not counted as proof.

## Gate 0 — Ground truth

**Status: PASS**

Verified so far:

- PASS — Official TxLINE repository pinned at commit
  `eba4cb4d578bdb5cfad3c22dfd134f012496e445`.
- PASS — Devnet IDL version `1.5.6` inspected directly.
- PASS — TxLINE program `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J`
  exists on devnet and is executable.
- PASS — Exact validation instruction arguments, return type, proof-node layout, root
  PDA seeds, documented soccer stat keys, and final period semantics are recorded in
  `docs/GROUND_TRUTH.md`.
- PASS — Free-tier subscription confirmed on devnet:
  [open transaction](https://explorer.solana.com/tx/2ph7xmYEs2eLGXPQHGEfKT74fZoc18ZQA274sx5U1hoHnqPN7uFmjmJ91AgEMswzBWb8oCQ85y3BaR1FKXKvY2TY?cluster=devnet).
- PASS — Authenticated France–Spain raw capture contains 35,031 score-stream bytes
  and 289,212 odds-stream bytes. Checksums are recorded in `GROUND_TRUTH.md`.
- CORRECTED — An earlier off-chain simulation claimed an authentic proof for observed
  semifinal sequence 111 validated through TxLINE `validate_stat_v2`. The retained
  capture backing that claim was later found to contain non-cryptographic placeholder
  bytes, not a real TxLINE response; the file and the claim have been removed (see
  `docs/GROUND_TRUTH.md` and `docs/FRICTION_LOG.md`). The same underlying claim — a
  real proof validates, a one-bit-tampered proof is rejected — is proven authoritatively
  in Gate 4 below via two real devnet transactions using a different, genuinely
  authentic capture, which is stronger evidence than the removed local simulation ever
  was.
- PASS — The authentic Spain–Belgium `game_finalised` record at sequence 1087 has
  `StatusId=100`; its verified proof leaves all carry `period=100`.

Plain-English result: real TxLINE packets, real final-result proofs, and the deployed
devnet validator behave as required. No feed or proof shape was invented.

## Gate 1 — Feed ingest and byte-exact replay

**Status: PASS**

- PASS — `npm run record -- --duration 12 --output data/recordings/gate1-live-smoke`
  connected to both authenticated TxLINE devnet SSE streams and atomically saved:
  - odds: 34,225 bytes, 87 packets, SHA-256
    `36651c5493a87314d9377f86ccdbde1fe3041460488df35bf757881c30d948ba`;
  - scores: 2,198 bytes, 2 packets, SHA-256
    `e0bd8692090dbd35dddfa24c3dde180380a9c888abfd0a5dd60d4d859d44eba1`.
- PASS — Replaying each smoke-test file produced an exact byte copy with the same
  checksum and delivered all 87 odds packets and both score packets through the
  shared packet bus.
- PASS — `make verify-phase1` passed parser fragmentation tests and replayed the
  larger authentic Phase 0 odds log: all 289,212 bytes and 743 packets matched,
  checksum
  `5676364ca687377c3cccd33abe265da8edc6caa600f261f1f790e6fe56f70c23`.
- PASS — The recorder writes to a `.partial` file with exclusive creation and only
  renames it after clean framing, non-empty-stream, and byte-count checks succeed.
  `gate1-live-smoke.manifest.json` records the source paths and checksums.

Plain-English result: `make record` stores the bytes received from TxLINE without
normalizing or regenerating them. `make replay` feeds those exact bytes through the
same packet path used by live operation, and the checksum test detects any change.

## Gate 2 — Predicate grammar and canonical compiler

**Status: PASS**

`npm test grammar` result: 6 tests passed, 0 failed. The suite proves text/byte/text
round trips, stable formatting and case normalization, commutative `AND` ordering,
human-readable illegal-field rejection, duplicate and range checks, corrupted-byte
rejection, and a pinned protocol hash vector.

Five reproducible examples:

| Canonical predicate | SHA-256 predicate hash |
|---|---|
| `outcome(18237038) == WIN_HOME` | `e74f3d39032f9c393744a58851631954bcf77a87f404e118d4b89b37700f1fa8` |
| `stat(18237038,goals_total) > 2` | `5ad103c85bfda487b2c4c2bd0c6f2fd65c0891b7f0cd24a197c9cfdcce6ffa4f` |
| `stat(18218149,corners_home) >= 5` | `4241d046a038f5aaccc219800dd4efb499ee5a44d1126d1d2e5b279aad984c9a` |
| `stat(18218149,red_cards_away) == 0` | `bd42f1512e27e0a135d7fc8a86274f5a5a5cdc2bf13ec9cade0418cffdbea841` |
| `stat(18237038,goals_home) >= 1 AND stat(18237038,goals_total) <= 4` | `7a690612434f7023b6a534504085bec5d6322486e612b375e084c5ef26f72115` |

Plain-English result: semantically identical supported predicates produce identical
policy identity bytes. Unsupported or unproven TxLINE fields fail during authoring
with a reason; they cannot become policies. The exact wire format and field boundary
are documented in `docs/PREDICATE_GRAMMAR.md`.

## Gate 3 — Underwriting vault and fully collateralized policy lifecycle

**Status: PASS**

Program: [`3e5r…8qVW`](https://explorer.solana.com/address/3e5rBR2J9uHPHHn6tP8HF6mPbEJsJWtzQEyicv6v8qVW?cluster=devnet)

- PASS — The reproducible SBF binary was upgraded on devnet in
  [transaction `2kbD…aBsd`](https://explorer.solana.com/tx/2kbD9V8LV2odm1pKXZETEDxraN8Nq7k8QTSaFVCe91dAF3RPYuohFbC2BhkgVbdLfscwHqgXg75d2qBPH9U3aBsd?cluster=devnet).
  The deployed and local binaries have identical SHA-256
  `a5f3b7349da3386e2e295563ea4990cef660cb682f8e0a3ecd3b36fef4538f2c`.
- PASS — An LP deposited 1,000 program-minted **test USDC** and received shares in
  [transaction `VbNr…Y35A`](https://explorer.solana.com/tx/VbNrtSSfrEAFi61MTN4KHFB8XssvF89LtXJ9yrnoyJ4dJDfrKWe9KjQnGMtRJdfqdcg9sq96UqKZbqtypGnY35A?cluster=devnet).
- PASS — Policy issuance committed canonical predicate and quote hashes, charged a
  10 test-USDC premium, and moved the full 100 test-USDC coverage into a
  policy-specific escrow in
  [transaction `5Pmz…HnFT`](https://explorer.solana.com/tx/5Pmzshspv5m2ai3DSuUhRJDBrtLFGVoqj6XJPdnDBnwqrCWVPPZnXkqF3UAgQo6ywbXXrno6xiuP8innFfXUHnFT?cluster=devnet).
- PASS — A same-outcome policy above the 20% cap was deliberately submitted past
  preflight and failed on-chain with `0x1781` (`BucketCapExceeded`) in
  [transaction `4Tnr…1iRS`](https://explorer.solana.com/tx/4TnrkK2amsFc3cHWpFaoT6HWB5FuLaqpgTwe4mPkNWKaQWc1C5JKTav2sRHjpSr7Cfm8Z3YoKAMJC3jbxuyu1iRS?cluster=devnet).
  Its policy PDA was not created and no tokens moved.
- PASS — An unrelated newly generated caller expired the policy after its on-chain
  deadline. The 100 escrowed test USDC returned to free reserves in
  [transaction `66rX…wsbG`](https://explorer.solana.com/tx/66rXonUJpzc61U7jMaiRD9b1GcVrRfbGQ8XUmLwpaayci7nQ5J8N95svcKGqFvFz5hifgjHzBpr9dnZWjDszwsbG?cluster=devnet).
- PASS — Independent CLI confirmation reported deposit, issuance, and expiry as
  `Finalized` and the cap transaction as failed. Native tests pass 4/4, the SBF
  build has no stack-frame violations, and the local lifecycle passes end-to-end.

Evidence accounts: [test-USDC mint](https://explorer.solana.com/address/5hu7bznXnkQgFXTUzpjCs7cT26ACWbFmjUbK52tjdcuW?cluster=devnet),
[vault](https://explorer.solana.com/address/5TDWp87JY7YMiHSv1AvnhTQfbSJeiZk4pUt1YUsfQ5qE?cluster=devnet), and
[policy](https://explorer.solana.com/address/EUqwLVCPXbUZLgJsXqKFHtLpSWxJ4mirFkvq6TrXbNfR?cluster=devnet).

Plain-English result: LP capital and premiums are SPL tokens, not dashboard numbers.
Issuance physically locks the promised payout in a policy PDA. Concentrated exposure
was rejected atomically, and escrow was released only after expiry. The evidence mint
is a six-decimal devnet test token, not Circle USDC, and has no monetary value.

## Gate 4 — Atomic settlement through TxLINE validation CPI

**Status: PASS**

Program: [`3e5r…8qVW`](https://explorer.solana.com/address/3e5rBR2J9uHPHHn6tP8HF6mPbEJsJWtzQEyicv6v8qVW?cluster=devnet)

- PASS — The settlement-enabled SBF was deployed in
  [transaction `3T3R…W1Ns`](https://explorer.solana.com/tx/3T3RmyAWE9zFcr7oibAxabHySPMdSoR44wTxKgTSck6JTbNNCnTPe66F2PuA6zzyMUSXnyLoha456L2oYHy2W1Ns?cluster=devnet).
- PASS — A permissionless caller submitted the authentic TxLINE V2 proof for the
  final Spain–Belgium record. The SURETY instruction reconstructed the validator
  predicate from the policy bytes, CPI-called TxLINE program `6pW6…wyP2`, required
  its boolean `true` return, and paid the full 100 test USDC to the policy payout
  account in the same transaction:
  [settlement `4e7n…PMQzX`](https://explorer.solana.com/tx/4e7nfJWfAuuxaa58k7Ta8LXM8BJJ4tMX16yCXE4pRMNUxA8P1ZyvgowDecnoe3kjhtSjn31Z4jz8XwUFwRbPMQzX?cluster=devnet).
- PASS — The exact same settlement was first submitted after changing
  `mainTreeProof[0].hash[0]` with XOR `0x01`. TxLINE rejected it and the complete
  transaction failed:
  [tampered transaction `39Ly…NShB`](https://explorer.solana.com/tx/39Ly98r1SwDk4EbLiW1woStmdNeBS4agzFQDcNfVmr5KifegDvcurEACTUyDgDABu4uDtKFNMSc4kr7hz8FKNShB?cluster=devnet).
  The test then fetched the policy and token account and confirmed the policy was
  still open and all 100 test USDC remained in escrow.
- PASS — Caller `2CgbFVv8AY4LTJeRFRopX9gKv63KHA5q8hD13aZ3k2GZ` was generated for this
  test and is neither the deployer nor policyholder. There is no admin settlement
  instruction.
- PASS — Policy account
  [`2s1w…jZdmL`](https://explorer.solana.com/address/2s1wFgQZ4JKfXMBtAP85XQSPujRfXfkf2CnUzp3jZdmL?cluster=devnet)
  ended `Triggered`, its escrow ended at zero, its payout account received exactly
  100 test USDC, and its on-chain Merkle receipt hash is nonzero.

Reproduction command:

```text
ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
ANCHOR_WALLET=.secrets/devnet-deployer.json \
npm run test:phase4
```

The two settlement transactions were each 1,185 serialized bytes, below Solana's
transaction limit. The test printed 1 pass, 0 failures.

Plain-English result: no SURETY keeper or administrator asserted the result. TxLINE's
deployed validator accepted the authentic Merkle path and rejected a one-bit change.
Payout and proof verification are atomic, so there is no path where a failed proof
can release escrow.

## Gate 5 — Deterministic quote engine and verdict gate

**Status: PASS**

- PASS — The quote engine uses the authentic full-match TxLINE StablePrice packet
  `1837782566:00003:000791-10021-stab` from the recorded France–Spain snapshot. It
  removes overround by normalizing reciprocal decimal prices with integer arithmetic;
  prices `[2784, 2968, 3291]` produce probabilities
  `[359202, 336933, 303865]` ppm, which sum to exactly 1,000,000.
- PASS — Ten policies were quoted sequentially from the live on-chain vault and
  bucket state, issued on devnet, fetched back, and independently audited. Every
  recomputed hash matched its Policy account. The complete reproducible inputs are
  in `data/quotes/gate5-quotes.jsonl`; `npm run audit-quote -- --log
  data/quotes/gate5-quotes.jsonl --rpc https://api.devnet.solana.com` printed ten
  per-policy PASS lines and `PASS: audited 10 quote commitments`.
- PASS — The audit set's vault is
  [`CDyQ…ZkqEC`](https://explorer.solana.com/address/CDyQxhDHsaWYNBvjJgGPVFZdsBD3mC28VEX5DkCZkqEC?cluster=devnet).
  Example accepted policy
  [`3DNb…LHsn`](https://explorer.solana.com/address/3DNbBFvs3NT6LCKvLgWmk8eA9AExCUJUV7xVRbhaLHsn?cluster=devnet)
  committed quote `3a2b…aeae`; example surcharged policy
  [`6yqK…6STp`](https://explorer.solana.com/address/6yqKpAB449yWAP4e3i7hhuaxt3gEbo8sBJCjcHbJ6STp?cluster=devnet)
  committed quote `96a1…dc2d`.
- PASS — `data/verdicts/gate5-verdicts.jsonl` contains all inputs and results for
  ACCEPT, SURCHARGE, and REJECT. The surcharge case projected 45.20% utilization and
  applied 10,866 bps. The reject vector projected exactly 100.00% utilization and
  returned no premium.
- PASS — Local tests prove packet/book/coverage mutations change the commitment,
  accounting-invalid books are refused, and repeat computation is byte-stable.

Plain-English result: the premium is not a hardcoded UI number. It is a pure,
fixed-point function of one recorded real TxLINE packet and the vault state that
existed immediately before issuance. Anyone can recompute the result and compare it
to the immutable hash in the policy account.

## Gate 6 — Glass Balance Sheet

**Status: PARTIAL — protocol gate passes; required dashboard recording is pending**

- PASS — The attestation-enabled SBF (`afd0962c…ef95cd`) was upgraded in
  [transaction `5Qhh…zGc1P`](https://explorer.solana.com/tx/5QhhECbakWakK2BwSstVTcy7oSDqvzeFtdoBhgbHo9GyjN3i5om2dyc9z26pAS6PVsEcJwSz5pr3f8uaxqJzGc1P?cluster=devnet).
- PASS — Ten hash-chained solvency attestations were posted for ten open policies in
  vault
  [`CDyQ…ZkqEC`](https://explorer.solana.com/address/CDyQxhDHsaWYNBvjJgGPVFZdsBD3mC28VEX5DkCZkqEC?cluster=devnet).
  Every record commits the prior hash, raw odds-packet hash, complete book-snapshot
  hash, reserves, locked collateral, marked liabilities, ratio, and packet time.
- PASS — Records 6–10 use the full 7.5 MB authentic odds capture around the recorded
  France–Spain goal at score timestamp `1784060376027`; no packet or probability was
  synthesized. Marked liabilities moved from `125,692,760` to `133,889,200` minor
  units across the goal window, and the solvency ratio moved from 95,742 to 89,881
  bps.
- PASS — `npm run marker -- --verify-chain data/attestations-gate6.jsonl --rpc
  https://api.devnet.solana.com` recomputed the full chain and printed an on-chain
  match for all ten records. Example goal-window accounts:
  [record 7](https://explorer.solana.com/address/BkfPVQuL5VXu3wEV2cyAScyNBRKZNnpxBcYRueMqA8Ba?cluster=devnet),
  [record 8](https://explorer.solana.com/address/JAYa91gEFYAQ3TnDUmNLeHPosMDr7gjpNjct4ypBnDcN?cluster=devnet), and
  [record 10](https://explorer.solana.com/address/7PUzobdns5uTUQppFZKWPXSxxzA7yvTRm1dCPNC8pPKT?cluster=devnet).
- PASS — Rebuilding each five-record segment twice from the same packet bytes and
  clean state produced byte-identical chains. Local tests also prove policy ordering
  cannot change the book hash and a one-unit liability mutation breaks verification.
- PASS — The Next.js Glass Balance Sheet dashboard builds as a static production
  route (`npm run build:web`) and returned HTTP 200 locally. Its timed replay uses
  records 6–10 directly, surfaces the goal between records 7 and 8, animates the
  ratio/liability/bucket changes, and links every displayed attestation to Explorer.
- PENDING — the required 30-second dashboard recording showing the goal, re-mark,
  ratio movement, and new chain link. Gate 6 is intentionally not marked complete
  without it.

Plain-English result: the balance sheet is no longer an off-chain dashboard claim.
Its figures are fixed-point, its history is tamper-evident, and each compact record
exists in a dedicated devnet account. The missing item is presentation evidence, not
the protocol chain.

## Gate 7 — Application layer and permissionless settlement

**Status: PASS (protocol + web); one presentation artifact still pending under Gate 6)**

The Next.js application is wired to the real pinned devnet vault, not a demo copy. During
this gate several defects that made the web layer non-functional were found by direct
audit and fixed; each claim below was re-verified after the fix.

- PASS — `npm run build:web` produces an optimized production build (exit 0): `/`,
  `/coverage`, `/props` static and `/underwrite`, `/policy/[address]` server-rendered on
  demand. `npx tsc --noEmit` is clean.
- CORRECTED — The web layer previously could not build or read chain state:
  - `app/lib/surety-client.ts` loaded the IDL with `node:fs`, which was pulled into the
    client bundle (`the chunking context does not support external modules: node:fs`).
    The IDL is now a static JSON import, so the module is browser-safe.
  - Every live account read used camelCase fields (`vault.policyCount`,
    `policy.predicateBytes`, …) against a `BorshAccountsCoder` that returns **snake_case**,
    so each read threw at runtime. The reads now use the Anchor account namespace
    (`program.account.vault.fetch`, `.policy.fetch`, `.exposureBucket.fetch`), which is the
    same camelCased path the passing devnet tests use.
  - `next/link` did not resolve under `moduleResolution: NodeNext`; the four-item navbar
    now uses plain anchors. `tests/phase6/attestation-devnet.test.ts` was updated for the
    marker's new required `maxBucketBps` field.
- PASS — Live reads verified against vault
  [`CDyQ…ZkqEC`](https://explorer.solana.com/address/CDyQxhDHsaWYNBvjJgGPVFZdsBD3mC28VEX5DkCZkqEC?cluster=devnet):
  `getVaultStats` returns `total_capital = 1,203,418,534`, `policy_count = 10`, share price
  `1.203418`; `requestQuote(WIN_HOME, 100)` returns verdict SURCHARGE with normalized
  probability `359,202` ppm — the exact France full-match value recorded at Gate 5.
- PASS — Settlement is now a first-class client capability, not test-only code. The proof→
  payload mapping (`services/settlement/src/v2-payload.ts`) and the transaction builder
  (`buildSettlePolicyTx`) are shared by both the Gate 4 devnet test and the app's
  permissionless `settlePolicy` server action, so the UI settlement path is byte-identical
  to the one TxLINE's deployed validator accepts. Re-running Gate 4 through the shared code
  produced a fresh authentic settlement
  [`5VeJ…3ux8q`](https://explorer.solana.com/tx/5VeJNDvujC9EgXPY3GrWdJZJFoKqHK1Kp15FpWmDxQ28ubByZcxrSo4tovqNCV9ojFFTdo6GyrrJaSLY1JZ3ux8q?cluster=devnet)
  and a rejected one-bit-tampered attempt
  [`Zvv5…farW`](https://explorer.solana.com/tx/Zvv5umPkM9ku19N1DMCRFsnwUcYUy9MJEDa8PjP8v6YKr5zRacv4LEY4xW2EK9QTsEBHaYCuh7So2cRSsxXfarW?cluster=devnet)
  from freshly generated permissionless caller `Dr1gYqURoCWfzsk65jucGEg2jDQy4cao7bvSHgpEnZ8q`.
- PASS — Honest settlement gating. The ten open France–Spain policies are on fixture
  `18237038`, for which **no authentic final-stat settlement proof has been captured** (an
  authentic odds proof now exists, but it cannot replace a result proof; the only genuine
  final-outcome proof on hand is the Spain–Belgium `18218149` capture, and that match was
  never captured finalized for `18237038`). The settle action therefore refuses these
  policies with a plain reason and submits nothing; it never synthesizes proof bytes to
  force a payout. This is the same discipline that removed the non-authentic Gate 0 capture
  (see `docs/FRICTION_LOG.md`).
- PASS — Dedicated settleable demo. Because the fixture SURETY holds a genuine proof for is
  Spain–Belgium `18218149`, a separate demo vault
  [`QVze…qDh9`](https://explorer.solana.com/address/QVze8qNHiFF4pNM684TJTV8fM67acaHYE9ZAKQcqDh9?cluster=devnet)
  was stood up (`scripts/setup-settlement-demo.ts`) holding an **open** `18218149` WIN_HOME
  policy
  [`CpCd…pqXGq`](https://explorer.solana.com/address/CpCdFcNkHHjQwW7J4AKyuRZNxusRMi8a6kSKjM2pqXGq?cluster=devnet),
  reachable in the app at `/policy/CpCd…pqXGq` and settleable by anyone through the same
  permissionless path. The vault-agnostic builder derives every account from the policy's
  own `vault` field and was verified end-to-end: sibling policy
  [`Con2…rXCmp`](https://explorer.solana.com/address/Con2wwzsWAZUYL3YJTzPi1AyyJ8BjVYHduHvpaqrXCmp?cluster=devnet)
  settled on that vault in
  [`iXnC…7NfH`](https://explorer.solana.com/tx/iXnC7c4W3ySnPfJVZfwyCMNi8RkJZVG29EapifGaoWSXgBbE3QfZajHtck8DFE4eiHDHMDwwc5H1gtCnB3L7NfH?cluster=devnet)
  (status `Triggered`), and simulating the app's own settle transaction against the still-open
  demo policy returns success with the TxLINE CPI validated (the demo policy is left open so a
  viewer can fire the real payout). The France–Spain showcase vault `CDyQ…ZkqEC` is untouched.

**Asset mint note.** Gate 3's lifecycle used a throwaway six-decimal test-USDC mint
`5hu7bznXnkQgFXTUzpjCs7cT26ACWbFmjUbK52tjdcuW`. The live app vault `CDyQ…ZkqEC` (Gates 5–7)
uses a distinct test-USDC mint `FiJfrnLoc2vZmjixZqCEBuWd8A5EuDaF9MZZhd96bpck`; the vault's
on-chain `asset_mint` field was decoded and confirms `FiJf…bpck`. Both are valueless devnet
tokens with no relation to Circle USDC.

- PASS — Deployed-baseline reproducibility was re-verified at Gate 7. `anchor build` produced
  `target/deploy/surety_core.so` with SHA-256
  `afd0962c90732c7cdcc624bf753ed36066364fa902648a5e1b7cbc3607ef95cd`, matching both the
  Gate 6 claim and a `solana program dump` of the deployed program — byte for byte. The
  additive odds-validation source described below builds to a different binary and is not
  included in this historical deployed-hash claim.
- PASS — Deployment readiness. The faucet and settlement server actions load the deployer
  key via `SURETY_DEPLOYER_SECRET` (env var) with a local-file fallback, and `next.config.ts`
  traces the authentic capture files into the serverless bundle, so the app hosts on any
  serverless Next platform (see `DEPLOY.md`) — no VPS required.

- TOOLING PASS / ARTIFACT PENDING — `scripts/capture-broll.mjs` (declared Playwright
  dependency) now records at least 33 seconds across the glass balance sheet goal replay and
  settlement policy page. The existing checked-in WebM predates that duration correction and
  is not claimed as the formal Gate 6 recording. Re-run the script or replace it with the
  narrated submission capture before marking Gate 6 complete.

**Remaining human artifact:**

- The narrated ≤5-minute submission demo video must be recorded by the team (voiceover plus
  the wallet-signed buy-coverage flow, which a headless capture cannot drive). A scene-by-
  scene script is in `DEMO_SCRIPT.md`.

## TxLINE fixture + odds validation — DEPLOYED AND EXERCISED

- PASS — TxLINE devnet returned an authentic `/api/odds/validation` response for the exact
  full-match 1X2 packet used by pricing: fixture `18237038`, message
  `1837782566:00003:000791-10021-stab`, timestamp `1784056509431`. The 3,453 raw response
  bytes are preserved with SHA-256
  `98a580777e4ab036bad4c67f77884b422483123090d09eefa6bfd6c6d1ebb143`.
- PASS — TxLINE's deployed devnet `validate_odds` returned `true` against root PDA
  `9CrnWb2ZBtxX3B2C7GUDacb8AnjvySjyDtci7uy4gdoH`; changing one proof bit was rejected.
- PASS — The final SURETY source builds to a 666,136-byte SBF binary with SHA-256
  `5cc17fc68c6f4a88b181873a0d191c048375fba4c69dac878d0d0a074a49d0b0`. A dump of the
  upgraded 670,384-byte program-data allocation at slot `476613238` matches all 666,136
  binary bytes exactly; the allocation remainder is zero padding. Upgrade transaction:
  `57Ufs9apeuCuFNxozw9QWy2747GivU4sxx79Ft7RTEXXnebP4tMtCjQoqmaz8o1DimqwNK6bTjwmH5NReDRM726P`.
- PASS — The official TxLINE `validate_fixture` CPI recorded France–England fixture
  `18257865` at receipt `5gYE…uaNh` in transaction
  `2GsWtfUUwtQQ1ZawGivJKmB5NQ2svzgz3cQUmHt4NA84U19MkRPuabEbbgmQf7LjLtSKAu3emuuU2RfeLZksaeEw`.
- PASS — The cloned-program local lifecycle performed fixture CPI → odds CPI → issuance.
  Wire sizes were 750, 1,095, and 735 bytes. It also proved that formula-v2 rejects legacy
  issuance and that an attacker-chosen bucket hash cannot split exposure around the cap.
- PASS — The deployed keeper recorded fresh message
  `1837990857:00003:000134-10021-stab` at `5D9X…Bufg` in transaction
  `5hJg9Tj16TXscQ7ZsJAAE3DNQEVkW8afF5kxzzYschLNwZkwPCyPQxMqEwPSKFaYfpDNdLi481dPRzFy2Egs9dR5`.
  Two subsequent one-minute ticks observed the same TxLINE message and reused the receipt
  without submitting duplicate transactions.
- PASS — Formula-v2 vault `9npi…UNyF` holds 1,000 test-USDC LP capital. Policy
  `HEdr…ZERv` was issued against the fixture and fresh odds receipts in transaction
  `2vUWE4HLKU6VRadhV2WyzPfXvhrgex8XVhQJ1YcL9fAJAuNJTdH2Xvvy9ZaSe45zZFcJBr7Gb9dzxpUw8Mz1TnCD`:
  50 test-USDC coverage, probability `488034` ppm, premium `36.602550` test-USDC.

## COMPLIANCE

Pending Gate 8.

## Glass Balance Sheet marker (Gate 6 preparation)

- PASS — `npm run test:phase6` proves identical inputs produce byte-identical
  marked-liability attestations and that changing a figure breaks verification.
- PASS — `npm run marker -- --input data/marker-input.json --output data/attestations.jsonl`
  wrote a two-record hash chain; `npm run marker -- --verify-chain data/attestations.jsonl`
  returned `PASS`.

The marker is deterministic and hash-chained. The next integration step is posting
these compact records through the on-chain `post_attestation` instruction alongside
the settlement CPI.

## GATE 10A — TxLINE SDK extraction

- PASS — The verification/record/replay implementation was moved into the npm workspace
  `packages/txline-verify`; all SURETY services import `@surety-tx/txline-verify`, and no second
  service copy remains. `npm test` builds that package before running the full suite.
- PASS — The TxLINE CPI wire types/helpers were moved into `crates/txline-cpi`; the Anchor
  program depends on exact version `0.1.0` through its workspace path. `cargo test
  --workspace --all-targets` and both examples pass.
- PASS — `npm pack --dry-run` and `cargo publish --dry-run -p txline-cpi --allow-dirty`
  validate the publish contents. `scripts/verify-published-txline.mjs` is wired into
  `make verify-sdk` and will install exact public versions into a temporary directory,
  compare verification of a committed packet to the workspace result, and check the crate.
- BLOCKED (external credentials) — `npm whoami` returns `ENEEDAUTH`, and no crates.io token
  is installed. Therefore neither registry URL nor the registry-install integrity check is
  claimed PASS. Publish `0.1.0` with maintainer credentials, then run `make verify-sdk` to
  close this gate; the repository explicitly refuses to substitute a local tarball.

## GATE 10B — On-chain broker commission

- PASS — Program `3e5r…v8qVW` was upgraded in
  [`4sTz…JFe7s`](https://explorer.solana.com/tx/4sTzQ6Gg4S3vPutQXhL7oWkGPbc1FLYzryQprxp7d7cKFzPRaQQp9wXc3ZtkkrnfnrPp9cueq6C7T9Q7HcKJFe7s?cluster=devnet).
  The local 541,960-byte release binary hashes to
  `6dcc0919a99fb94ebc9af7959a4123e699a66c6b3cd6bf83451e50ac939dc1fe`; those exact leading
  bytes match the larger preallocated program-data account.
- PASS — Broker issuance
  [`5iZJ…poqkdJ`](https://explorer.solana.com/tx/5iZJ5HtxbQukdcYjqtQzb5ihXKKLbhTVY92xhHfJYy3qX7HQYutBUSjfR5bzMethihHSYSpk9RGV1aUcW3poqkdJ?cluster=devnet)
  atomically transfers 500,000 units to the broker and the 9,500,000-unit net premium to
  reserve. Vault `7fRen…FZdpp` increments capital/free reserves by the net amount only and
  emits `BrokerCommissionPaid`.
- PASS — No-broker issuance
  [`k3xu…Gmfs`](https://explorer.solana.com/tx/k3xug6tk84xErkNSecZpWjJ7LdoqScWizU6iSTUuZDtnwdvjouHK8XMZuCTjBu3eV3sgEmX3SxxU97pSD2zGmfs?cluster=devnet)
  retains the original single gross-premium transfer behavior.
- PASS — Self-referral
  [`bk1H…W3A`](https://explorer.solana.com/tx/bk1HWj7bp6UjeAbMozbyiWWrhbvkJxKLpRV2qMkjP93xL6W5FaWZRCmDL6WnzzsQYdZcASD7HxgNoHkkuqrzW3A?cluster=devnet)
  is rejected atomically; no policy or token movement is created.
- PASS — The invariant/local lifecycle covers broker split, integer rounding, net accounting,
  no-broker regression, expiry, capacity rejection, and reconciliation. The Solana Action
  route carries `?broker=<pubkey>` into the optional same-mint token account, and the composer
  creates dial.to broker links. Recording the final fresh-wallet dial.to bind remains a human
  wallet/demo artifact.

## GATE 10C — Period-scoped proof and halftime settlement

- PASS — `docs/provability-matrix.json` and `docs/PROVABILITY_MATRIX.md` record 48 authenticated
  requests across two captured fixtures (prefixes 1000/2000/3000 × base keys 1–8), with raw
  halftime proof artifacts for keys 2001/2002. `npm run check:provability-matrix` reports
  `PASS: grammar menu matches 48 committed provability probes`.
- PASS — The deployed TxLINE validator directly accepted authentic fixture `18218149`,
  sequence 522, halftime key 2001. This exposed and fixed a real integration issue: CPI
  timestamp must use `summary.updateStats.minTimestamp`, not the response's top-level `ts`.
- PASS — Halftime policy
  [`6zby…BWU6D`](https://explorer.solana.com/address/6zby7AzkpSbpernkAnxs7bHSBemQhspdzU4pwq4BWU6D?cluster=devnet)
  was issued in
  [`53SQ…KApT`](https://explorer.solana.com/tx/53SQGfFVthArSFa3qbUHtoVnaLLZ9tUWFSdygDA7LXKpdKehzSsKRL8Q1sDsZwDWok6X2Sd84eXtWc7yRhNaKApT?cluster=devnet)
  and settled through standard `validate_stat_v2` CPI at the halftime sequence in
  [`5oAE…sG1E`](https://explorer.solana.com/tx/5oAEpxzLcVSd62eFxH9r6aoMjjYE5xuBEwu9uVqR7mZF3GSq4b3iD96ewuYakP4JXFgUNTgKFCt11i5f6UrcsG1E?cluster=devnet),
  while the recorded match contains later second-half events.
- PASS — Compiler tests cover a priced HT predicate, a proof-backed but unpriceable period
  stat, and an unprobed period. Goal timestamps and penalties/shootouts are documented
  refusals because the probe found no known on-chain validation path.

## Post-Phase-10 redeploy regression

- PASS — Fresh authentic final settlement after the upgrade:
  [`3ZYr…AiKMc`](https://explorer.solana.com/tx/3ZYrGWX1wNHy1ompWH7jL4pw8V6XwBYtkEGVGTMB8EBQcCMsAZKuMaXrfRu8EdsnaT93GeoMjq37euHYkrvAiKMc?cluster=devnet).
  Fresh one-bit mutation rejection:
  [`5X2j…YNgxRN`](https://explorer.solana.com/tx/5X2jyajSZbmWPWTu1tE38ocDitv2q8CwpjXUV85pKiWJygLD6Sa6fvrp9AfyCTMF2KtoRNsDafos3xgsHqYNgxRN?cluster=devnet).
- PASS — Phase 5 re-audited ten issued quote hashes on upgraded-layout vault
  `CYEJ9bPaxGoDhrZ6vk4ha254GbShiCpdYtCq5uQVkVEf`, including ACCEPT, SURCHARGE, and REJECT.
- PASS — Fresh open settlement-demo policy
  [`Axs7…UUon`](https://explorer.solana.com/address/Axs7Tf6B2DbsDQ3EwLF4tvVrmhkb39hPR5FbrjUeUUon?cluster=devnet)
  uses the upgraded layout; its sibling settled through TxLINE in
  [`2oeC…y3Px`](https://explorer.solana.com/tx/2oeCnxWzmDExhLDYNE7BMgu9kqhEVLrW2s26sFeaD9c2gZHUTKcdzGJABMa4XJVQmMPL4WAFUzY7VCmCMrp4y3Px?cluster=devnet).
