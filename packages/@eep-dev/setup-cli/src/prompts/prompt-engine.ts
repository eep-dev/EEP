import { readFile } from "node:fs/promises";
import { detectProject } from "../detect/detector.js";
import { promptIdentityOverrides } from "./interactive.js";
import { getPresetConfig, listPresets } from "./presets.js";
import type { EEPSetupConfig } from "../types/config.js";

export type PromptEngineOptions = {
  mode: "init" | "inject";
  preset?: string;
  answersPath?: string;
  projectPath?: string;
  /** When true, prompt for identity fields on a TTY (skipped in CI / non-TTY). */
  interactive?: boolean;
};

function deepMerge<T>(target: T, source: Partial<T>): T {
  if (typeof source !== "object" || source === null) {
    return target;
  }
  const output: Record<string, unknown> = { ...(target as Record<string, unknown>) };
  for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      output[key] = value;
    } else if (typeof value === "object" && value !== null) {
      output[key] = deepMerge((output[key] as Record<string, unknown>) ?? {}, value as Record<string, unknown>);
    } else {
      output[key] = value;
    }
  }
  return output as T;
}

async function readAnswers(path?: string): Promise<Partial<EEPSetupConfig>> {
  if (!path) {
    return {};
  }
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw) as Partial<EEPSetupConfig>;
}

export async function runPromptEngine(options: PromptEngineOptions): Promise<{
  config: EEPSetupConfig;
  debug: Record<string, unknown>;
}> {
  const presetName = options.preset && listPresets().includes(options.preset as never)
    ? (options.preset as ReturnType<typeof listPresets>[number])
    : "saas";
  let config = getPresetConfig(presetName);
  config.mode = options.mode;

  if (options.mode === "inject") {
    const profile = await detectProject(options.projectPath ?? process.cwd());
    config.adapters.framework.type = profile.framework ?? "custom";
    config.conformance.runtime = profile.language === "python" ? "python" : profile.language === "typescript" || profile.language === "javascript" ? "node" : "other";
    config.adapters.auth.type = profile.existingAuth === "oauth"
      ? "oauth_scopes"
      : profile.existingAuth === "api-key"
        ? "api_key_lookup"
        : "jwt_claims";
    config.adapters.database.type = profile.existingDB ?? "postgres";
    config.adapters.event_bus.type = profile.existingEventBus ?? "redis";
  }

  if (options.interactive) {
    const interactivePartial = await promptIdentityOverrides();
    config = deepMerge(config, interactivePartial);
  }

  const answers = await readAnswers(options.answersPath);
  config = deepMerge(config, answers);

  return {
    config,
    debug: {
      preset: presetName,
      mode: options.mode,
      answers_path: options.answersPath ?? null
    }
  };
}
