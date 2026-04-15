import { describe, expect, it } from "vitest";
import { MCPClient } from "./mcp-client.js";

function fakeResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

describe("MCPClient", () => {
  it("introspects tools/resources", async () => {
    const calls: string[] = [];
    const client = new MCPClient(
      "http://mcp.local",
      async (url: string) => {
        calls.push(url);
        if (url.endsWith("/tools/list")) {
          return fakeResponse({ server: { name: "mcp-x", version: "1" }, tools: [{ name: "search" }] });
        }
        return fakeResponse({ resources: [{ uri: "res://1" }] });
      },
      "sk_legacy",
    );

    const out = await client.introspect();
    expect(calls).toHaveLength(2);
    expect(out.server.name).toBe("mcp-x");
    expect(out.tools[0].name).toBe("search");
  });

  it("calls tools/call endpoint", async () => {
    const client = new MCPClient("http://mcp.local", async () => fakeResponse({ result: { ok: true } }));
    const out = (await client.callTool("search", { q: "x" })) as any;
    expect(out.result.ok).toBe(true);
  });

  it("throws on non-ok response", async () => {
    const client = new MCPClient("http://mcp.local", async () => fakeResponse({}, false, 500));
    await expect(client.introspect()).rejects.toThrow("MCP request failed");
  });

  it("uses fallback server metadata when absent", async () => {
    const client = new MCPClient("http://mcp.local", async (url: string) => {
      if (url.endsWith("/tools/list")) return fakeResponse({ tools: [] });
      return fakeResponse({ resources: [] });
    });
    const out = await client.introspect();
    expect(out.server.name).toBe("mcp-server");
    expect(out.server.version).toBeUndefined();
  });

  it("falls back to empty arrays when list payloads are malformed", async () => {
    const client = new MCPClient("http://mcp.local", async (url: string) => {
      if (url.endsWith("/tools/list")) return fakeResponse({ server: { name: "x" }, tools: {} });
      return fakeResponse({ resources: {} });
    });
    const out = await client.introspect();
    expect(out.tools).toEqual([]);
    expect(out.resources).toEqual([]);
  });
});
