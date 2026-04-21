import { readFile, writeFile, access } from "node:fs/promises";
import { join } from "node:path";

const MARKER = "// EEP_AUTOGEN_START";
const END_MARKER = "// EEP_AUTOGEN_END";

function hasExpress(packageJson: string): boolean {
  try {
    const p = JSON.parse(packageJson) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    return Boolean(p.dependencies?.express || p.devDependencies?.express);
  } catch {
    return false;
  }
}

/**
 * Best-effort: adds a generated wiring module and a marked block in the entry file before `app.listen`.
 * Idempotent: skips if EEP markers already present.
 */
export async function tryPatchExpress(
  projectPath: string,
  out: { write: (s: string) => void; writeErr: (s: string) => void }
): Promise<string[]> {
  const notes: string[] = [];
  let packageRaw: string;
  try {
    packageRaw = await readFile(join(projectPath, "package.json"), "utf8");
  } catch {
    return ["skip: no package.json (not a Node project)"];
  }
  if (!hasExpress(packageRaw)) {
    return ["skip: express not in package.json"];
  }

  const entryCandidates = ["src/index.ts", "src/main.ts", "src/server.ts", "index.ts", "src/index.js", "index.js"];
  let entry: string | null = null;
  for (const rel of entryCandidates) {
    try {
      await access(join(projectPath, rel));
      entry = rel;
      break;
    } catch {
      // try next
    }
  }
  if (!entry) {
    return ["skip: no common Express entry (src/index.ts, src/server.ts, …) found"];
  }

  const entryPath = join(projectPath, entry);
  const entryDir = join(
    projectPath,
    entry.includes("/") ? (entry.split("/").slice(0, -1).join("/") as string) : "."
  );
  const wiringName = "eep.express.wiring.ts";
  const wiringPath = join(entryDir, wiringName);
  const importPath = entry.includes("/") ? `./${wiringName}` : `./${wiringName}`;
  const importPathJs = importPath.replace(/\.ts$/, ".js");

  let mainSource: string;
  try {
    mainSource = await readFile(entryPath, "utf8");
  } catch (e) {
    out.writeErr(String(e));
    return ["skip: could not read entry file"];
  }

  if (mainSource.includes("registerEepHttpRoutes") && mainSource.includes(MARKER)) {
    return ["ok: express entry already contains EEP wiring"];
  }

  const cleanWiring = `/**
 * EEP Express wiring (generated). Add deps: @eep-dev/middleware @eep-dev/gates
 * Docs: EEP/docs/guides/integrate-eep-after-setup-cli.md
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Application, Request, Response } from "express";
import { createEEPRouter } from "@eep-dev/middleware";
import { parseGateConfig } from "@eep-dev/gates";

type Method = "get" | "post" | "put" | "delete" | "patch" | "options" | "head";

export function registerEepHttpRoutes(app: Application, projectRoot: string): void {
  const gatePath = join(projectRoot, "eep-generated", "gate-config.json");
  const baseUrl = process.env.EEP_BASE_URL ?? "http://127.0.0.1:3000";
  const did = process.env.EEP_DID ?? "did:web:example.com";
  const gateConfig = existsSync(gatePath)
    ? parseGateConfig(JSON.parse(readFileSync(gatePath, "utf8")) as Record<string, unknown>)
    : undefined;
  const { routes } = createEEPRouter({ baseUrl, did, gateConfig });
  for (const route of routes) {
    const m = route.method as Method;
    app[m](route.path, async (req: Request, res: Response) => {
      const rOut = await route.execute({
        method: req.method,
        path: req.path,
        headers: req.headers as Record<string, string>,
        query: req.query as Record<string, string>,
        params: req.params as Record<string, string>,
        body: req.body
      });
      res.status(rOut.status);
      for (const [k, v] of Object.entries(rOut.headers ?? {})) {
        res.setHeader(k, v as string);
      }
      if (rOut.body === undefined || rOut.body === null) {
        res.end();
      } else if (typeof rOut.body === "string" || Buffer.isBuffer(rOut.body)) {
        res.send(rOut.body);
      } else {
        res.json(rOut.body);
      }
    });
  }
}
`;
  await writeFile(wiringPath, cleanWiring, "utf8");
  notes.push(`wrote ${wiringPath}`);

  const importLine = `import { registerEepHttpRoutes } from "${importPathJs}";\n`;
  const block = `\n${MARKER}\nregisterEepHttpRoutes(app, process.cwd());\n${END_MARKER}\n`;

  let updated = mainSource;
  if (!updated.includes("registerEepHttpRoutes")) {
    updated = importLine + updated;
  }
  if (!updated.includes(MARKER)) {
    const listenIdx = updated.indexOf("app.listen");
    const at = listenIdx >= 0 ? listenIdx : updated.length;
    updated = updated.slice(0, at) + block + updated.slice(at);
  }
  await writeFile(entryPath, updated, "utf8");
  notes.push(`patched ${entry}`);

  return notes;
}
