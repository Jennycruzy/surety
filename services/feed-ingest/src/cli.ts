import { PacketBus } from "../../shared/src/packet-bus.js";
import { createGuestJwt, loadApiToken } from "./auth.js";
import { recordStream, writeManifest } from "./recorder.js";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

async function main() {
  const apiOrigin = process.env.TXLINE_API_ORIGIN ?? "https://txline-dev.txodds.com";
  const durationSeconds = Number(argument("--duration") ?? "300");
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error("--duration must be a positive number of seconds");
  }
  const stamp = new Date().toISOString().replace(/[-:.]/g, "");
  const prefix = argument("--output") ?? `data/recordings/txline-${stamp}`;
  const apiToken = await loadApiToken();
  const jwt = await createGuestJwt(apiOrigin);
  const bus = new PacketBus();
  const counts = { odds: 0, scores: 0 };
  bus.subscribe(({ channel }) => { counts[channel] += 1; });

  const results = await Promise.all([
    recordStream({
      apiOrigin, apiToken, jwt, channel: "odds", output: `${prefix}-odds.raw.sse`,
      durationMs: durationSeconds * 1_000, bus,
    }),
    recordStream({
      apiOrigin, apiToken, jwt, channel: "scores", output: `${prefix}-scores.raw.sse`,
      durationMs: durationSeconds * 1_000, bus,
    }),
  ]);
  await writeManifest(`${prefix}.manifest.json`, results);

  for (const result of results) {
    console.log(`PASS: recorded ${result.channel} ${result.bytes} bytes / ${result.frames} packets / sha256 ${result.sha256}`);
  }
  console.log(`PASS: live and replay paths share the packet bus (${counts.odds} odds, ${counts.scores} scores).`);
}

main().catch((error) => {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
