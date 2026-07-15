import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export type Policy = { id: string; coverage: number; bucket: string };
export type OddsUpdate = { packetRef: string; probability: number; ts: number };
export type Attestation = { seq: number; prevHash: string; oddsPacketRef: string; reserves: number; markedLiabilities: number; solvencyRatioBps: number; ts: number; hash: string };

const sha = (v: string) => createHash("sha256").update(v).digest("hex");
export function buildChain(policies: Policy[], updates: OddsUpdate[], reserves: number): Attestation[] {
  let prevHash = "0".repeat(64);
  return updates.map((u, i) => {
    const markedLiabilities = policies.reduce((sum, p) => sum + p.coverage * u.probability, 0);
    const solvencyRatioBps = markedLiabilities === 0 ? 0 : Math.floor((reserves * 10_000) / markedLiabilities);
    const body = { seq: i + 1, prevHash, oddsPacketRef: u.packetRef, reserves, markedLiabilities, solvencyRatioBps, ts: u.ts };
    const hash = sha(JSON.stringify(body));
    prevHash = hash;
    return { ...body, hash };
  });
}
export function verifyChain(chain: Attestation[]): boolean {
  let prevHash = "0".repeat(64);
  for (const a of chain) {
    const { hash, ...body } = a;
    if (a.prevHash !== prevHash || sha(JSON.stringify(body)) !== hash) return false;
    prevHash = hash;
  }
  return true;
}
export async function verifyChainFile(path: string): Promise<boolean> {
  const lines = (await readFile(path, "utf8")).split(/\r?\n/).filter(Boolean);
  return verifyChain(lines.map((line) => JSON.parse(line) as Attestation));
}
