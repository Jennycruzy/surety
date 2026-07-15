import { readFile, writeFile } from "node:fs/promises";
import { buildChain, verifyChainFile, type OddsUpdate, type Policy } from "./marker.js";

const arg = (n: string) => { const i = process.argv.indexOf(n); return i < 0 ? undefined : process.argv[i + 1]; };
async function main() {
  const verify = arg("--verify-chain");
  if (verify) { if (!(await verifyChainFile(verify))) throw new Error("attestation hash chain verification failed"); console.log(`PASS: verify-chain ${verify}`); return; }
  const input = arg("--input"); const output = arg("--output");
  if (!input || !output) throw new Error("usage: marker --input updates.json --output attestations.jsonl");
  const data = JSON.parse(await readFile(input, "utf8")) as { policies: Policy[]; updates: OddsUpdate[]; reserves: number };
  const chain = buildChain(data.policies, data.updates, data.reserves);
  await writeFile(output, chain.map((a) => JSON.stringify(a)).join("\n") + "\n");
  console.log(`PASS: wrote ${chain.length} hash-chained attestations to ${output}`);
}
main().catch((e) => { console.error(`FAIL: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
