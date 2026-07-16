import { createHash } from "node:crypto";
import { PublicKey } from "@solana/web3.js";

const VERIFIED_QUOTE_DOMAIN = Buffer.from("SURETY_TXLINE_ODDS_QUOTE_V1");

function fixedBytes(label: string, value: Buffer, length: number): Buffer {
  if (value.length !== length) throw new Error(`${label} must be ${length} bytes`);
  return value;
}

function u64Le(value: bigint): Buffer {
  if (value < 0n || value > 0xffff_ffff_ffff_ffffn) throw new Error("u64 value is out of range");
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(value);
  return bytes;
}

function u32Le(value: number): Buffer {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff_ffff) throw new Error("u32 value is out of range");
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32LE(value);
  return bytes;
}

export type VerifiedQuoteCommitmentInput = {
  vault: PublicKey;
  validatedOdds: PublicKey;
  validationReceiptHash: Buffer;
  predicateHash: Buffer;
  bucketHash: Buffer;
  coverage: bigint;
  premium: bigint;
  probabilityPpm: number;
};

export function verifiedQuoteHash(input: VerifiedQuoteCommitmentInput): Buffer {
  return createHash("sha256")
    .update(
      Buffer.concat([
        VERIFIED_QUOTE_DOMAIN,
        input.vault.toBuffer(),
        input.validatedOdds.toBuffer(),
        fixedBytes("validationReceiptHash", input.validationReceiptHash, 32),
        fixedBytes("predicateHash", input.predicateHash, 32),
        fixedBytes("bucketHash", input.bucketHash, 32),
        u64Le(input.coverage),
        u64Le(input.premium),
        u32Le(input.probabilityPpm),
      ]),
    )
    .digest();
}
