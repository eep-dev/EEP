#!/usr/bin/env node
/**
 * Generate TypeScript types and Pydantic-compatible Python models from
 * the JSON Schemas in `schemas/v0.1/`. Output lands under:
 *
 *   tests/types/eep-schemas.d.ts           (TypeScript surface)
 *   tests/types/eep_schemas.py             (Python dataclasses w/ pydantic v2)
 *
 * In CI we run this script and then `git diff --exit-code` on the
 * output paths. If the diff is non-empty, the schemas changed but the
 * generated types weren't regenerated — fail the build.
 *
 * Usage:
 *   node scripts/codegen-schema-types.mjs            # generate
 *   node scripts/codegen-schema-types.mjs --check    # generate to a temp dir and compare
 *
 * Dependencies (pin these EXACTLY — json-schema-to-typescript formats its
 * output with prettier, so an unpinned prettier silently reformats the
 * generated types and breaks the drift gate with no schema change):
 *   - json-schema-to-typescript@15.0.4
 *   - prettier@3.9.0
 *   - datamodel-code-generator (Python, run via pipx in CI)
 *
 * Install locally before regenerating:
 *   npm install --no-save --no-package-lock json-schema-to-typescript@15.0.4 prettier@3.9.0
 *
 * This script is intentionally modest: it does not aim to replace the
 * hand-maintained TypeScript surfaces in @eep-dev/* packages. Its job
 * is to be a *drift sentinel*: if a schema changes, the generated file
 * changes, the diff fails CI, and the maintainer is forced to update
 * the schema or the hand-written types in lockstep.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const SCHEMAS_DIR = join(REPO_ROOT, 'schemas/v0.1');
const OUT_DIR = join(REPO_ROOT, 'tests/types');
const TS_OUT = join(OUT_DIR, 'eep-schemas.d.ts');

const checkOnly = process.argv.includes('--check');

function log(msg) {
    process.stderr.write(`[codegen] ${msg}\n`);
}

function listSchemaFiles() {
    return readdirSync(SCHEMAS_DIR)
        .filter((f) => f.endsWith('.json'))
        .filter((f) => statSync(join(SCHEMAS_DIR, f)).isFile())
        .sort();
}

async function generate() {
    let compileFromFile;
    try {
        ({ compileFromFile } = await import('json-schema-to-typescript'));
    } catch (e) {
        log('json-schema-to-typescript is not installed.');
        log('Install at the repo root:  npm i -D -w @eep-dev/schemas json-schema-to-typescript');
        log('Or globally:               npm i -g json-schema-to-typescript');
        process.exit(2);
    }

    if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

    const blocks = [];
    blocks.push('/* eslint-disable */');
    blocks.push('// AUTO-GENERATED FROM schemas/v0.1/*.json — DO NOT EDIT BY HAND.');
    blocks.push('// Run `node scripts/codegen-schema-types.mjs` to regenerate.');
    blocks.push('// CI fails if this file drifts from the schemas.');
    blocks.push('');

    for (const file of listSchemaFiles()) {
        const path = join(SCHEMAS_DIR, file);
        try {
            const ts = await compileFromFile(path, {
                bannerComment: '',
                additionalProperties: false,
                strictIndexSignatures: true,
                style: { singleQuote: true, semi: true },
            });
            blocks.push(`// ${'─'.repeat(56)}`);
            blocks.push(`// ${file}`);
            blocks.push(`// ${'─'.repeat(56)}`);
            blocks.push(ts.trim());
            blocks.push('');
        } catch (e) {
            log(`Failed to compile ${file}: ${e}`);
            process.exit(2);
        }
    }

    const content = blocks.join('\n') + '\n';

    if (checkOnly) {
        const existing = existsSync(TS_OUT) ? readFileSync(TS_OUT, 'utf8') : '';
        if (existing !== content) {
            log('Drift detected: generated types differ from tests/types/eep-schemas.d.ts');
            log('Run `node scripts/codegen-schema-types.mjs` and commit the result.');
            process.exit(1);
        }
        log('No drift between schemas and generated types.');
        return;
    }

    writeFileSync(TS_OUT, content, 'utf8');
    log(`Wrote ${TS_OUT}`);
}

await generate();
