import { describe, expect, it } from "vitest";
import { renderDelivery, toBinaryAttributeName } from "./content-mode.js";
import type { CloudEvent } from "../core/request-handler.js";

const event = (overrides: Partial<CloudEvent> = {}): CloudEvent =>
    ({
        specversion: "1.0",
        id: "01HN3QK7GX",
        source: "did:web:acme.example",
        type: "com.example.entity.updated",
        time: "2026-02-22T14:30:00Z",
        datacontenttype: "application/json",
        eep_version: "0.1",
        data: { field: "bio", current: "New bio" },
        ...overrides,
    }) as CloudEvent;

describe("toBinaryAttributeName", () => {
    // CloudEvents restricts context attribute names to lowercase letters and
    // digits, so `ce-eep_version` is not a legal header name.
    it.each([
        ["eep_version", "eepversion"],
        ["eep_subscription_id", "eepsubscriptionid"],
        ["specversion", "specversion"],
        ["EEP_Version", "eepversion"],
    ])("maps %s to %s", (input, expected) => {
        expect(toBinaryAttributeName(input)).toBe(expected);
    });
});

describe("structured mode (default)", () => {
    it("puts the whole envelope in the body", () => {
        const evt = event();
        const { body, headers } = renderDelivery(evt, undefined);
        expect(JSON.parse(body)).toEqual(evt);
        expect(headers["content-type"]).toBe("application/json");
    });

    it("keeps the underscored attribute spelling", () => {
        const { body } = renderDelivery(event(), "cloudevents/v1.0");
        expect(JSON.parse(body)).toHaveProperty("eep_version", "0.1");
    });

    it("emits no ce-* headers", () => {
        const { headers } = renderDelivery(event(), "cloudevents/v1.0");
        expect(Object.keys(headers).filter((h) => h.startsWith("ce-"))).toEqual([]);
    });
});

describe("binary mode (§5.2.1)", () => {
    it("carries the payload alone in the body", () => {
        const { body } = renderDelivery(event(), "cloudevents/v1.0-binary");
        expect(JSON.parse(body)).toEqual({ field: "bio", current: "New bio" });
    });

    it("relocates context attributes to ce-* headers", () => {
        const { headers } = renderDelivery(event(), "cloudevents/v1.0-binary");
        expect(headers["ce-specversion"]).toBe("1.0");
        expect(headers["ce-id"]).toBe("01HN3QK7GX");
        expect(headers["ce-source"]).toBe("did:web:acme.example");
        expect(headers["ce-type"]).toBe("com.example.entity.updated");
        expect(headers["ce-time"]).toBe("2026-02-22T14:30:00Z");
    });

    it("strips underscores from EEP attribute names", () => {
        const { headers } = renderDelivery(
            event({ eep_subscription_id: "sub_1" } as Partial<CloudEvent>),
            "cloudevents/v1.0-binary"
        );
        expect(headers["ce-eepversion"]).toBe("0.1");
        expect(headers["ce-eepsubscriptionid"]).toBe("sub_1");
        // The illegal spelling must never appear.
        expect(headers["ce-eep_version"]).toBeUndefined();
    });

    // Binary mode RELOCATES attributes; it must not drop them. An object-valued
    // attribute has no header representation, so it stays in the body.
    it("keeps object-valued attributes in the body rather than losing them", () => {
        const { body, headers } = renderDelivery(
            event({ eep_known_event_types: ["a", "b"] } as Partial<CloudEvent>),
            "cloudevents/v1.0-binary"
        );
        const parsed = JSON.parse(body) as Record<string, unknown>;
        expect(parsed.eep_known_event_types).toEqual(["a", "b"]);
        expect(parsed.data).toEqual({ field: "bio", current: "New bio" });
        expect(headers["ce-eepknowneventtypes"]).toBeUndefined();
    });

    it("loses no attribute across the mode change", () => {
        const evt = event();
        const { body, headers } = renderDelivery(evt, "cloudevents/v1.0-binary");
        const parsed = JSON.parse(body) as Record<string, unknown>;
        for (const attribute of Object.keys(evt)) {
            if (attribute === "data") continue;
            const inHeader = headers[`ce-${toBinaryAttributeName(attribute)}`] !== undefined;
            const inBody = Object.prototype.hasOwnProperty.call(parsed, attribute);
            expect(inHeader || inBody).toBe(true);
        }
    });

    it("handles an event with no data", () => {
        const evt = event();
        delete (evt as { data?: unknown }).data;
        const { body } = renderDelivery(evt, "cloudevents/v1.0-binary");
        expect(JSON.parse(body)).toEqual({});
    });

    it("produces a smaller body than structured mode", () => {
        const evt = event();
        const structured = renderDelivery(evt, "cloudevents/v1.0");
        const binary = renderDelivery(evt, "cloudevents/v1.0-binary");
        expect(binary.body.length).toBeLessThan(structured.body.length);
    });
});
