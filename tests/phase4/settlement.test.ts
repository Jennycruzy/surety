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
import {
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { compilePredicate } from "../../services/predicate/src/compiler.js";
import { settlementPayloadFromProof, type RawV2Proof } from "../../services/settlement/src/v2-payload.js";
import type { SuretyCore } from "../../target/types/surety_core.js";

const idl = JSON.parse(readFileSync("target/idl/surety_core.json", "utf8")) as SuretyCore;
const proof = JSON.parse(
  readFileSync("data/recordings/phase0-18218149-seq1087-final-proof-v2.raw.json", "utf8"),
) as RawV2Proof;
const PROGRAM_ID = new PublicKey(idl.address);
const TXLINE_PROGRAM_ID = new PublicKey("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J");
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

const settlementPayload = (tamperMainProof: boolean) =>
  settlementPayloadFromProof(proof, { tamperMainProof });

async function retry<T>(label: string, operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= 7 || !String(error).includes("429")) throw error;
      const delay = Math.min(8_000, 500 * 2 ** attempt);
      console.log(`WAIT: ${label} rate-limited; retrying in ${delay}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

async function submit(
  provider: AnchorProvider,
  payer: Keypair,
  transaction: Transaction,
  signers: Keypair[] = [],
  expectFailure = false,
): Promise<string> {
  const latest = await retry("latest blockhash", () =>
    provider.connection.getLatestBlockhash("confirmed"),
  );
  transaction.feePayer = payer.publicKey;
  transaction.recentBlockhash = latest.blockhash;
  transaction.sign(payer, ...signers);
  const wire = transaction.serialize();
  console.log(`INFO: serialized transaction is ${wire.length} bytes`);
  const signature = await retry("transaction submission", () =>
    provider.connection.sendRawTransaction(wire, {
      skipPreflight: expectFailure,
      maxRetries: 5,
    }),
  );
  const deadline = Date.now() + 75_000;
  while (Date.now() < deadline) {
    const response = await retry("signature status", () =>
      provider.connection.getSignatureStatuses([signature]),
    );
    const status = response.value[0];
    if (status?.err) {
      if (!expectFailure) {
        throw new Error(`transaction ${signature} failed: ${JSON.stringify(status.err)}`);
      }
      return signature;
    }
    if (status && ["confirmed", "finalized"].includes(status.confirmationStatus ?? "")) {
      if (expectFailure) throw new Error(`transaction ${signature} unexpectedly succeeded`);
      return signature;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`transaction ${signature} did not reach a terminal state`);
}

test("real TxLINE CPI atomically settles and a one-bit proof mutation fails", async () => {
  assert.match(process.env.ANCHOR_PROVIDER_URL ?? "", /devnet/i, "Gate 4 must run on devnet");
  const provider = AnchorProvider.env();
  setProvider(provider);
  const program = new Program<SuretyCore>(idl, provider);
  const payer = (provider.wallet as unknown as { payer: Keypair }).payer;

  const assetMint = await createMint(provider.connection, payer, payer.publicKey, null, 6);
  const holderAssets = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    payer,
    assetMint,
    payer.publicKey,
  );
  await mintTo(
    provider.connection,
    payer,
    assetMint,
    holderAssets.address,
    payer,
    2_000n * BigInt(SCALE),
  );

  const runId = process.env.SURETY_RUN_ID ?? `gate4-${Date.now()}`;
  const vaultId = digest(`surety:${runId}`);
  const vault = pda(Buffer.from("vault"), vaultId);
  const reserve = pda(Buffer.from("reserve"), vault.toBuffer());
  const shareMint = pda(Buffer.from("share_mint"), vault.toBuffer());
  await submit(
    provider,
    payer,
    await program.methods
      .initializeVault([...vaultId], 5_000, new BN(172_800), 15_000, 1, 500)
      .accountsStrict({
        authority: payer.publicKey,
        vault,
        assetMint,
        reserve,
        shareMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .transaction(),
  );
  const lpShares = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    payer,
    shareMint,
    payer.publicKey,
  );
  await submit(
    provider,
    payer,
    await program.methods
      .lpDeposit(new BN(1_000 * SCALE))
      .accountsStrict({
        lp: payer.publicKey,
        vault,
        assetMint,
        reserve,
        shareMint,
        lpAssetAccount: holderAssets.address,
        lpShareAccount: lpShares.address,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .transaction(),
  );

  const compiled = compilePredicate("outcome(18218149) == WIN_HOME");
  const predicateBytes = Buffer.alloc(32);
  predicateBytes.set(compiled.canonicalBytes);
  const predicateHash = Buffer.from(compiled.hash, "hex");
  const bucketHash = digest("match:18218149:WIN_HOME");
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
  const payoutAuthority = Keypair.generate();
  const payoutAccount = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    payer,
    assetMint,
    payoutAuthority.publicKey,
  );
  const slot = await provider.connection.getSlot("confirmed");
  const now = await provider.connection.getBlockTime(slot);
  if (now === null) throw new Error("devnet did not return block time");
  await submit(
    provider,
    payer,
    await program.methods
      .issuePolicy({
        nonce: new BN(nonce.toString()),
        predicateLen: compiled.canonicalBytes.length,
        predicateBytes: [...predicateBytes],
        predicateHash: [...predicateHash],
        quoteHash: [...digest("gate4:authentic-final-proof")],
        bucketHash: [...bucketHash],
        payoutAuthority: payoutAuthority.publicKey,
        coverage: new BN(100 * SCALE),
        premium: new BN(10 * SCALE),
        expiresAt: new BN(now + 3_600),
      })
      .accountsStrict({
        holder: payer.publicKey,
        vault,
        assetMint,
        reserve,
        holderAssetAccount: holderAssets.address,
        brokerAssetAccount: null,
        bucket,
        policy,
        policyEscrow,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .transaction(),
  );

  const caller = Keypair.generate();
  await submit(
    provider,
    payer,
    new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: caller.publicKey,
        lamports: 5_000_000,
      }),
    ),
  );
  const epochDay = Math.floor(proof.ts / 86_400_000);
  const day = Buffer.alloc(2);
  day.writeUInt16LE(epochDay);
  const dailyScoresMerkleRoots = PublicKey.findProgramAddressSync(
    [Buffer.from("daily_scores_roots"), day],
    TXLINE_PROGRAM_ID,
  )[0];
  const accounts = {
    caller: caller.publicKey,
    vault,
    assetMint,
    reserve,
    bucket,
    policy,
    policyEscrow,
    payoutAccount: payoutAccount.address,
    txlineProgram: TXLINE_PROGRAM_ID,
    dailyScoresMerkleRoots,
    tokenProgram: TOKEN_PROGRAM_ID,
  };

  const tamperedTransaction = await program.methods
    .settlePolicy(settlementPayload(true))
    .accountsStrict(accounts)
    .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })])
    .transaction();
  const tamperedSignature = await submit(provider, payer, tamperedTransaction, [caller], true);
  assert.deepEqual((await program.account.policy.fetch(policy)).status, { open: {} });
  assert.equal((await getAccount(provider.connection, policyEscrow)).amount, 100n * BigInt(SCALE));

  const settlementTransaction = await program.methods
    .settlePolicy(settlementPayload(false))
    .accountsStrict(accounts)
    .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })])
    .transaction();
  const settlementSignature = await submit(provider, payer, settlementTransaction, [caller]);
  const settledPolicy = await program.account.policy.fetch(policy);
  assert.deepEqual(settledPolicy.status, { triggered: {} });
  assert.notDeepEqual(Buffer.from(settledPolicy.merkleReceiptHash), Buffer.alloc(32));
  assert.equal((await getAccount(provider.connection, policyEscrow)).amount, 0n);
  assert.equal((await getAccount(provider.connection, payoutAccount.address)).amount, 100n * BigInt(SCALE));

  console.log(
    `PASS: tampering mainTreeProof[0].hash[0] with XOR 0x01 rejected settlement (${tamperedSignature})`,
  );
  console.log(`PASS: authentic TxLINE CPI and payout were atomic (${settlementSignature})`);
  console.log(`EVIDENCE: policy ${policy.toBase58()}, permissionless caller ${caller.publicKey.toBase58()}`);
});
