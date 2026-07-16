import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID, TXLINE_PROGRAM_ID, VAULT } from "./config.js";

export function u64LE(value: bigint): Buffer {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(value);
  return bytes;
}

export function u16LE(value: number): Buffer {
  const bytes = Buffer.alloc(2);
  bytes.writeUInt16LE(value);
  return bytes;
}

function pda(seeds: (Buffer | Uint8Array)[], programId: PublicKey = PROGRAM_ID): PublicKey {
  return PublicKey.findProgramAddressSync(seeds, programId)[0];
}

export const reservePda = (vault: PublicKey = VAULT) => pda([Buffer.from("reserve"), vault.toBuffer()]);
export const shareMintPda = (vault: PublicKey = VAULT) => pda([Buffer.from("share_mint"), vault.toBuffer()]);

export const bucketPda = (bucketHash: Buffer, vault: PublicKey = VAULT) =>
  pda([Buffer.from("bucket"), vault.toBuffer(), bucketHash]);

export const policyPda = (holder: PublicKey, predicateHash: Buffer, nonce: bigint) =>
  pda([Buffer.from("policy"), VAULT.toBuffer(), holder.toBuffer(), predicateHash, u64LE(nonce)]);

export const policyEscrowPda = (policy: PublicKey) => pda([Buffer.from("policy_escrow"), policy.toBuffer()]);

export const withdrawalPda = (lp: PublicKey, requestId: bigint) =>
  pda([Buffer.from("withdrawal"), VAULT.toBuffer(), lp.toBuffer(), u64LE(requestId)]);

export const withdrawalSharesPda = (withdrawal: PublicKey) =>
  pda([Buffer.from("withdrawal_shares"), withdrawal.toBuffer()]);

export const attestationPda = (seq: bigint) =>
  pda([Buffer.from("attestation"), VAULT.toBuffer(), u64LE(seq)]);

export const dailyScoresMerkleRootsPda = (proofTimestampMs: number) => {
  const epochDay = Math.floor(proofTimestampMs / 86_400_000);
  return pda([Buffer.from("daily_scores_roots"), u16LE(epochDay)], TXLINE_PROGRAM_ID);
};

export const dailyOddsMerkleRootsPda = (proofTimestampMs: number) => {
  const epochDay = Math.floor(proofTimestampMs / 86_400_000);
  return pda([Buffer.from("daily_batch_roots"), u16LE(epochDay)], TXLINE_PROGRAM_ID);
};

export const validatedOddsPda = (messageIdKey: Buffer) => {
  if (messageIdKey.length !== 16) throw new Error("validated odds message key must be 16 bytes");
  return pda([Buffer.from("validated_odds"), messageIdKey]);
};

export const bucketHashFor = (fixtureId: bigint, outcome: "WIN_HOME" | "DRAW" | "WIN_AWAY") =>
  `match:${fixtureId}:${outcome}`;
