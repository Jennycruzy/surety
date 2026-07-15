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

Run the Glass Balance Sheet locally with `npm run dev` and open
`http://localhost:3000`. The production build is checked with `npm run build:web`.

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
