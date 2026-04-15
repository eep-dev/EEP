import type { MCPIntrospection } from "./types.js";

interface FetchLike {
  (input: string, init?: RequestInit): Promise<Response>;
}

export class MCPClient {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly legacyApiKey?: string,
  ) {}

  private headers(): HeadersInit | undefined {
    if (!this.legacyApiKey) return undefined;
    return { Authorization: `Bearer ${this.legacyApiKey}` };
  }

  async introspect(): Promise<MCPIntrospection> {
    const [tools, resources] = await Promise.all([
      this.fetchJson(`${this.baseUrl}/tools/list`),
      this.fetchJson(`${this.baseUrl}/resources/list`),
    ]);

    return {
      server: {
        name: String((tools as any)?.server?.name ?? "mcp-server"),
        version: (tools as any)?.server?.version ? String((tools as any).server.version) : undefined,
      },
      tools: Array.isArray((tools as any)?.tools) ? (tools as any).tools : [],
      resources: Array.isArray((resources as any)?.resources) ? (resources as any).resources : [],
    };
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    return this.fetchJson(`${this.baseUrl}/tools/call`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.headers() ?? {}),
      },
      body: JSON.stringify({ name, arguments: args }),
    });
  }

  private async fetchJson(url: string, init?: RequestInit): Promise<unknown> {
    const res = await this.fetchImpl(url, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        ...(this.headers() ?? {}),
      },
    });
    if (!res.ok) {
      throw new Error(`MCP request failed (${res.status}) for ${url}`);
    }
    return res.json();
  }
}
