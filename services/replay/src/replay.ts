import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { PacketBus, type FeedChannel } from "../../shared/src/packet-bus.js";
import { SseFrameDecoder } from "../../shared/src/sse.js";

export type ReplayOptions = {
  log: string;
  channel: FeedChannel;
  bus: PacketBus;
  rawOutput?: string;
};

export async function replay(options: ReplayOptions) {
  const decoder = new SseFrameDecoder();
  const hash = createHash("sha256");
  const writer = options.rawOutput ? createWriteStream(options.rawOutput, { flags: "w" }) : undefined;
  let bytes = 0;
  let frames = 0;

  for await (const chunk of createReadStream(options.log)) {
    const raw = Buffer.from(chunk);
    hash.update(raw);
    bytes += raw.length;
    if (writer && !writer.write(raw)) await new Promise<void>((resolve) => writer.once("drain", resolve));
    for (const frame of decoder.push(raw)) {
      frames += 1;
      await options.bus.publish({ channel: options.channel, frame });
    }
  }
  if (writer) await new Promise<void>((resolve, reject) => writer.end((e?: Error | null) => e ? reject(e) : resolve()));
  const remainder = decoder.finish();
  if (remainder.length > 0) throw new Error(`Replay ended with ${remainder.length} unframed bytes`);
  if (frames === 0) throw new Error("Replay contained no SSE packets");
  return { bytes, frames, sha256: hash.digest("hex") };
}
