import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PacketBus, replay, type FeedChannel } from "@surety-tx/txline-verify";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

async function sha256(path: string) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function main() {
  const log = argument("--log");
  if (!log) throw new Error("--log is required");
  const channel: FeedChannel = log.includes("scores") ? "scores" : "odds";
  const verifyIdentical = process.argv.includes("--verify-identical");
  const rawOutput = argument("--raw-output") ?? (verifyIdentical ? `/tmp/surety-replay-${process.pid}.sse` : undefined);
  const bus = new PacketBus();
  let delivered = 0;
  bus.subscribe(() => { delivered += 1; });
  const result = await replay({ log, channel, bus, ...(rawOutput ? { rawOutput } : {}) });

  if (verifyIdentical) {
    const originalHash = await sha256(log);
    const replayHash = await sha256(rawOutput!);
    if (originalHash !== replayHash) throw new Error(`checksum mismatch ${originalHash} != ${replayHash}`);
    console.log(`PASS: recorded bytes equal replayed bytes (${originalHash}).`);
  }
  console.log(`PASS: replay emitted ${result.frames} ${channel} packets through the shared bus (${delivered} delivered).`);
}

main().catch((error) => {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
