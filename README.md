# SURETY

SURETY is an on-chain prize-indemnity and parametric prop-settlement protocol for
Solana devnet, powered by real TxLINE odds, scores, and Merkle proofs.

Current verified state: Gates 0–3 pass. The repository contains authentic TxLINE raw
captures, byte-exact recording/replay, a canonical settleability-gated predicate
compiler, and a deployed Anchor vault with LP shares, outcome-bucket caps,
policy-specific SPL-token escrows, quote-hash commitments, epoch-gated withdrawals,
and permissionless expiry. Settlement CPI is Gate 4 work and is not yet claimed.

Gate 3 uses a six-decimal program-minted devnet **test USDC** for reproducibility. It
is not Circle USDC and has no monetary value. TxLINE's credit token is never used by
the SURETY program or user flows.

```bash
make verify-phase1
make verify-phase2
make verify-phase3
```

See `EVIDENCE.md` for plain-English PASS lines and Explorer links, and
`docs/GROUND_TRUTH.md` for the pinned TxLINE interfaces and captured schemas.
