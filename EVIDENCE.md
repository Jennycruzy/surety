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

## COMPLIANCE

Pending Gate 8.
