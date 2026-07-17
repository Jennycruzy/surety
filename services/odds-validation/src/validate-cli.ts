import { readFile } from "node:fs/promises";
import { AnchorProvider, setProvider } from "@anchor-lang/core";
import { type RawOddsValidation, validateOddsOnDevnet } from "@surety/txline-verify";

const proofPath =
  process.argv[2] ?? "data/recordings/phase0-18237038-message-000791-odds-proof.raw.json";

async function main() {
  const proof = JSON.parse(await readFile(proofPath, "utf8")) as RawOddsValidation;
  const provider = AnchorProvider.env();
  setProvider(provider);
  if (!(await validateOddsOnDevnet(provider, proof))) throw new Error("authentic proof returned false");

  let tamperedRejected = false;
  try {
    tamperedRejected = !(await validateOddsOnDevnet(provider, proof, { tamperFirstProofBit: true }));
  } catch {
    tamperedRejected = true;
  }
  if (!tamperedRejected) throw new Error("one-bit-mutated odds proof was unexpectedly accepted");
  console.log(
    `PASS: TxLINE validate_odds accepted fixture ${proof.odds.FixtureId} message ${proof.odds.MessageId}; ` +
      "a one-bit proof mutation was rejected",
  );
}

main().catch((error) => {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
