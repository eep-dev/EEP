import type { CommandContext, CommandResult } from "./types.js";
import { detectProject } from "../detect/detector.js";
import { runPromptEngine } from "../prompts/prompt-engine.js";
import { hasFlag, readFlag } from "../utils/args.js";
import { writeJson } from "../utils/files.js";
import { join } from "node:path";

export async function runInject(context: CommandContext): Promise<CommandResult> {
  context.stdout.write("Running inject scaffold...\n");
  const projectFlagIndex = context.argv.indexOf("--project");
  const projectPath = projectFlagIndex >= 0 ? context.argv[projectFlagIndex + 1] ?? context.cwd : context.cwd;
  const preset = readFlag(context.argv, "--preset") ?? readFlag(context.argv, "--template") ?? undefined;
  const answersPath = readFlag(context.argv, "--answers") ?? undefined;
  const outFile = readFlag(context.argv, "--out") ?? join(projectPath, "eep-setup.json");
  const interactive = hasFlag(context.argv, "--interactive");
  const profile = await detectProject(projectPath);
  const { config, debug } = await runPromptEngine({
    mode: "inject",
    preset,
    answersPath,
    projectPath,
    interactive
  });
  await writeJson(outFile, config);
  context.stdout.write(`Wrote setup config: ${outFile}\n`);
  return {
    ok: true,
    message: "inject scaffold ready",
    details: {
      mode: "inject",
      project_path: projectPath,
      output_file: outFile,
      detected_profile: profile,
      debug,
      next_step: "Implement framework-specific middleware injection patches"
    }
  };
}
