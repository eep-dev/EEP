import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { toEEPManifest, toGateConfig } from "./mapping.js";
import { evaluateMcpCallAccess } from "./gate.js";

const fixturePath = resolve(process.cwd(), "../../../tests/parity/mcp-bridge-fixtures.json");
const fixtures = JSON.parse(readFileSync(fixturePath, "utf8"));

describe("mcp-bridge parity fixtures", () => {
  it("matches manifest parity fixture", () => {
    const manifest = toEEPManifest(fixtures.manifest_case.config, fixtures.manifest_case.introspection) as any;
    expect(manifest.did).toBe(fixtures.manifest_case.expect.did);
    expect(manifest.supported_content_types.includes("text/plain")).toBe(fixtures.manifest_case.expect.has_text_plain);
  });

  it("matches gate decision parity fixture", async () => {
    const gate = toGateConfig(fixtures.manifest_case.config, fixtures.manifest_case.introspection);
    const denied = await evaluateMcpCallAccess(gate as any, fixtures.gate_case.tool, []);
    expect(denied.status).toBe(fixtures.gate_case.expect_missing_status);
    const allowed = await evaluateMcpCallAccess(
      gate as any,
      fixtures.gate_case.tool,
      fixtures.gate_case.proofs as any,
    );
    expect(allowed.status).toBe(fixtures.gate_case.expect_with_proof_status);
  });
});
