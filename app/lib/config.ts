import { PublicKey } from "@solana/web3.js";

export const RPC_ENDPOINT = "https://api.devnet.solana.com";
export const PROGRAM_ID = new PublicKey("3e5rBR2J9uHPHHn6tP8HF6mPbEJsJWtzQEyicv6v8qVW");
export const TXLINE_PROGRAM_ID = new PublicKey("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J");

// The live devnet vault Gates 5/6 already quote, issue, and mark against.
// Phase 7 extends this same protocol state rather than standing up a disconnected demo vault.
export const VAULT = new PublicKey("CDyQxhDHsaWYNBvjJgGPVFZdsBD3mC28VEX5DkCZkqEC");
export const ASSET_MINT = new PublicKey("FiJfrnLoc2vZmjixZqCEBuWd8A5EuDaF9MZZhd96bpck");
export const ASSET_DECIMALS = 6;

// The France v Spain semifinal fixture Gates 5/6 already quote and mark against.
export const FIXTURE_ID = 18237038n;

export const FAUCET_AMOUNT = 2_000_000_000n; // 2,000 test-USDC (6 decimals) — one click covers a demo premium

// A dedicated, genuinely-settleable demo policy on its own vault: an open
// Spain–Belgium (fixture 18218149) WIN_HOME policy, the one fixture for which SURETY
// holds an authentic on-chain-verifiable TxLINE proof. Anyone can settle it from the UI
// and watch the atomic TxLINE-CPI payout on devnet. The France–Spain showcase vault is
// left untouched. Created by scripts/setup-settlement-demo.ts.
export const SETTLEMENT_DEMO_POLICY = "CpCdFcNkHHjQwW7J4AKyuRZNxusRMi8a6kSKjM2pqXGq";
