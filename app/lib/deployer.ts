import { readFileSync } from "node:fs";
import { Keypair } from "@solana/web3.js";

// Loads the devnet deployer keypair used only as a permissionless / fee-paying signer for
// the faucet and settlement server actions. It is the test-USDC mint authority and a
// permissionless settle caller — it never custodies user funds, LP capital, or escrow, and
// it operates only on devnet with a valueless test token.
//
// Hosted deploys (Vercel/Netlify/etc.) have no repo filesystem, so provide the key as the
// SURETY_DEPLOYER_SECRET env var — a JSON array of the 64 secret-key bytes. Local dev falls
// back to the .secrets file.
export function loadDeployer(): Keypair {
  const inline = process.env.SURETY_DEPLOYER_SECRET;
  const path = process.env.SURETY_DEPLOYER_SECRET_PATH ?? ".secrets/devnet-deployer.json";
  const bytes = inline ? (JSON.parse(inline) as number[]) : (JSON.parse(readFileSync(path, "utf8")) as number[]);
  return Keypair.fromSecretKey(Uint8Array.from(bytes));
}
