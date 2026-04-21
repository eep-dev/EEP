import { tryPatchExpress } from "./express.js";
import { tryPatchFastapi } from "./fastapi.js";

/**
 * After `apply` has written `eep-generated/`, best-effort framework hooks for Express and FastAPI.
 * Safe to no-op: returns human-readable notes for reports.
 */
export async function applyFrameworkPatchers(
  projectPath: string,
  out: { write: (s: string) => void; writeErr: (s: string) => void }
): Promise<{ express: string[]; fastapi: string[] }> {
  const express = await tryPatchExpress(projectPath, out);
  const fastapi = await tryPatchFastapi(projectPath, out);
  return { express, fastapi };
}
