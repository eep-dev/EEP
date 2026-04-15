import { describe, expect, it } from "vitest";
import { InMemoryDBAdapter } from "./in-memory.js";

describe("InMemoryDBAdapter", () => {
  it("saves, gets and lists subscriptions", async () => {
    const db = new InMemoryDBAdapter();
    await db.saveSubscription({
      subscription_id: "sub_1",
      source_did: "did:web:agent.example",
      delivery_method: "webhook",
      created_at: new Date().toISOString()
    });
    expect(await db.getSubscription("sub_1")).not.toBeNull();
    expect((await db.listSubscriptions()).length).toBe(1);
    expect(await db.getSubscription("missing")).toBeNull();
  });
});
