import type { CommandContext, CommandResult } from "./types.js";
import { join } from "node:path";
import { runPromptEngine } from "../prompts/prompt-engine.js";
import { hasFlag, readFlag } from "../utils/args.js";
import { writeJson } from "../utils/files.js";

export async function runInit(context: CommandContext): Promise<CommandResult> {
  context.stdout.write("Running init wizard scaffold...\n");
  const preset = readFlag(context.argv, "--preset") ?? readFlag(context.argv, "--template") ?? undefined;
  const answersPath = readFlag(context.argv, "--answers") ?? undefined;
  const outFile = readFlag(context.argv, "--out") ?? join(context.cwd, "eep-setup.json");
  const interactive = hasFlag(context.argv, "--interactive");
  const { config, debug } = await runPromptEngine({
    mode: "init",
    preset,
    answersPath,
    interactive
  });
  await writeJson(outFile, config);
  context.stdout.write(`Wrote setup config: ${outFile}\n`);
  return {
    ok: true,
    message: "init scaffold ready",
    details: {
      mode: "init",
      output_file: outFile,
      debug,
      next_step: interactive ? "Review eep-setup.json and run apply" : "Use --interactive for TTY identity prompts, or --answers for CI"
    }
  };
}
