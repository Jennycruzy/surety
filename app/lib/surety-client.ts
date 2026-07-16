import { AnchorProvider, BN, Program, type Idl } from "@anchor-lang/core";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { ComputeBudgetProgram, Connection, PublicKey, SystemProgram, type Transaction, type VersionedTransaction } from "@solana/web3.js";
import type { SuretyCore } from "../../target/types/surety_core.js";
import idlJson from "../../target/idl/surety_core.json" with { type: "json" };
import { ASSET_MINT, PROGRAM_ID, RPC_ENDPOINT, TXLINE_PROGRAM_ID, VAULT } from "./config.js";
import {
  bucketPda,
  dailyScoresMerkleRootsPda,
  policyEscrowPda,
  policyPda,
  reservePda,
  shareMintPda,
  validatedOddsPda,
  validatedFixturePda,
  withdrawalPda,
  withdrawalSharesPda,
} from "./pda.js";

export type ReadOnlyWallet = { publicKey: PublicKey };
export type SigningWallet = ReadOnlyWallet & {
  signTransaction: <T extends Transaction | VersionedTransaction>(tx: T) => Promise<T>;
  signAllTransactions: <T extends Transaction | VersionedTransaction>(txs: T[]) => Promise<T[]>;
};

// The IDL is imported statically so this module stays free of `node:fs` and can be
// bundled into client components (the wallet-signing panels build transactions here).
const idl = idlJson as Idl;

export function newConnection(): Connection {
  return new Connection(RPC_ENDPOINT, "confirmed");
}

// AnchorProvider requires a Wallet-shaped object even for building unsigned
// transactions; a wallet lacking signing capability is fine here because
// `.transaction()` never calls it, only `.rpc()`/`.sendAndConfirm()` would.
function unsignedWallet(publicKey: PublicKey): SigningWallet {
  return {
    publicKey,
    signTransaction: async () => {
      throw new Error("this provider is read-only: sign and send with the connected wallet instead");
    },
    signAllTransactions: async () => {
      throw new Error("this provider is read-only: sign and send with the connected wallet instead");
    },
  };
}

export function getProgram(connection: Connection, wallet: ReadOnlyWallet): Program<SuretyCore> {
  const provider = new AnchorProvider(connection, unsignedWallet(wallet.publicKey), { commitment: "confirmed" });
  return new Program<SuretyCore>(idl, provider);
}

export const assetAta = (owner: PublicKey) => getAssociatedTokenAddressSync(ASSET_MINT, owner);

export function ensureAtaIx(payer: PublicKey, owner: PublicKey, mint: PublicKey = ASSET_MINT) {
  const ata = getAssociatedTokenAddressSync(mint, owner);
  return {
    ata,
    instruction: createAssociatedTokenAccountIdempotentInstruction(payer, ata, owner, mint, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID),
  };
}

export type IssuePolicyInput = {
  holder: PublicKey;
  payoutAuthority: PublicKey;
  nonce: bigint;
  predicateBytes: Buffer; // canonical bytes, will be padded to 32
  predicateLen: number;
  predicateHash: Buffer; // 32 bytes
  quoteHash: Buffer; // 32 bytes
  bucketHash: Buffer; // 32 bytes
  coverage: bigint;
  premium: bigint;
  expiresAt: bigint;
};

