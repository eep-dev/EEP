import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runApply } from "./apply.js";
import { runInit } from "./init.js";
import { runInject } from "./inject.js";
import type { CommandContext } from "./types.js";

class MemoryStream {
  public readonly chunks: string[] = [];
  write(chunk: string): boolean {
    this.chunks.push(chunk);
    return true;
  }
}

const tempDirs: string[] = [];

async function tempDir(tag: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), `eep-io-${tag}-`));
  tempDirs.push(dir);
  return dir;
}

function context(cwd: string, argv: string[]): CommandContext {
  return {
    argv,
    cwd,
    stdout: new MemoryStream() as unknown as NodeJS.WriteStream,
    stderr: new MemoryStream() as unknown as NodeJS.WriteStream
  };
}

afterEach(async () => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

describe("commands with file IO", () => {
  it("init writes setup file and apply handles dry-run/apply", async () => {
    const dir = await tempDir("init");
    const initCtx = context(dir, ["node", "cli", "init", "--preset", "exchange", "--out", join(dir, "setup.json")]);
    const initResult = await runInit(initCtx);
    expect(initResult.ok).toBe(true);
    await access(join(dir, "setup.json"));

    const dryRun = await runApply(
      context(dir, ["node", "cli", "apply", "--config", join(dir, "setup.json"), "--dry-run"])
    );
    expect(dryRun.message).toContain("dry-run");

    const applied = await runApply(
      context(dir, ["node", "cli", "apply", "--config", join(dir, "setup.json"), "--output", join(dir, "out")])
    );
    expect(applied.message).toContain("complete");
    await access(join(dir, "out/.well-known/eep.json"));

    const prodBlocked = await runApply(
      context(dir, ["node", "cli", "apply", "--config", join(dir, "setup.json"), "--output", join(dir, "out2"), "--production"])
    );
    expect(prodBlocked.ok).toBe(false);
    expect(prodBlocked.message).toContain("production");
    await access(join(dir, "out/openapi-eep.json"));
  });

  it("blocks unsafe output path traversal unless explicitly allowed", async () => {
    const dir = await tempDir("unsafe");
    await runInit(context(dir, ["node", "cli", "init", "--out", join(dir, "setup.json")]));
    const blocked = await runApply(
      context(dir, ["node", "cli", "apply", "--config", join(dir, "setup.json"), "--output", "/tmp/eep-escape"])
    );
    expect(blocked.ok).toBe(false);

    const allowed = await runApply(
      context(dir, [
        "node",
        "cli",
        "apply",
        "--config",
        join(dir, "setup.json"),
        "--output",
        "/tmp/eep-escape",
        "--unsafe-paths"
      ])
    );
    expect(allowed.ok).toBe(true);
  });

  it("inject writes setup file using detected project profile", async () => {
    const project = await tempDir("inject");
    await writeFile(join(project, "package.json"), JSON.stringify({ dependencies: { express: "1.0.0" } }));
    const injectResult = await runInject(
      context(project, ["node", "cli", "inject", "--project", project, "--out", join(project, "inject-setup.json")])
    );
    expect(injectResult.ok).toBe(true);
    const raw = await readFile(join(project, "inject-setup.json"), "utf8");
    const parsed = JSON.parse(raw) as { adapters: { framework: { type: string } } };
    expect(parsed.adapters.framework.type).toBe("express");
  });
});
