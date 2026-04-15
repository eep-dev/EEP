import { describe, expect, it } from "vitest";
import { RedisEventBusAdapter } from "./redis.js";

describe("RedisEventBusAdapter", () => {
  it("publishes and subscribes through client", async () => {
    let subscribedHandler: ((message: string) => void) | undefined;
    const published: Array<{ channel: string; message: string }> = [];

    const adapter = new RedisEventBusAdapter(
      {
        publish: async (channel, message) => {
          published.push({ channel, message });
          return 1;
        },
        subscribe: async (_channel, callback) => {
          subscribedHandler = callback;
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

    subscribedHandler?.(JSON.stringify({ type: "subscription.created" }));
    subscribedHandler?.("not-json");

    expect(published[0]?.channel).toBe("eep.subscription.created");
    expect(received).toEqual(["subscription.created"]);
  });
});
