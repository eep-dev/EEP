#!/usr/bin/env node
import { loadBridgeConfig } from "./config.js";
import { MCPClient } from "./mcp-client.js";
import { toEEPManifest, toGateConfig, toServiceCatalog } from "./mapping.js";
import { createBridgeServer } from "./server.js";

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx < 0) return undefined;
  return process.argv[idx + 1];
}

async function main(): Promise<void> {
  const cmd = process.argv[2];
  const configPath = arg("--config") ?? "./bridge.config.json";
  const port = Number(arg("--port") ?? "3001");
  const cfg = await loadBridgeConfig(configPath);

  if (cmd === "validate-config") {
    process.stdout.write(JSON.stringify({ valid: true, did: cfg.did }, null, 2) + "\n");
    return;
  }

  if (cmd === "export-manifest" || cmd === "dry-run") {
    const mcp = new MCPClient(cfg.mcpBaseUrl, fetch, cfg.legacyApiKey);
    const data = await mcp.introspect();
    const out = {
      manifest: toEEPManifest(cfg, data),
      services: toServiceCatalog(data),
      gates: toGateConfig(cfg, data),
    };
    process.stdout.write(JSON.stringify(out, null, 2) + "\n");
    return;
  }

  if (cmd === "start") {
    const server = await createBridgeServer(cfg);
    server.listen(port, () => {
      process.stdout.write(`EEP MCP bridge listening on :${port}\n`);
    });
    return;
  }

  process.stderr.write(
    "Usage: eep-mcp-bridge <start|validate-config|export-manifest|dry-run> --config ./bridge.config.json [--port 3001]\n",
  );
  process.exitCode = 1;
}

void main();
