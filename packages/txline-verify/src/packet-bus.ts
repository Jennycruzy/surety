import type { SseFrame } from "./sse.js";

export type FeedChannel = "odds" | "scores";

export type FeedPacket = {
  channel: FeedChannel;
  frame: SseFrame;
};

export type PacketHandler = (packet: FeedPacket) => void | Promise<void>;

export class PacketBus {
  private readonly handlers = new Set<PacketHandler>();

  subscribe(handler: PacketHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async publish(packet: FeedPacket): Promise<void> {
    for (const handler of this.handlers) await handler(packet);
  }
}
