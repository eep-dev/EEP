/**
 * CloudEvents content-mode rendering (SPECIFICATION.md §5.2.1).
 *
 * Structured mode puts the whole envelope in the body. Binary mode relocates
 * context attributes to `ce-`-prefixed headers and leaves only `data` in the
 * body, so a subscriber can route and filter on headers without parsing the
 * payload at all.
 */
import type { CloudEvent, DeliveryFormat } from "../core/request-handler.js";

/** Attributes that are part of the envelope rather than the payload. */
const RESERVED = new Set(["data"]);

/**
 * CloudEvents restricts context attribute names to lowercase letters and
 * digits — the underscore is excluded — so EEP's `eep_`-prefixed attributes
 * cannot be carried verbatim as `ce-` headers. In binary mode the underscores
 * are removed (`eep_version` → `ce-eepversion`). Structured mode keeps the
 * underscored spelling, which is what every deployed implementation emits.
 */
export function toBinaryAttributeName(attribute: string): string {
    return attribute.replace(/_/g, "").toLowerCase();
}

export interface RenderedDelivery {
    body: string;
    /** Headers the content mode contributes. Signing headers are added separately. */
    headers: Record<string, string>;
}

/**
 * Render an event for delivery in the subscription's content mode.
 *
 * Binary mode relocates attributes; it never drops them. Any attribute that
 * cannot be represented as a header value (an object or array) stays in
 * structured form for that delivery rather than being silently lost.
 */
export function renderDelivery(event: CloudEvent, format: DeliveryFormat | undefined): RenderedDelivery {
    if (format !== "cloudevents/v1.0-binary") {
        return {
            body: JSON.stringify(event),
            headers: { "content-type": "application/json" },
        };
    }

    const headers: Record<string, string> = { "content-type": "application/json" };
    const leftovers: Record<string, unknown> = {};

    for (const [attribute, value] of Object.entries(event)) {
        if (RESERVED.has(attribute)) continue;
        if (value === undefined || value === null) continue;
        if (typeof value === "object") {
            // Structured attribute values have no header representation.
            // Keeping them in the body is lossless; dropping them would not be.
            leftovers[attribute] = value;
            continue;
        }
        headers[`ce-${toBinaryAttributeName(attribute)}`] = String(value);
    }

    const data = (event as { data?: unknown }).data;
    const body =
        Object.keys(leftovers).length > 0
            ? JSON.stringify({ ...leftovers, data })
            : JSON.stringify(data ?? {});

    return { body, headers };
}
