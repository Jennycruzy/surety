import { PublicKey } from "@solana/web3.js";

// Defaults to the public devnet RPC, which can return 429s under load. Set
// SURETY_RPC_ENDPOINT (or NEXT_PUBLIC_SURETY_RPC_ENDPOINT for client bundles) to a
// dedicated devnet RPC to avoid rate limiting in a hosted deploy.
export const RPC_ENDPOINT =
  process.env.SURETY_RPC_ENDPOINT ??
  process.env.NEXT_PUBLIC_SURETY_RPC_ENDPOINT ??
  "https://api.devnet.solana.com";
export const PROGRAM_ID = new PublicKey("3e5rBR2J9uHPHHn6tP8HF6mPbEJsJWtzQEyicv6v8qVW");
export const TXLINE_PROGRAM_ID = new PublicKey("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J");

// The live devnet vault Gates 5/6 already quote, issue, and mark against.
// Phase 7 extends this same protocol state rather than standing up a disconnected demo vault.
export const VAULT = new PublicKey(
  process.env.NEXT_PUBLIC_SURETY_VAULT ?? "CDyQxhDHsaWYNBvjJgGPVFZdsBD3mC28VEX5DkCZkqEC",
);
export const ASSET_MINT = new PublicKey(
  process.env.NEXT_PUBLIC_SURETY_ASSET_MINT ?? "FiJfrnLoc2vZmjixZqCEBuWd8A5EuDaF9MZZhd96bpck",
);
export const ASSET_DECIMALS = 6;

// Defaults preserve the audited France–Spain demo. A separate build can point at a
// newly captured live fixture without modifying source or disturbing this deployment.
export const FIXTURE_ID = BigInt(process.env.NEXT_PUBLIC_SURETY_FIXTURE_ID ?? "18237038");
export const FIXTURE_LABEL = process.env.NEXT_PUBLIC_SURETY_FIXTURE_LABEL ?? "France v Spain, semifinal";

export const FAUCET_AMOUNT = 2_000_000_000n; // 2,000 test-USDC (6 decimals) — one click covers a demo premium

// A dedicated, genuinely-settleable demo policy on its own vault: an open
// Spain–Belgium (fixture 18218149) WIN_HOME policy, the one fixture for which SURETY
// holds an authentic on-chain-verifiable TxLINE proof. Anyone can settle it from the UI
// and watch the atomic TxLINE-CPI payout on devnet. The France–Spain showcase vault is
// left untouched. Created by scripts/setup-settlement-demo.ts.
export const SETTLEMENT_DEMO_POLICY = "CpCdFcNkHHjQwW7J4AKyuRZNxusRMi8a6kSKjM2pqXGq";
