# TxLINE Ground Truth

Status: **Gate 0 passed**
Checked: 2026-07-14 UTC

This document records only facts verified against TxODDS's published documentation,
the official `txodds/tx-on-chain` repository, authenticated raw captures, or Solana
devnet. It deliberately does not invent missing API fields.

## Sources pinned for the build

- [TxLINE Quickstart](https://txline.txodds.com/documentation/quickstart)
- [World Cup Free Tier](https://txline.txodds.com/documentation/worldcup)
- [Streaming Data](https://txline.txodds.com/documentation/examples/streaming-data)
- [On-Chain Validation](https://txline.txodds.com/documentation/examples/onchain-validation)
- [Soccer Feed](https://txline.txodds.com/documentation/scores/soccer-feed)
- [Devnet Program Reference](https://txline.txodds.com/documentation/programs/devnet)
- Official repository: `txodds/tx-on-chain` commit
  `eba4cb4d578bdb5cfad3c22dfd134f012496e445` (2026-07-14).
- Devnet IDL: `examples/devnet/idl/txoracle.json`, metadata version `1.5.6`.

## Network ground truth

| Value | Devnet setting |
|---|---|
| RPC | `https://api.devnet.solana.com` |
| API origin | `https://txline-dev.txodds.com` |
| TxLINE program | `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J` |
| TxL authorization mint | `4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG` |
| Free service level | `1` |

A read-only RPC check on 2026-07-14 returned the documented program account as
present and executable, owned by `BPFLoaderUpgradeab1e11111111111111111111111`.

The free-tier subscription was executed from the SURETY Phase 0 wallet. Its devnet
transaction is [2ph7xmYEs2eLGXPQHGEfKT74fZoc18ZQA274sx5U1hoHnqPN7uFmjmJ91AgEMswzBWb8oCQ85y3BaR1FKXKvY2TY](https://explorer.solana.com/tx/2ph7xmYEs2eLGXPQHGEfKT74fZoc18ZQA274sx5U1hoHnqPN7uFmjmJ91AgEMswzBWb8oCQ85y3BaR1FKXKvY2TY?cluster=devnet).

## Authentication and data endpoints

The official flow is:

1. Submit `subscribe(serviceLevelId, durationWeeks)` on the matching network.
2. Request a guest JWT from `POST /auth/guest/start`.
3. Sign the exact UTF-8 message `${txSig}:${selectedLeagues.join(",")}:${jwt}`.
   For the standard bundle this contains two adjacent colons: `${txSig}::${jwt}`.
4. Activate with `POST /api/token/activate` and send both the guest JWT and API
   token on data requests.

Documented endpoints relevant to SURETY are:

- `GET /api/odds/stream`
- `GET /api/scores/stream`
- `GET /api/odds/snapshot/{fixtureId}`
- `GET /api/scores/snapshot/{fixtureId}`
- `GET /api/scores/historical/{fixtureId}`
- `GET /api/scores/stat-validation`
- `GET /api/scores/stat-validation-v3`

The V3 endpoint appears in the official devnet example added in the pinned commit.
V2 is the Gate 0 verified path; V3 remains a measured optimization candidate.

## On-chain validation interface

The current devnet IDL exposes the following read-only validation instructions. Each
returns a Borsh/Anchor `bool` through Solana return data.

| Instruction | Required account | Arguments |
|---|---|---|
| `validate_odds` | `daily_odds_merkle_roots` | timestamp, odds snapshot, batch summary, subtree proof, main-tree proof |
| `validate_stat` | `daily_scores_merkle_roots` | timestamp, score batch summary, fixture proof, main-tree proof, predicate, one/two stat terms, optional binary operation |
| `validate_stat_v2` | `daily_scores_merkle_roots` | `StatValidationInput`, `NDimensionalStrategy` |
| `validate_stat_v3` | `daily_scores_merkle_roots` | `StatValidationInputV3`, `NDimensionalStrategy` |

The score-root PDA is derived from:

```text
["daily_scores_roots", u16_le(floor(proof_timestamp_ms / 86_400_000))]
```

The odds-root PDA uses the corresponding `daily_batch_roots` seed according to the
published devnet reference.

### Merkle proof node

The IDL defines every proof node as:

```text
ProofNode { hash: [u8; 32], is_right_sibling: bool }
```

V2 carries a proof per requested stat. V3 adds `leaf_indices` and shared
`multiproof_hashes` to reduce repeated proof material.

### Predicate primitives

TxLINE's program natively supports:

- comparisons: equal, not equal, greater than, less than, greater/equal,
  less/equal;
- single-stat predicates;
- binary expressions over two stats;
- multi-leg indexed strategies;
- geometric distance strategies.

The exact enum spellings and all discriminators are pinned in IDL version `1.5.6`.
SURETY will vendor the matching interface rather than re-declare it from memory.

## Soccer field menu currently proven by documentation

The documented full-game numeric stat keys are:

| Key | Meaning |
|---:|---|
| 1 | participant 1 total goals |
| 2 | participant 2 total goals |
| 3 | participant 1 total yellow cards |
| 4 | participant 2 total yellow cards |
| 5 | participant 1 total red cards |
| 6 | participant 2 total red cards |
| 7 | participant 1 total corners |
| 8 | participant 2 total corners |

Period prefixes documented for soccer are `1000` first half, `2000` halftime,
`3000` second half, `4000` first extra-time period, `5000` second extra-time period,
`6000` penalty shootout, and `7000` extra-time total.

Only a predicate that maps to captured proof fields **and** to a captured quoted odds
market will be enabled. TxLINE explicitly warns that market availability varies per
fixture, so corners/cards/player props will not be assumed from this stat menu alone.

For the live France–Spain semifinal capture, the actual quoted market menu contained:

- `1X2_PARTICIPANT_RESULT` with `part1`, `draw`, and `part2` prices;
- `ASIANHANDICAP_PARTICIPANT_GOALS` with fixture-specific `line` parameters;
- `OVERUNDER_PARTICIPANT_GOALS` with fixture-specific `line` parameters;
- full-game (`MarketPeriod: null`) and first-half (`MarketPeriod: "half=1"`) variants.

There was no corners or cards odds market in that snapshot. Such stat predicates are
cryptographically settleable, but SURETY must reject them at quote time unless a
matching market is present in the selected fixture's real odds payload.

## Finality

The official documentation states that a final score record uses
`action=game_finalised`, `statusId=100`, and `period=100`. The devnet IDL's proved
`ScoreStat` leaf is:

```text
ScoreStat { key: u32, value: i32, period: i32 }
```

Therefore SURETY can enforce `period == 100` on every final-outcome leaf before
performing the TxLINE CPI, while the CPI proves that the complete leaf—including its
period—belongs to the anchored Merkle root. In-running threshold policies may use a
documented non-final period only where the predicate is monotonic and immediately
decidable.

## CPI assessment

The sponsor explicitly invites custom programs to CPI into `validate_stat`. The IDL
provides instruction discriminators, Borsh argument types, one read-only account, and
a boolean return value, so the proposed atomic flow is implementable in principle:

1. invoke TxLINE;
2. require return data to originate from the configured TxLINE program;
3. decode and require `true`;
4. transfer policy escrow in the same SURETY instruction.

An earlier off-chain `validate_stat_v2` simulation against a captured France–Spain
semifinal proof (fixture `18237038`, sequence 111) is **not usable as evidence**: the
retained capture for that proof was later found to contain non-cryptographic
placeholder bytes in its Merkle proof nodes (repeated `0xFF`/patterned runs, not real
hash output) rather than an authentic response. The file has been removed; see
`docs/FRICTION_LOG.md` for the dated writeup. The underlying claim — a real proof
validates and a one-bit-tampered proof is rejected — is instead proven, authoritatively
and on-chain rather than by local simulation, at Gate 4 using a different, genuinely
authentic capture (`data/recordings/phase0-18218149-seq1087-final-proof-v2.raw.json`,
the Spain–Belgium final record). See `EVIDENCE.md` Gate 4 for the two devnet
transaction signatures.

## Raw packet samples

All artifacts below were written directly from authenticated HTTP response bytes and
independently corroborated: each remaining proof file was accepted by TxLINE's own
deployed on-chain validator in a real devnet transaction (see `EVIDENCE.md` Gate 4),
which is stronger evidence of authenticity than a byte-provenance claim alone. One
artifact previously listed here (`phase0-18237038-seq111-proof-v2.raw.json`) was
removed after its Merkle proof nodes were found to contain non-cryptographic
placeholder bytes rather than genuine hash output — see `docs/FRICTION_LOG.md`.

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| `data/recordings/phase0-18237038-scores.raw.sse` | 35,031 | `933a91a5bec1f77254381f8d367709316e32ee636240e8d8dacf628032a7e1c5` |
| `data/recordings/phase0-18237038-odds.raw.sse` | 289,212 | `5676364ca687377c3cccd33abe265da8edc6caa600f261f1f790e6fe56f70c23` |
| `data/recordings/phase0-18237038-scores-snapshot.raw.json` | 40,958 | `07e26845527ed6acfc8229b27aa932411cafd468253d259a93758f504a89861b` |
| `data/recordings/phase0-18237038-odds-snapshot.raw.json` | 9,029 | `bedb9df15f9fdce7c0ee5178bba0fc5bdd3c21e46c5b9ea3775b626458763434` |
| `data/recordings/phase0-18218149-historical.raw.json` | 1,101,803 | `2b3080034d82d9200a05a70dd5c3f42090b628294df9e210986d1ab4be4a01c0` |
| `data/recordings/phase0-18218149-seq1087-final-proof-v2.raw.json` | 3,862 | `491a0a0ebc3b9502e5d4fba837a4276f6cda0c28d4617c511562a3d9f4b5dc87` |

Exact raw odds event captured from the live stream:

```text
data: {"FixtureId":18237038,"MessageId":"1837782566:00003:001545-10021-stab","Ts":1784056509920,"Bookmaker":"TXLineStablePriceDemargined","BookmakerId":10021,"SuperOddsType":"OVERUNDER_PARTICIPANT_GOALS","GameState":null,"InRunning":true,"MarketParameters":"line=0.75","MarketPeriod":"half=1","PriceNames":["over","under"],"Prices":[2208,1828],"Pct":["NA","NA"]}
id: 1784056500000:2002
```

The captured odds schema is therefore exactly:

```text
FixtureId, MessageId, Ts, Bookmaker, BookmakerId, SuperOddsType,
GameState, InRunning, MarketParameters, MarketPeriod, PriceNames, Prices, Pct
```

The captured soccer event common fields are:

```text
FixtureId, GameState, StartTime, IsTeam, FixtureGroupId, CompetitionId,
CountryId, SportId, Participant1IsHome, Participant1Id, Participant2Id,
CoverageSecondaryData, CoverageType, Action, Id, Ts, ConnectionId, Seq,
StatusId, Type, Clock, Stats
```

Action-specific fields observed include `Participant`, `Possession`,
`PossessionType`, `Data`, `Score`, `PlayerStats`, and `Confirmed`.

The authentic Spain–Belgium final record is sequence `1087`,
`Action: "game_finalised"`, `StatusId: 100`, with final stats participant 1 goals
`2`, participant 2 goals `1`, participant 1 corners `5`, and participant 2 corners
`1`. Its returned proof leaves are exactly:

```json
[{"key":1,"value":2,"period":100},{"key":2,"value":1,"period":100},{"key":7,"value":5,"period":100},{"key":8,"value":1,"period":100}]
```

## Architecture confirmation

**The architecture in the specification works as designed at the TxLINE boundary.**
Authenticated live odds and score packets were captured, a completed match's final
record produced period-100 proof leaves, the current devnet program validated both an
in-running and a final proof, and a one-bit-tampered proof was rejected. SURETY will
use only markets actually present in each odds payload and will require period `100`
for final-outcome settlement. Atomic CPI payout remains the explicit Gate 4 proof.
