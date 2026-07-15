import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { canonicalJson } from "../../quote-engine/src/engine.js";

const DOMAIN = Buffer.from("SURETY_ATTESTATION_V1");
const PPM = 1_000_000n;
const BPS = 10_000n;

export type Policy = { id: string; coverage: string; bucket: string };
export type OddsUpdate = {
  packetRef: string;
  packetHash: string;
  probabilityPpmByBucket: Record<string, number>;
  timestampMs: string;
};
export type MarkerInput = {
  vault: string;
  reserves: string;
  lockedCollateral: string;
  policies: Policy[];
  updates: OddsUpdate[];
};
export type Attestation = {
  seq: number;
  prevHash: string;
  oddsPacketRef: string;
  oddsPacketHash: string;
  bookSnapshotHash: string;
  reserves: string;
  lockedCollateral: string;
  markedLiabilities: string;
  solvencyRatioBps: string;
  timestampMs: string;
  hash: string;
  attestationPda?: string;
  transactionSignature?: string;
};

function sha(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function hex32(label: string, value: string): Buffer {
  if (!/^[0-9a-f]{64}$/i.test(value)) throw new Error(`${label} must be 32-byte hex`);
  return Buffer.from(value, "hex");
}

function u64(value: bigint): Buffer {
  if (value < 0n || value > 0xffff_ffff_ffff_ffffn) throw new Error("u64 value out of range");
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(value);
  return bytes;
}

function i64(value: bigint): Buffer {
  if (value < -0x8000_0000_0000_0000n || value > 0x7fff_ffff_ffff_ffffn) {
    throw new Error("i64 value out of range");
  }
  const bytes = Buffer.alloc(8);
  bytes.writeBigInt64LE(value);
  return bytes;
}

export function computeAttestationHash(attestation: Omit<Attestation, "hash" | "oddsPacketRef" | "attestationPda" | "transactionSignature">): string {
  return sha(
    Buffer.concat([
      DOMAIN,
      u64(BigInt(attestation.seq)),
      hex32("prevHash", attestation.prevHash),
      hex32("oddsPacketHash", attestation.oddsPacketHash),
      hex32("bookSnapshotHash", attestation.bookSnapshotHash),
      u64(BigInt(attestation.reserves)),
      u64(BigInt(attestation.lockedCollateral)),
      u64(BigInt(attestation.markedLiabilities)),
      u64(BigInt(attestation.solvencyRatioBps)),
      i64(BigInt(attestation.timestampMs)),
    ]),
  );
}

function validateInput(input: MarkerInput): void {
  const reserves = BigInt(input.reserves);
  const locked = BigInt(input.lockedCollateral);
  if (reserves <= 0n || locked < 0n || locked > reserves) throw new Error("invalid vault figures");
  const ids = new Set<string>();
  for (const policy of input.policies) {
    if (ids.has(policy.id)) throw new Error(`duplicate policy ${policy.id}`);
    ids.add(policy.id);
    if (BigInt(policy.coverage) <= 0n) throw new Error(`policy ${policy.id} has invalid coverage`);
  }
}

export function buildChain(
  input: MarkerInput,
  start: { seq: number; prevHash: string } = { seq: 0, prevHash: "0".repeat(64) },
): Attestation[] {
  validateInput(input);
  if (!Number.isSafeInteger(start.seq) || start.seq < 0) throw new Error("invalid starting sequence");
  hex32("starting prevHash", start.prevHash);
  const policies = [...input.policies].sort((left, right) => left.id.localeCompare(right.id));
  const bookSnapshotHash = sha(
    canonicalJson({
      vault: input.vault,
      reserves: input.reserves,
      lockedCollateral: input.lockedCollateral,
      policies,
    }),
  );
  let prevHash = start.prevHash;
  return input.updates.map((update, index) => {
    hex32("packetHash", update.packetHash);
    const weighted = policies.reduce((sum, policy) => {
      const probability = update.probabilityPpmByBucket[policy.bucket];
      if (!Number.isInteger(probability) || probability! < 0 || probability! > 1_000_000) {
        throw new Error(`packet ${update.packetRef} has no valid probability for ${policy.bucket}`);
      }
      return sum + BigInt(policy.coverage) * BigInt(probability!);
    }, 0n);
    const marked = weighted / PPM;
    const ratio = marked === 0n ? 0n : (BigInt(input.reserves) * BPS) / marked;
    const body = {
      seq: start.seq + index + 1,
      prevHash,
      oddsPacketHash: update.packetHash.toLowerCase(),
      bookSnapshotHash,
      reserves: input.reserves,
      lockedCollateral: input.lockedCollateral,
      markedLiabilities: marked.toString(),
      solvencyRatioBps: ratio.toString(),
      timestampMs: update.timestampMs,
    };
    const hash = computeAttestationHash(body);
    const attestation: Attestation = {
      ...body,
      oddsPacketRef: update.packetRef,
      hash,
    };
    prevHash = hash;
    return attestation;
  });
}

export function verifyChain(chain: Attestation[]): boolean {
  let prevHash = "0".repeat(64);
  for (const attestation of chain) {
    const { hash, oddsPacketRef: _ref, attestationPda: _pda, transactionSignature: _sig, ...body } = attestation;
    if (attestation.prevHash !== prevHash || computeAttestationHash(body) !== hash) return false;
    prevHash = hash;
  }
  return true;
}

export async function verifyChainFile(path: string): Promise<boolean> {
  const lines = (await readFile(path, "utf8")).split(/\r?\n/).filter(Boolean);
  return verifyChain(lines.map((line) => JSON.parse(line) as Attestation));
}
