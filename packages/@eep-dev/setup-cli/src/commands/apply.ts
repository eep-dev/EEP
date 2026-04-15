import type { CommandContext, CommandResult } from "./types.js";
import { join } from "node:path";
import { resolve } from "node:path";
import type { EEPSetupConfig } from "../types/config.js";
import { readFlag } from "../utils/args.js";
import { readJson } from "../utils/json.js";
import { generateArtifacts } from "../generators/artifacts.js";
import { writeText } from "../utils/files.js";
import { validateProductionIdentity } from "./validate-production.js";

export async function runApply(context: CommandContext): Promise<CommandResult> {
  const configPath = readFlag(context.argv, "--config") ?? join(context.cwd, "eep-setup.json");
  const outputDir = readFlag(context.argv, "--output") ?? join(context.cwd, "eep-generated");
  const dryRun = context.argv.includes("--dry-run");
  const production = context.argv.includes("--production");
  const allowUnsafePaths = context.argv.includes("--unsafe-paths");
  const resolvedOutput = resolve(outputDir);
  const resolvedCwd = resolve(context.cwd);

  if (!allowUnsafePaths && !resolvedOutput.startsWith(resolvedCwd)) {
    return {
      ok: false,
      message: "apply blocked unsafe output path",
      details: {
        output_dir: outputDir,
        cwd: context.cwd
      }
    };
  }

  const config = await readJson<EEPSetupConfig>(configPath);

  if (production) {
    const issues = validateProductionIdentity(config);
    if (issues.length > 0) {
      return {
        ok: false,
        message: "apply --production blocked: fix placeholder identity fields",
        details: {
          config_path: configPath,
          issues
        }
      };
    }
  }

  const artifacts = generateArtifacts(config);
  const files = Object.keys(artifacts).sort();

  if (dryRun) {
    context.stdout.write(`Dry-run: ${files.length} files would be generated\n`);
    return {
      ok: true,
      message: "apply dry-run complete",
      details: {
        mode: "dry-run",
        config_path: configPath,
        output_dir: outputDir,
        files
      }
    };
  }

  for (const [relativePath, content] of Object.entries(artifacts)) {
    await writeText(join(outputDir, relativePath), content);
  }
  context.stdout.write(`Applied ${files.length} artifacts to ${outputDir}\n`);

  return {
    ok: true,
    message: "apply complete",
    details: {
      mode: "apply",
      config_path: configPath,
      output_dir: outputDir,
      files
    }
  };
}
