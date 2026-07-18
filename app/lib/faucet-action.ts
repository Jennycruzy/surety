"use server";

import { createAssociatedTokenAccountIdempotentInstruction, createMintToInstruction, getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PublicKey, Transaction } from "@solana/web3.js";
import { ASSET_MINT, FAUCET_AMOUNT } from "./config.js";
import { loadDeployer } from "./deployer.js";
import { newConnection } from "./surety-client.js";

export type FaucetResult =
  | { ok: true; signature: string; amount: string; ata: string }
  | { ok: false; error: string };

// Devnet-only: mints program-issued test-USDC (no monetary value) to the connecting
// wallet's ATA. Signs with the deployer keypair, which is the mint's own configured
// mint authority (confirmed on-chain) — it never touches the vault, escrow, or any
// user funds, so this cannot move real value regardless of who calls it.
export async function fundTestUsdc(recipient: string): Promise<FaucetResult> {
  try {
    const owner = new PublicKey(recipient);
    const deployer = loadDeployer();

    const connection = newConnection();
    const ata = getAssociatedTokenAddressSync(ASSET_MINT, owner);

    const tx = new Transaction().add(
      createAssociatedTokenAccountIdempotentInstruction(deployer.publicKey, ata, owner, ASSET_MINT, TOKEN_PROGRAM_ID),
      createMintToInstruction(ASSET_MINT, ata, deployer.publicKey, FAUCET_AMOUNT, [], TOKEN_PROGRAM_ID),
    );
    const latest = await connection.getLatestBlockhash("confirmed");
    tx.feePayer = deployer.publicKey;
    tx.recentBlockhash = latest.blockhash;
    tx.sign(deployer);

    const signature = await connection.sendRawTransaction(tx.serialize(), { maxRetries: 5 });
    await connection.confirmTransaction({ signature, ...latest }, "confirmed");

    return { ok: true, signature, amount: FAUCET_AMOUNT.toString(), ata: ata.toBase58() };
  } catch (error) {
    console.error("test-USDC faucet failed", error);
    const message = error instanceof Error ? error.message : "unknown faucet error";
    return {
      ok: false,
      error: message.includes("SURETY_DEPLOYER_SECRET")
        ? "Test-USDC faucet is not configured for this build"
        : `Test-USDC faucet failed: ${message}`,
    };
  }
}
