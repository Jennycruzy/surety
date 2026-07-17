import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PacketBus, SseFrameDecoder, replay } from "@surety/txline-verify";

const fixture = Buffer.from(
  ": heartbeat\r\n\r\n" +
  "event: score\r\nid: 10\r\ndata: {\"Seq\":10}\r\n\r\n" +
  "id: 11\ndata: first\ndata: second\n\n",
);

test("incremental parser preserves exact SSE frame bytes", () => {
  const decoder = new SseFrameDecoder();
  const frames = [
    ...decoder.push(fixture.subarray(0, 7)),
    ...decoder.push(fixture.subarray(7, 31)),
    ...decoder.push(fixture.subarray(31)),
  ];
  assert.equal(decoder.finish().length, 0);
  assert.equal(frames.length, 2);
  assert.equal(frames[0]?.id, "10");
  assert.equal(frames[0]?.data, "{\"Seq\":10}");
  assert.equal(frames[1]?.data, "first\nsecond");
  assert.deepEqual(Buffer.concat(frames.map((frame) => frame.raw)), fixture.subarray(15));
});

test("replay copies source bytes without mutation and uses shared packet bus", async () => {
  const directory = await mkdtemp(join(tmpdir(), "surety-phase1-"));
  const source = join(directory, "source.sse");
  const output = join(directory, "output.sse");
  await writeFile(source, fixture.subarray(15));
  const bus = new PacketBus();
  const received: string[] = [];
  bus.subscribe(({ frame }) => { received.push(frame.data); });
  const result = await replay({ log: source, rawOutput: output, channel: "scores", bus });
  const replayed = await readFile(output);
  assert.deepEqual(replayed, fixture.subarray(15));
  assert.deepEqual(received, ["{\"Seq\":10}", "first\nsecond"]);
  assert.equal(result.sha256, createHash("sha256").update(replayed).digest("hex"));
});
