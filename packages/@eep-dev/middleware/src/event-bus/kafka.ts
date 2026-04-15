import type { CloudEvent, EventBusAdapter } from "../core/request-handler.js";

export type KafkaProducerLike = {
  send: (topic: string, payload: string) => Promise<void>;
};

export type KafkaConsumerLike = {
  subscribe: (topic: string, handler: (payload: string) => void) => Promise<void>;
};

export class KafkaEventBusAdapter implements EventBusAdapter {
  constructor(
    private readonly producer: KafkaProducerLike,
    private readonly consumer: KafkaConsumerLike,
    private readonly topicPrefix = "eep."
  ) {}

  async publish(event: CloudEvent): Promise<void> {
    await this.producer.send(`${this.topicPrefix}${event.type}`, JSON.stringify(event));
  }

  async subscribe(pattern: string, handler: (event: CloudEvent) => void): Promise<void> {
    await this.consumer.subscribe(`${this.topicPrefix}${pattern}`, (payload) => {
      try {
        handler(JSON.parse(payload) as CloudEvent);
      } catch {
        return;
      }
    });
  }
}
