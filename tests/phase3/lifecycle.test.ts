import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { AnchorProvider, BN, Program, setProvider } from "@anchor-lang/core";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  getAccount,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { compilePredicate } from "../../services/predicate/src/compiler.js";
import type { SuretyCore } from "../../target/types/surety_core.js";

const idl = JSON.parse(readFileSync("target/idl/surety_core.json", "utf8")) as SuretyCore;
const PROGRAM_ID = new PublicKey(idl.address);
const SCALE = 1_000_000;

function digest(value: string | Uint8Array): Buffer {
  return createHash("sha256").update(value).digest();
}

function pda(...seeds: (Buffer | Uint8Array)[]): PublicKey {
  return PublicKey.findProgramAddressSync(seeds, PROGRAM_ID)[0];
}

function u64(value: bigint): Buffer {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(value);
  return bytes;
}

async function chainTime(connection: AnchorProvider["connection"]): Promise<number> {
  const slot = await connection.getSlot("confirmed");
  const timestamp = await connection.getBlockTime(slot);
  if (timestamp === null) throw new Error(`validator returned no block time for slot ${slot}`);
  return timestamp;
}

async function waitForChainTime(connection: AnchorProvider["connection"], target: number): Promise<void> {
  const deadline = Date.now() + 30_000;
  while ((await chainTime(connection)) < target) {
    if (Date.now() >= deadline) throw new Error(`validator clock did not reach ${target} within 30 seconds`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

async function retryRead<T>(label: string, operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= 7 || !String(error).includes("429")) throw error;
      const delay = Math.min(8_000, 500 * 2 ** attempt);
      console.log(`WAIT: ${label} was rate-limited; retrying in ${delay}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

async function submitTransaction(
  connection: AnchorProvider["connection"],
  payer: Keypair,
  transaction: Transaction,
  additionalSigners: Keypair[] = [],
  expectFailure = false,
): Promise<string> {
  const latest = await retryRead("latest blockhash", () => connection.getLatestBlockhash("confirmed"));
  transaction.feePayer = payer.publicKey;
  transaction.recentBlockhash = latest.blockhash;
  transaction.sign(payer, ...additionalSigners);
  const wire = transaction.serialize();
  const signature = await retryRead("transaction submission", () =>
    connection.sendRawTransaction(wire, { skipPreflight: expectFailure, maxRetries: 5 }),
  );
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const response = await retryRead("signature status", () => connection.getSignatureStatuses([signature]));
    const status = response.value[0];
    if (status?.err) {
      if (!expectFailure) throw new Error(`transaction ${signature} failed: ${JSON.stringify(status.err)}`);
      return signature;
    }
    if (status && (status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized")) {
      if (expectFailure) throw new Error(`transaction ${signature} unexpectedly succeeded`);
      return signature;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`transaction ${signature} was not confirmed within 60 seconds`);
}

test("fully collateralized lifecycle enforces bucket cap and unlocks only on expiry", async () => {
  const provider = AnchorProvider.env();
  setProvider(provider);
  const program = new Program<SuretyCore>(idl, provider);
  const payer = (provider.wallet as unknown as { payer: Keypair }).payer;
  const connection = provider.connection;

  console.log("STEP: creating test-USDC mint");
  const assetMint = await createMint(connection, payer, payer.publicKey, null, 6);
  console.log("STEP: creating and funding LP token account");
  const lpAssets = await getOrCreateAssociatedTokenAccount(connection, payer, assetMint, payer.publicKey);
  await mintTo(connection, payer, assetMint, lpAssets.address, payer, 2_000n * BigInt(SCALE));

  const runId = process.env.SURETY_RUN_ID ?? "local-lifecycle-v1";
  const vaultId = digest(`surety:phase3:${runId}`);
  const vault = pda(Buffer.from("vault"), vaultId);
  const reserve = pda(Buffer.from("reserve"), vault.toBuffer());
  const shareMint = pda(Buffer.from("share_mint"), vault.toBuffer());

  console.log("STEP: initializing vault");
  const initializeTransaction = await program.methods
    .initializeVault([...vaultId], 2_000, new BN(2), 15_000, 1, 500)
    .accountsStrict({
      authority: payer.publicKey,
      vault,
      assetMint,
      reserve,
      shareMint,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .transaction();
  await submitTransaction(connection, payer, initializeTransaction);

  console.log("STEP: depositing LP capital");
  const lpShares = await getOrCreateAssociatedTokenAccount(connection, payer, shareMint, payer.publicKey);
  const depositTransaction = await program.methods
    .lpDeposit(new BN(1_000 * SCALE))
    .accountsStrict({
      lp: payer.publicKey,
      vault,
      assetMint,
      reserve,
      shareMint,
      lpAssetAccount: lpAssets.address,
      lpShareAccount: lpShares.address,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .transaction();
  const depositSignature = await submitTransaction(connection, payer, depositTransaction);

  const compiled = compilePredicate("outcome(18237038) == WIN_HOME");
  const predicateBytes = Buffer.alloc(32);
  predicateBytes.set(compiled.canonicalBytes);
  const predicateHash = Buffer.from(compiled.hash, "hex");
  const quoteHash = digest("phase3:quote-commitment:fixture-18237038:v1");
  const bucketHash = digest("match:18237038:WIN_HOME");
  const bucket = pda(Buffer.from("bucket"), vault.toBuffer(), bucketHash);
  const nonce = 1n;
  const policy = pda(
    Buffer.from("policy"),
    vault.toBuffer(),
    payer.publicKey.toBuffer(),
    predicateHash,
    u64(nonce),
  );
  const policyEscrow = pda(Buffer.from("policy_escrow"), policy.toBuffer());
  const expiresAt = (await chainTime(connection)) + 3;

  console.log("STEP: issuing collateralized policy");
  const issueTransaction = await program.methods
    .issuePolicy({
      nonce: new BN(nonce.toString()),
      predicateLen: compiled.canonicalBytes.length,
      predicateBytes: [...predicateBytes],
      predicateHash: [...predicateHash],
      quoteHash: [...quoteHash],
      bucketHash: [...bucketHash],
      payoutAuthority: payer.publicKey,
      coverage: new BN(100 * SCALE),
      premium: new BN(10 * SCALE),
      expiresAt: new BN(expiresAt),
    })
    .accountsStrict({
      holder: payer.publicKey,
      vault,
      assetMint,
      reserve,
      holderAssetAccount: lpAssets.address,
      brokerAssetAccount: null,
      bucket,
      policy,
      policyEscrow,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .transaction();
  const issueSignature = await submitTransaction(connection, payer, issueTransaction);

  await new Promise((resolve) => setTimeout(resolve, 1_000));
  const openVault = await retryRead("open vault", () => program.account.vault.fetch(vault));
  const openPolicy = await retryRead("open policy", () => program.account.policy.fetch(policy));
  const escrowAfterIssue = await retryRead("policy escrow", () => getAccount(connection, policyEscrow));
  assert.equal(openVault.totalCapital.toString(), String(1_010 * SCALE));
  assert.equal(openVault.freeReserves.toString(), String(910 * SCALE));
  assert.equal(openVault.lockedLiabilities.toString(), String(100 * SCALE));
  assert.equal(escrowAfterIssue.amount, 100n * BigInt(SCALE));
  assert.deepEqual(openPolicy.status, { open: {} });
  assert.deepEqual(Buffer.from(openPolicy.quoteHash), quoteHash);

  const rejectedNonce = 2n;
  const rejectedPolicy = pda(
    Buffer.from("policy"),
    vault.toBuffer(),
    payer.publicKey.toBuffer(),
    predicateHash,
    u64(rejectedNonce),
  );
  const rejectedEscrow = pda(Buffer.from("policy_escrow"), rejectedPolicy.toBuffer());
  const rejectedTransaction = await program.methods
      .issuePolicy({
        nonce: new BN(rejectedNonce.toString()),
        predicateLen: compiled.canonicalBytes.length,
        predicateBytes: [...predicateBytes],
        predicateHash: [...predicateHash],
        quoteHash: [...digest("phase3:rejected-quote")],
        bucketHash: [...bucketHash],
        payoutAuthority: payer.publicKey,
        coverage: new BN(110 * SCALE),
        premium: new BN(10 * SCALE),
        expiresAt: new BN(expiresAt + 60),
      })
      .accountsStrict({
        holder: payer.publicKey,
        vault,
        assetMint,
        reserve,
        holderAssetAccount: lpAssets.address,
        brokerAssetAccount: null,
        bucket,
        policy: rejectedPolicy,
        policyEscrow: rejectedEscrow,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .transaction();
  const rejectedSignature = await submitTransaction(connection, payer, rejectedTransaction, [], true);
  assert.equal(
    await retryRead("rejected policy", () => connection.getAccountInfo(rejectedPolicy)),
    null,
    "rejected policy creation must be atomic",
  );

  const caller = Keypair.generate();
  await submitTransaction(
    connection,
    payer,
    new Transaction().add(
      SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: caller.publicKey, lamports: 10_000_000 }),
    ),
  );
  await waitForChainTime(connection, expiresAt);

  const expiryTransaction = await program.methods
    .expirePolicy()
    .accountsStrict({
      caller: caller.publicKey,
      vault,
      assetMint,
      reserve,
      bucket,
      policy,
      policyEscrow,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .transaction();
  const expirySignature = await submitTransaction(connection, payer, expiryTransaction, [caller]);

  await new Promise((resolve) => setTimeout(resolve, 1_000));
  const expiredVault = await retryRead("expired vault", () => program.account.vault.fetch(vault));
  const expiredPolicy = await retryRead("expired policy", () => program.account.policy.fetch(policy));
  const escrowAfterExpiry = await retryRead("expired escrow", () => getAccount(connection, policyEscrow));
  assert.equal(expiredVault.totalCapital.toString(), String(1_010 * SCALE));
  assert.equal(expiredVault.freeReserves.toString(), String(1_010 * SCALE));
  assert.equal(expiredVault.lockedLiabilities.toString(), "0");
  assert.equal(escrowAfterExpiry.amount, 0n);
  assert.deepEqual(expiredPolicy.status, { expired: {} });

  const broker = Keypair.generate();
  const brokerAssets = await getOrCreateAssociatedTokenAccount(connection, payer, assetMint, broker.publicKey);
  const brokerCompiled = compilePredicate("outcome(18237038) == DRAW");
  const brokerPredicateBytes = Buffer.alloc(32);
  brokerPredicateBytes.set(brokerCompiled.canonicalBytes);
  const brokerPredicateHash = Buffer.from(brokerCompiled.hash, "hex");
  const brokerBucketHash = digest("match:18237038:DRAW");
  const brokerBucket = pda(Buffer.from("bucket"), vault.toBuffer(), brokerBucketHash);
  const brokerNonce = 2n;
  const brokerPolicy = pda(Buffer.from("policy"), vault.toBuffer(), payer.publicKey.toBuffer(), brokerPredicateHash, u64(brokerNonce));
  const brokerEscrow = pda(Buffer.from("policy_escrow"), brokerPolicy.toBuffer());
  const brokerIssue = await program.methods
    .issuePolicy({
      nonce: new BN(brokerNonce.toString()),
      predicateLen: brokerCompiled.canonicalBytes.length,
      predicateBytes: [...brokerPredicateBytes],
      predicateHash: [...brokerPredicateHash],
      quoteHash: [...digest("phase3:broker-quote")],
      bucketHash: [...brokerBucketHash],
      payoutAuthority: payer.publicKey,
      coverage: new BN(50 * SCALE),
      premium: new BN(10 * SCALE),
      expiresAt: new BN(expiresAt + 3_600),
    })
    .accountsStrict({
      holder: payer.publicKey,
      vault,
      assetMint,
      reserve,
      holderAssetAccount: lpAssets.address,
      brokerAssetAccount: brokerAssets.address,
      bucket: brokerBucket,
      policy: brokerPolicy,
      policyEscrow: brokerEscrow,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .transaction();
  const brokerSignature = await submitTransaction(connection, payer, brokerIssue);
  const brokerBalance = await retryRead("broker balance", () => getAccount(connection, brokerAssets.address));
  const brokerVault = await retryRead("broker vault", () => program.account.vault.fetch(vault));
  assert.equal(brokerBalance.amount, 500_000n, "broker receives 5% of gross premium");
  assert.equal(brokerVault.totalCapital.toString(), String(1_019_500_000), "vault capital grows by net premium only");
  assert.equal(brokerVault.freeReserves.toString(), String(969_500_000), "free reserves use net-premium accounting");

  const selfNonce = 3n;
  const selfPolicy = pda(Buffer.from("policy"), vault.toBuffer(), payer.publicKey.toBuffer(), brokerPredicateHash, u64(selfNonce));
  const selfReferral = await program.methods
    .issuePolicy({
      nonce: new BN(selfNonce.toString()),
      predicateLen: brokerCompiled.canonicalBytes.length,
      predicateBytes: [...brokerPredicateBytes],
      predicateHash: [...brokerPredicateHash],
      quoteHash: [...digest("phase3:self-referral")],
      bucketHash: [...brokerBucketHash],
      payoutAuthority: payer.publicKey,
      coverage: new BN(1 * SCALE),
      premium: new BN(1 * SCALE),
      expiresAt: new BN(expiresAt + 3_600),
    })
    .accountsStrict({
      holder: payer.publicKey,
      vault,
      assetMint,
      reserve,
      holderAssetAccount: lpAssets.address,
      brokerAssetAccount: lpAssets.address,
      bucket: brokerBucket,
      policy: selfPolicy,
      policyEscrow: pda(Buffer.from("policy_escrow"), selfPolicy.toBuffer()),
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .transaction();
  const selfReferralSignature = await submitTransaction(connection, payer, selfReferral, [], true);
  assert.equal(await retryRead("self-referral policy", () => connection.getAccountInfo(selfPolicy)), null);

  console.log(`PASS: LP deposit locked ${1_000} test USDC (${depositSignature})`);
  console.log(`PASS: policy escrow locked ${100} test USDC (${issueSignature})`);
  console.log(`PASS: same-outcome policy above the 20% bucket cap was rejected atomically (${rejectedSignature})`);
  console.log(`PASS: permissionless expiry restored escrow to free reserves (${expirySignature})`);
  console.log(`PASS: broker received 5% while the vault booked net premium (${brokerSignature})`);
  console.log(`PASS: self-referral was rejected atomically (${selfReferralSignature})`);
  console.log(`EVIDENCE: test-USDC mint ${assetMint.toBase58()}, vault ${vault.toBase58()}, policy ${policy.toBase58()}`);
});
