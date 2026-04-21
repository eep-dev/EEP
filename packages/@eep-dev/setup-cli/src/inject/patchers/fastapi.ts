import { readFile, writeFile, access } from "node:fs/promises";
import { join } from "node:path";

const MARK = "# EEP_AUTOGEN_START";
const END = "# EEP_AUTOGEN_END";

/**
 * Best-effort FastAPI: writes `eep_fastapi_wiring.py` at the **project root** (reliable import),
 * and inserts `register_eep_routes(app)` after `app = FastAPI(...)`.
 * Requires `eep-middleware-python`.
 */
export async function tryPatchFastapi(
  projectPath: string,
  out: { write: (s: string) => void; writeErr: (s: string) => void }
): Promise<string[]> {
  const notes: string[] = [];
  let py: string;
  try {
    py = await readFile(join(projectPath, "pyproject.toml"), "utf8");
  } catch {
    return ["skip: no pyproject.toml"];
  }
  if (!py.toLowerCase().includes("fastapi")) {
    return ["skip: fastapi not in pyproject.toml"];
  }

  const entryCandidates = ["app/main.py", "main.py", "src/main.py", "app.py"];
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
    return ["skip: no common FastAPI entry (app/main.py, main.py, …) found"];
  }

  const entryPath = join(projectPath, entry);
  let mainSource: string;
  try {
    mainSource = await readFile(entryPath, "utf8");
  } catch (e) {
    out.writeErr(String(e));
    return ["skip: could not read entry file"];
  }
  if (mainSource.includes(MARK) && mainSource.includes("register_eep_routes")) {
    return ["ok: FastAPI entry already contains EEP wiring"];
  }

  const modPath = join(projectPath, "eep_fastapi_wiring.py");
  const wiring = `"""EEP FastAPI wiring (generated). Dependency: eep-middleware-python."""
from __future__ import annotations

import json
import os
from pathlib import Path

from eep_middleware.core import EEPServer
from eep_middleware.fastapi import create_eep_router


def register_eep_routes(app) -> None:
    root = Path(os.environ.get("EEP_PROJECT_ROOT", os.getcwd()))
    gate_path = root / "eep-generated" / "gate-config.json"
    gate = json.loads(gate_path.read_text(encoding="utf-8")) if gate_path.exists() else None
    server = EEPServer(
        base_url=os.environ.get("EEP_BASE_URL", "http://127.0.0.1:8000"),
        did=os.environ.get("EEP_DID", "did:web:example.com"),
        gate_config=gate,
    )
    app.include_router(create_eep_router(server))
`;
  await writeFile(modPath, wiring, "utf8");
  notes.push(`wrote ${modPath}`);

  const importLine = "from eep_fastapi_wiring import register_eep_routes\n";
  const block = `${MARK}\nregister_eep_routes(app)\n${END}\n`;

  let body = mainSource.startsWith("from eep_fastapi_wiring") ? mainSource : importLine + mainSource;
  const m = /app\s*=\s*FastAPI\s*\([^)]*\)\s*/m.exec(body);
  if (m && !body.includes(MARK)) {
    const at = m.index + m[0].length;
    body = body.slice(0, at) + "\n" + block + body.slice(at);
  } else if (!body.includes(MARK)) {
    body = body + "\n" + block;
  }
  try {
    await writeFile(entryPath, body, "utf8");
    notes.push(`patched ${entry}`);
  } catch (e) {
    out.writeErr(String(e));
    return [...notes, "error writing entry file"];
  }
  return notes;
}
