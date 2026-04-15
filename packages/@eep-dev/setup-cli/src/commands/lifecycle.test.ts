import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runApply } from "./apply.js";
import { runDoctor } from "./doctor.js";
import { runInit } from "./init.js";
import { runRotateSecrets } from "./rotate-secrets.js";
import { runStatus } from "./status.js";
import { runUpgrade } from "./upgrade.js";
import { runVerify } from "./verify.js";
import { runWatch } from "./watch.js";
import type { CommandContext } from "./types.js";

class MemoryStream {
  public readonly chunks: string[] = [];
  write(chunk: string): boolean {
    this.chunks.push(chunk);
    return true;
  }
}

const dirs: string[] = [];

async function makeDir(tag: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), `eep-life-${tag}-`));
  dirs.push(dir);
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
  while (dirs.length) {
    const dir = dirs.pop();
    if (dir) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

describe("lifecycle commands", () => {
  it("verify/doctor/status produce reports for generated artifacts", async () => {
    const dir = await makeDir("verify");
    await runInit(context(dir, ["node", "cli", "init", "--out", join(dir, "setup.json")]));
    await runApply(context(dir, ["node", "cli", "apply", "--config", join(dir, "setup.json"), "--output", join(dir, "out")]));

    const verify = await runVerify(
      context(dir, [
        "node",
        "cli",
        "verify",
        "--output",
        join(dir, "out"),
        "--report-json",
        join(dir, "out/report.json"),
        "--report-md",
        join(dir, "out/report.md")
      ])
    );
    expect(verify.ok).toBe(true);
    await access(join(dir, "out/report.json"));
    await access(join(dir, "out/report.md"));

    const doctor = await runDoctor(context(dir, ["node", "cli", "doctor", "--output", join(dir, "out")]));
    expect(doctor.ok).toBe(true);

    const status = await runStatus(context(dir, ["node", "cli", "status", "--output", join(dir, "out")]));
    expect(status.ok).toBe(true);
    expect((status.details?.dashboard as { manifest: boolean }).manifest).toBe(true);
  });

  it("upgrade/watch/rotate-secrets mutate generated state safely", async () => {
    const dir = await makeDir("mutate");
    await runInit(context(dir, ["node", "cli", "init", "--out", join(dir, "setup.json")]));

    const upgraded = await runUpgrade(
      context(dir, ["node", "cli", "upgrade", "--config", join(dir, "setup.json"), "--to-version", "0.9"])
    );
    expect(upgraded.ok).toBe(true);
    const upgradedRaw = await readFile(join(dir, "setup.json"), "utf8");
    expect(JSON.parse(upgradedRaw).setup_schema_version).toBe("0.9");

    const watchedDryRun = await runWatch(
      context(dir, ["node", "cli", "watch", "--dry-run", "--config", join(dir, "setup.json"), "--output", join(dir, "out")])
    );
    expect(watchedDryRun.ok).toBe(true);
    expect(watchedDryRun.details?.watch_mode).toBe("dry-run");

    const watchedApply = await runWatch(
      context(dir, ["node", "cli", "watch", "--once", "--config", join(dir, "setup.json"), "--output", join(dir, "out")])
    );
    expect(watchedApply.ok).toBe(true);
    expect(watchedApply.details?.watch_mode).toBe("once-apply");
    await access(join(dir, "out/.well-known/eep.json"));

    const envPath = join(dir, ".env");
    await writeFile(envPath, "EEP_WEBHOOK_SECRET=oldsecret\n", "utf8");
    const rotated = await runRotateSecrets(context(dir, ["node", "cli", "rotate-secrets", "--env", envPath]));
    expect(rotated.ok).toBe(true);
    const envRaw = await readFile(envPath, "utf8");
    expect(envRaw).toContain("EEP_WEBHOOK_SECRET_PREVIOUS=oldsecret");
    expect(envRaw).toContain("EEP_SECRET_ROTATION_AT=");
  });

  it("rotate-secrets bootstraps missing env files", async () => {
    const dir = await makeDir("rotate-missing");
    const envPath = join(dir, "missing.env");
    const rotated = await runRotateSecrets(context(dir, ["node", "cli", "rotate-secrets", "--env", envPath]));
    expect(rotated.ok).toBe(true);
    const envRaw = await readFile(envPath, "utf8");
    expect(envRaw).toContain("EEP_WEBHOOK_SECRET=");
    expect(envRaw).not.toContain("EEP_WEBHOOK_SECRET_PREVIOUS=");
  });

  it("verify fails when artifacts are missing", async () => {
    const dir = await makeDir("verify-fail");
    const result = await runVerify(context(dir, ["node", "cli", "verify", "--output", join(dir, "missing")]));
    expect(result.ok).toBe(false);
    expect((result.details?.missing as string[]).length).toBeGreaterThan(0);
  });
});
