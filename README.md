# SURETY

SURETY is an on-chain prize-indemnity and parametric prop-settlement protocol for
Solana devnet, powered by real TxLINE odds, scores, and Merkle proofs.

Current verified state: Gates 0–5 pass. The repository contains authentic TxLINE raw
captures, byte-exact recording/replay, a canonical settleability-gated predicate
compiler, and a deployed Anchor vault with LP shares, outcome-bucket caps,
policy-specific SPL-token escrows, quote-hash commitments, epoch-gated withdrawals,
permissionless expiry, and permissionless settlement that atomically CPIs into
TxLINE's `validate_stat_v2`. The Gate 4 evidence includes both an authentic final
proof payout and a one-bit-tampered proof rejected on devnet.

Gate 6's protocol checks also pass: a ten-record hash chain is posted on devnet over
ten open policies, the last five records span a goal in the full authentic match
capture, and `verify-chain` matches every local field to every on-chain account.
Gate 6 remains formally incomplete only because its required dashboard screen
recording has not yet been produced; this repository does not claim that artifact.

Gate 7 wires the Next.js application to the same pinned devnet vault: `npm run build:web`
produces a clean production build, live vault/quote reads resolve against real on-chain
state, and settlement is exposed as a permissionless client capability whose proof→payout
path is shared byte-for-byte with the Gate 4 devnet test. Policies whose fixture has no
authentic captured TxLINE proof are refused at settle time rather than settled with
synthesized data. See `EVIDENCE.md` Gate 7.

## TxLINE validation boundary

The currently deployed program uses TxLINE's `validate_stat_v2` CPI atomically during
settlement. The original France–Spain pricing policies used authenticated TxLINE SSE
bytes and deterministic quote hashes; those historical policies did not call
`validate_odds`.

The source tree now contains an additive proof-backed issuance path for the next live
fixture:

1. fetch an authentic proof from TxLINE's `/api/odds/validation` endpoint;
2. CPI into TxLINE `validate_odds` and store a SURETY `ValidatedOdds` receipt;
3. issue a policy against that receipt while the program checks freshness, matches the
   proved fixture/outcome, and recomputes the premium from the proved prices and current
   vault exposure.

This upgrade has been built and unit-tested but is intentionally **not described as
deployed** until the local-validator suite, program upgrade, authentic CPI receipt, and
fresh live-fixture issuance have all passed. The existing `issue_policy` instruction and
demo configuration remain available unchanged. A new proof-required build should use a
formula-version 2 vault: version 2 rejects the legacy issuance instruction on-chain, so the
validated path cannot be bypassed by calling the program directly.

The exact existing pricing packet now has a genuine TxLINE odds proof at
`data/recordings/phase0-18237038-message-000791-odds-proof.raw.json`. TxLINE's deployed
devnet validator accepts it and rejects a one-bit mutation:

```bash
ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
  ANCHOR_WALLET=.secrets/devnet-deployer.json \
  npm run validate:odds-proof:devnet
```

Run the Glass Balance Sheet locally with `npm run dev` and open
`http://localhost:3000`. The production build is checked with `npm run build:web`.

For a separate proof-required live-fixture build, copy `.env.example`, set the fixture
ID/label and a snapshot filename located under `data/recordings`, then set
`SURETY_REQUIRE_VALIDATED_ODDS=1`. The default values preserve the audited demo build.

## Deterministic quote formula

For a full-match 1X2 packet, each integer decimal price `dᵢ` becomes a normalized
probability `pᵢ = (1/dᵢ) / Σ(1/dⱼ)`, rounded half-up to parts per million. Premiums
use integer arithmetic only:

```text
premium = ceil(coverage × probability_ppm × margin_bps × surcharge_bps
               / (1,000,000 × 10,000 × 10,000))
```

Projected bucket utilization below 40% has a 1.0× surcharge. From 40% to the hard
cap it rises linearly toward 2.0×; a quote that reaches or crosses the cap is
rejected. The packet identity and source checksum, predicate, coverage, formula
version, normalized probability, complete book-state hash, utilization, surcharge,
verdict, and premium are all committed by the policy's on-chain quote hash.

Gate 3 uses a six-decimal program-minted devnet **test USDC** for reproducibility. It
is not Circle USDC and has no monetary value. TxLINE's credit token is never used by
the SURETY program or user flows.

```bash
make verify-phase1
make verify-phase2
make verify-phase3
ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
  ANCHOR_WALLET=.secrets/devnet-deployer.json make verify-phase4
make verify-phase5
make verify-phase6
```

See `EVIDENCE.md` for plain-English PASS lines and Explorer links, and
`docs/GROUND_TRUTH.md` for the pinned TxLINE interfaces and captured schemas.
