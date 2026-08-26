/**
 * Conditional-request support for Layer 1 (SPECIFICATION.md §3.2.1).
 *
 * Layer 1 is the polled surface of EEP — manifest, entity resolution, gates,
 * services, capabilities. An agent tracking many entities re-reads these far
 * more often than they change, and a manifest is not small. Before this,
 * nothing in the spec or the packages emitted `ETag`, honoured
 * `If-None-Match`, or sent `Cache-Control`: every poll re-downloaded the whole
 * document.
 */
import { createHash } from "node:crypto";
import type { OutgoingResponse } from "./request-handler.js";

/**
 * Compute a strong entity-tag over a JSON-serialisable body.
 *
 * The body is serialised with sorted keys so the tag is stable across runs
 * regardless of property insertion order. Without that, a publisher that
 * builds its manifest from a map would emit a new `ETag` on every request and
 * conditional requests would never hit — worse than not implementing them,
 * because the client pays for the validator round-trip and still gets a body.
 */
export function computeETag(body: unknown): string {
    const canonical = JSON.stringify(body, canonicalReplacer);
    const digest = createHash("sha256").update(canonical ?? "null", "utf8").digest("base64url");
    // 22 base64url chars ≈ 128 bits: ample for change detection, short enough
    // that the header stays cheap on every response.
    return `"${digest.slice(0, 22)}"`;
}

function canonicalReplacer(_key: string, value: unknown): unknown {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return value;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
        sorted[key] = (value as Record<string, unknown>)[key];
    }
    return sorted;
}

/**
 * Does an `If-None-Match` header match `etag`?
 *
 * Handles the comma-separated list form and `*`, and compares weak and strong
 * validators using the weak comparison function RFC 9110 §8.8.3.2 prescribes
 * for `If-None-Match` — `W/"x"` and `"x"` are a match here, which is why this
 * cannot be a string equality check.
 */
export function ifNoneMatchSatisfied(header: string | undefined, etag: string): boolean {
    if (!header) return false;
    const candidates = header.split(",").map((c) => c.trim()).filter((c) => c.length > 0);
    if (candidates.includes("*")) return true;
    const normalized = stripWeak(etag);
    return candidates.some((candidate) => stripWeak(candidate) === normalized);
}

function stripWeak(tag: string): string {
    return tag.startsWith("W/") ? tag.slice(2) : tag;
}

export interface ConditionalOptions {
    /** `Cache-Control` for this resource. */
    cacheControl: string;
    /** RFC 1123 `Last-Modified`, when the publisher knows it. */
    lastModified?: string;
}

/**
 * Attach validators to a `200` response, collapsing it to `304` when the
 * client already holds the current representation.
 *
 * A `304` repeats `ETag` and `Cache-Control` and carries no body, per §3.2.1.
 * Only `2xx` responses are made conditional: collapsing an error to `304`
 * would tell a client its cached success is still valid when it is not.
 */
export function withConditional(
    response: OutgoingResponse,
    requestHeaders: Record<string, string | undefined>,
    options: ConditionalOptions
): OutgoingResponse {
    if (response.status < 200 || response.status >= 300) return response;

    const etag = computeETag(response.body);
    const headers: Record<string, string> = {
        ...(response.headers ?? {}),
        ETag: etag,
        "Cache-Control": options.cacheControl,
    };
    if (options.lastModified) headers["Last-Modified"] = options.lastModified;

    const ifNoneMatch = headerValue(requestHeaders, "if-none-match");
    if (ifNoneMatchSatisfied(ifNoneMatch, etag)) {
        return {
            status: 304,
            headers: {
                ETag: etag,
                "Cache-Control": options.cacheControl,
                ...(options.lastModified ? { "Last-Modified": options.lastModified } : {}),
            },
            body: null,
        };
    }

    return { ...response, headers, body: response.body };
}

function headerValue(
    headers: Record<string, string | undefined>,
    name: string
): string | undefined {
    const direct = headers[name];
    if (direct !== undefined) return direct;
    // Node lower-cases incoming header names, but adapters vary; fall back to
    // a case-insensitive scan rather than silently missing the header and
    // serving a full body to a client that sent a valid conditional request.
    for (const [key, value] of Object.entries(headers)) {
        if (key.toLowerCase() === name) return value;
    }
    return undefined;
}
