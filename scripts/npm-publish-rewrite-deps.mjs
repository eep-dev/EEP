#!/usr/bin/env node
/**
 * Prepare package.json for registry publish (local machine).
 * - Rewrite file:../@eep-dev/* dependencies to ^VERSION
 * - Remove publishConfig.provenance (npm ignores NPM_CONFIG_PROVENANCE=false when set in package.json)
 *
 * Usage: node scripts/npm-publish-rewrite-deps.mjs <packageDir> <version> [--strip-provenance]
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

const stripProvenance = process.argv.includes("--strip-provenance");
if (stripProvenance && pkg.publishConfig && pkg.publishConfig.provenance) {
  delete pkg.publishConfig.provenance;
  if (Object.keys(pkg.publishConfig).length === 0) {
    delete pkg.publishConfig;
  }
  changed += 1;
  console.log(`removed publishConfig.provenance from ${pkgPath} (local publish)`);
}

if (changed === 0) {
  console.log(`no publish prep changes in ${pkgPath}`);
} else {
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  if (changed > (stripProvenance ? 1 : 0)) {
    console.log(`updated ${pkgPath} for registry publish (^${version})`);
  }
}
