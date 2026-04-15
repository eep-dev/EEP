import { describe, expect, it } from "vitest";
import { InMemoryEventBusAdapter } from "./in-memory.js";

describe("InMemoryEventBusAdapter", () => {
  it("publishes and fan-outs by pattern", async () => {
    const bus = new InMemoryEventBusAdapter();
    const received: string[] = [];

    await bus.subscribe("subscription.*", (event) => {
      received.push(event.type);
    });
    await bus.subscribe("exact.event", (event) => {
      received.push(`exact:${event.type}`);
    });
    await bus.subscribe("*", (event) => {
      received.push(`all:${event.type}`);
    });

    await bus.publish({
      id: "1",
      type: "subscription.created",
      source: "did:web:example",
      time: new Date().toISOString(),
      data: {}
    });
    await bus.publish({
      id: "2",
      type: "unmatched.event",
      source: "did:web:example",
      time: new Date().toISOString(),
      data: {}
    });
    await bus.publish({
      id: "3",
      type: "exact.event",
      source: "did:web:example",
      time: new Date().toISOString(),
      data: {}
    });

    expect(received).toContain("subscription.created");
    expect(received).toContain("all:subscription.created");
    expect(received).toContain("exact:exact.event");
    expect(bus.getPublishedEvents().length).toBe(3);
  });
});
