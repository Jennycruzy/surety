// Stands up a persistent, genuinely-settleable demo on devnet: a fresh SURETY vault with
// an OPEN Spain-Belgium (fixture 18218149) WIN_HOME policy — the one fixture for which we
// hold an authentic, on-chain-verifiable TxLINE proof. Leaves policy nonce 1 open for the
// live UI settlement demo and settles nonce 2 to prove the vault-agnostic app path fires.
//
//   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
//   ANCHOR_WALLET=.secrets/devnet-deployer.json \
//   node --import tsx scripts/setup-settlement-demo.ts

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { AnchorProvider, BN, Program } from "@anchor-lang/core";
import {
  TOKEN_PROGRAM_ID,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { ComputeBudgetProgram, Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { compilePredicate } from "../services/predicate/src/compiler.js";
import { settlementPayloadFromProof, type RawV2Proof } from "../services/settlement/src/v2-payload.js";
import type { SuretyCore } from "../target/types/surety_core.js";

const SCALE = 1_000_000;
const ASSET_MINT = new PublicKey("FiJfrnLoc2vZmjixZqCEBuWd8A5EuDaF9MZZhd96bpck");
const TXLINE_PROGRAM_ID = new PublicKey("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J");
const RUN_ID = process.env.SURETY_DEMO_RUN_ID ?? "settlement-demo-v1";

const idl = JSON.parse(readFileSync("target/idl/surety_core.json", "utf8")) as SuretyCore;
const proof = JSON.parse(
  readFileSync("data/recordings/phase0-18218149-seq1087-final-proof-v2.raw.json", "utf8"),
) as RawV2Proof;

const digest = (value: string) => createHash("sha256").update(value).digest();
const u64 = (value: bigint) => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(value);
  return b;
};

async function retry<T>(label: string, op: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await op();
    } catch (error) {
      if (attempt >= 8 || !String(error).includes("429")) throw error;
      const delay = Math.min(8_000, 500 * 2 ** attempt);
      console.log(`WAIT: ${label} rate-limited; retry in ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

async function main() {
  const provider = AnchorProvider.env();
  const program = new Program<SuretyCore>(idl, provider);
  const program_id = new PublicKey(idl.address);
  const payer = (provider.wallet as unknown as { payer: Keypair }).payer;
  const pda = (...seeds: (Buffer | Uint8Array)[]) => PublicKey.findProgramAddressSync(seeds, program_id)[0];

  async function submit(tx: Transaction, signers: Keypair[] = [], expectFailure = false): Promise<string> {
    const latest = await retry("blockhash", () => provider.connection.getLatestBlockhash("confirmed"));
    tx.feePayer = payer.publicKey;
    tx.recentBlockhash = latest.blockhash;
    tx.sign(payer, ...signers);
    const sig = await retry("send", () =>
      provider.connection.sendRawTransaction(tx.serialize(), { skipPreflight: expectFailure, maxRetries: 5 }),
    );
    const deadline = Date.now() + 75_000;
    while (Date.now() < deadline) {
      const st = (await retry("status", () => provider.connection.getSignatureStatuses([sig]))).value[0];
      if (st?.err) {
        if (!expectFailure) throw new Error(`tx ${sig} failed: ${JSON.stringify(st.err)}`);
        return sig;
      }
      if (st && ["confirmed", "finalized"].includes(st.confirmationStatus ?? "")) return sig;
      await new Promise((r) => setTimeout(r, 1_000));
    }
    throw new Error(`tx ${sig} never finalized`);
  }

  const vaultId = digest(`surety:${RUN_ID}`);
  const vault = pda(Buffer.from("vault"), vaultId);
  const reserve = pda(Buffer.from("reserve"), vault.toBuffer());
  const shareMint = pda(Buffer.from("share_mint"), vault.toBuffer());

  const existing = await provider.connection.getAccountInfo(vault, "confirmed");
  if (!existing) {
    console.log("INIT: creating demo vault", vault.toBase58());
    await submit(
      await program.methods
        .initializeVault([...vaultId], 5_000, new BN(172_800), 15_000, 1)
        .accountsStrict({
          authority: payer.publicKey,
          vault,
          assetMint: ASSET_MINT,
          reserve,
          shareMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .transaction(),
    );
    const assetAta = await getOrCreateAssociatedTokenAccount(provider.connection, payer, ASSET_MINT, payer.publicKey);
    await mintTo(provider.connection, payer, ASSET_MINT, assetAta.address, payer, 2_000n * BigInt(SCALE));
    const shareAta = await getOrCreateAssociatedTokenAccount(provider.connection, payer, shareMint, payer.publicKey);
    await submit(
      await program.methods
        .lpDeposit(new BN(1_000 * SCALE))
        .accountsStrict({
          lp: payer.publicKey,
          vault,
          assetMint: ASSET_MINT,
          reserve,
          shareMint,
          lpAssetAccount: assetAta.address,
          lpShareAccount: shareAta.address,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .transaction(),
    );
    console.log("INIT: LP deposited 1,000 test-USDC");
  } else {
    console.log("INIT: demo vault already exists", vault.toBase58());
  }

  const compiled = compilePredicate("outcome(18218149) == WIN_HOME");
  const predicateBytes = Buffer.alloc(32);
  predicateBytes.set(compiled.canonicalBytes);
  const predicateHash = Buffer.from(compiled.hash, "hex");
  const bucketHash = digest("match:18218149:WIN_HOME");
  const bucket = pda(Buffer.from("bucket"), vault.toBuffer(), bucketHash);
  const assetAta = await getOrCreateAssociatedTokenAccount(provider.connection, payer, ASSET_MINT, payer.publicKey);

  async function issue(nonce: bigint): Promise<PublicKey> {
    const policy = pda(Buffer.from("policy"), vault.toBuffer(), payer.publicKey.toBuffer(), predicateHash, u64(nonce));
    if (await provider.connection.getAccountInfo(policy, "confirmed")) return policy;
    const policyEscrow = pda(Buffer.from("policy_escrow"), policy.toBuffer());
    const slot = await provider.connection.getSlot("confirmed");
    const now = (await provider.connection.getBlockTime(slot)) ?? Math.floor(Date.now() / 1000);
    await submit(
      await program.methods
        .issuePolicy({
          nonce: new BN(nonce.toString()),
          predicateLen: compiled.canonicalBytes.length,
          predicateBytes: [...predicateBytes],
          predicateHash: [...predicateHash],
          quoteHash: [...digest(`settlement-demo:quote:${nonce}`)],
          bucketHash: [...bucketHash],
          payoutAuthority: payer.publicKey,
          coverage: new BN(100 * SCALE),
          premium: new BN(10 * SCALE),
          expiresAt: new BN(now + 30 * 24 * 3_600),
        })
        .accountsStrict({
          holder: payer.publicKey,
          vault,
          assetMint: ASSET_MINT,
          reserve,
          holderAssetAccount: assetAta.address,
          bucket,
          policy,
          policyEscrow,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .transaction(),
    );
    return policy;
  }

  const demoPolicy = await issue(1n);
  const verifyPolicy = await issue(2n);
  console.log("DEMO policy (leave OPEN for UI settle):", demoPolicy.toBase58());
  console.log("VERIFY policy (settled below):", verifyPolicy.toBase58());

  // Prove the vault-agnostic settlement path fires on this non-default vault.
  const payload = settlementPayloadFromProof(proof);
  const epochDay = Math.floor(proof.ts / 86_400_000);
  const day = Buffer.alloc(2);
  day.writeUInt16LE(epochDay);
  const dailyScoresMerkleRoots = PublicKey.findProgramAddressSync(
    [Buffer.from("daily_scores_roots"), day],
    TXLINE_PROGRAM_ID,
  )[0];
  const verifyEscrow = pda(Buffer.from("policy_escrow"), verifyPolicy.toBuffer());
  const settleSig = await submit(
    await program.methods
      .settlePolicy(payload)
      .accountsStrict({
        caller: payer.publicKey,
        vault,
        assetMint: ASSET_MINT,
        reserve,
        bucket,
        policy: verifyPolicy,
        policyEscrow: verifyEscrow,
        payoutAccount: assetAta.address,
        txlineProgram: TXLINE_PROGRAM_ID,
        dailyScoresMerkleRoots,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })])
      .transaction(),
  );
  const settled = await program.account.policy.fetch(verifyPolicy);
  console.log("VERIFY settlement:", settleSig, "status", JSON.stringify(settled.status));
  console.log("\nSET IN app/lib/config.ts -> SETTLEMENT_DEMO_POLICY =", `"${demoPolicy.toBase58()}"`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
