import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createGuestJwt, loadApiToken } from "../../feed-ingest/src/auth.js";
import type { TxlineWinnerPacket } from "../../quote-engine/src/engine.js";
import {
  assertAuthenticFixtureProofShape,
  assertProofMatchesPacket,
  pureFixtureId,
  type RawFixtureValidation,
  type RawOddsValidation,
} from "@surety/txline-verify";

export type TxlineSession = { apiOrigin: string; apiToken: string; jwt: string };

export async function createTxlineSession(): Promise<TxlineSession> {
  const apiOrigin = process.env.TXLINE_API_ORIGIN ?? "https://txline-dev.txodds.com";
  return { apiOrigin, apiToken: await loadApiToken(), jwt: await createGuestJwt(apiOrigin) };
}

async function authenticatedJson<T>(session: TxlineSession, pathname: string): Promise<{ value: T; bytes: Buffer }> {
  const response = await fetch(`${session.apiOrigin}/api${pathname}`, {
    headers: { Authorization: `Bearer ${session.jwt}`, "X-Api-Token": session.apiToken },
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!response.ok) throw new Error(`TxLINE ${pathname} HTTP ${response.status}: ${bytes.toString("utf8").slice(0, 300)}`);
  return { value: JSON.parse(bytes.toString("utf8")) as T, bytes };
}

export type TxlineFixtureSnapshot = RawFixtureValidation["snapshot"];

export async function fetchFixtureSnapshot(session: TxlineSession, fixtureId: bigint): Promise<TxlineFixtureSnapshot> {
  const { value } = await authenticatedJson<TxlineFixtureSnapshot[]>(session, "/fixtures/snapshot");
  const fixture = value.find((row) => pureFixtureId(row.FixtureId) === fixtureId);
  if (!fixture) throw new Error(`fixture ${fixtureId} is absent from the authenticated TxLINE snapshot`);
  return fixture;
}

export async function fetchFixtureProof(
  session: TxlineSession,
  fixture: TxlineFixtureSnapshot,
): Promise<{ proof: RawFixtureValidation; bytes: Buffer }> {
  const query = new URLSearchParams({ fixtureId: String(fixture.FixtureId), timestamp: String(fixture.Ts) });
  const response = await authenticatedJson<RawFixtureValidation>(session, `/fixtures/validation?${query}`);
  assertAuthenticFixtureProofShape(response.value);
  assert.equal(pureFixtureId(response.value.snapshot.FixtureId), pureFixtureId(fixture.FixtureId));
  return { proof: response.value, bytes: response.bytes };
}

export async function fetchLatestFullMatchOdds(
  session: TxlineSession,
  fixtureId: bigint,
  asOf = Date.now(),
): Promise<{ packet: TxlineWinnerPacket; snapshotBytes: Buffer }> {
  const response = await authenticatedJson<TxlineWinnerPacket[]>(
    session,
    `/odds/snapshot/${fixtureId}?asOf=${asOf}`,
  );
  const packet = response.value.find(
    (row) =>
      BigInt(row.FixtureId) === fixtureId &&
      row.Bookmaker === "TXLineStablePriceDemargined" &&
      row.SuperOddsType === "1X2_PARTICIPANT_RESULT" &&
      row.MarketParameters === null &&
      row.MarketPeriod === null,
  );
  if (!packet) throw new Error(`fixture ${fixtureId} has no canonical full-match TxLINE 1X2 packet`);
  return { packet, snapshotBytes: response.bytes };
}

export async function fetchOddsProof(
  session: TxlineSession,
  packet: TxlineWinnerPacket,
): Promise<{ proof: RawOddsValidation; bytes: Buffer }> {
  const query = new URLSearchParams({ messageId: packet.MessageId, ts: String(packet.Ts) });
  const response = await authenticatedJson<RawOddsValidation>(session, `/odds/validation?${query}`);
  assertProofMatchesPacket(response.value, packet);
  return { proof: response.value, bytes: response.bytes };
}

export async function preserveAuthenticArtifact(filename: string, bytes: Buffer): Promise<string> {
  assert.equal(path.basename(filename), filename, "artifact filename must not contain a directory");
  const directory = path.join(process.cwd(), "data", "recordings");
  await mkdir(directory, { recursive: true });
  const output = path.join(directory, filename);
  try {
    const existing = await readFile(output);
    if (!existing.equals(bytes)) throw new Error(`${output} already exists with different bytes`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await writeFile(output, bytes, { flag: "wx", mode: 0o600 });
  }
  return createHash("sha256").update(bytes).digest("hex");
}
