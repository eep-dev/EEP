import { describe, expect, it } from "vitest";
import {
    validateFilter,
    eventMatchesFilter,
    readPath,
    FilterValidationError,
    MAX_FILTER_CONDITIONS,
    type EventFilter,
} from "./event-filter.js";
import type { CloudEvent } from "./request-handler.js";

const evt = (overrides: Partial<CloudEvent> = {}): CloudEvent => ({
    id: "evt-1",
    type: "com.example.entity.updated",
    source: "did:web:acme.example",
    time: "2026-01-01T00:00:00.000Z",
    data: { field: "bio", status: "published", score: 42 },
    ...overrides,
});

describe("validateFilter (§5.1.3)", () => {
    const ok: EventFilter = { match: "all", conditions: [{ path: "subject", op: "exists" }] };

    it("accepts a well-formed filter", () => {
        expect(validateFilter(ok)).toEqual(ok);
    });

    it.each([
        ["not an object", "string"],
        ["null", null],
        ["missing match", { conditions: [{ path: "a", op: "exists" }] }],
        ["bad match", { match: "some", conditions: [{ path: "a", op: "exists" }] }],
        ["missing conditions", { match: "all" }],
        ["empty conditions", { match: "all", conditions: [] }],
        ["bad op", { match: "all", conditions: [{ path: "a", op: "regex" }] }],
        ["empty path", { match: "all", conditions: [{ path: "", op: "exists" }] }],
        ["empty path segment", { match: "all", conditions: [{ path: "a..b", op: "exists" }] }],
    ])("rejects %s", (_label, input) => {
        expect(() => validateFilter(input)).toThrow(FilterValidationError);
    });

    it("rejects more conditions than the bound allows", () => {
        const conditions = Array.from({ length: MAX_FILTER_CONDITIONS + 1 }, () => ({
            path: "a",
            op: "exists" as const,
        }));
        expect(() => validateFilter({ match: "all", conditions })).toThrow(FilterValidationError);
    });

    it("rejects a path deeper than the bound allows", () => {
        const path = Array.from({ length: 9 }, (_, i) => `s${i}`).join(".");
        expect(() => validateFilter({ match: "all", conditions: [{ path, op: "exists" }] })).toThrow(
            FilterValidationError
        );
    });

    // A subscriber-supplied path must never reach a prototype lookup.
    it.each(["__proto__", "constructor", "prototype"])("rejects a path traversing %s", (segment) => {
        expect(() =>
            validateFilter({ match: "all", conditions: [{ path: `data.${segment}`, op: "exists" }] })
        ).toThrow(FilterValidationError);
    });

    it("enforces operand types per operator", () => {
        expect(() => validateFilter({ match: "all", conditions: [{ path: "a", op: "in", value: "x" }] })).toThrow();
        expect(() => validateFilter({ match: "all", conditions: [{ path: "a", op: "prefix", value: 1 }] })).toThrow();
        expect(() => validateFilter({ match: "all", conditions: [{ path: "a", op: "gt", value: "1" }] })).toThrow();
    });
});

describe("readPath", () => {
    it("reads envelope and nested data paths", () => {
        expect(readPath(evt({ subject: "listing/1" } as Partial<CloudEvent>), "subject")).toBe("listing/1");
        expect(readPath(evt(), "data.status")).toBe("published");
        expect(readPath(evt(), "type")).toBe("com.example.entity.updated");
    });

    it("returns undefined for an absent path", () => {
        expect(readPath(evt(), "data.nope")).toBeUndefined();
        expect(readPath(evt(), "a.b.c")).toBeUndefined();
    });

    // Even if validation were bypassed, the reader must not walk the prototype.
    it("does not read inherited properties", () => {
        expect(readPath(evt(), "data.toString")).toBeUndefined();
        expect(readPath(evt(), "constructor")).toBeUndefined();
    });
});

describe("eventMatchesFilter (§5.1.3)", () => {
    it("matches everything when no filter is set", () => {
        expect(eventMatchesFilter(evt(), undefined)).toBe(true);
    });

    it.each([
        ["eq hit", { path: "data.status", op: "eq", value: "published" }, true],
        ["eq miss", { path: "data.status", op: "eq", value: "draft" }, false],
        ["ne hit", { path: "data.status", op: "ne", value: "draft" }, true],
        ["in hit", { path: "data.status", op: "in", value: ["published", "archived"] }, true],
        ["in miss", { path: "data.status", op: "in", value: ["draft"] }, false],
        ["nin hit", { path: "data.status", op: "nin", value: ["draft"] }, true],
        ["prefix hit", { path: "type", op: "prefix", value: "com.example." }, true],
        ["prefix miss", { path: "type", op: "prefix", value: "org.other." }, false],
        ["exists hit", { path: "data.field", op: "exists" }, true],
        ["exists miss", { path: "data.absent", op: "exists" }, false],
        ["gt hit", { path: "data.score", op: "gt", value: 10 }, true],
        ["gt miss", { path: "data.score", op: "gt", value: 100 }, false],
        ["lt hit", { path: "data.score", op: "lt", value: 100 }, true],
    ])("%s", (_label, condition, expected) => {
        expect(
            eventMatchesFilter(evt(), { match: "all", conditions: [condition as never] })
        ).toBe(expected);
    });

    it("requires every condition under match=all", () => {
        const filter: EventFilter = {
            match: "all",
            conditions: [
                { path: "data.status", op: "eq", value: "published" },
                { path: "data.score", op: "gt", value: 100 },
            ],
        };
        expect(eventMatchesFilter(evt(), filter)).toBe(false);
    });

    it("requires only one condition under match=any", () => {
        const filter: EventFilter = {
            match: "any",
            conditions: [
                { path: "data.status", op: "eq", value: "published" },
                { path: "data.score", op: "gt", value: 100 },
            ],
        };
        expect(eventMatchesFilter(evt(), filter)).toBe(true);
    });

    // Type-mismatched comparisons must be false, not throw: the filter runs on
    // the publisher's delivery hot path against arbitrary payloads.
    it("returns false rather than throwing on a type mismatch", () => {
        expect(
            eventMatchesFilter(evt(), { match: "all", conditions: [{ path: "data.score", op: "prefix", value: "4" }] })
        ).toBe(false);
        expect(
            eventMatchesFilter(evt(), { match: "all", conditions: [{ path: "data.status", op: "gt", value: 1 }] })
        ).toBe(false);
    });
});
