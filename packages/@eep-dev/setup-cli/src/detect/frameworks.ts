import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { DetectedFramework } from "../types/detect.js";

function parsePackageNames(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    return [
      ...Object.keys(parsed.dependencies ?? {}),
      ...Object.keys(parsed.devDependencies ?? {})
    ];
  } catch {
    return [];
  }
}

function detectNodeFramework(packageNames: string[]): DetectedFramework {
  if (packageNames.includes("express")) return "express";
  if (packageNames.includes("fastify")) return "fastify";
  if (packageNames.includes("hono")) return "hono";
  if (packageNames.includes("koa")) return "koa";
  if (packageNames.includes("@nestjs/core")) return "nestjs";
  if (packageNames.includes("next")) return "next";
  return null;
}

function detectPythonFramework(pyprojectRaw: string): DetectedFramework {
  if (pyprojectRaw.includes("fastapi")) return "fastapi";
  if (pyprojectRaw.includes("flask")) return "flask";
  if (pyprojectRaw.includes("django")) return "django";
  if (pyprojectRaw.includes("starlette")) return "starlette";
  return null;
}

export async function detectFramework(projectPath: string): Promise<DetectedFramework> {
  try {
    const packageRaw = await readFile(join(projectPath, "package.json"), "utf8");
    const framework = detectNodeFramework(parsePackageNames(packageRaw));
    if (framework) {
      return framework;
    }
  } catch {
    // no-op
  }

  try {
    const pyprojectRaw = await readFile(join(projectPath, "pyproject.toml"), "utf8");
    const framework = detectPythonFramework(pyprojectRaw);
    if (framework) {
      return framework;
    }
  } catch {
    // no-op
  }

  try {
    const goRaw = await readFile(join(projectPath, "go.mod"), "utf8");
    if (goRaw.includes("github.com/gin-gonic/gin")) return "gin";
    if (goRaw.includes("github.com/labstack/echo")) return "echo";
  } catch {
    // no-op
  }

  try {
    const cargoRaw = await readFile(join(projectPath, "Cargo.toml"), "utf8");
    if (cargoRaw.includes("actix-web")) return "actix-web";
    if (cargoRaw.includes("axum")) return "axum";
  } catch {
    // no-op
  }

  try {
    const pomRaw = await readFile(join(projectPath, "pom.xml"), "utf8");
    if (pomRaw.includes("spring-boot")) return "spring-boot";
  } catch {
    // no-op
  }

  return null;
}
