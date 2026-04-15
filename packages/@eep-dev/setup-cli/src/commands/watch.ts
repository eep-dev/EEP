import type { CommandContext, CommandResult } from "./types.js";
import { hasFlag } from "../utils/args.js";
import { runApply } from "./apply.js";

export async function runWatch(context: CommandContext): Promise<CommandResult> {
  const once = hasFlag(context.argv, "--once");
  const dryRun = hasFlag(context.argv, "--dry-run");
  const applyResult = await runApply(context);
  const watch_mode = once ? (dryRun ? "once-dry-run" : "once-apply") : dryRun ? "dry-run" : "apply";
  return {
    ok: applyResult.ok,
    message: "watch cycle complete",
    details: {
      watch_mode,
      apply_result: applyResult.details
    }
  };
}
