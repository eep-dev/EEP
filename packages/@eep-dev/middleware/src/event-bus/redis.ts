import type { CloudEvent, EventBusAdapter } from "../core/request-handler.js";

export type RedisClientLike = {
  publish: (channel: string, message: string) => Promise<number>;
  subscribe: (channel: string, callback: (message: string) => void) => Promise<void>;
};

export class RedisEventBusAdapter implements EventBusAdapter {
  constructor(private readonly client: RedisClientLike, private readonly prefix = "eep.") {}

  async publish(event: CloudEvent): Promise<void> {
    const channel = `${this.prefix}${event.type}`;
    await this.client.publish(channel, JSON.stringify(event));
  }

  async subscribe(pattern: string, handler: (event: CloudEvent) => void): Promise<void> {
    const channel = `${this.prefix}${pattern}`;
    await this.client.subscribe(channel, (message) => {
      try {
        handler(JSON.parse(message) as CloudEvent);
      } catch {
        return;
      }
    });
  }
}
