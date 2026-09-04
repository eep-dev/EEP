#!/usr/bin/env node
/**
 * Copy `schemas/v0.1/*.json` into `dist/schemas/` at build time.
 *
 * The published npm package ships only `dist`, so without this step the
 * CLI has no schemas to validate against once it is installed from the
 * registry — it would silently degrade to "schemas not found" for every
 * user who is not running from a repo checkout.
 *
 * Copying at build time (rather than committing a second copy) keeps
 * `schemas/v0.1/` the single source of truth: the bundle cannot drift,
 * because it is regenerated from the originals on every build and publish.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(HERE, '..');
const SOURCE = resolve(PACKAGE_ROOT, '../../../schemas/v0.1');
const DEST = join(PACKAGE_ROOT, 'dist', 'schemas');

if (!existsSync(SOURCE)) {
    console.error(`[bundle-schemas] source not found: ${SOURCE}`);
    process.exit(1);
}

mkdirSync(DEST, { recursive: true });

let copied = 0;
for (const filename of readdirSync(SOURCE).sort()) {
    if (!filename.endsWith('.json')) continue;
    const from = join(SOURCE, filename);
    if (!statSync(from).isFile()) continue;
    const raw = readFileSync(from, 'utf8');
    // Parse to fail loudly on a corrupt schema rather than shipping it.
    JSON.parse(raw);
    writeFileSync(join(DEST, filename), raw);
    copied += 1;
}

if (copied === 0) {
    console.error(`[bundle-schemas] no schemas found in ${SOURCE}`);
    process.exit(1);
}

console.error(`[bundle-schemas] bundled ${copied} schemas into dist/schemas/`);
