import { readFile } from "node:fs/promises";
import { AnchorProvider, setProvider } from "@anchor-lang/core";
import { type RawStatValidationV2, validateStatV2OnDevnet } from "@surety/txline-verify";

const proofPath = process.argv[2] ?? "data/recordings/txline-18218149-seq522-ht-stat-2001-proof-v2.raw.json";
const proof = JSON.parse(await readFile(proofPath, "utf8")) as RawStatValidationV2;
const provider = AnchorProvider.env();
setProvider(provider);
if (!(await validateStatV2OnDevnet(provider, proof))) throw new Error("TxLINE rejected the authentic halftime proof");
console.log(`PASS: TxLINE validate_stat_v2 accepted halftime key ${proof.statsToProve[0]!.key} for fixture ${proof.summary.fixtureId} at period ${proof.statsToProve[0]!.period}`);
