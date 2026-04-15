import { describe, expect, it } from "vitest";
import { KafkaEventBusAdapter } from "./kafka.js";

describe("KafkaEventBusAdapter", () => {
  it("uses producer/consumer with topic prefixes", async () => {
    const sent: Array<{ topic: string; payload: string }> = [];
    let handler: ((payload: string) => void) | undefined;

    const adapter = new KafkaEventBusAdapter(
      {
        send: async (topic, payload) => {
          sent.push({ topic, payload });
        }
      },
      {
        subscribe: async (_topic, next) => {
          handler = next;
        }
      },
      "eep."
    );

    const received: string[] = [];
    await adapter.subscribe("subscription.created", (event) => {
      received.push(event.type);
    });

    await adapter.publish({
      id: "evt_1",
      type: "subscription.created",
      source: "did:web:example",
      time: new Date().toISOString(),
      data: {}
    });
    handler?.(JSON.stringify({ type: "subscription.created" }));
    handler?.("bad-json");

    expect(sent[0]?.topic).toBe("eep.subscription.created");
    expect(received).toEqual(["subscription.created"]);
  });
});
