import { access } from "node:fs/promises";
import { join } from "node:path";
import type { DetectedLanguage, ProjectProfile } from "../types/detect.js";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function detectLanguage(projectPath: string): Promise<DetectedLanguage> {
  if (await exists(join(projectPath, "package.json"))) {
    if (await exists(join(projectPath, "tsconfig.json"))) {
      return "typescript";
    }
    return "javascript";
  }
  if ((await exists(join(projectPath, "pyproject.toml"))) || (await exists(join(projectPath, "requirements.txt")))) {
    return "python";
  }
  if (await exists(join(projectPath, "go.mod"))) {
    return "go";
  }
  if ((await exists(join(projectPath, "pom.xml"))) || (await exists(join(projectPath, "build.gradle")))) {
    return "java";
  }
  if (await exists(join(projectPath, "Cargo.toml"))) {
    return "rust";
  }
  return "other";
}

export function defaultProfile(language: DetectedLanguage): ProjectProfile {
  const packageManager = language === "typescript" || language === "javascript"
    ? "npm"
    : language === "python"
      ? "pip"
      : language === "go"
        ? "go-mod"
        : language === "java"
          ? "maven"
          : language === "rust"
            ? "cargo"
            : null;

  return {
    language,
    framework: null,
    packageManager,
    entryPoint: null,
    existingAuth: null,
    existingDB: null,
    existingEventBus: null,
    existingPorts: []
  };
}
