#!/usr/bin/env node
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { exit, argv, stderr, stdout } from "node:process";
import { runApply, runInject, runVerify, applyFrameworkPatchers } from "@eep-dev/setup-cli";

type StepLog = { step: string; ok: boolean; details?: string };

function readToken(a: string[], name: string, short?: string): string | undefined {
  const i = a.indexOf(name);
  if (i >= 0 && a[i + 1] && !a[i + 1].startsWith("-")) {
    return a[i + 1];
  }
  if (short) {
    const j = a.indexOf(short);
    if (j >= 0 && a[j + 1] && !a[j + 1].startsWith("-")) {
      return a[j + 1];
    }
  }
  return undefined;
}

function hasFlag(a: string[], name: string): boolean {
  return a.includes(name);
}

function runComplianceNpx(
  projectPath: string,
  target: string,
  apiKey?: string,
  entity?: string
): Promise<{ ok: boolean; message: string }> {
  return new Promise((resolveP) => {
    const npxArgs = [
      "@eep-dev/compliance-cli",
      "--target",
      target,
      "--report-md",
      join(projectPath, "eep-compliance-staging.md")
    ];
    if (apiKey) npxArgs.push("--api-key", apiKey);
    if (entity) npxArgs.push("--entity", entity);
    const child = spawn("npx", npxArgs, {
      cwd: projectPath,
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32"
    });
    let combined = "";
    child.stdout?.on("data", (d) => {
      combined += d.toString();
    });
    child.stderr?.on("data", (d) => {
      combined += d.toString();
    });
    child.on("close", (code) => {
      resolveP({ ok: code === 0, message: combined.slice(0, 4000) });
    });
  });
}

async function writeReport(
  path: string,
  projectPath: string,
  steps: StepLog[],
  extra: { patchNotes: { express: string[]; fastapi: string[] }; complianceNote?: string }
): Promise<void> {
  const lines = [
    "# EEP adoption report",
    "",
    `**Project:** \`${projectPath}\``,
    `**Generated:** ${new Date().toISOString()}`,
    "",
    "## Steps",
    "",
    ...steps.map((s) => `- **${s.step}** — ${s.ok ? "ok" : "failed"}: ${(s.details ?? "").slice(0, 200)}`),
    "",
    "## Framework patch notes",
    "",
    "- Express:",
    ...extra.patchNotes.express.map((x) => `  - ${x}`),
    "- FastAPI:",
    ...extra.patchNotes.fastapi.map((x) => `  - ${x}`),
    "",
    "## Live compliance (optional)",
    "",
    extra.complianceNote ?? "n/a",
    "",
    "## Next",
    "",
    "- Add runtime deps: Node apps need `@eep-dev/middleware` and `@eep-dev/gates`; Python needs `eep-middleware-python` (path or install).",
    "- Follow the EEP guide `docs/guides/integrate-eep-after-setup-cli.md` in the EEP repo for production hardening."
  ];
  await writeFile(path, lines.join("\n"), "utf8");
}

