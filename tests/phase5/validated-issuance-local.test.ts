import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { AnchorProvider, BN, Program, setProvider } from "@anchor-lang/core";
import {
  TOKEN_PROGRAM_ID,
  createAccount,
  createMint,
  getAccount,
  mintTo,
} from "@solana/spl-token";
import { Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { compilePredicate } from "../../services/predicate/src/compiler.js";
import { verifiedQuoteHash } from "../../services/odds-validation/src/quote-commitment.js";
import {
  buildRecordValidatedFixtureTx,
  buildRecordValidatedOddsTx,
  validatedFixtureAddress,
  validatedOddsAddress,
} from "../../services/odds-validation/src/record.js";
import {
  oddsMessageKey,
  type RawFixtureValidation,
  type RawOddsValidation,
} from "../../services/odds-validation/src/txline.js";
import type { TxlineWinnerPacket } from "../../services/quote-engine/src/engine.js";
import type { SuretyCore } from "../../target/types/surety_core.js";

const idl = JSON.parse(readFileSync("target/idl/surety_core.json", "utf8")) as SuretyCore;
const fixtureProof = JSON.parse(
  readFileSync(process.env.SURETY_FIXTURE_PROOF ?? "data/recordings/txline-18257865-1784149200000-fixture-proof.raw.json", "utf8"),
) as RawFixtureValidation;
const oddsProof = JSON.parse(
  readFileSync(process.env.SURETY_ODDS_PROOF ?? "data/recordings/txline-18257865-1784177934298-odds-proof.raw.json", "utf8"),
) as RawOddsValidation;

function digest(value: string | Uint8Array): Buffer {
  return createHash("sha256").update(value).digest();
}

function pda(programId: PublicKey, ...seeds: (Buffer | Uint8Array)[]): PublicKey {
  return PublicKey.findProgramAddressSync(seeds, programId)[0];
}

function u64(value: bigint): Buffer {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(value);
  return bytes;
}

async function send(provider: AnchorProvider, payer: Keypair, transaction: Transaction): Promise<string> {
  return sendAndConfirmTransaction(provider.connection, transaction, [payer], {
    commitment: "finalized",
    maxRetries: 5,
  });
}

test("TxLINE fixture CPI -> odds CPI -> proof-backed issuance lifecycle", async () => {
  const provider = AnchorProvider.env();
  setProvider(provider);
  const payer = (provider.wallet as unknown as { payer: Keypair }).payer;
  const program = new Program<SuretyCore>(idl, provider);
  const connection = provider.connection;
  const fixtureId = BigInt(oddsProof.odds.FixtureId);

  const assetMint = await createMint(connection, payer, payer.publicKey, null, 6, undefined, { commitment: "finalized" });
  const holderAssets = await createAccount(connection, payer, assetMint, payer.publicKey, Keypair.generate(), { commitment: "finalized" });
  await mintTo(connection, payer, assetMint, holderAssets, payer, 2_000_000_000n, [], { commitment: "finalized" });

  const vaultId = digest(`surety:validated-local:${Date.now()}`);
  const vault = pda(program.programId, Buffer.from("vault"), vaultId);
  const reserve = pda(program.programId, Buffer.from("reserve"), vault.toBuffer());
  const shareMint = pda(program.programId, Buffer.from("share_mint"), vault.toBuffer());
  await send(
    provider,
    payer,
    await program.methods
      .initializeVault([...vaultId], 2_000, new BN(60), 15_000, 2)
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
  const lpShares = await createAccount(connection, payer, shareMint, payer.publicKey, Keypair.generate(), { commitment: "finalized" });
  await send(
    provider,
    payer,
    await program.methods
      .lpDeposit(new BN(1_000_000_000))
      .accountsStrict({
        lp: payer.publicKey,
        vault,
        assetMint,
        reserve,
        shareMint,
        lpAssetAccount: holderAssets,
        lpShareAccount: lpShares,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .transaction(),
  );

  const fixtureTransaction = await buildRecordValidatedFixtureTx(connection, payer.publicKey, fixtureProof);
  const fixtureSignature = await send(provider, payer, fixtureTransaction);
  const fixtureWireSize = fixtureTransaction.serialize().length;
  const oddsTransaction = await buildRecordValidatedOddsTx(connection, payer.publicKey, oddsProof);
  const oddsSignature = await send(provider, payer, oddsTransaction);
  const oddsWireSize = oddsTransaction.serialize().length;

  const validatedFixture = validatedFixtureAddress(fixtureProof);
  const validatedOdds = validatedOddsAddress(oddsProof);
  const fixtureReceipt = await program.account.validatedFixture.fetch(validatedFixture);
  const oddsReceipt = await program.account.validatedOdds.fetch(validatedOdds);
  assert.equal(fixtureReceipt.fixtureId.toString(), fixtureId.toString());
  assert.equal(oddsReceipt.fixtureId.toString(), fixtureId.toString());

  const compiled = compilePredicate(`outcome(${fixtureId}) == WIN_HOME`);
  const predicateBytes = Buffer.alloc(32);
  predicateBytes.set(compiled.canonicalBytes);
  const predicateHash = Buffer.from(compiled.hash, "hex");
  const bucketHash = digest(`match:${fixtureId}:WIN_HOME`);
  const bucket = pda(program.programId, Buffer.from("bucket"), vault.toBuffer(), bucketHash);
  const coverage = 50_000_000n;
  const probabilityPpm = 1_000_000n * BigInt(oddsProof.odds.Prices[1]!) * BigInt(oddsProof.odds.Prices[2]!) /
    (BigInt(oddsProof.odds.Prices[1]!) * BigInt(oddsProof.odds.Prices[2]!) +
      BigInt(oddsProof.odds.Prices[0]!) * BigInt(oddsProof.odds.Prices[2]!) +
      BigInt(oddsProof.odds.Prices[0]!) * BigInt(oddsProof.odds.Prices[1]!));
  const roundedProbabilityPpm = Number(
    (BigInt(oddsProof.odds.Prices[1]!) * BigInt(oddsProof.odds.Prices[2]!) * 1_000_000n +
      (BigInt(oddsProof.odds.Prices[1]!) * BigInt(oddsProof.odds.Prices[2]!) +
        BigInt(oddsProof.odds.Prices[0]!) * BigInt(oddsProof.odds.Prices[2]!) +
        BigInt(oddsProof.odds.Prices[0]!) * BigInt(oddsProof.odds.Prices[1]!)) / 2n) /
      (BigInt(oddsProof.odds.Prices[1]!) * BigInt(oddsProof.odds.Prices[2]!) +
        BigInt(oddsProof.odds.Prices[0]!) * BigInt(oddsProof.odds.Prices[2]!) +
        BigInt(oddsProof.odds.Prices[0]!) * BigInt(oddsProof.odds.Prices[1]!)),
  );
  assert(Number(probabilityPpm) > 0);
  const premium =
    (coverage * BigInt(roundedProbabilityPpm) * 15_000n + 1_000_000n * 10_000n - 1n) /
    (1_000_000n * 10_000n);
  const nonce = BigInt(Date.now());
  const policy = pda(
    program.programId,
    Buffer.from("policy"),
    vault.toBuffer(),
    payer.publicKey.toBuffer(),
    predicateHash,
    u64(nonce),
  );
  const policyEscrow = pda(program.programId, Buffer.from("policy_escrow"), policy.toBuffer());
  const quoteHash = verifiedQuoteHash({
    vault,
    validatedFixture,
    validatedOdds,
    fixtureValidationReceiptHash: Buffer.from(fixtureReceipt.validationReceiptHash),
    oddsValidationReceiptHash: Buffer.from(oddsReceipt.validationReceiptHash),
    predicateHash,
    bucketHash,
    coverage,
    premium,
    probabilityPpm: roundedProbabilityPpm,
  });
  const commonArgs = {
    predicateLen: compiled.canonicalBytes.length,
    predicateBytes: [...predicateBytes],
    predicateHash: [...predicateHash],
    payoutAuthority: payer.publicKey,
    coverage: new BN(coverage.toString()),
    premium: new BN(premium.toString()),
    expiresAt: new BN(Math.floor(Date.now() / 1_000) + 3_600),
  };

  const legacyNonce = nonce + 1n;
  const legacyPolicy = pda(
    program.programId,
    Buffer.from("policy"),
    vault.toBuffer(),
    payer.publicKey.toBuffer(),
    predicateHash,
    u64(legacyNonce),
  );
  await assert.rejects(async () =>
    send(
      provider,
      payer,
      await program.methods
        .issuePolicy({
          ...commonArgs,
          nonce: new BN(legacyNonce.toString()),
          quoteHash: [...quoteHash],
          bucketHash: [...bucketHash],
        })
        .accountsStrict({
          holder: payer.publicKey,
          vault,
          assetMint,
          reserve,
          holderAssetAccount: holderAssets,
          bucket,
          policy: legacyPolicy,
          policyEscrow: pda(program.programId, Buffer.from("policy_escrow"), legacyPolicy.toBuffer()),
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .transaction(),
    ),
  );
  assert.equal(await connection.getAccountInfo(legacyPolicy), null, "formula-v2 vault must reject legacy issuance atomically");

  const maliciousNonce = nonce + 2n;
  const maliciousBucketHash = digest("attacker-controlled-exposure-bucket");
  const maliciousBucket = pda(program.programId, Buffer.from("bucket"), vault.toBuffer(), maliciousBucketHash);
  const maliciousPolicy = pda(
    program.programId,
    Buffer.from("policy"),
    vault.toBuffer(),
    payer.publicKey.toBuffer(),
    predicateHash,
    u64(maliciousNonce),
  );
  const maliciousQuoteHash = verifiedQuoteHash({
    vault,
    validatedFixture,
    validatedOdds,
    fixtureValidationReceiptHash: Buffer.from(fixtureReceipt.validationReceiptHash),
    oddsValidationReceiptHash: Buffer.from(oddsReceipt.validationReceiptHash),
    predicateHash,
    bucketHash: maliciousBucketHash,
    coverage,
    premium,
    probabilityPpm: roundedProbabilityPpm,
  });
  await assert.rejects(async () =>
    send(
      provider,
      payer,
      await program.methods
        .issuePolicyWithValidatedOdds({
          ...commonArgs,
          nonce: new BN(maliciousNonce.toString()),
          quoteHash: [...maliciousQuoteHash],
          bucketHash: [...maliciousBucketHash],
        })
        .accountsStrict({
          holder: payer.publicKey,
          vault,
          assetMint,
          reserve,
          holderAssetAccount: holderAssets,
          bucket: maliciousBucket,
          policy: maliciousPolicy,
          policyEscrow: pda(program.programId, Buffer.from("policy_escrow"), maliciousPolicy.toBuffer()),
          validatedOdds,
          validatedFixture,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .transaction(),
    ),
  );
  assert.equal(await connection.getAccountInfo(maliciousPolicy), null, "arbitrary bucket hash must be rejected atomically");

  const issue = await program.methods
    .issuePolicyWithValidatedOdds({
      ...commonArgs,
      nonce: new BN(nonce.toString()),
      quoteHash: [...quoteHash],
      bucketHash: [...bucketHash],
    })
    .accountsStrict({
      holder: payer.publicKey,
      vault,
      assetMint,
      reserve,
      holderAssetAccount: holderAssets,
      bucket,
      policy,
      policyEscrow,
      validatedOdds,
      validatedFixture,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .transaction();
  const issueSignature = await send(provider, payer, issue);
  const issueWireSize = issue.serialize().length;
  const storedPolicy = await program.account.policy.fetch(policy);
  const escrow = await getAccount(connection, policyEscrow);
  assert.equal(storedPolicy.premium.toString(), premium.toString());
  assert.deepEqual(Buffer.from(storedPolicy.quoteHash), quoteHash);
  assert.equal(escrow.amount, coverage);
  console.log(
    JSON.stringify({
      fixtureSignature,
      oddsSignature,
      issueSignature,
      fixtureWireSize,
      oddsWireSize,
      issueWireSize,
      validatedFixture: validatedFixture.toBase58(),
      validatedOdds: validatedOdds.toBase58(),
      policy: policy.toBase58(),
      premium: premium.toString(),
    }),
  );
});
