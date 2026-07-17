# Predicate grammar v1

SURETY stores a versioned canonical binary form, not user-entered text. This keeps
policy identity deterministic across whitespace, case, and `AND` clause order.

## Enabled fields

- `outcome(match_id) == WIN_HOME | DRAW | WIN_AWAY`
- `stat(match_id, stat_name) op i32`, where `op` is `>`, `>=`, `<`, `<=`, or `==`
- `stat(match_id, period, stat_name) op i32`, where the period is matrix-gated
- at most two comparisons, joined by `AND`

The proof-backed stat names are `goals_home`, `goals_away`, `goals_total`,
`yellow_cards_home`, `yellow_cards_away`, `yellow_cards_total`, `red_cards_home`,
`red_cards_away`, `red_cards_total`, `corners_home`, `corners_away`, and
`corners_total`. The `_total` fields compile to a two-leaf TxLINE operation during
settlement. Home/away proof-key selection must use the fixture's authenticated
`Participant1IsHome` metadata.

This list means cryptographically settleable, not automatically quoteable. The quote
engine must additionally find a matching market in the fixture's actual odds packet.
For example, corners are proof-backed but were not quoted in the captured semifinal
snapshot, so a corners quote must be rejected for that snapshot.

The period-scoped menu is generated from `docs/provability-matrix.json`, never maintained
as a second hand-written allowlist. The current captured consensus markets admit `HT` goals
for participant 1/2 (`statKey` 2001/2002). A matrix-proven stat without a deterministic
market is rejected as unpriceable; an unprobed period/key is rejected as unprovable:

```text
stat(18218149, HT, goals_home) > 0       # compiles to TxLINE statKey 2001
stat(18218149, HT, corners_home) > 0     # proof exists, but captured market cannot price it
stat(18218149, ET, goals_home) > 0       # period/key was not probed
```

The on-chain parser additionally requires proof period 3 for HT keys, preventing an
in-progress first-half value from satisfying a halftime policy. Goal timestamps and
`decided_by = PENALTIES` stay rejected because the probe found no on-chain validation path.

`tournament_result` and `decided_by` are intentionally rejected with specific
unsettleable-field messages: Gate 0 did not prove stage-tag or decision-method leaves.

## Canonical bytes

```text
u8 version = 1
u8 clause_count = 1 or 2
clause[clause_count], sorted lexicographically by its 15 encoded bytes

clause:
  u8 kind                 // 1 stat, 2 outcome
  u64_le match_id
  u8 field_id             // stat id, or zero for outcome
  u8 operator_id
  [u8; 4] value           // i32_le stat value; outcome id then three zero bytes
```

Duplicate clauses and non-strict ordering are invalid. SHA-256 of the complete
canonical bytes is the predicate hash used in policy PDA identity.

Pinned vector:

```text
text:   outcome(18237038) == WIN_HOME
bytes:  0101026e46160100000000000000000000
sha256: e74f3d39032f9c393744a58851631954bcf77a87f404e118d4b89b37700f1fa8
```