export async function runAgentAdopt(): Promise<number> {
  const a = argv;
  const project = resolve(readToken(a, "--project", "-p") ?? ".");
  const outConfig = readToken(a, "--config") ?? join(project, "eep-setup.json");
  const outGen = readToken(a, "--output") ?? join(project, "eep-generated");
  const noPatch = hasFlag(a, "--no-patch");
  const noCompliance = hasFlag(a, "--no-compliance");
  const compTarget = readToken(a, "--compliance-target");
  const compKey = readToken(a, "--compliance-api-key");
  const compEntity = readToken(a, "--compliance-entity");
  const reportPath = readToken(a, "--report") ?? join(project, "EEP_ADOPTION_REPORT.md");
  const answerFile = readToken(a, "--answers");
  const extraInject = [
    ...(answerFile ? ["--answers", answerFile] : []),
    ...(hasFlag(a, "--interactive") ? ["--interactive"] : []),
    ...(hasFlag(a, "--ci") || process.env.EEP_SETUP_CI === "1" ? [] : [])
  ];
  if (hasFlag(a, "--help") || hasFlag(a, "-h")) {
    stderr.write(`Usage: eep-adopt [options]
  --project, -p <dir>   Target app (default: cwd)
  --config <file>        eep-setup.json path (default: <project>/eep-setup.json)
  --output <dir>         eep-generated (default: <project>/eep-generated)
  --answers <file>      Answers for non-interactive inject
  --no-patch            Skip Express/FastAPI best-effort patch
  --no-compliance       Skip live compliance even if --compliance-target set
  --compliance-target <url>   Run npx @eep-dev/compliance-cli (Node 22+ for CLI)
  --compliance-api-key <key>  API key for compliance
  --compliance-entity <path>  e.g. u/example
  --report <file>        Write this report (default: EEP_ADOPTION_REPORT.md)
`);
    return 0;
  }

  const steps: StepLog[] = [];
  const log = (s: string) => stderr.write(`[eep-adopt] ${s}\n`);

  const injectArgv = [process.execPath, "noop", "inject", "--project", project, "--out", outConfig, ...extraInject].slice(
    1
  );
  const r1 = await runInject({ argv: injectArgv, cwd: project, stdout, stderr });
  steps.push({ step: "setup-cli inject", ok: r1.ok, details: r1.message });
  if (!r1.ok) {
    await writeReport(reportPath, project, steps, { patchNotes: { express: [], fastapi: [] } });
    return 2;
  }

  const applyArgv = [process.execPath, "noop", "apply", "--config", outConfig, "--output", outGen].slice(1);
  const r2 = await runApply({ argv: applyArgv, cwd: project, stdout, stderr });
  steps.push({ step: "setup-cli apply", ok: r2.ok, details: r2.message });
  if (!r2.ok) {
    await writeReport(reportPath, project, steps, { patchNotes: { express: [], fastapi: [] } });
    return 2;
  }

  const patchNotes = { express: [] as string[], fastapi: [] as string[] };
  if (!noPatch) {
    const w = (s: string) => {
      stdout.write(s);
    };
    const e = (s: string) => {
      stderr.write(s);
    };
    const patches = await applyFrameworkPatchers(project, { write: w, writeErr: e });
    patchNotes.express = patches.express;
    patchNotes.fastapi = patches.fastapi;
    steps.push({ step: "framework patch (best-effort)", ok: true, details: "see report" });
  }

  const verifyArgv = [process.execPath, "noop", "verify", "--output", outGen, "--report-md", join(outGen, "setup-report.md")].slice(
    1
  );
  const r3 = await runVerify({ argv: verifyArgv, cwd: project, stdout, stderr });
  steps.push({ step: "setup-cli verify", ok: r3.ok, details: r3.message });
  if (!r3.ok) {
    await writeReport(reportPath, project, steps, { patchNotes });
    return 2;
  }

  let complianceNote = "skipped (no --compliance-target or --no-compliance)";
  if (compTarget && !noCompliance) {
    log("Running npx @eep-dev/compliance-cli (Node 22+ recommended for the compliance package)…");
    const c = await runComplianceNpx(project, compTarget, compKey, compEntity);
    steps.push({ step: "compliance-cli (live target)", ok: c.ok, details: c.message.slice(0, 200) });
    complianceNote = c.ok ? "pass (see eep-compliance-staging.md)" : `output: ${c.message.slice(0, 500)}`;
  }

  await writeReport(reportPath, project, steps, { patchNotes, complianceNote });
  log(`Wrote ${reportPath}`);
  return 0;
}

const here = fileURLToPath(import.meta.url);
if (process.argv[1] && realpathSync(here) === realpathSync(process.argv[1])) {
  runAgentAdopt()
    .then((code) => exit(code))
    .catch((e) => {
      stderr.write(String(e) + "\n");
      exit(1);
    });
}
