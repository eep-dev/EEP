#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { cwd, exit } from "node:process";
import { fileURLToPath } from "node:url";
import { runApply } from "./commands/apply.js";
import { runDoctor } from "./commands/doctor.js";
import { runInit } from "./commands/init.js";
import { runInject } from "./commands/inject.js";
import { runRotateSecrets } from "./commands/rotate-secrets.js";
import { runStatus } from "./commands/status.js";
import type { CommandContext, CommandResult } from "./commands/types.js";
import { runUpgrade } from "./commands/upgrade.js";
import { runVerify } from "./commands/verify.js";
import { runWatch } from "./commands/watch.js";

export { runInject } from "./commands/inject.js";
export { runApply } from "./commands/apply.js";
export { runVerify } from "./commands/verify.js";
export { applyFrameworkPatchers } from "./inject/patchers/index.js";

export type CommandName =
  | "init"
  | "inject"
  | "apply"
  | "verify"
  | "doctor"
  | "upgrade"
  | "watch"
  | "status"
  | "rotate-secrets";

type CommandHandler = (context: CommandContext) => Promise<CommandResult>;

const COMMANDS: Record<CommandName, CommandHandler> = {
  init: runInit,
  inject: runInject,
  apply: runApply,
  verify: runVerify,
  doctor: runDoctor,
  upgrade: runUpgrade,
  watch: runWatch,
  status: runStatus,
  "rotate-secrets": runRotateSecrets
};

export function parseCommand(argv: string[]): CommandName | null {
  const candidate = argv[2];
  if (!candidate) {
    return null;
  }
  return candidate in COMMANDS ? (candidate as CommandName) : null;
}

export function helpText(): string {
  return [
    "Usage: eep-setup <command> [options]",
    "",
    "Commands:",
    "  init            Create a new EEP setup config (--preset or --template, optional --interactive)",
    "  inject          Inject EEP into an existing project (optional --interactive)",
    "  apply           Generate and write EEP artifacts (--dry-run to preview; --production validates identity)",
    "  verify          Verify generated or live deployment artifacts",
    "  doctor          Diagnose existing setup and report issues",
    "  upgrade         Upgrade setup schema and regenerate artifacts",
    "  watch           Watch config and regenerate changed artifacts",
    "  status          Show deployment health and readiness",
    "  rotate-secrets  Rotate webhook/HMAC secrets safely"
  ].join("\n");
}

export async function runCli(argv: string[], out = process.stdout, err = process.stderr): Promise<number> {
  const commandName = parseCommand(argv);
  if (!commandName) {
    err.write(`${helpText()}\n`);
    return 1;
  }

  const result = await COMMANDS[commandName]({
    argv,
    cwd: cwd(),
    stdout: out,
    stderr: err
  });

  const serialized = JSON.stringify(result);
  out.write(`${serialized}\n`);
  return result.ok ? 0 : 2;
}

/* c8 ignore start */
const isMainModule =
  Boolean(process.argv[1]) && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]!);
if (isMainModule) {
  runCli(process.argv).then((code) => exit(code));
}
/* c8 ignore stop */
