import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { AnchorProvider, BN, Program } from "@anchor-lang/core";
import { TOKEN_PROGRAM_ID, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { compilePredicate } from "../services/predicate/src/compiler.js";
import { verifiedQuoteHash } from "../services/odds-validation/src/quote-commitment.js";
import { syncValidatedMarket } from "../services/odds-validation/src/sync.js";
import { computeQuote, type BookState } from "../services/quote-engine/src/engine.js";
import type { SuretyCore } from "../target/types/surety_core.js";

const idl = JSON.parse(readFileSync("target/idl/surety_core.json", "utf8")) as SuretyCore;
const ASSET_MINT = new PublicKey("FiJfrnLoc2vZmjixZqCEBuWd8A5EuDaF9MZZhd96bpck");
const SCALE = 1_000_000n;

function digest(value: string | Uint8Array): Buffer {
  return createHash("sha256").update(value).digest();
}

function u64(value: bigint): Buffer {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(value);
  return bytes;
}

async function retry<T>(label: string, operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= 8 || !String(error).includes("429")) throw error;
      const delay = Math.min(8_000, 500 * 2 ** attempt);
      console.log(`WAIT: ${label} rate-limited; retrying in ${delay}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

async function main() {
  const fixtureId = BigInt(process.env.NEXT_PUBLIC_SURETY_FIXTURE_ID ?? "18257865");
  const provider = AnchorProvider.env();
  const payer = (provider.wallet as unknown as { payer: Keypair }).payer;
  const program = new Program<SuretyCore>(idl, provider);
  const pda = (...seeds: (Buffer | Uint8Array)[]) => PublicKey.findProgramAddressSync(seeds, program.programId)[0];

  async function submit(transaction: Transaction): Promise<{ signature: string; bytes: number }> {
    const latest = await retry("blockhash", () => provider.connection.getLatestBlockhash("confirmed"));
    transaction.feePayer = payer.publicKey;
    transaction.recentBlockhash = latest.blockhash;
    transaction.sign(payer);
    const wire = transaction.serialize();
    const signature = await retry("send", () => provider.connection.sendRawTransaction(wire, { maxRetries: 5 }));
    const result = await retry("confirm", () =>
      provider.connection.confirmTransaction({ signature, ...latest }, "confirmed"),
    );
    if (result.value.err) throw new Error(`transaction ${signature} failed: ${JSON.stringify(result.value.err)}`);
    return { signature, bytes: wire.length };
  }

  console.log("STEP: synchronizing fresh TxLINE fixture and odds receipts");
  const synced = await syncValidatedMarket(fixtureId, {
    connection: provider.connection,
    payer,
    preserve: true,
  });
  const vaultId = digest(`surety:txline-validated:${fixtureId}:v1`);
  const vault = pda(Buffer.from("vault"), vaultId);
  const reserve = pda(Buffer.from("reserve"), vault.toBuffer());
  const shareMint = pda(Buffer.from("share_mint"), vault.toBuffer());
  let initializeTransaction: { signature: string; bytes: number } | null = null;
  let depositTransaction: { signature: string; bytes: number } | null = null;

  if (!(await retry("vault lookup", () => program.account.vault.fetchNullable(vault)))) {
    console.log("STEP: initializing formula-v2 vault", vault.toBase58());
    initializeTransaction = await submit(
      await program.methods
        .initializeVault([...vaultId], 2_000, new BN(172_800), 15_000, 2, 500)
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
    const holderAssets = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,
      ASSET_MINT,
      payer.publicKey,
      false,
      "confirmed",
    );
    await mintTo(provider.connection, payer, ASSET_MINT, holderAssets.address, payer, 2_000n * SCALE);
    const lpShares = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,
      shareMint,
      payer.publicKey,
      false,
      "confirmed",
    );
    depositTransaction = await submit(
      await program.methods
        .lpDeposit(new BN((1_000n * SCALE).toString()))
        .accountsStrict({
          lp: payer.publicKey,
          vault,
          assetMint: ASSET_MINT,
          reserve,
          shareMint,
          lpAssetAccount: holderAssets.address,
          lpShareAccount: lpShares.address,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .transaction(),
    );
    console.log("STEP: deposited 1,000 test-USDC of LP capital");
  }

  let vaultState = await retry("vault state", () => program.account.vault.fetch(vault));
  if (BigInt(vaultState.totalCapital.toString()) === 0n) {
    console.log("STEP: funding previously initialized formula-v2 vault");
    const holderAssets = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,
      ASSET_MINT,
      payer.publicKey,
      false,
      "confirmed",
    );
    await mintTo(provider.connection, payer, ASSET_MINT, holderAssets.address, payer, 2_000n * SCALE);
    const lpShares = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,
      shareMint,
      payer.publicKey,
      false,
      "confirmed",
    );
    depositTransaction = await submit(
      await program.methods
        .lpDeposit(new BN((1_000n * SCALE).toString()))
        .accountsStrict({
          lp: payer.publicKey,
          vault,
          assetMint: ASSET_MINT,
          reserve,
          shareMint,
          lpAssetAccount: holderAssets.address,
          lpShareAccount: lpShares.address,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .transaction(),
    );
    vaultState = await retry("funded vault state", () => program.account.vault.fetch(vault));
  }
  if (vaultState.formulaVersion !== 2) throw new Error("validated market vault is not formula version 2");
  const outcome = "WIN_HOME" as const;
  const compiled = compilePredicate(`outcome(${fixtureId}) == ${outcome}`);
  const predicateBytes = Buffer.alloc(32);
  predicateBytes.set(compiled.canonicalBytes);
  const predicateHash = Buffer.from(compiled.hash, "hex");
  const bucketHash = digest(`match:${fixtureId}:${outcome}`);
  const bucket = pda(Buffer.from("bucket"), vault.toBuffer(), bucketHash);
  const bucketState = await retry("bucket state", () => program.account.exposureBucket.fetchNullable(bucket));
  const book: BookState = {
    vault: vault.toBase58(),
    totalCapital: BigInt(vaultState.totalCapital.toString()),
    freeReserves: BigInt(vaultState.freeReserves.toString()),
    lockedLiabilities: BigInt(vaultState.lockedLiabilities.toString()),
    bucketHash: bucketHash.toString("hex"),
    bucketExposure: BigInt(bucketState?.lockedExposure.toString() ?? "0"),
    maxBucketBps: vaultState.maxBucketBps,
  };
  const coverage = 50n * SCALE;
  const quote = computeQuote({
    packet: synced.packet,
    packetSourceSha256: digest(synced.snapshotBytes).toString("hex"),
    predicateHash: compiled.hash,
    outcome,
    coverage,
    marginBps: vaultState.marginBps,
    book,
  });
  if (quote.premium === null) throw new Error(`validated quote was rejected at ${quote.projectedUtilizationBps} bps`);
  const premium = BigInt(quote.premium);
  const quoteHash = verifiedQuoteHash({
    vault,
    validatedFixture: synced.fixtureAddress,
    validatedOdds: synced.oddsAddress,
    fixtureValidationReceiptHash: Buffer.from(synced.fixtureReceipt.validationReceiptHash),
    oddsValidationReceiptHash: Buffer.from(synced.oddsReceipt.validationReceiptHash),
    predicateHash,
    bucketHash,
    coverage,
    premium,
    probabilityPpm: quote.probabilityPpm,
  });
  const nonce = BigInt(synced.packet.Ts);
  const policy = pda(
    Buffer.from("policy"),
    vault.toBuffer(),
    payer.publicKey.toBuffer(),
    predicateHash,
    u64(nonce),
  );
  const policyEscrow = pda(Buffer.from("policy_escrow"), policy.toBuffer());
  let issueTransaction: { signature: string; bytes: number } | null = null;
  if (!(await retry("policy lookup", () => program.account.policy.fetchNullable(policy)))) {
    console.log("STEP: issuing proof-backed policy", policy.toBase58());
    const holderAssets = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,
      ASSET_MINT,
      payer.publicKey,
      false,
      "confirmed",
    );
    issueTransaction = await submit(
      await program.methods
        .issuePolicyWithValidatedOdds({
          nonce: new BN(nonce.toString()),
          predicateLen: compiled.canonicalBytes.length,
          predicateBytes: [...predicateBytes],
          predicateHash: [...predicateHash],
          quoteHash: [...quoteHash],
          bucketHash: [...bucketHash],
          payoutAuthority: payer.publicKey,
          coverage: new BN(coverage.toString()),
          premium: new BN(premium.toString()),
          expiresAt: new BN(Math.floor(Date.now() / 1_000) + 30 * 24 * 3_600),
        })
        .accountsStrict({
          holder: payer.publicKey,
          vault,
          assetMint: ASSET_MINT,
          reserve,
          holderAssetAccount: holderAssets.address,
          brokerAssetAccount: null,
          bucket,
          policy,
          policyEscrow,
          validatedOdds: synced.oddsAddress,
          validatedFixture: synced.fixtureAddress,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .transaction(),
    );
  }

  const storedPolicy = await retry("stored policy", () => program.account.policy.fetch(policy));
  if (!Buffer.from(storedPolicy.quoteHash).equals(quoteHash)) throw new Error("stored policy quote hash differs");
  console.log(
    JSON.stringify(
      {
        fixtureId: fixtureId.toString(),
        packet: { messageId: synced.packet.MessageId, ts: synced.packet.Ts, prices: synced.packet.Prices },
        program: program.programId.toBase58(),
        vault: vault.toBase58(),
        assetMint: ASSET_MINT.toBase58(),
        validatedFixture: synced.fixtureAddress.toBase58(),
        validatedOdds: synced.oddsAddress.toBase58(),
        policy: policy.toBase58(),
        quote: { probabilityPpm: quote.probabilityPpm, coverage: coverage.toString(), premium: premium.toString() },
        transactions: {
          fixtureReceipt: synced.fixtureTransaction,
          oddsReceipt: synced.oddsTransaction,
          initializeVault: initializeTransaction,
          lpDeposit: depositTransaction,
          issuePolicy: issueTransaction,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("FAIL:", error);
  process.exit(1);
});
