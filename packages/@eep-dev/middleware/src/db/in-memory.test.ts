import { describe, expect, it } from "vitest";
import { InMemoryDBAdapter } from "./in-memory.js";
import type { SubscriptionRecord } from "../core/request-handler.js";

function record(overrides: Partial<SubscriptionRecord> = {}): SubscriptionRecord {
  return {
    subscription_id: "sub_1",
    source_did: "did:web:agent.example",
    delivery_method: "webhook",
    callback_url: "https://hook.example/eep",
    event_types: ["entity.updated"],
    status: "active",
    failure_count: 0,
    created_at: new Date().toISOString(),
    ...overrides
  };
}

describe("InMemoryDBAdapter", () => {
  it("saves, gets and lists subscriptions", async () => {
    const db = new InMemoryDBAdapter();
    await db.saveSubscription(record());
    expect(await db.getSubscription("sub_1")).not.toBeNull();
    expect((await db.listSubscriptions()).length).toBe(1);
    expect(await db.getSubscription("missing")).toBeNull();
  });

  it("applies partial updates to an existing subscription", async () => {
    const db = new InMemoryDBAdapter();
    await db.saveSubscription(record());
    await db.updateSubscription("sub_1", { failure_count: 3 });
    expect((await db.getSubscription("sub_1"))?.failure_count).toBe(3);

    await db.updateSubscription("sub_1", { status: "paused" });
    const updated = await db.getSubscription("sub_1");
    expect(updated?.status).toBe("paused");
    // Untouched fields are preserved.
    expect(updated?.failure_count).toBe(3);
    expect(updated?.source_did).toBe("did:web:agent.example");
  });

  it("ignores updates for an unknown subscription", async () => {
    const db = new InMemoryDBAdapter();
    await db.updateSubscription("missing", { status: "paused" });
    expect(await db.getSubscription("missing")).toBeNull();
  });
});
