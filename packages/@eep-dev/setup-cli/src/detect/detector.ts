import { access } from "node:fs/promises";
import { join } from "node:path";
import { detectFramework } from "./frameworks.js";
import { defaultProfile, detectLanguage } from "./languages.js";
import { detectInfrastructure } from "./infrastructure.js";
import type { ProjectProfile } from "../types/detect.js";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function detectEntryPoint(projectPath: string, language: ProjectProfile["language"]): Promise<string | null> {
  const candidatesByLanguage: Record<ProjectProfile["language"], string[]> = {
    typescript: ["src/index.ts", "src/main.ts", "index.ts"],
    javascript: ["src/index.js", "src/main.js", "index.js"],
    python: ["app.py", "main.py"],
    go: ["main.go"],
    java: ["src/main/java/Application.java"],
    rust: ["src/main.rs"],
    other: []
  };

  for (const candidate of candidatesByLanguage[language]) {
    if (await exists(join(projectPath, candidate))) {
      return candidate;
    }
  }
  return null;
}

async function detectPackageManager(projectPath: string, language: ProjectProfile["language"]): Promise<ProjectProfile["packageManager"]> {
  if (language === "typescript" || language === "javascript") {
    if (await exists(join(projectPath, "pnpm-lock.yaml"))) return "pnpm";
    if (await exists(join(projectPath, "yarn.lock"))) return "yarn";
    return "npm";
  }
  if (language === "python") {
    if (await exists(join(projectPath, "poetry.lock"))) return "poetry";
    return "pip";
  }
  if (language === "go") return "go-mod";
  if (language === "rust") return "cargo";
  if (language === "java") {
    if (await exists(join(projectPath, "build.gradle"))) return "gradle";
    return "maven";
  }
  return null;
}

export async function detectProject(projectPath: string): Promise<ProjectProfile> {
  const language = await detectLanguage(projectPath);
  const base = defaultProfile(language);
  const [framework, infra, entryPoint, packageManager] = await Promise.all([
    detectFramework(projectPath),
    detectInfrastructure(projectPath),
    detectEntryPoint(projectPath, language),
    detectPackageManager(projectPath, language)
  ]);

  return {
    ...base,
    framework,
    packageManager,
    entryPoint,
    existingAuth: infra.existingAuth,
    existingDB: infra.existingDB,
    existingEventBus: infra.existingEventBus,
    existingPorts: infra.existingPorts
  };
}

export async function detectProjectFromAnswers(pathOrAnswers: string | { project_path?: string }): Promise<ProjectProfile> {
  if (typeof pathOrAnswers === "string") {
    return detectProject(pathOrAnswers);
  }
  const projectPath = pathOrAnswers.project_path ?? process.cwd();
  return detectProject(projectPath);
}
