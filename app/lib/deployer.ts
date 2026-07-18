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
  if (inline) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(inline) as number[]));

  // `next start` sets NODE_ENV=production even for a local demo build. The local key
  // remains a valid fallback there; hosted bundles do not contain it because the read
  // below is deliberately excluded from output tracing.
  const path = process.env.SURETY_DEPLOYER_SECRET_PATH ?? ".secrets/devnet-deployer.json";
  try {
    // Local-only secret path: never trace or bundle this file into a hosted build.
    const bytes = JSON.parse(readFileSync(/* turbopackIgnore: true */ path, "utf8")) as number[];
    return Keypair.fromSecretKey(Uint8Array.from(bytes));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new Error("SURETY_DEPLOYER_SECRET is required when the local demo key is unavailable");
    }
    throw error;
  }
}
