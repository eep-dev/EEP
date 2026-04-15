import type { CommandContext, CommandResult } from "./types.js";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { readFlag } from "../utils/args.js";
import { writeText } from "../utils/files.js";

function parseEnv(raw: string): Record<string, string> {
  const output: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }
    const [key, ...rest] = trimmed.split("=");
    output[key] = rest.join("=");
  }
  return output;
}

function serializeEnv(env: Record<string, string>): string {
  return `${Object.entries(env).map(([key, value]) => `${key}=${value}`).join("\n")}\n`;
}

export async function runRotateSecrets(context: CommandContext): Promise<CommandResult> {
  const envPath = readFlag(context.argv, "--env") ?? join(context.cwd, ".env");
  let env: Record<string, string> = {};
  try {
    env = parseEnv(await readFile(envPath, "utf8"));
  } catch {
    env = {};
  }

  const previous = env.EEP_WEBHOOK_SECRET ?? "";
  const next = randomBytes(32).toString("hex");
  env.EEP_WEBHOOK_SECRET = next;
  if (previous) {
    env.EEP_WEBHOOK_SECRET_PREVIOUS = previous;
  }
  env.EEP_SECRET_ROTATION_AT = new Date().toISOString();
  await writeText(envPath, serializeEnv(env));

  return {
    ok: true,
    message: "rotate-secrets complete",
    details: {
      env_path: envPath,
      has_previous_secret: Boolean(previous),
      active_secret_length: next.length
    }
  };
}
