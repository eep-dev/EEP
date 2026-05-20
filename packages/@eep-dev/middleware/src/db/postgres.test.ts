import { describe, expect, it } from "vitest";
import { PostgresDBAdapter } from "./postgres.js";
import type { SubscriptionRecord } from "../core/request-handler.js";

function record(overrides: Partial<SubscriptionRecord> = {}): SubscriptionRecord {
  return {
    subscription_id: "sub_1",
    source_did: "did:web:agent.example",
    delivery_method: "sse",
    callback_url: "https://hook.example",
    event_types: ["entity.updated"],
    status: "active",
    failure_count: 0,
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides
  };
}

function row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    subscription_id: "sub_1",
    source_did: "did:web:agent.example",
    delivery_method: "sse",
    callback_url: "https://hook.example",
    event_types: JSON.stringify(["entity.updated"]),
    status: "active",
    failure_count: 0,
    delivery_secret: null,
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides
  };
}

describe("PostgresDBAdapter", () => {
  it("maps insert/select/list queries to db client", async () => {
    const calls: Array<{ query: string; params?: unknown[] }> = [];
    const adapter = new PostgresDBAdapter({
      execute: async (query, params) => {
        calls.push({ query, params });
        if (query.includes("WHERE") || query.includes("FROM eep_subscriptions")) {
          return { rows: [row()] };
        }
        return;
      }
    });

    await adapter.saveSubscription(record());
    await adapter.saveSubscription(record({ subscription_id: "sub_1b", delivery_method: "webhook" }));
    const one = await adapter.getSubscription("sub_1");
    const many = await adapter.listSubscriptions();

    expect(calls.length).toBe(4);
    // Insert carries all eleven columns, event_types serialized as JSON.
    expect(calls[0]?.params?.length).toBe(11);
    expect(calls[0]?.params?.[4]).toBe(JSON.stringify(["entity.updated"]));
    expect(one?.subscription_id).toBe("sub_1");
    expect(one?.callback_url).toBe("https://hook.example");
    expect(one?.event_types).toEqual(["entity.updated"]);
    expect(one?.status).toBe("active");
    expect(many[0]?.failure_count).toBe(0);
  });

  it("returns null and empty lists when rows are missing", async () => {
    const adapter = new PostgresDBAdapter({
      execute: async (query) => {
        if (query.includes("WHERE")) {
          return undefined;
        }
        return {};
      }
    });
    expect(await adapter.getSubscription("sub_missing")).toBeNull();
    expect(await adapter.listSubscriptions()).toEqual([]);
  });

  it("maps nullable callback_url and tolerates legacy rows", async () => {
    const adapter = new PostgresDBAdapter({
      execute: async () => ({
        // A row written before this column set existed.
        rows: [{ subscription_id: "sub_2", source_did: "did:web:a", delivery_method: "webhook", callback_url: null, created_at: "2026-01-01T00:00:00.000Z" }]
      })
    });
    const got = await adapter.getSubscription("sub_2");
    expect(got?.callback_url).toBeUndefined();
    expect(got?.event_types).toEqual([]);
    expect(got?.status).toBe("active");
    expect(got?.failure_count).toBe(0);
    expect(got?.metadata).toBeUndefined();
    expect(got?.tier).toBeUndefined();
  });

  it("round-trips metadata and tier", async () => {
    const calls: Array<{ query: string; params?: unknown[] }> = [];
    const adapter = new PostgresDBAdapter({
      execute: async (query, params) => {
        calls.push({ query, params });
        if (query.includes("WHERE")) {
          return { rows: [row({ metadata: JSON.stringify({ agent_id: "agent-42" }), tier: "pro" })] };
        }
        return;
      }
    });

    await adapter.saveSubscription(record({ metadata: { agent_id: "agent-42" }, tier: "pro" }));
    // metadata is param 9 (index 8), tier is param 10 (index 9).
    expect(calls[0]?.params?.[8]).toBe(JSON.stringify({ agent_id: "agent-42" }));
    expect(calls[0]?.params?.[9]).toBe("pro");

    const got = await adapter.getSubscription("sub_1");
    expect(got?.metadata).toEqual({ agent_id: "agent-42" });
    expect(got?.tier).toBe("pro");
  });

  it("reads metadata when the driver returns an already-parsed object", async () => {
    // jsonb columns (and JSON-auto-parsing drivers) hand back an object, not a string.
    const adapter = new PostgresDBAdapter({
      execute: async () => ({ rows: [row({ metadata: { agent_id: "agent-42" } })] })
    });
    const got = await adapter.getSubscription("sub_1");
    expect(got?.metadata).toEqual({ agent_id: "agent-42" });
  });

  it("initSchema creates the table and adds later columns idempotently", async () => {
    const queries: string[] = [];
    const adapter = new PostgresDBAdapter({
      execute: async (query) => {
        queries.push(query);
      }
    });

    await adapter.initSchema();
    expect(queries[0]).toContain("CREATE TABLE IF NOT EXISTS eep_subscriptions");
    for (const column of ["event_types", "status", "failure_count", "delivery_secret", "metadata", "tier"]) {
      expect(queries.some((q) => q.includes(`ADD COLUMN IF NOT EXISTS ${column}`))).toBe(true);
    }
  });

  it("builds a partial UPDATE only for the supplied fields", async () => {
    const calls: Array<{ query: string; params?: unknown[] }> = [];
    const adapter = new PostgresDBAdapter({
      execute: async (query, params) => {
        calls.push({ query, params });
      }
    });

    await adapter.updateSubscription("sub_1", { failure_count: 2 });
    expect(calls[0]?.query).toContain("SET failure_count = $1");
    expect(calls[0]?.query).toContain("WHERE subscription_id = $2");
    expect(calls[0]?.params).toEqual([2, "sub_1"]);

    await adapter.updateSubscription("sub_1", { status: "paused", failure_count: 5 });
    expect(calls[1]?.query).toContain("status = $1");
    expect(calls[1]?.query).toContain("failure_count = $2");
    expect(calls[1]?.params).toEqual(["paused", 5, "sub_1"]);
  });

  it("skips the query entirely when there is nothing to update", async () => {
    let executed = false;
    const adapter = new PostgresDBAdapter({
      execute: async () => {
        executed = true;
      }
    });
    await adapter.updateSubscription("sub_1", {});
    expect(executed).toBe(false);
  });

  it("issues a DELETE for the given id and reports rowCount > 0", async () => {
    const calls: Array<{ query: string; params?: unknown[] }> = [];
    const adapter = new PostgresDBAdapter({
      execute: async (query, params) => {
        calls.push({ query, params });
        return { rowCount: 1 };
      }
    });
    const ok = await adapter.deleteSubscription("sub_1");
    expect(ok).toBe(true);
    expect(calls[0]?.query).toContain("DELETE FROM eep_subscriptions");
    expect(calls[0]?.query).toContain("WHERE subscription_id = $1");
    expect(calls[0]?.params).toEqual(["sub_1"]);
  });

  it("reports false when DELETE affects no rows", async () => {
    const adapter = new PostgresDBAdapter({
      execute: async () => ({ rowCount: 0 })
    });
    expect(await adapter.deleteSubscription("sub_missing")).toBe(false);
  });

  it("falls back to true when the driver omits rowCount", async () => {
    // Some drivers/stubs return void; DELETE semantics tolerate no-op deletes.
    const adapter = new PostgresDBAdapter({
      execute: async () => {
        return;
      }
    });
    expect(await adapter.deleteSubscription("sub_1")).toBe(true);
  });
});