export async function buildIssuePolicyTx(connection: Connection, input: IssuePolicyInput): Promise<Transaction> {
  const program = getProgram(connection, { publicKey: input.holder });
  const padded = Buffer.alloc(32);
  input.predicateBytes.copy(padded);
  const policy = policyPda(input.holder, input.predicateHash, input.nonce);
  const { ata: holderAssetAccount, instruction: ensureHolderAta } = ensureAtaIx(input.holder, input.holder);
  const tx = await program.methods
    .issuePolicy({
      nonce: new BN(input.nonce.toString()),
      predicateLen: input.predicateLen,
      predicateBytes: [...padded],
      predicateHash: [...input.predicateHash],
      quoteHash: [...input.quoteHash],
      bucketHash: [...input.bucketHash],
      payoutAuthority: input.payoutAuthority,
      coverage: new BN(input.coverage.toString()),
      premium: new BN(input.premium.toString()),
      expiresAt: new BN(input.expiresAt.toString()),
    })
    .accountsStrict({
      holder: input.holder,
      vault: VAULT,
      assetMint: ASSET_MINT,
      reserve: reservePda(),
      holderAssetAccount,
      bucket: bucketPda(input.bucketHash),
      policy,
      policyEscrow: policyEscrowPda(policy),
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .preInstructions([ensureHolderAta])
    .transaction();
  return tx;
}

export async function buildIssuePolicyWithValidatedOddsTx(
  connection: Connection,
  input: IssuePolicyInput & { fixtureId: bigint; validatedOddsMessageKey: Buffer },
): Promise<Transaction> {
  const program = getProgram(connection, { publicKey: input.holder });
  const padded = Buffer.alloc(32);
  input.predicateBytes.copy(padded);
  const policy = policyPda(input.holder, input.predicateHash, input.nonce);
  const { ata: holderAssetAccount, instruction: ensureHolderAta } = ensureAtaIx(input.holder, input.holder);
  return program.methods
    .issuePolicyWithValidatedOdds({
      nonce: new BN(input.nonce.toString()),
      predicateLen: input.predicateLen,
      predicateBytes: [...padded],
      predicateHash: [...input.predicateHash],
      quoteHash: [...input.quoteHash],
      bucketHash: [...input.bucketHash],
      payoutAuthority: input.payoutAuthority,
      coverage: new BN(input.coverage.toString()),
      premium: new BN(input.premium.toString()),
      expiresAt: new BN(input.expiresAt.toString()),
    })
    .accountsStrict({
      holder: input.holder,
      vault: VAULT,
      assetMint: ASSET_MINT,
      reserve: reservePda(),
      holderAssetAccount,
      bucket: bucketPda(input.bucketHash),
      policy,
      policyEscrow: policyEscrowPda(policy),
      validatedOdds: validatedOddsPda(input.validatedOddsMessageKey),
      validatedFixture: validatedFixturePda(input.fixtureId),
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .preInstructions([ensureHolderAta])
    .transaction();
}

export type LpDepositInput = { lp: PublicKey; assets: bigint };

export async function buildLpDepositTx(connection: Connection, input: LpDepositInput): Promise<Transaction> {
  const program = getProgram(connection, { publicKey: input.lp });
  const shareMint = shareMintPda();
  const { ata: lpAssetAccount, instruction: ensureLpAssetAta } = ensureAtaIx(input.lp, input.lp, ASSET_MINT);
  const { ata: lpShareAccount, instruction: ensureLpShareAta } = ensureAtaIx(input.lp, input.lp, shareMint);
  return program.methods
    .lpDeposit(new BN(input.assets.toString()))
    .accountsStrict({
      lp: input.lp,
      vault: VAULT,
      assetMint: ASSET_MINT,
      reserve: reservePda(),
      shareMint,
      lpAssetAccount,
      lpShareAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .preInstructions([ensureLpAssetAta, ensureLpShareAta])
    .transaction();
}

export type RequestWithdrawalInput = { lp: PublicKey; requestId: bigint; shares: bigint };

export async function buildRequestWithdrawalTx(connection: Connection, input: RequestWithdrawalInput): Promise<Transaction> {
  const program = getProgram(connection, { publicKey: input.lp });
  const shareMint = shareMintPda();
  const withdrawal = withdrawalPda(input.lp, input.requestId);
  const { ata: lpShareAccount } = ensureAtaIx(input.lp, input.lp, shareMint);
  return program.methods
    .requestWithdrawal(new BN(input.requestId.toString()), new BN(input.shares.toString()))
    .accountsStrict({
      lp: input.lp,
      vault: VAULT,
      reserve: reservePda(),
      shareMint,
      lpShareAccount,
      withdrawal,
      requestShareAccount: withdrawalSharesPda(withdrawal),
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .transaction();
}

export type ExecuteWithdrawalInput = { caller: PublicKey; lp: PublicKey; requestId: bigint };

export async function buildExecuteWithdrawalTx(connection: Connection, input: ExecuteWithdrawalInput): Promise<Transaction> {
  const program = getProgram(connection, { publicKey: input.caller });
  const withdrawal = withdrawalPda(input.lp, input.requestId);
  const { ata: lpAssetAccount, instruction: ensureLpAssetAta } = ensureAtaIx(input.caller, input.lp, ASSET_MINT);
  return program.methods
    .executeWithdrawal()
    .accountsStrict({
      caller: input.caller,
      vault: VAULT,
      assetMint: ASSET_MINT,
      reserve: reservePda(),
      shareMint: shareMintPda(),
      withdrawal,
      requestShareAccount: withdrawalSharesPda(withdrawal),
      lpAssetAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .preInstructions([ensureLpAssetAta])
    .transaction();
}

export type ExpirePolicyInput = { caller: PublicKey; policy: PublicKey; bucketHash: Buffer };

export async function buildExpirePolicyTx(connection: Connection, input: ExpirePolicyInput): Promise<Transaction> {
  const program = getProgram(connection, { publicKey: input.caller });
  return program.methods
    .expirePolicy()
    .accountsStrict({
      caller: input.caller,
      vault: VAULT,
      assetMint: ASSET_MINT,
      reserve: reservePda(),
      bucket: bucketPda(input.bucketHash),
      policy: input.policy,
      policyEscrow: policyEscrowPda(input.policy),
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .transaction();
}

export type SettlePolicyInput = {
  caller: PublicKey;
  policyAddress: PublicKey;
  // Anchor `StatValidationInput` payload, built via settlementPayloadFromProof().
  payload: Parameters<Program<SuretyCore>["methods"]["settlePolicy"]>[0];
};

// Builds the permissionless settlement transaction for the live app vault. This is the
// same instruction, account layout, and proof payload proven on devnet at Gate 4 — the
// only difference is the vault/policy are resolved from the app's configured vault.
export async function buildSettlePolicyTx(connection: Connection, input: SettlePolicyInput): Promise<Transaction> {
  const program = getProgram(connection, { publicKey: input.caller });
  const policy = await program.account.policy.fetch(input.policyAddress);
  // All vault-scoped accounts derive from the policy's own vault field, so this settles
  // any policy on any SURETY vault — not just the app's default showcase vault.
  const vault = new PublicKey(policy.vault as PublicKey);
  const vaultState = await program.account.vault.fetch(vault);
  const assetMint = new PublicKey(vaultState.assetMint as PublicKey);
  const bucketHash = Buffer.from(policy.bucketHash as number[]);
  const payoutAuthority = new PublicKey(policy.payoutAuthority as PublicKey);
  const { ata: payoutAccount, instruction: ensurePayoutAta } = ensureAtaIx(input.caller, payoutAuthority, assetMint);
  const proofTs = Number((input.payload as { ts: { toString(): string } }).ts.toString());
  return program.methods
    .settlePolicy(input.payload)
    .accountsStrict({
      caller: input.caller,
      vault,
      assetMint,
      reserve: reservePda(vault),
      bucket: bucketPda(bucketHash, vault),
      policy: input.policyAddress,
      policyEscrow: policyEscrowPda(input.policyAddress),
      payoutAccount,
      txlineProgram: TXLINE_PROGRAM_ID,
      dailyScoresMerkleRoots: dailyScoresMerkleRootsPda(proofTs),
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }), ensurePayoutAta])
    .transaction();
}

export { PROGRAM_ID, TXLINE_PROGRAM_ID, VAULT, dailyScoresMerkleRootsPda };
