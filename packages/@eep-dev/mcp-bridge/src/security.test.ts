import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createBridgeServer } from "./server.js";

const originalFetch = global.fetch;
let server: ReturnType<typeof import("node:http").createServer>;
let baseUrl = "";

beforeAll(async () => {
  global.fetch = (async (url: string, init?: RequestInit) => {
    if (url.startsWith("http://127.0.0.1:")) {
      return originalFetch(url, init);
    }
    if (url.endsWith("/tools/list")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          server: { name: "mock", version: "1.0.0" },
          tools: [{ name: "safe_tool", annotations: { price_usd: 1 } }],
        }),
      } as Response;
    }
    if (url.endsWith("/resources/list")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ resources: [] }),
      } as Response;
    }
    if (url.endsWith("/tools/call")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ output: "ok", args: init?.body ? JSON.parse(String(init.body)) : {} }),
      } as Response;
    }
    throw new Error(`Unexpected URL ${url}`);
  }) as typeof fetch;

  server = await createBridgeServer({
    did: "did:web:bridge.eep.dev",
    baseUrl: "http://127.0.0.1:0",
    mcpBaseUrl: "http://mcp.local",
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  global.fetch = originalFetch;
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("bridge security hardening", () => {
  it("serves manifest/services/gates endpoints", async () => {
    const manifest = await fetch(`${baseUrl}/.well-known/eep.json`);
    expect(manifest.status).toBe(200);
    const services = await fetch(`${baseUrl}/eep/services`);
    expect(services.status).toBe(200);
    const gates = await fetch(`${baseUrl}/eep/gates`);
    expect(gates.status).toBe(200);
  });

  it("supports subscribe and stream endpoints", async () => {
    const sub = await fetch(`${baseUrl}/eep/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source_did: "did:web:source", delivery_method: "sse" }),
    });
    expect(sub.status).toBe(200);
    const subBody = await sub.json();
    expect(subBody.status).toBe("active");

    const stream = await fetch(`${baseUrl}/eep/stream?source=did:web:source`);
    expect(stream.status).toBe(200);
    const payload = await stream.text();
    expect(payload).toContain("event:");
    expect(payload).toContain("com.eep.bridge.snapshot");
  });

  it("supports webhook subscribe and default stream source", async () => {
    const sub = await fetch(`${baseUrl}/eep/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ delivery_method: "webhook", callback_url: "https://example.com/hook" }),
    });
    expect(sub.status).toBe(200);
    const subBody = await sub.json();
    expect(subBody.status).toBe("pending_verification");
    expect(typeof subBody.source_did).toBe("string");

    const stream = await fetch(`${baseUrl}/eep/stream`);
    expect(stream.status).toBe(200);
    const payload = await stream.text();
    expect(payload).toContain("did:web:bridge.eep.dev");
  });

  it("returns 404 for unknown route", async () => {
    const res = await fetch(`${baseUrl}/nope`);
    expect(res.status).toBe(404);
  });

  it("rejects malformed tool names (injection guard)", async () => {
    const res = await fetch(`${baseUrl}/mcp/tools/call`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "../../etc/passwd", arguments: {} }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_tool_name");
  });

  it("rejects unknown tools", async () => {
    const res = await fetch(`${baseUrl}/mcp/tools/call`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "not_registered", arguments: {} }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("unknown_tool");
  });

  it("fails closed with 402 on missing payment proof", async () => {
    const res = await fetch(`${baseUrl}/mcp/tools/call`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "safe_tool", arguments: {} }),
    });
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error).toBe("access_restricted");
  });

  it("treats non-array gate_proofs as empty", async () => {
    const res = await fetch(`${baseUrl}/mcp/tools/call`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "safe_tool", arguments: {}, gate_proofs: { type: "payment", token: "x" } }),
    });
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error).toBe("access_restricted");
  });

  it("accepts call when proof is present", async () => {
    const res = await fetch(`${baseUrl}/mcp/tools/call`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "safe_tool",
        arguments: { q: "x" },
        gate_proofs: [{ type: "payment", token: "x402" }],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("returns 500 on invalid json body", async () => {
    const res = await fetch(`${baseUrl}/mcp/tools/call`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not-json",
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("bridge_error");
  });

  it("handles empty call body by failing validation path", async () => {
    const res = await fetch(`${baseUrl}/mcp/tools/call`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "",
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_tool_name");
  });
});
