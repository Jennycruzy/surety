export type SseFrame = {
  raw: Buffer;
  data: string;
  id?: string;
  event?: string;
  retry?: number;
};

export type FrameSink = (frame: SseFrame) => void | Promise<void>;

function decodeFrame(raw: Buffer): SseFrame | null {
  const text = raw.toString("utf8");
  const body = text.replace(/(?:\r?\n){2}$/, "");
  let data = "";
  let id: string | undefined;
  let event: string | undefined;
  let retry: number | undefined;

  for (const line of body.split(/\r?\n/)) {
    if (line === "" || line.startsWith(":")) continue;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
    if (field === "data") data += `${value}\n`;
    if (field === "id") id = value;
    if (field === "event") event = value;
    if (field === "retry") retry = Number(value);
  }

  data = data.replace(/\n$/, "");
  if (!data && id === undefined && event === undefined && retry === undefined) return null;

  return {
    raw,
    data,
    ...(id === undefined ? {} : { id }),
    ...(event === undefined ? {} : { event }),
    ...(retry === undefined ? {} : { retry }),
  };
}

export class SseFrameDecoder {
  private pending = Buffer.alloc(0);

  push(chunk: Uint8Array): SseFrame[] {
    this.pending = Buffer.concat([this.pending, Buffer.from(chunk)]);
    const frames: SseFrame[] = [];

    while (true) {
      const lf = this.pending.indexOf(Buffer.from("\n\n"));
      const crlf = this.pending.indexOf(Buffer.from("\r\n\r\n"));
      let index = -1;
      let delimiterLength = 0;

      if (lf >= 0 && (crlf < 0 || lf < crlf)) {
        index = lf;
        delimiterLength = 2;
      } else if (crlf >= 0) {
        index = crlf;
        delimiterLength = 4;
      }

      if (index < 0) break;
      const end = index + delimiterLength;
      const raw = this.pending.subarray(0, end);
      this.pending = this.pending.subarray(end);
      const frame = decodeFrame(raw);
      if (frame) frames.push(frame);
    }

    return frames;
  }

  finish(): Buffer {
    const remainder = this.pending;
    this.pending = Buffer.alloc(0);
    return remainder;
  }
}
