import { readFile } from "node:fs/promises";
import { loadDeployer } from "../../../app/lib/deployer.js";
import { getProgram, newConnection } from "../../../app/lib/surety-client.js";
import { buildRecordValidatedOddsTx, validatedOddsAddress } from "./record.js";
import { oddsMessageHash, type RawOddsValidation } from "@surety-tx/txline-verify";

const proofPath =
  process.argv[2] ?? "data/recordings/phase0-18237038-message-000791-odds-proof.raw.json";

async function main() {
  const proof = JSON.parse(await readFile(proofPath, "utf8")) as RawOddsValidation;
  const connection = newConnection();
  const payer = loadDeployer();
  const address = validatedOddsAddress(proof);
  const program = getProgram(connection, { publicKey: payer.publicKey });
  const existing = await program.account.validatedOdds.fetchNullable(address);
  if (existing) {
    const storedHash = Buffer.from(existing.messageIdHash as number[]);
    if (!storedHash.equals(oddsMessageHash(proof.odds.MessageId))) {
      throw new Error(`existing receipt ${address.toBase58()} has the wrong message hash`);
    }
    console.log(`PASS: validated odds receipt already exists at ${address.toBase58()}`);
    return;
  }

  const tx = await buildRecordValidatedOddsTx(connection, payer.publicKey, proof);
  const latest = await connection.getLatestBlockhash("confirmed");
  tx.feePayer = payer.publicKey;
  tx.recentBlockhash = latest.blockhash;
  tx.sign(payer);
  const wire = tx.serialize();
  if (wire.length > 1_232) throw new Error(`record transaction is ${wire.length} bytes (maximum 1232)`);
  const signature = await connection.sendRawTransaction(wire, { maxRetries: 5 });
  await connection.confirmTransaction({ signature, ...latest }, "confirmed");
  const recorded = await program.account.validatedOdds.fetch(address);
  if (!Buffer.from(recorded.messageIdHash as number[]).equals(oddsMessageHash(proof.odds.MessageId))) {
    throw new Error("on-chain receipt does not match the submitted odds message");
  }
  console.log(
    `PASS: SURETY recorded TxLINE-validated odds at ${address.toBase58()} in ${signature} (${wire.length} bytes)`,
  );
}

main().catch((error) => {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
