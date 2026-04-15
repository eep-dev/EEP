import { describe, expect, it } from "vitest";
import { helpText, parseCommand, runCli } from "./index.js";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

class MemoryStream {
  public readonly chunks: string[] = [];
  write(chunk: string): boolean {
    this.chunks.push(chunk);
    return true;
  }
  toString(): string {
    return this.chunks.join("");
  }
}

describe("setup-cli router", () => {
  it("parses known commands and rejects unknown ones", () => {
    expect(parseCommand(["node", "cli", "init"])).toBe("init");
    expect(parseCommand(["node", "cli", "rotate-secrets"])).toBe("rotate-secrets");
    expect(parseCommand(["node", "cli", "unknown"])).toBeNull();
    expect(parseCommand(["node", "cli"])).toBeNull();
  });

  it("returns help text when command is missing", async () => {
    const out = new MemoryStream();
    const err = new MemoryStream();
    const code = await runCli(["node", "cli"], out as unknown as NodeJS.WriteStream, err as unknown as NodeJS.WriteStream);
    expect(code).toBe(1);
    expect(err.toString()).toContain("Usage: eep-setup");
    expect(helpText()).toContain("inject");
  });

  it("routes verify command with prepared artifacts", async () => {
    const dir = await mkdtemp(join(tmpdir(), "eep-index-verify-"));
    await mkdir(join(dir, ".well-known"), { recursive: true });
    await writeFile(join(dir, ".well-known/eep.json"), "{}", "utf8");
    await writeFile(join(dir, "gate-config.json"), "{}", "utf8");
    await writeFile(join(dir, "service-catalog.json"), "{}", "utf8");
    await writeFile(join(dir, "openapi-eep.json"), "{}", "utf8");
    await writeFile(join(dir, "adapter-config.json"), "{}", "utf8");

    const out = new MemoryStream();
    const err = new MemoryStream();
    const code = await runCli(
      ["node", "cli", "verify", "--output", dir, "--report-json", join(dir, "report.json"), "--report-md", join(dir, "report.md")],
      out as unknown as NodeJS.WriteStream,
      err as unknown as NodeJS.WriteStream
    );
    expect(code).toBe(0);
    expect(out.toString()).toContain("\"verify complete\"");
    await rm(dir, { recursive: true, force: true });
  });

  it("returns non-zero exit code when verify finds missing artifacts", async () => {
    const dir = await mkdtemp(join(tmpdir(), "eep-index-missing-"));
    const out = new MemoryStream();
    const err = new MemoryStream();
    const code = await runCli(
      ["node", "cli", "verify", "--output", dir, "--report-json", join(dir, "report.json"), "--report-md", join(dir, "report.md")],
      out as unknown as NodeJS.WriteStream,
      err as unknown as NodeJS.WriteStream
    );
    expect(code).toBe(2);
    expect(out.toString()).toContain("\"verify failed\"");
    await rm(dir, { recursive: true, force: true });
  });
});
