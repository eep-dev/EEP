import type { CommandContext, CommandResult } from "./types.js";
import { join } from "node:path";
import { readFlag } from "../utils/args.js";
import type { EEPSetupConfig } from "../types/config.js";
import { readJson } from "../utils/json.js";
import { writeJson } from "../utils/files.js";

export async function runUpgrade(context: CommandContext): Promise<CommandResult> {
  const configPath = readFlag(context.argv, "--config") ?? join(context.cwd, "eep-setup.json");
  const toVersion = readFlag(context.argv, "--to-version") ?? "0.2";
  const config = await readJson<EEPSetupConfig>(configPath);
  config.setup_schema_version = toVersion;
  await writeJson(configPath, config);
  return {
    ok: true,
    message: "upgrade complete",
    details: {
      config_path: configPath,
      setup_schema_version: toVersion
    }
  };
}
