import { describe, expect, it } from "vitest";
import { runApply } from "./apply.js";
import { runDoctor } from "./doctor.js";
import { runInit } from "./init.js";
import { runInject } from "./inject.js";
import { runRotateSecrets } from "./rotate-secrets.js";
import { runStatus } from "./status.js";
import type { CommandContext } from "./types.js";
import { runUpgrade } from "./upgrade.js";
import { runVerify } from "./verify.js";
import { runWatch } from "./watch.js";

class MemoryStream {
  public readonly chunks: string[] = [];
  write(chunk: string): boolean {
    this.chunks.push(chunk);
    return true;
  }
}

function context(): CommandContext {
  const out = new MemoryStream();
  const err = new MemoryStream();
  return {
    argv: [],
    cwd: "/tmp",
    stdout: out as unknown as NodeJS.WriteStream,
    stderr: err as unknown as NodeJS.WriteStream
  };
}

describe("command handlers", () => {
  it("returns scaffold responses for all commands", async () => {
    const initResult = await runInit(context());
    const injectResult = await runInject(context());
    const applyResult = await runApply(context());
    const verifyResult = await runVerify(context());
    const doctorResult = await runDoctor(context());
    const upgradeResult = await runUpgrade(context());
    const watchResult = await runWatch(context());
    const statusResult = await runStatus(context());
    const rotateResult = await runRotateSecrets(context());

    for (const result of [
      initResult,
      injectResult,
      applyResult,
      verifyResult,
      doctorResult,
      upgradeResult,
      watchResult,
      statusResult,
      rotateResult
    ]) {
      expect(typeof result.ok).toBe("boolean");
      expect(result.message.length).toBeGreaterThan(0);
    }
  });

  it("supports inject --project argument parsing", async () => {
    const ctx = context();
    ctx.argv = ["node", "cli", "inject", "--project", "/tmp/sample-project"];
    const result = await runInject(ctx);
    expect(result.details?.project_path).toBe("/tmp/sample-project");

    const ctxFallback = context();
    ctxFallback.argv = ["node", "cli", "inject", "--project"];
    const fallback = await runInject(ctxFallback);
    expect(fallback.details?.project_path).toBe("/tmp");
  });
});
