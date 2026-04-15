import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { detectProject, detectProjectFromAnswers } from "./detector.js";
import { defaultProfile, detectLanguage } from "./languages.js";
import { detectFramework } from "./frameworks.js";
import { detectInfrastructure } from "./infrastructure.js";

const tempDirs: string[] = [];

async function makeTempProject(name: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), `eep-setup-${name}-`));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

describe("project detection", () => {
  it("detects TypeScript node projects and infra metadata", async () => {
    const project = await makeTempProject("ts");
    await writeFile(
      join(project, "package.json"),
      JSON.stringify({
        dependencies: {
          express: "^1.0.0",
          jsonwebtoken: "^1.0.0",
          pg: "^1.0.0",
          ioredis: "^1.0.0"
        }
      })
    );
    await writeFile(join(project, "tsconfig.json"), "{}");
    await mkdir(join(project, "src"), { recursive: true });
    await writeFile(join(project, "src/index.ts"), "export {}");
    await writeFile(join(project, ".env"), "PORT=3001\n");

    expect(await detectLanguage(project)).toBe("typescript");
    expect(await detectFramework(project)).toBe("express");
    expect(await detectInfrastructure(project)).toEqual({
      existingAuth: "jwt",
      existingDB: "postgres",
      existingEventBus: "redis",
      existingPorts: [3001]
    });

    const profile = await detectProject(project);
    expect(profile.entryPoint).toBe("src/index.ts");
    expect(profile.packageManager).toBe("npm");
    expect(profile.framework).toBe("express");
  });

  it("detects python projects and unknown fallback paths", async () => {
    const project = await makeTempProject("py");
    await writeFile(join(project, "pyproject.toml"), "[project]\ndependencies=[\"fastapi\"]\n");
    await writeFile(join(project, "main.py"), "print('x')");
    await writeFile(join(project, "compose.yml"), "ports:\n  - \"8080:8080\"\n");

    const profile = await detectProjectFromAnswers({ project_path: project });
    expect(profile.language).toBe("python");
    expect(profile.framework).toBe("fastapi");
    expect(profile.packageManager).toBe("pip");
    expect(profile.existingPorts).toEqual([]);
  });

  it("detects go/rust/java and defaults to other", async () => {
    const goProject = await makeTempProject("go");
    await writeFile(join(goProject, "go.mod"), "module x\nrequire github.com/gin-gonic/gin v1.0.0\n");
    await writeFile(join(goProject, "main.go"), "package main");
    expect((await detectProject(goProject)).framework).toBe("gin");

    const goEchoProject = await makeTempProject("go-echo");
    await writeFile(join(goEchoProject, "go.mod"), "module x\nrequire github.com/labstack/echo/v4 v4.0.0\n");
    await writeFile(join(goEchoProject, "main.go"), "package main");
    expect((await detectProject(goEchoProject)).framework).toBe("echo");

    const rustProject = await makeTempProject("rust");
    await writeFile(join(rustProject, "Cargo.toml"), "[dependencies]\naxum = \"0.7\"\n");
    await mkdir(join(rustProject, "src"), { recursive: true });
    await writeFile(join(rustProject, "src/main.rs"), "fn main() {}");
    expect((await detectProject(rustProject)).framework).toBe("axum");

    const rustActixProject = await makeTempProject("rust-actix");
    await writeFile(join(rustActixProject, "Cargo.toml"), "[dependencies]\nactix-web = \"4\"\n");
    await mkdir(join(rustActixProject, "src"), { recursive: true });
    await writeFile(join(rustActixProject, "src/main.rs"), "fn main() {}");
    expect((await detectProject(rustActixProject)).framework).toBe("actix-web");

    const javaProject = await makeTempProject("java");
    await writeFile(join(javaProject, "pom.xml"), "<artifactId>spring-boot-starter-web</artifactId>");
    expect((await detectProject(javaProject)).framework).toBe("spring-boot");

    const otherProject = await makeTempProject("other");
    const otherProfile = await detectProject(otherProject);
    expect(otherProfile.language).toBe("other");
    expect(defaultProfile("other").packageManager).toBeNull();
  });

  it("handles malformed package json and framework misses", async () => {
    const project = await makeTempProject("bad-json");
    await writeFile(join(project, "package.json"), "{bad json");
    const framework = await detectFramework(project);
    const infra = await detectInfrastructure(project);
    expect(framework).toBeNull();
    expect(infra.existingAuth).toBeNull();
    expect(await detectProjectFromAnswers(project)).toBeTruthy();
    expect(await detectProjectFromAnswers({})).toBeTruthy();
  });

  it("detects multiple framework variants and package manager branches", async () => {
    const frameworkCases: Array<{ dep: string; expected: string }> = [
      { dep: "fastify", expected: "fastify" },
      { dep: "hono", expected: "hono" },
      { dep: "koa", expected: "koa" },
      { dep: "@nestjs/core", expected: "nestjs" },
      { dep: "next", expected: "next" }
    ];
    for (const item of frameworkCases) {
      const project = await makeTempProject(`node-fw-${item.expected}`);
      await writeFile(join(project, "package.json"), JSON.stringify({ dependencies: { [item.dep]: "1.0.0" } }));
      const profile = await detectProject(project);
      expect(profile.framework).toBe(item.expected as typeof profile.framework);
    }

    const yarnProject = await makeTempProject("yarn");
    await writeFile(join(yarnProject, "package.json"), JSON.stringify({ dependencies: {} }));
    await writeFile(join(yarnProject, "yarn.lock"), "");
    expect((await detectProject(yarnProject)).packageManager).toBe("yarn");

    const pnpmProject = await makeTempProject("pnpm");
    await writeFile(join(pnpmProject, "package.json"), JSON.stringify({ dependencies: {} }));
    await writeFile(join(pnpmProject, "pnpm-lock.yaml"), "");
    expect((await detectProject(pnpmProject)).packageManager).toBe("pnpm");

    const poetryProject = await makeTempProject("poetry");
    await writeFile(join(poetryProject, "pyproject.toml"), "[project]\nname='x'\n");
    await writeFile(join(poetryProject, "poetry.lock"), "");
    expect((await detectProject(poetryProject)).packageManager).toBe("poetry");

    const gradleProject = await makeTempProject("gradle");
    await writeFile(join(gradleProject, "build.gradle"), "plugins { id 'java' }");
    expect((await detectProject(gradleProject)).packageManager).toBe("gradle");
  });

  it("detects python framework variants and infra flavors", async () => {
    const pyFrameworkCases = [
      { dep: "flask", expected: "flask" },
      { dep: "django", expected: "django" },
      { dep: "starlette", expected: "starlette" }
    ];
    for (const item of pyFrameworkCases) {
      const project = await makeTempProject(`py-fw-${item.expected}`);
      await writeFile(join(project, "pyproject.toml"), `[project]\ndependencies=["${item.dep}"]\n`);
      expect((await detectProject(project)).framework).toBe(item.expected);
    }

    const infraProject = await makeTempProject("infra");
    await writeFile(
      join(infraProject, "package.json"),
      JSON.stringify({
        dependencies: {
          passport: "1.0.0",
          mysql2: "1.0.0",
          kafkajs: "1.0.0"
        }
      })
    );
    await writeFile(join(infraProject, "compose.yml"), "APP_PORT: 8080\nAPI_PORT=9090\n");
    const infra = await detectInfrastructure(infraProject);
    expect(infra.existingAuth).toBe("oauth");
    expect(infra.existingDB).toBe("mysql");
    expect(infra.existingEventBus).toBe("kafka");

    const infraProject2 = await makeTempProject("infra-2");
    await writeFile(
      join(infraProject2, "package.json"),
      JSON.stringify({
        dependencies: {
          "express-api-key-auth": "1.0.0",
          mongodb: "1.0.0",
          amqplib: "1.0.0"
        }
      })
    );
    const infra2 = await detectInfrastructure(infraProject2);
    expect(infra2.existingAuth).toBe("api-key");
    expect(infra2.existingDB).toBe("mongodb");
    expect(infra2.existingEventBus).toBe("rabbitmq");

    const infraProject3 = await makeTempProject("infra-3");
    await writeFile(join(infraProject3, "package.json"), JSON.stringify({ dependencies: { sqlite3: "1.0.0" } }));
    const infra3 = await detectInfrastructure(infraProject3);
    expect(infra3.existingDB).toBe("sqlite");
  });
});
