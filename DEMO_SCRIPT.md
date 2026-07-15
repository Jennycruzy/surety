# SURETY — 5-minute demo video script

Target: **≤ 5:00**, screen recording with voiceover. Judges must see (1) the problem,
(2) a live app walkthrough, (3) how TxLINE powers the backend. Record with a Wallet-Standard
wallet (Phantom/Solflare/Backpack) set to **Devnet** with a little devnet SOL for fees.

Pre-flight: `npm run dev` (or the deployed URL), wallet on Devnet, this repo's Explorer
links handy.

---

### 0:00–0:35 — The problem (talking head or slide)
> "Promotions like 'we'll refund every customer if France wins the final' are a real,
> unhedged liability. Today they settle on trust — someone eyeballs the result and pays out,
> or doesn't. SURETY makes that promise **fully collateralized and cryptographically
> settled** on Solana, using real TxLINE odds and Merkle proofs."

### 0:35–1:15 — Glass balance sheet (screen: `/`)
- Let the animated replay run through the goal (records 6→10; the goal lands between 7 and 8).
- VO: "Every open policy is continuously re-marked from real TxLINE consensus odds. When a
  goal lands, liabilities and the solvency ratio move — and every state is hash-chained and
  written to Solana." Hover/point at the ratio gauge and a chain link to Explorer.

### 1:15–1:55 — Underwrite (screen: `/underwrite`)
- Show live vault stats (total capital, free reserves, locked liabilities, open policies,
  share price). VO: "These are decoded live from the on-chain vault, not a mockup."
- Connect wallet → click **Get test USDC** (mints 2,000 tUSDC). Optional: show a small deposit.

### 1:55–2:55 — Buy coverage (screen: `/coverage`)
- VO: "A merchant insures against France winning." Pick an outcome → **Get live quote**.
- Point out the verdict, implied probability, projected bucket utilization, premium, and the
  **quote commitment hash**. VO: "The premium is a pure function of one recorded TxLINE
  packet and current vault state — anyone can recompute this hash."
- Click **Pay … & issue policy** → approve in Phantom → show the policy receipt page and the
  Explorer transaction. VO: "The full coverage is now locked in a policy-specific escrow."

### 2:55–4:05 — Settlement, the core (screen: the settle demo policy)
- From `/coverage`, click **"See a claim settle end-to-end"** → the open Spain–Belgium policy.
- VO: "Here's the part that matters. SURETY does not trust a keeper or itself to declare the
  result. It submits the authentic TxLINE Merkle proof and CPIs into TxLINE's on-chain
  `validate_stat_v2` validator."
- Click **Submit TxLINE proof & settle** → show the success notice and the Explorer
  settlement transaction. VO: "TxLINE's validator verified the proof against its anchored
  root, returned true, and the payout moved atomically in the same transaction."
- (Optional b-roll) show Gate 4's tampered-proof rejection tx: "Flip one bit of the proof
  and TxLINE rejects it — escrow stays locked."

### 4:05–4:45 — How TxLINE powers the backend (screen: code / GROUND_TRUTH.md)
- Show `programs/surety_core/src/lib.rs` `settle_policy`: the CPI into TxLINE, the required
  boolean return, and the atomic transfer. Show `docs/GROUND_TRUTH.md` endpoint table.
- VO: "Odds and scores stream from TxLINE; final settlement is TxLINE's on-chain validator
  called directly from our program. No invented feeds, no trusted oracle in the middle."

### 4:45–5:00 — Close
> "Fully collateralized, continuously marked, and settled by cryptography — powered by
> TxLINE. Repo, deployed devnet app, and reproducible program in the description."

---

## B-roll the recording tool can capture (no wallet needed)
- The glass balance sheet animating through the goal (the Gate 6 artifact).
- The settle-demo policy page and a real settlement firing.
Use these as cutaways if a live wallet step is slow. The buy-coverage/deposit clicks need a
real wallet and must be recorded by you.

## Explorer links to keep on screen
- Program: https://explorer.solana.com/address/3e5rBR2J9uHPHHn6tP8HF6mPbEJsJWtzQEyicv6v8qVW?cluster=devnet
- Authentic settlement (Gate 4): tx `5VeJNDvujC9EgXPY3GrWdJZJFoKqHK1Kp15FpWmDxQ28ubByZcxrSo4tovqNCV9ojFFTdo6GyrrJaSLY1JZ3ux8q`
- Tampered proof rejected: tx `Zvv5umPkM9ku19N1DMCRFsnwUcYUy9MJEDa8PjP8v6YKr5zRacv4LEY4xW2EK9QTsEBHaYCuh7So2cRSsxXfarW`
