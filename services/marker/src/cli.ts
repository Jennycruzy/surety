import { readFile, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { BorshAccountsCoder, type Idl } from "@anchor-lang/core";
import { Connection, PublicKey } from "@solana/web3.js";
import { buildChain, verifyChainFile, type Attestation, type MarkerInput } from "./marker.js";

const arg = (n: string) => { const i = process.argv.indexOf(n); return i < 0 ? undefined : process.argv[i + 1]; };
async function main() {
  const verify = arg("--verify-chain");
  if (verify) {
    if (!(await verifyChainFile(verify))) throw new Error("attestation hash chain verification failed");
    const rpc = arg("--rpc");
    if (rpc) {
      const chain = (await readFile(verify, "utf8")).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as Attestation);
      if (chain.some((record) => !record.attestationPda)) throw new Error("on-chain verification requires attestationPda on every record");
      const connection = new Connection(rpc, "confirmed");
      const idl = JSON.parse(readFileSync("target/idl/surety_core.json", "utf8")) as Idl;
      const coder = new BorshAccountsCoder(idl);
      const accounts = await connection.getMultipleAccountsInfo(chain.map((record) => new PublicKey(record.attestationPda!)), "confirmed");
      for (const [index, record] of chain.entries()) {
        const account = accounts[index];
        if (!account) throw new Error(`attestation ${record.seq} is absent on-chain`);
        const decoded = coder.decode("SolvencyAttestation", account.data) as Record<string, unknown>;
        const field = (camel: string, snake: string) => decoded[camel] ?? decoded[snake];
        const hex = (value: unknown) => Buffer.from(value as number[]).toString("hex");
        const number = (value: unknown) => String(value);
        if (
          number(field("seq", "seq")) !== String(record.seq) ||
          hex(field("prevHash", "prev_hash")) !== record.prevHash ||
          hex(field("recordHash", "record_hash")) !== record.hash ||
          hex(field("oddsPacketHash", "odds_packet_hash")) !== record.oddsPacketHash ||
          hex(field("bookSnapshotHash", "book_snapshot_hash")) !== record.bookSnapshotHash ||
          number(field("reserves", "reserves")) !== record.reserves ||
          number(field("lockedCollateral", "locked_collateral")) !== record.lockedCollateral ||
          number(field("markedLiabilities", "marked_liabilities")) !== record.markedLiabilities ||
          number(field("solvencyRatioBps", "solvency_ratio_bps")) !== record.solvencyRatioBps ||
          number(field("observedAtMs", "observed_at_ms")) !== record.timestampMs
        ) throw new Error(`attestation ${record.seq} differs from its on-chain account`);
        console.log(`PASS: attestation ${record.seq} ${record.hash} matches on-chain`);
      }
    }
    console.log(`PASS: verify-chain ${verify}${rpc ? " including on-chain accounts" : ""}`);
    return;
  }
  const input = arg("--input"); const output = arg("--output");
  if (!input || !output) throw new Error("usage: marker --input updates.json --output attestations.jsonl");
  const data = JSON.parse(await readFile(input, "utf8")) as MarkerInput;
  const chain = buildChain(data);
  await writeFile(output, chain.map((a) => JSON.stringify(a)).join("\n") + "\n");
  console.log(`PASS: wrote ${chain.length} hash-chained attestations to ${output}`);
}
main().catch((e) => { console.error(`FAIL: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
