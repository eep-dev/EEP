import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runPromptEngine } from "./prompt-engine.js";
import { getPresetConfig, listPresets } from "./presets.js";

const dirs: string[] = [];

async function makeDir(tag: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), `eep-prompt-${tag}-`));
  dirs.push(dir);
  return dir;
}

afterEach(async () => {
  while (dirs.length) {
    const dir = dirs.pop();
    if (dir) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

describe("prompt engine", () => {
  it("lists presets and returns preset config variants", () => {
    expect(listPresets()).toContain("exchange");
    expect(getPresetConfig("exchange").conformance.target_tier).toBe("Full");
    expect(getPresetConfig("marketplace").services.pricing_mode).toBe("auction");
    expect(getPresetConfig("saas").conformance.target_tier).toBe("Standard");
    expect(getPresetConfig("data-provider").delivery.methods).toEqual(["sse"]);
    expect(getPresetConfig("iot-publisher").gates.enabled).toBe(false);
  });

  it("merges answers over preset defaults in init mode", async () => {
    const dir = await makeDir("init");
    const answersPath = join(dir, "answers.json");
    await writeFile(
      answersPath,
      JSON.stringify({
        identity: {
          org_name: "CustomOrg"
        },
        conformance: {
          environment: "production"
        },
        custom_block: {
          enabled: true
        }
      })
    );

    const result = await runPromptEngine({
      mode: "init",
      preset: "exchange",
      answersPath
    });
    expect(result.config.mode).toBe("init");
    expect(result.config.identity.org_name).toBe("CustomOrg");
    expect(result.config.conformance.environment).toBe("production");
    expect((result.config as unknown as { custom_block: { enabled: boolean } }).custom_block.enabled).toBe(true);
  });

  it("handles array overrides and primitive answer payloads", async () => {
    const dir = await makeDir("answers");
    const arrayAnswers = join(dir, "array-answers.json");
    await writeFile(
      arrayAnswers,
      JSON.stringify({
        delivery: {
          events: ["x.y.z"]
        }
      })
    );
    const arrayResult = await runPromptEngine({
      mode: "init",
      answersPath: arrayAnswers
    });
    expect(arrayResult.config.delivery.events).toEqual(["x.y.z"]);

    const primitiveAnswers = join(dir, "primitive-answers.json");
    await writeFile(primitiveAnswers, "5");
    const primitiveResult = await runPromptEngine({
      mode: "init",
      answersPath: primitiveAnswers
    });
    expect(primitiveResult.config.mode).toBe("init");
  });

  it("adapts config in inject mode from detected project profile", async () => {
    const project = await makeDir("inject");
    await writeFile(
      join(project, "package.json"),
      JSON.stringify({
        dependencies: {
          fastify: "1.0.0",
          mysql2: "1.0.0",
          amqplib: "1.0.0",
          "express-api-key-auth": "1.0.0"
        }
      })
    );

    const result = await runPromptEngine({
      mode: "inject",
      projectPath: project,
      preset: "saas"
    });

    expect(result.config.mode).toBe("inject");
    expect(result.config.adapters.framework.type).toBe("fastify");
    expect(result.config.adapters.auth.type).toBe("api_key_lookup");
    expect(result.config.adapters.database.type).toBe("mysql");
    expect(result.config.adapters.event_bus.type).toBe("rabbitmq");
  });

  it("maps oauth auth profile to oauth_scopes", async () => {
    const project = await makeDir("inject-oauth");
    await writeFile(
      join(project, "package.json"),
      JSON.stringify({
        dependencies: {
          passport: "1.0.0"
        }
      })
    );
    const result = await runPromptEngine({
      mode: "inject",
      projectPath: project
    });
    expect(result.config.adapters.auth.type).toBe("oauth_scopes");
  });

  it("uses cwd fallback for inject project path and supports runtime=other", async () => {
    const result = await runPromptEngine({
      mode: "inject",
      answersPath: undefined
    });
    expect(result.config.mode).toBe("inject");
    expect(["node", "python", "other"]).toContain(result.config.conformance.runtime);
  });

  it("sets runtime to other for unsupported languages", async () => {
    const project = await makeDir("inject-other");
    const result = await runPromptEngine({
      mode: "inject",
      projectPath: project
    });
    expect(result.config.conformance.runtime).toBe("other");
  });

  it("sets runtime to node for TypeScript projects", async () => {
    const project = await makeDir("inject-ts");
    await writeFile(join(project, "package.json"), JSON.stringify({ dependencies: { express: "1.0.0" } }));
    await writeFile(join(project, "tsconfig.json"), "{}");
    const result = await runPromptEngine({
      mode: "inject",
      projectPath: project
    });
    expect(result.config.conformance.runtime).toBe("node");
  });

  it("sets runtime to python for Python projects", async () => {
    const project = await makeDir("inject-py-runtime");
    await writeFile(join(project, "pyproject.toml"), "[project]\nname='x'\n");
    const result = await runPromptEngine({
      mode: "inject",
      projectPath: project
    });
    expect(result.config.conformance.runtime).toBe("python");
  });

  it("falls back to saas preset for unknown preset names", async () => {
    const result = await runPromptEngine({
      mode: "init",
      preset: "unknown-preset"
    });
    expect(result.debug.preset).toBe("saas");
  });

  it("applies interactive branch in CI without TTY prompts", async () => {
    const prev = process.env.CI;
    process.env.CI = "true";
    const result = await runPromptEngine({
      mode: "init",
      preset: "saas",
      interactive: true
    });
    expect(result.config.identity?.org_name).toBeDefined();
    process.env.CI = prev;
  });
});
