import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rename, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { PacketBus, type FeedChannel } from "./packet-bus.js";
import { SseFrameDecoder } from "./sse.js";

export type RecordOptions = {
  apiOrigin: string;
  apiToken: string;
  jwt: string;
  channel: FeedChannel;
  output: string;
  durationMs: number;
  bus: PacketBus;
};

export type RecordingResult = {
  channel: FeedChannel;
  path: string;
  bytes: number;
  frames: number;
  sha256: string;
};

export async function recordStream(options: RecordOptions): Promise<RecordingResult> {
  await mkdir(dirname(options.output), { recursive: true });
  const partial = `${options.output}.partial`;
  const writer = createWriteStream(partial, { flags: "wx", mode: 0o600 });
  const hash = createHash("sha256");
  const decoder = new SseFrameDecoder();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.durationMs);
  let bytes = 0;
  let frames = 0;

  try {
    const response = await fetch(`${options.apiOrigin}/api/${options.channel}/stream`, {
      headers: {
        Authorization: `Bearer ${options.jwt}`,
        "X-Api-Token": options.apiToken,
        Accept: "text/event-stream",
        "Cache-Control": "no-cache",
      },
      signal: controller.signal,
    });
    if (!response.ok || !response.body) {
      throw new Error(`${options.channel} stream failed: HTTP ${response.status}`);
    }

    const reader = response.body.getReader();
    while (true) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      const raw = Buffer.from(chunk);
      if (!writer.write(raw)) await new Promise<void>((resolve) => writer.once("drain", resolve));
      hash.update(raw);
      bytes += raw.length;
      for (const frame of decoder.push(raw)) {
        frames += 1;
        await options.bus.publish({ channel: options.channel, frame });
      }
    }
  } catch (error: unknown) {
    if (!(error instanceof Error) || error.name !== "AbortError") throw error;
  } finally {
    clearTimeout(timer);
    await new Promise<void>((resolve, reject) => {
      writer.end((error?: Error | null) => error ? reject(error) : resolve());
    });
  }

  const remainder = decoder.finish();
  if (remainder.length > 0) {
    throw new Error(`${options.channel} stream ended with ${remainder.length} unframed bytes`);
  }
  if (bytes === 0 || frames === 0) throw new Error(`${options.channel} stream was empty`);
  await rename(partial, options.output);
  const saved = await stat(options.output);
  if (saved.size !== bytes) throw new Error(`${options.channel} byte count changed while saving`);

  return { channel: options.channel, path: options.output, bytes, frames, sha256: hash.digest("hex") };
}

export async function writeManifest(path: string, results: RecordingResult[]): Promise<void> {
  const manifest = {
    format: "surety.txline.raw-sse.v1",
    source: "TxLINE authenticated SSE response bytes",
    files: results,
  };
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
}
