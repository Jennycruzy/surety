import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { AnchorProvider, BN, Program } from "@anchor-lang/core";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { ComputeBudgetProgram, Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { compilePredicate } from "../services/predicate/src/compiler.js";
import { settlementPayloadFromProof, type RawV2Proof } from "../services/settlement/src/v2-payload.js";
import type { SuretyCore } from "../target/types/surety_core.js";

const PROGRAM_ID = new PublicKey("3e5rBR2J9uHPHHn6tP8HF6mPbEJsJWtzQEyicv6v8qVW");
const TXLINE_PROGRAM_ID = new PublicKey("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J");
const VAULT = new PublicKey(process.env.SURETY_HT_VAULT ?? "7fRenQWU499cbD3bPhfEMXsZThegiAFMCTnYdbLFZdpp");
const ASSET_MINT = new PublicKey(process.env.SURETY_HT_ASSET_MINT ?? "9667mqn3XmsLAqDQ4D5qHd27aKscsoZ2jGZK4LoXRuQF");
const proof = JSON.parse(readFileSync("data/recordings/txline-18218149-seq522-ht-stat-2001-proof-v2.raw.json", "utf8")) as RawV2Proof;
const idl = JSON.parse(readFileSync("target/idl/surety_core.json", "utf8")) as SuretyCore;
const digest = (text: string) => createHash("sha256").update(text).digest();
const u64 = (value: bigint) => { const bytes = Buffer.alloc(8); bytes.writeBigUInt64LE(value); return bytes; };

async function main() {
  const provider = AnchorProvider.env();
  const payer = (provider.wallet as unknown as { payer: Keypair }).payer;
  const program = new Program<SuretyCore>(idl, provider);
  const pda = (...seeds: Buffer[]) => PublicKey.findProgramAddressSync(seeds, PROGRAM_ID)[0];
  const submit = async (tx: Transaction) => {
    const latest = await provider.connection.getLatestBlockhash("confirmed");
    tx.feePayer = payer.publicKey;
    tx.recentBlockhash = latest.blockhash;
    tx.sign(payer);
    const signature = await provider.connection.sendRawTransaction(tx.serialize(), { maxRetries: 10 });
    await provider.connection.confirmTransaction({ signature, ...latest }, "confirmed");
    return signature;
  };

  const compiled = compilePredicate("stat(18218149,HT,goals_home) > 0");
  const predicate = Buffer.alloc(32);
  predicate.set(compiled.canonicalBytes);
  const predicateHash = Buffer.from(compiled.hash, "hex");
  const bucketHash = digest("period:18218149:HT:goals_home>0");
  const nonce = BigInt(Date.now());
  const reserve = pda(Buffer.from("reserve"), VAULT.toBuffer());
  const bucket = pda(Buffer.from("bucket"), VAULT.toBuffer(), bucketHash);
  const policy = pda(Buffer.from("policy"), VAULT.toBuffer(), payer.publicKey.toBuffer(), predicateHash, u64(nonce));
  const escrow = pda(Buffer.from("policy_escrow"), policy.toBuffer());
  const holderAssets = getAssociatedTokenAddressSync(ASSET_MINT, payer.publicKey);
  const now = Math.floor(Date.now() / 1_000);
  const issue = await submit(await program.methods.issuePolicy({
    nonce: new BN(nonce.toString()), predicateLen: compiled.canonicalBytes.length,
    predicateBytes: [...predicate], predicateHash: [...predicateHash],
    quoteHash: [...digest("phase10c:halftime-quote")], bucketHash: [...bucketHash],
    payoutAuthority: payer.publicKey, coverage: new BN(10_000_000), premium: new BN(1_000_000),
    expiresAt: new BN(now + 3_600),
  }).accountsStrict({ holder: payer.publicKey, vault: VAULT, assetMint: ASSET_MINT, reserve,
    holderAssetAccount: holderAssets, brokerAssetAccount: null, bucket, policy, policyEscrow: escrow,
    tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId }).transaction());

  const payload = settlementPayloadFromProof(proof);
  const day = Buffer.alloc(2);
  day.writeUInt16LE(Math.floor(proof.summary.updateStats.minTimestamp / 86_400_000));
  const root = PublicKey.findProgramAddressSync([Buffer.from("daily_scores_roots"), day], TXLINE_PROGRAM_ID)[0];
  const settle = await submit(await program.methods.settlePolicy(payload).accountsStrict({ caller: payer.publicKey,
    vault: VAULT, assetMint: ASSET_MINT, reserve, bucket, policy, policyEscrow: escrow,
    payoutAccount: holderAssets, txlineProgram: TXLINE_PROGRAM_ID, dailyScoresMerkleRoots: root,
    tokenProgram: TOKEN_PROGRAM_ID }).preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })]).transaction());
  const state = await program.account.policy.fetch(policy);
  console.log(`PASS: issued halftime policy ${policy} in ${issue}`);
  console.log(`PASS: settled halftime policy through TxLINE while replay continues in ${settle}; status ${JSON.stringify(state.status)}`);
}

await main();
