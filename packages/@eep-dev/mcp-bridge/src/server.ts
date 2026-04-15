import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { MCPClient } from "./mcp-client.js";
import { toEEPManifest, toGateConfig, toServiceCatalog } from "./mapping.js";
import type { BridgeConfig } from "./types.js";
import { evaluateMcpCallAccess } from "./gate.js";

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const c of req) {
    chunks.push(Buffer.from(c));
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw) as Record<string, unknown>;
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

export async function createBridgeServer(config: BridgeConfig): Promise<ReturnType<typeof createServer>> {
  const mcp = new MCPClient(config.mcpBaseUrl, fetch, config.legacyApiKey);
  const introspection = await mcp.introspect();
  const knownTools = new Set(introspection.tools.map((t) => t.name));
  const manifest = toEEPManifest(config, introspection);
  const services = toServiceCatalog(introspection);
  const gateConfig = toGateConfig(config, introspection);
  const subscriptions: Array<{ id: string; source_did: string; delivery_method: "webhook" | "sse"; callback_url?: string }> = [];

  const server = createServer(async (req, res) => {
    try {
      /* c8 ignore next */
      const url = new URL(req.url ?? "/", config.baseUrl);
      if (req.method === "GET" && url.pathname === "/.well-known/eep.json") {
        return json(res, 200, manifest);
      }
      if (req.method === "GET" && url.pathname === "/eep/services") {
        return json(res, 200, services);
      }
      if (req.method === "GET" && url.pathname === "/eep/gates") {
        return json(res, 200, gateConfig);
      }
      if (req.method === "POST" && url.pathname === "/eep/subscribe") {
        const body = await readJson(req);
        const delivery_method = body.delivery_method === "webhook" ? "webhook" : "sse";
        const source_did = typeof body.source_did === "string" ? body.source_did : config.sourceDid ?? config.did;
        const entry = {
          id: `sub_${Date.now()}_${subscriptions.length + 1}`,
          source_did,
          delivery_method,
          callback_url: typeof body.callback_url === "string" ? body.callback_url : undefined,
        } as const;
        subscriptions.push(entry);
        return json(res, 200, {
          subscription_id: entry.id,
          status: delivery_method === "webhook" ? "pending_verification" : "active",
          source_did: entry.source_did,
          delivery_method,
        });
      }
      if (req.method === "GET" && url.pathname === "/eep/stream") {
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        const source = url.searchParams.get("source") ?? config.sourceDid ?? config.did;
        const event = {
          specversion: "1.0",
          id: `evt_${Date.now()}`,
          source,
          type: "com.eep.bridge.snapshot",
          time: new Date().toISOString(),
          datacontenttype: "application/json",
          data: { active_subscriptions: subscriptions.length, tools: knownTools.size },
        };
        res.write(`event: ${event.type}\n`);
        res.write(`data: ${JSON.stringify(event)}\n\n`);
        res.end();
        return;
      }
      if (req.method === "POST" && url.pathname === "/mcp/tools/call") {
        const body = await readJson(req);
        const toolName = String(body.name ?? "");
        const args = (body.arguments ?? {}) as Record<string, unknown>;
        const proofs = Array.isArray(body.gate_proofs) ? (body.gate_proofs as any[]) : [];
        if (!/^[a-zA-Z0-9._:-]{1,128}$/.test(toolName)) {
          return json(res, 400, { error: "invalid_tool_name" });
        }
        if (!knownTools.has(toolName)) {
          return json(res, 404, { error: "unknown_tool" });
        }

        const access = await evaluateMcpCallAccess(
          gateConfig,
          toolName,
          proofs as any[],
          config.strictSemanticVerification ?? true,
        );

        if (!access.granted) {
          return json(res, access.status, access.body);
        }
        const result = await mcp.callTool(toolName, args);
        return json(res, 200, { ok: true, result });
      }

      return json(res, 404, { error: "not_found" });
    } catch (err) {
      return json(res, 500, { error: "bridge_error", message: (err as Error).message });
    }
  });

  return server;
}
