#!/usr/bin/env node
/**
 * Rewrite file:../@eep-dev/* dependencies to ^VERSION for npm publish.
 * Usage: node scripts/npm-publish-rewrite-deps.mjs <packageDir> <version>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const pkgDir = resolve(process.argv[2] ?? "");
const version = process.argv[3];
if (!pkgDir || !version) {
  console.error("usage: npm-publish-rewrite-deps.mjs <packageDir> <version>");
  process.exit(1);
}

const pkgPath = resolve(pkgDir, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
let changed = 0;

for (const section of ["dependencies", "peerDependencies", "optionalDependencies"]) {
  const deps = pkg[section];
  if (!deps || typeof deps !== "object") continue;
  for (const [name, spec] of Object.entries(deps)) {
    if (typeof spec === "string" && spec.startsWith("file:") && name.startsWith("@eep-dev/")) {
      deps[name] = `^${version}`;
      changed += 1;
    }
  }
}

if (changed === 0) {
  console.log(`no file:@eep-dev deps to rewrite in ${pkgPath}`);
} else {
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log(`rewrote ${changed} @eep-dev file: dep(s) in ${pkgPath} -> ^${version}`);
}
