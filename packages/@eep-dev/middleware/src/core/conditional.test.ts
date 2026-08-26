import { describe, expect, it } from "vitest";
import { computeETag, ifNoneMatchSatisfied, withConditional } from "./conditional.js";

describe("computeETag", () => {
    it("produces a quoted, stable tag", () => {
        const tag = computeETag({ a: 1 });
        expect(tag).toMatch(/^"[A-Za-z0-9_-]{22}"$/);
        expect(computeETag({ a: 1 })).toBe(tag);
    });

    // Without canonicalisation a publisher building its manifest from a map
    // would emit a fresh ETag on every request, so no conditional request
    // would ever hit — worse than not implementing them, because the client
    // pays for the validator round-trip and still receives a body.
    it("is insensitive to property insertion order", () => {
        expect(computeETag({ a: 1, b: 2 })).toBe(computeETag({ b: 2, a: 1 }));
        expect(computeETag({ outer: { x: 1, y: 2 } })).toBe(computeETag({ outer: { y: 2, x: 1 } }));
    });

    it("changes when the representation changes", () => {
        expect(computeETag({ a: 1 })).not.toBe(computeETag({ a: 2 }));
        expect(computeETag({ a: [1, 2] })).not.toBe(computeETag({ a: [2, 1] }));
    });

    it("preserves array order, which is semantic", () => {
        expect(computeETag(["a", "b"])).not.toBe(computeETag(["b", "a"]));
    });
});

describe("ifNoneMatchSatisfied", () => {
    const etag = '"abc123"';

    it("returns false when the header is absent", () => {
        expect(ifNoneMatchSatisfied(undefined, etag)).toBe(false);
        expect(ifNoneMatchSatisfied("", etag)).toBe(false);
    });

    it("matches an identical tag", () => {
        expect(ifNoneMatchSatisfied('"abc123"', etag)).toBe(true);
    });

    it("matches within a comma-separated list", () => {
        expect(ifNoneMatchSatisfied('"other", "abc123", "more"', etag)).toBe(true);
    });

    it("matches `*`", () => {
        expect(ifNoneMatchSatisfied("*", etag)).toBe(true);
    });

    // RFC 9110 §8.8.3.2: If-None-Match uses the WEAK comparison function, so
    // W/"x" and "x" match. A string equality check would be wrong here.
    it("compares weak and strong validators weakly", () => {
        expect(ifNoneMatchSatisfied('W/"abc123"', etag)).toBe(true);
        expect(ifNoneMatchSatisfied('"abc123"', 'W/"abc123"')).toBe(true);
    });

    it("does not match a different tag", () => {
        expect(ifNoneMatchSatisfied('"different"', etag)).toBe(false);
    });
});

describe("withConditional", () => {
    const body = { did: "did:web:example.com", eep_version: "0.1" };
    const options = { cacheControl: "public, max-age=300" };

    it("adds ETag and Cache-Control to a 200", () => {
        const res = withConditional({ status: 200, body }, {}, options);
        expect(res.status).toBe(200);
        expect(res.headers?.ETag).toMatch(/^"/);
        expect(res.headers?.["Cache-Control"]).toBe("public, max-age=300");
        expect(res.body).toEqual(body);
    });

    it("preserves headers the handler already set", () => {
        const res = withConditional(
            { status: 200, headers: { "EEP-Version": "0.1" }, body },
            {},
            options
        );
        expect(res.headers?.["EEP-Version"]).toBe("0.1");
        expect(res.headers?.ETag).toBeDefined();
    });

    it("collapses to a bodyless 304 when the client already has it", () => {
        const first = withConditional({ status: 200, body }, {}, options);
        const etag = first.headers!.ETag!;
        const second = withConditional({ status: 200, body }, { "if-none-match": etag }, options);
        expect(second.status).toBe(304);
        expect(second.body).toBeNull();
        // §3.2.1: a 304 repeats ETag and Cache-Control.
        expect(second.headers?.ETag).toBe(etag);
        expect(second.headers?.["Cache-Control"]).toBe("public, max-age=300");
    });

    it("returns a full body when the client's validator is stale", () => {
        const res = withConditional({ status: 200, body }, { "if-none-match": '"stale"' }, options);
        expect(res.status).toBe(200);
        expect(res.body).toEqual(body);
    });

    it("matches If-None-Match case-insensitively on the header name", () => {
        const first = withConditional({ status: 200, body }, {}, options);
        const res = withConditional(
            { status: 200, body },
            { "If-None-Match": first.headers!.ETag! },
            options
        );
        expect(res.status).toBe(304);
    });

    it("emits Last-Modified when the publisher knows it", () => {
        const res = withConditional({ status: 200, body }, {}, {
            ...options,
            lastModified: "Sat, 22 Feb 2026 14:30:00 GMT",
        });
        expect(res.headers?.["Last-Modified"]).toBe("Sat, 22 Feb 2026 14:30:00 GMT");
    });

    // Collapsing an error to 304 would tell the client its cached success is
    // still valid when it is not.
    it("never makes a non-2xx response conditional", () => {
        for (const status of [304, 400, 402, 404, 500]) {
            const res = withConditional({ status, body: { error: "nope" } }, { "if-none-match": "*" }, options);
            expect(res.status).toBe(status);
            expect(res.headers?.ETag).toBeUndefined();
        }
    });
});
