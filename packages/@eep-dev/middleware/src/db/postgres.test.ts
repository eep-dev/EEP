import { describe, expect, it } from "vitest";
import { PostgresDBAdapter } from "./postgres.js";

describe("PostgresDBAdapter", () => {
  it("maps insert/select/list queries to db client", async () => {
    const calls: Array<{ query: string; params?: unknown[] }> = [];
    const adapter = new PostgresDBAdapter({
      execute: async (query, params) => {
        calls.push({ query, params });
        if (query.includes("WHERE")) {
          return {
            rows: [
              {
                subscription_id: "sub_1",
                source_did: "did:web:agent.example",
                delivery_method: "sse",
                callback_url: "https://hook.example",
                created_at: "2026-01-01T00:00:00.000Z"
              }
            ]
          };
        }
        if (query.includes("FROM eep_subscriptions")) {
          return {
            rows: [
              {
                subscription_id: "sub_1",
                source_did: "did:web:agent.example",
                delivery_method: "sse",
                callback_url: "https://hook.example",
                created_at: "2026-01-01T00:00:00.000Z"
              }
            ]
          };
        }
        return;
      }
    });

    await adapter.saveSubscription({
      subscription_id: "sub_1",
      source_did: "did:web:agent.example",
      delivery_method: "sse",
      callback_url: "https://hook.example",
      created_at: "2026-01-01T00:00:00.000Z"
    });
    await adapter.saveSubscription({
      subscription_id: "sub_1b",
      source_did: "did:web:agent.example",
      delivery_method: "webhook",
      created_at: "2026-01-01T00:00:00.000Z"
    });
    const one = await adapter.getSubscription("sub_1");
    const many = await adapter.listSubscriptions();

    expect(calls.length).toBe(4);
    expect(one?.subscription_id).toBe("sub_1");
    expect(one?.callback_url).toBe("https://hook.example");
    expect(many[0]?.callback_url).toBe("https://hook.example");
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

  it("maps nullable callback_url values", async () => {
    const adapter = new PostgresDBAdapter({
      execute: async (query) => {
        if (query.includes("WHERE")) {
          return {
            rows: [
              {
                subscription_id: "sub_2",
                source_did: "did:web:agent.example",
                delivery_method: "webhook",
                callback_url: null,
                created_at: "2026-01-01T00:00:00.000Z"
              }
            ]
          };
        }
        return {
          rows: [
            {
              subscription_id: "sub_2",
              source_did: "did:web:agent.example",
              delivery_method: "webhook",
              callback_url: null,
              created_at: "2026-01-01T00:00:00.000Z"
            }
          ]
        };
      }
    });
    expect((await adapter.getSubscription("sub_2"))?.callback_url).toBeUndefined();
    expect((await adapter.listSubscriptions())[0]?.callback_url).toBeUndefined();
  });
});
