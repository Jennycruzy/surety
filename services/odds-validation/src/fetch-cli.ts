import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { AnchorProvider, setProvider } from "@anchor-lang/core";
import { createGuestJwt, loadApiToken } from "../../feed-ingest/src/auth.js";
import type { TxlineWinnerPacket } from "../../quote-engine/src/engine.js";
import {
  assertProofMatchesPacket,
  type RawOddsValidation,
  validateOddsOnDevnet,
} from "@surety/txline-verify";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

async function main() {
  const apiOrigin = process.env.TXLINE_API_ORIGIN ?? "https://txline-dev.txodds.com";
  const packetPath = argument("--packets") ?? "data/recordings/phase0-18237038-odds-snapshot.raw.json";
  const packets = JSON.parse(await readFile(packetPath, "utf8")) as TxlineWinnerPacket[];
  const requestedMessage = argument("--message-id");
  const packet = requestedMessage
    ? packets.find((candidate) => candidate.MessageId === requestedMessage)
    : packets.find(
        (candidate) =>
          candidate.SuperOddsType === "1X2_PARTICIPANT_RESULT" && candidate.MarketPeriod === null,
      );
  if (!packet) throw new Error("requested odds packet was not found in the authentic capture");

  const jwt = await createGuestJwt(apiOrigin);
  const apiToken = await loadApiToken();
  const url = new URL(`${apiOrigin}/api/odds/validation`);
  url.searchParams.set("messageId", packet.MessageId);
  url.searchParams.set("ts", String(packet.Ts));
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${jwt}`, "X-Api-Token": apiToken },
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!response.ok) throw new Error(`TxLINE odds validation HTTP ${response.status}: ${bytes.toString("utf8").slice(0, 300)}`);
  const proof = JSON.parse(bytes.toString("utf8")) as RawOddsValidation;
  assertProofMatchesPacket(proof, packet);

  const provider = AnchorProvider.env();
  setProvider(provider);
  const valid = await validateOddsOnDevnet(provider, proof);
  if (!valid) throw new Error("TxLINE validate_odds returned false");

  const output = argument("--output") ?? `data/recordings/txline-${packet.FixtureId}-odds-proof.raw.json`;
  try {
    const existing = await readFile(output);
    if (!existing.equals(bytes)) throw new Error(`${output} exists with different bytes`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await writeFile(output, bytes, { flag: "wx", mode: 0o600 });
  }
  console.log(
    `PASS: authentic TxLINE odds proof validated on devnet and preserved at ${output} ` +
      `(sha256 ${createHash("sha256").update(bytes).digest("hex")})`,
  );
}

main().catch((error) => {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
