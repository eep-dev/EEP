import { readFile } from "node:fs/promises";
import type { BridgeConfig } from "./types.js";

const DID_PATTERN = /^did:[a-z0-9]+:[^\s]+$/i;

export function validateBridgeConfig(input: unknown): BridgeConfig {
  if (!input || typeof input !== "object") {
    throw new Error("Bridge config must be an object");
  }
  const cfg = input as Record<string, unknown>;
  const required = ["did", "baseUrl", "mcpBaseUrl"] as const;
  for (const key of required) {
    if (typeof cfg[key] !== "string" || !(cfg[key] as string).trim()) {
      throw new Error(`Missing required config field: ${key}`);
    }
  }
  if (!DID_PATTERN.test(String(cfg.did))) {
    throw new Error("Invalid DID format in config.did");
  }
  const ensureHttp = (value: string, field: string) => {
    if (!/^https?:\/\//.test(value)) {
      throw new Error(`${field} must be an absolute http(s) URL`);
    }
  };
  ensureHttp(String(cfg.baseUrl), "baseUrl");
  ensureHttp(String(cfg.mcpBaseUrl), "mcpBaseUrl");

  return cfg as unknown as BridgeConfig;
}

export async function loadBridgeConfig(path: string): Promise<BridgeConfig> {
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  return validateBridgeConfig(parsed);
}
