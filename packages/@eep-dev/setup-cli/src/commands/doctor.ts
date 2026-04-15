import type { CommandContext, CommandResult } from "./types.js";
import { runVerify } from "./verify.js";

export async function runDoctor(context: CommandContext): Promise<CommandResult> {
  const verifyResult = await runVerify(context);
  /* c8 ignore next */
  const missing = (verifyResult.details?.missing as string[] | undefined) ?? [];
  const recommendations = missing.map((item) => `Generate missing artifact: ${item}`);
  return {
    ok: verifyResult.ok,
    message: verifyResult.ok ? "doctor found no issues" : "doctor found issues",
    details: {
      ...verifyResult.details,
      recommendations
    }
  };
}
