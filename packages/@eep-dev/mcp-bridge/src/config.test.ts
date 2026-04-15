import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadBridgeConfig, validateBridgeConfig } from "./config.js";

describe("validateBridgeConfig", () => {
  it("accepts a valid config", () => {
    const cfg = validateBridgeConfig({
      did: "did:web:bridge.eep.dev",
      baseUrl: "http://localhost:3001",
      mcpBaseUrl: "http://localhost:4100",
    });
    expect(cfg.did).toBe("did:web:bridge.eep.dev");
  });

  it("rejects invalid object", () => {
    expect(() => validateBridgeConfig(null)).toThrow("Bridge config must be an object");
  });

  it("rejects invalid did", () => {
    expect(() =>
      validateBridgeConfig({
        did: "invalid",
        baseUrl: "http://localhost:3001",
        mcpBaseUrl: "http://localhost:4100",
      }),
    ).toThrow("Invalid DID format");
  });

  it("rejects when required field is missing", () => {
    expect(() =>
      validateBridgeConfig({
        did: "did:web:bridge.eep.dev",
        baseUrl: "http://localhost:3001",
      }),
    ).toThrow("Missing required config field: mcpBaseUrl");
  });

  it("rejects non-http URLs", () => {
    expect(() =>
      validateBridgeConfig({
        did: "did:web:bridge.eep.dev",
        baseUrl: "ws://localhost:3001",
        mcpBaseUrl: "http://localhost:4100",
      }),
    ).toThrow("baseUrl must be an absolute http(s) URL");
  });

  it("loads config from file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bridge-"));
    const path = join(dir, "bridge.config.json");
    writeFileSync(
      path,
      JSON.stringify({
        did: "did:web:bridge.eep.dev",
        baseUrl: "http://localhost:3001",
        mcpBaseUrl: "http://localhost:4100",
      }),
      "utf8",
    );
    const cfg = await loadBridgeConfig(path);
    expect(cfg.baseUrl).toContain("localhost");
  });
});
