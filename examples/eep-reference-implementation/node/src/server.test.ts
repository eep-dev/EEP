import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createEEPNodeServer } from "./server.js";

let server: ReturnType<typeof createEEPNodeServer>;
let baseUrl = "";
const parity = JSON.parse(readFileSync(resolve(process.cwd(), "../parity-fixtures.json"), "utf8"));

const DEMO_AGREEMENT_HASH =
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

beforeAll(async () => {
  server = createEEPNodeServer("http://127.0.0.1:0");
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("EEP node reference", () => {
  it("serves well-known manifest", async () => {
    const res = await fetch(`${baseUrl}/.well-known/eep.json`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.eep_version).toBe(parity.manifest_expect.eep_version);
    expect(body.x402_enabled).toBe(parity.manifest_expect.x402_enabled);
    expect(body.supported_content_types).toContain(parity.manifest_expect.supports_json);
  });

  it("returns subscribe response", async () => {
    const res = await fetch(`${baseUrl}/eep/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source_did: "did:web:test",
        delivery_method: "webhook",
        callback_url: "https://example.com/hook",
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("pending_verification");
  });

  it("resolves entity and link headers", async () => {
    const res = await fetch(`${baseUrl}/u/u/acme-corp`);
    expect(res.status).toBe(200);
    expect(res.headers.get("EEP-Version")).toBe("0.1");
  });

  it("uses fallback entity parts and subscribe defaults", async () => {
    const fallbackEntity = await fetch(`${baseUrl}/u/`);
    expect(fallbackEntity.status).toBe(200);

    const sub = await fetch(`${baseUrl}/eep/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "",
    });
    expect(sub.status).toBe(200);
    const payload = await sub.json();
    expect(payload.status).toBe("active");
    expect(payload.source_did).toContain("did:web:api.eep.dev");
  });

  it("serves services, gates and stream endpoints", async () => {
    const services = await fetch(`${baseUrl}/eep/services`);
    expect(services.status).toBe(200);
    const gates = await fetch(`${baseUrl}/eep/gates`);
    expect(gates.status).toBe(200);
    const stream = await fetch(`${baseUrl}/eep/stream`);
    expect(stream.status).toBe(200);
    const text = await stream.text();
    expect(text).toContain("event:");
  });

  it("serves health endpoint", async () => {
    const res = await fetch(`${baseUrl}/healthz`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.runtime).toBe("node");
  });

  it("gates protected content", async () => {
    const denied = await fetch(`${baseUrl}/eep/content/did:web:x/content.papers.full_text`);
    expect(denied.status).toBe(parity.gate_expect.denied_status);

    const allowed = await fetch(`${baseUrl}/eep/content/did:web:x/content.papers.full_text`, {
      headers: { "x-eep-gate-proofs": JSON.stringify([{ type: "payment", token: "x402" }]) },
    });
    expect(allowed.status).toBe(parity.gate_expect.allowed_status);
  });

  it("supports websocket pulse", async () => {
    const wsUrl = `${baseUrl.replace("http", "ws")}/eep/pulse`;
    const events: string[] = [];
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      ws.on("message", (msg) => {
        events.push(String(msg));
        if (events.length === 1) {
          ws.send(JSON.stringify({ v: 1, type: "system", action: "subscribe" }));
          return;
        }
        ws.close();
        resolve();
      });
      ws.on("error", reject);
    });
    expect(events.length).toBeGreaterThanOrEqual(2);
  });

  it("returns 404 for unknown route", async () => {
    const res = await fetch(`${baseUrl}/not-found`);
    expect(res.status).toBe(404);
  });

  it("serves federation registry manifest with economics", async () => {
    const res = await fetch(`${baseUrl}/.well-known/eep-registry.json`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect((body.economics as { query_quota?: { free_requests_per_day?: number } })?.query_quota?.free_requests_per_day).toBe(
      1000,
    );
    expect(String(body.federation_credential_url)).toContain("/.well-known/eep-federation-credential.json");
  });

  it("supports cold-start trust graduation and status", async () => {
    const did = "did:key:node-trust-test";
    const cold = await fetch(`${baseUrl}/eep/trust-status?agent_did=${encodeURIComponent(did)}`);
    expect(cold.status).toBe(200);
    expect((await cold.json()).trust_state).toBe("cold_start");
    const grad = await fetch(`${baseUrl}/eep/trust/graduate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent_did: did }),
    });
    expect(grad.status).toBe(200);
    const warm = await fetch(`${baseUrl}/eep/trust-status?agent_did=${encodeURIComponent(did)}`);
    expect((await warm.json()).trust_state).toBe("standard");
  });

  it("emits X-EEP-Trust-State for EEP-Agent-DID", async () => {
    const did = "did:key:header-test";
    const r0 = await fetch(`${baseUrl}/healthz`, { headers: { "EEP-Agent-DID": did } });
    expect(r0.headers.get("X-EEP-Trust-State")).toBe("cold_start");
    await fetch(`${baseUrl}/eep/trust/graduate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent_did: did }),
    });
    const r1 = await fetch(`${baseUrl}/healthz`, { headers: { "EEP-Agent-DID": did } });
    expect(r1.headers.get("X-EEP-Trust-State")).toBe("standard");
  });

  it("verifies delegation privacy binding", async () => {
    const res = await fetch(`${baseUrl}/eep/delegation/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        credential_subject: {
          operator_privacy_policy_hash: "pol1",
          allowed_dpv_purposes: ["analytics"],
          max_retention_days: 30,
        },
        data_request_requirement: {
          type: "data_request",
          policy_hash: "pol1",
          requested_claims: [{ purpose: "analytics", claim: "email", retention_days: 10 }],
        },
      }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).valid).toBe(true);
  });

  it("unlocks combined bundle resource with payment + agreement proofs", async () => {
    const proofs = [
      { type: "payment", token: "x402" },
      {
        type: "agreement",
        document_hash: DEMO_AGREEMENT_HASH,
        document_url: "https://example.com/eep-reference/terms",
        signature: "dGVzdC1zaWduYXR1cmUxMjM0",
        signer_did: "did:key:testsigner",
        signature_algo: "EdDSA",
      },
    ];
    const res = await fetch(`${baseUrl}/eep/content/did:web:x/content.bundle.report`, {
      headers: { "x-eep-gate-proofs": JSON.stringify(proofs) },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { combined_gate?: boolean };
    expect(body.combined_gate).toBe(true);
  });

  it("resolves commerce dispute over websocket", async () => {
    const wsUrl = `${baseUrl.replace("http", "ws")}/eep/pulse`;
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      ws.on("message", (msg) => {
        const data = JSON.parse(String(msg));
        if (data.action === "connected") {
          ws.send(
            JSON.stringify({
              v: 1,
              type: "commerce",
              action: "commerce.dispute.open",
              seq: 3,
              data: { negotiation_id: "neg_ws" },
            }),
          );
          return;
        }
        if (data.action === "commerce.dispute.resolved") {
          expect(data.data?.outcome).toBe("dismissed");
          ws.close();
          resolve();
          return;
        }
      });
      ws.on("error", reject);
    });
  });

  it("handles invalid websocket payload and non-pulse path", async () => {
    const wsUrl = `${baseUrl.replace("http", "ws")}/eep/pulse`;
    const badEvents: string[] = [];
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      ws.on("message", (msg) => {
        badEvents.push(String(msg));
        if (badEvents.length === 1) {
          ws.send("not-json");
          return;
        }
        ws.close();
        resolve();
      });
      ws.on("error", reject);
    });
    expect(badEvents.some((e) => e.includes('"action":"error"'))).toBe(true);

    await new Promise<void>((resolve) => {
      const bad = new WebSocket(`${baseUrl.replace("http", "ws")}/other`);
      bad.on("error", () => resolve());
      bad.on("close", () => resolve());
    });
  });
});
