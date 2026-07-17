# TxLINE period-stat provability matrix

Generated 2026-07-17T15:39:04.458Z from authenticated TxLINE devnet requests against two committed recordings.

A `proof-returned` cell means the API returned a complete, key-matched Merkle payload. On-chain acceptance remains a separate gate and must not be inferred from API success alone.

| Fixture | Phase seq | Prefix | Keys returning proofs | Rejections |
|---:|---:|---:|---|---|
| 18218149 | 518 (attack_possession) | 1000 | 1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008 | none |
| 18218149 | 522 (halftime_finalised) | 2000 | 2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008 | none |
| 18218149 | 1086 (action_amend) | 3000 | 3001, 3002, 3003, 3004, 3005, 3006, 3007, 3008 | none |
| 18237038 | 473 (corner) | 1000 | 1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008 | none |
| 18237038 | 478 (halftime_finalised) | 2000 | 2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008 | none |
| 18237038 | 737 (free_kick) | 3000 | 3001, 3002, 3003, 3004, 3005, 3006, 3007, 3008 | none |

## Preserved halftime proof samples

- Fixture 18218149, key 2001: [proof](../data/recordings/txline-18218149-seq522-ht-stat-2001-proof-v2.raw.json)
- Fixture 18218149, key 2002: [proof](../data/recordings/txline-18218149-seq522-ht-stat-2002-proof-v2.raw.json)
- Fixture 18237038, key 2001: [proof](../data/recordings/txline-18237038-seq478-ht-stat-2001-proof-v2.raw.json)
- Fixture 18237038, key 2002: [proof](../data/recordings/txline-18237038-seq478-ht-stat-2002-proof-v2.raw.json)

## Designed refusals

- **goal timestamps:** Goal time exists only as raw event clock data; no numeric Stats key or documented stat-validation mapping was found.
- **penalties/shootout decision:** Penalty events exist in the raw events feed; no proof-backed decision-method Stats key is documented or observed.

Machine-readable source: [`provability-matrix.json`](./provability-matrix.json).
