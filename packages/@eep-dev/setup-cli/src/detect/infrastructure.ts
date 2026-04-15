import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ProjectProfile } from "../types/detect.js";

function parsePackageNames(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    return [...Object.keys(parsed.dependencies ?? {}), ...Object.keys(parsed.devDependencies ?? {})];
  } catch {
    return [];
  }
}

function detectAuth(packages: string[], text: string): ProjectProfile["existingAuth"] {
  if (packages.includes("jsonwebtoken") || text.includes("jwt")) return "jwt";
  if (packages.includes("passport") || text.includes("oauth")) return "oauth";
  if (packages.includes("express-api-key-auth") || text.includes("api_key")) return "api-key";
  return null;
}

function detectDB(packages: string[], text: string): ProjectProfile["existingDB"] {
  if (packages.includes("pg") || packages.includes("postgres") || text.includes("postgres")) return "postgres";
  if (packages.includes("mysql2") || text.includes("mysql")) return "mysql";
  if (packages.includes("mongodb") || text.includes("mongo")) return "mongodb";
  if (packages.includes("sqlite3") || text.includes("sqlite")) return "sqlite";
  return null;
}

function detectEventBus(packages: string[], text: string): ProjectProfile["existingEventBus"] {
  if (packages.includes("ioredis") || text.includes("redis")) return "redis";
  if (packages.includes("kafkajs") || text.includes("kafka")) return "kafka";
  if (packages.includes("amqplib") || text.includes("rabbitmq")) return "rabbitmq";
  return null;
}

function detectPorts(text: string): number[] {
  const matches = [...text.matchAll(/\b(?:port|PORT)\D{0,5}(\d{2,5})\b/g)];
  const values = matches.map((match) => Number(match[1])).filter((value) => Number.isFinite(value));
  return Array.from(new Set(values)).sort((a, b) => a - b);
}

export async function detectInfrastructure(projectPath: string): Promise<{
  existingAuth: ProjectProfile["existingAuth"];
  existingDB: ProjectProfile["existingDB"];
  existingEventBus: ProjectProfile["existingEventBus"];
  existingPorts: number[];
}> {
  let packageNames: string[] = [];
  let aggregateText = "";

  try {
    const packageRaw = await readFile(join(projectPath, "package.json"), "utf8");
    packageNames = parsePackageNames(packageRaw);
    aggregateText += packageRaw;
  } catch {
    // no-op
  }

  for (const filename of ["pyproject.toml", ".env", "docker-compose.yml", "compose.yml"]) {
    try {
      aggregateText += `\n${await readFile(join(projectPath, filename), "utf8")}`;
    } catch {
      // no-op
    }
  }

  return {
    existingAuth: detectAuth(packageNames, aggregateText),
    existingDB: detectDB(packageNames, aggregateText),
    existingEventBus: detectEventBus(packageNames, aggregateText),
    existingPorts: detectPorts(aggregateText)
  };
}
