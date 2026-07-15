# SURETY Evidence

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
- PASS — An authentic proof for observed semifinal sequence 111 returned four
  `ScoreStat` leaves and validated through TxLINE `validate_stat_v2` on devnet.
- PASS — A one-bit mutation to `mainTreeProof[0].hash[0]` was rejected.
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
