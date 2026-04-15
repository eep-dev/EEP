import type { CommandContext, CommandResult } from "./types.js";
import { readFlag } from "../utils/args.js";
import { join } from "node:path";
import { access } from "node:fs/promises";
import { writeText } from "../utils/files.js";

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function runVerify(context: CommandContext): Promise<CommandResult> {
  const outputDir = readFlag(context.argv, "--output") ?? join(context.cwd, "eep-generated");
  const reportJsonPath = readFlag(context.argv, "--report-json") ?? join(outputDir, "setup-report.json");
  const reportMdPath = readFlag(context.argv, "--report-md") ?? join(outputDir, "setup-report.md");
  const expectedFiles = [
    ".well-known/eep.json",
    "gate-config.json",
    "service-catalog.json",
    "openapi-eep.json",
    "adapter-config.json"
  ];
  const checks: Array<{ file: string; exists: boolean }> = [];
  for (const file of expectedFiles) {
    checks.push({
      file,
      exists: await fileExists(join(outputDir, file))
    });
  }
  const missing = checks.filter((item) => !item.exists).map((item) => item.file);
  const ok = missing.length === 0;
  const report = {
    ok,
    output_dir: outputDir,
    checks,
    score_100: ok ? 100 : Math.max(0, 100 - missing.length * 20)
  };
  await writeText(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await writeText(
    reportMdPath,
    [
      "# Setup Verification Report",
      "",
      `- Status: ${ok ? "PASS" : "FAIL"}`,
      `- Score: ${report.score_100}/100`,
      "",
      "## Checks",
      ...checks.map((item) => `- ${item.exists ? "PASS" : "FAIL"} ${item.file}`)
    ].join("\n")
  );

  return {
    ok,
    message: ok ? "verify complete" : "verify failed",
    details: {
      output_dir: outputDir,
      missing,
      report_json: reportJsonPath,
      report_md: reportMdPath
    }
  };
}
