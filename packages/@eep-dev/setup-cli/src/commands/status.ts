import type { CommandContext, CommandResult } from "./types.js";
import { runVerify } from "./verify.js";

export async function runStatus(context: CommandContext): Promise<CommandResult> {
  const verifyResult = await runVerify(context);
  /* c8 ignore next */
  const missing = (verifyResult.details?.missing as string[] | undefined) ?? [];
  const dashboard = {
    manifest: !missing.includes(".well-known/eep.json"),
    gates: !missing.includes("gate-config.json"),
    services: !missing.includes("service-catalog.json"),
    openapi: !missing.includes("openapi-eep.json"),
    adapters: !missing.includes("adapter-config.json")
  };
  return {
    ok: verifyResult.ok,
    message: verifyResult.ok ? "status healthy" : "status degraded",
    details: {
      dashboard,
      verify: verifyResult.details
    }
  };
}
