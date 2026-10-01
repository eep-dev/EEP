import { describe, expect, it } from "vitest";
import {
    InMemoryEventStore,
    RetentionWindowExceededError,
    clampLimit,
    DEFAULT_HISTORY_LIMIT,
    MAX_HISTORY_LIMIT,
} from "./event-store.js";
import type { CloudEvent } from "./request-handler.js";

function event(id: string, source = "did:web:acme.example"): CloudEvent {
    return {
        id,
        type: "com.example.entity.updated",
        source,
        time: "2026-01-01T00:00:00.000Z",
        data: {},
    };
}

async function seeded(ids: string[], source?: string) {
    const store = new InMemoryEventStore();
    for (const id of ids) await store.append(event(id, source));
    return store;
}

describe("clampLimit", () => {
    it("defaults for absent or nonsensical values", () => {
        expect(clampLimit(undefined)).toBe(DEFAULT_HISTORY_LIMIT);
        expect(clampLimit(Number.NaN)).toBe(DEFAULT_HISTORY_LIMIT);
        expect(clampLimit(0)).toBe(DEFAULT_HISTORY_LIMIT);
        expect(clampLimit(-5)).toBe(DEFAULT_HISTORY_LIMIT);
    });

    it("caps at the maximum", () => {
        expect(clampLimit(999_999)).toBe(MAX_HISTORY_LIMIT);
    });

    it("honours a sensible value", () => {
        expect(clampLimit(25)).toBe(25);
    });
});

describe("InMemoryEventStore history (§5.1.2)", () => {
    it("returns events in emission order", async () => {
        const store = await seeded(["e1", "e2", "e3"]);
        const page = await store.history({});
        expect(page.events.map((e) => e.id)).toEqual(["e1", "e2", "e3"]);
    });

    it("returns events strictly after `since`", async () => {
        const store = await seeded(["e1", "e2", "e3"]);
        const page = await store.history({ since: "e1" });
        // Strictly after: the cursor event itself is not repeated.
        expect(page.events.map((e) => e.id)).toEqual(["e2", "e3"]);
    });

    it("omits next_cursor when the subscriber is caught up", async () => {
        const store = await seeded(["e1", "e2"]);
        const page = await store.history({});
        // Absence of the cursor is how a subscriber knows it is up to date.
        expect(page.next_cursor).toBeUndefined();
    });

    it("emits next_cursor when more events remain, and pages to the end", async () => {
        const store = await seeded(["e1", "e2", "e3", "e4"]);
        const first = await store.history({ limit: 2 });
        expect(first.events.map((e) => e.id)).toEqual(["e1", "e2"]);
        expect(first.next_cursor).toBe("e2");

        const second = await store.history({ since: first.next_cursor, limit: 2 });
        expect(second.events.map((e) => e.id)).toEqual(["e3", "e4"]);
        expect(second.next_cursor).toBeUndefined();
    });

    it("filters by source", async () => {
        const store = new InMemoryEventStore();
        await store.append(event("a1", "did:web:a.example"));
        await store.append(event("b1", "did:web:b.example"));
        await store.append(event("a2", "did:web:a.example"));
        const page = await store.history({ source: "did:web:a.example" });
        expect(page.events.map((e) => e.id)).toEqual(["a1", "a2"]);
    });

    it("honours `until` as an inclusive upper bound", async () => {
        const store = await seeded(["e1", "e2", "e3"]);
        const page = await store.history({ until: "e2" });
        expect(page.events.map((e) => e.id)).toEqual(["e1", "e2"]);
    });

    // An empty page is indistinguishable from "you are up to date", which
    // would let a subscriber believe it caught up while silently losing
    // events. §5.1.2 requires 410 instead.
    it("throws rather than returning an empty page for an unsatisfiable cursor", async () => {
        const store = await seeded(["e1", "e2"]);
        await expect(store.history({ since: "evicted-long-ago" })).rejects.toBeInstanceOf(
            RetentionWindowExceededError
        );
    });

    it("names the oldest retained event so the subscriber can reconcile", async () => {
        const store = await seeded(["e1", "e2"]);
        await store.history({ since: "gone" }).catch((err: RetentionWindowExceededError) => {
            expect(err.oldestRetainedId).toBe("e1");
        });
        expect.assertions(1);
    });

    it("reports a null oldest id when nothing is retained", async () => {
        const store = new InMemoryEventStore();
        await store.history({ since: "gone" }).catch((err: RetentionWindowExceededError) => {
            expect(err.oldestRetainedId).toBeNull();
        });
        expect.assertions(1);
    });

    it("prunes events past the retention window", async () => {
        const store = new InMemoryEventStore(0);
        await store.append(event("e1"));
        // The cutoff is `now - retention`, so with zero retention the event is
        // only strictly older than the cutoff once the clock has moved.
        await new Promise((resolve) => setTimeout(resolve, 5));
        const page = await store.history({});
        expect(page.events).toEqual([]);
    });
});

describe("InMemoryEventStore getByIds", () => {
    it("returns only the requested events", async () => {
        const store = await seeded(["e1", "e2", "e3"]);
        const found = await store.getByIds(["e1", "e3"]);
        expect(found.map((e) => e.id)).toEqual(["e1", "e3"]);
    });

    it("silently omits ids it does not hold, so callers can report them", async () => {
        const store = await seeded(["e1"]);
        const found = await store.getByIds(["e1", "missing"]);
        expect(found.map((e) => e.id)).toEqual(["e1"]);
    });
});

describe("InMemoryEventStore delivery log (delivery_guarantees.md §4)", () => {
    const entry = (overrides: Partial<Parameters<InMemoryEventStore["recordDelivery"]>[0]> = {}) => ({
        subscription_id: "sub_1",
        event_id: "e1",
        attempt: 1,
        timestamp: new Date().toISOString(),
        status_code: 200,
        response_time_ms: 12,
        final_status: "delivered" as const,
        ...overrides,
    });

    it("records and returns attempts for a subscription", async () => {
        const store = new InMemoryEventStore();
        await store.recordDelivery(entry());
        const log = await store.deliveryLog("sub_1");
        expect(log).toHaveLength(1);
        expect(log[0]).toMatchObject({ event_id: "e1", final_status: "delivered" });
    });

    it("scopes the log to the requested subscription", async () => {
        const store = new InMemoryEventStore();
        await store.recordDelivery(entry({ subscription_id: "sub_1" }));
        await store.recordDelivery(entry({ subscription_id: "sub_2" }));
        expect(await store.deliveryLog("sub_1")).toHaveLength(1);
    });

    it("returns the most recent attempts when limited", async () => {
        const store = new InMemoryEventStore();
        for (let i = 1; i <= 5; i++) {
            await store.recordDelivery(entry({ event_id: `e${i}` }));
        }
        const log = await store.deliveryLog("sub_1", 2);
        expect(log.map((e) => e.event_id)).toEqual(["e4", "e5"]);
    });

    it("prunes attempts past the retention window", async () => {
        const store = new InMemoryEventStore(undefined, 0);
        await store.recordDelivery(entry({ timestamp: new Date(Date.now() - 1000).toISOString() }));
        expect(await store.deliveryLog("sub_1")).toEqual([]);
    });
});
