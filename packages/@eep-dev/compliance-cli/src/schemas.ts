/**
 * JSON Schema registry for the conformance runner.
 *
 * The repository publishes 24 normative schemas under `schemas/v0.1/`, and
 * until now the CLI validated against none of them: the manifest probe
 * hand-checked five fields, and the CloudEvents probe hand-listed five
 * required attribute names. Fixtures were validated properly by the
 * `tests/` suite, but *live publishers* — the thing this tool certifies —
 * were not. A deployment could pass Full conformance while emitting
 * envelopes and manifests that violate the schemas the project ships.
 *
 * This module loads every schema by `$id` into a single Ajv instance so
 * `$ref`s resolve across files, then exposes a small validate-by-filename
 * helper. It is the same wiring as `tests/conformance-fixtures.test.ts`,
 * lifted into the published package.
 */
// Schemas are JSON Schema 2020-12; Ajv's default export only
// understands draft-07, so the 2020-12 build is required.
import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Candidate locations for `schemas/v0.1/`, most specific first.
 *
 * - `dist/schemas` is where `scripts/bundle-schemas.mjs` copies them at
 *   build time, so the published npm package is self-contained.
 * - The repo-relative paths let the CLI run from source during development
 *   without a build step.
 */
const SCHEMA_DIR_CANDIDATES = [
    join(HERE, 'schemas'),
    resolve(HERE, '../../../../schemas/v0.1'),
    resolve(HERE, '../../../../../schemas/v0.1'),
];

export function findSchemasDir(explicit?: string): string | null {
    const candidates = explicit ? [explicit, ...SCHEMA_DIR_CANDIDATES] : SCHEMA_DIR_CANDIDATES;
    for (const dir of candidates) {
        try {
            if (existsSync(dir) && statSync(dir).isDirectory()) {
                // Require at least one schema so we don't latch onto an
                // empty directory that merely happens to exist.
                if (readdirSync(dir).some((f) => f.endsWith('.json'))) return dir;
            }
        } catch {
            // Unreadable candidate; try the next one.
        }
    }
    return null;
}

export interface SchemaRegistry {
    /** Directory the schemas were loaded from. */
    dir: string;
    /** Number of schemas registered. */
    count: number;
    /** Validate `document` against a schema named by its filename, e.g. `eep-manifest.json`. */
    validate(schemaFile: string, document: unknown): SchemaValidation;
    /** True when the named schema is registered. */
    has(schemaFile: string): boolean;
}

export interface SchemaValidation {
    valid: boolean;
    /** Human-readable, deduplicated error lines. Empty when `valid`. */
    errors: string[];
}

/** Schemas whose absence should not be silently tolerated. */
export const SCHEMA_MANIFEST = 'eep-manifest.json';
export const SCHEMA_EVENT_ENVELOPE = 'event.envelope.json';
export const SCHEMA_SUBSCRIPTION_REQUEST = 'subscription.request.json';
export const SCHEMA_GATE_402 = 'gate.402-response.json';
export const SCHEMA_GATE_403 = 'gate.403-response.json';

/**
 * Build a registry over every `*.json` in the resolved schema directory.
 *
 * Returns `null` when no schema directory can be found, so callers can
 * degrade to skipping schema probes with an explicit reason rather than
 * crashing or — worse — silently passing.
 */
export function loadSchemaRegistry(explicitDir?: string): SchemaRegistry | null {
    const dir = findSchemasDir(explicitDir);
    if (!dir) return null;

    const ajv = new Ajv2020({ strict: false, allErrors: true, allowUnionTypes: true });
    addFormats(ajv);

    const byFile = new Map<string, unknown>();
    for (const filename of readdirSync(dir).sort()) {
        if (!filename.endsWith('.json')) continue;
        const path = join(dir, filename);
        if (!statSync(path).isFile()) continue;
        let schema: Record<string, unknown>;
        try {
            schema = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
        } catch {
            continue;
        }
        byFile.set(filename, schema);
        const id = schema.$id;
        if (typeof id === 'string' && !ajv.getSchema(id)) {
            try {
                ajv.addSchema(schema);
            } catch {
                // Duplicate or unusable $id — the per-file compile below
                // still gives us a validator.
            }
        }
    }

    const compiled = new Map<string, ValidateFunction>();
    function validatorFor(schemaFile: string): ValidateFunction | null {
        const cached = compiled.get(schemaFile);
        if (cached) return cached;
        const schema = byFile.get(schemaFile) as Record<string, unknown> | undefined;
        if (!schema) return null;
        // Prefer the instance registered by $id so cross-file $refs resolve;
        // fall back to compiling the document directly.
        const id = typeof schema.$id === 'string' ? schema.$id : undefined;
        let fn: ValidateFunction | undefined = id ? ajv.getSchema(id) : undefined;
        if (!fn) {
            try {
                fn = ajv.compile(schema);
            } catch {
                return null;
            }
        }
        compiled.set(schemaFile, fn);
        return fn;
    }

    return {
        dir,
        count: byFile.size,
        has: (schemaFile) => byFile.has(schemaFile),
        validate(schemaFile, document) {
            const fn = validatorFor(schemaFile);
            if (!fn) {
                return { valid: false, errors: [`schema not found: ${schemaFile}`] };
            }
            const valid = fn(document) as boolean;
            if (valid) return { valid: true, errors: [] };
            return { valid: false, errors: formatErrors(fn) };
        },
    };
}

/**
 * Turn Ajv's error objects into short, deduplicated lines.
 *
 * Capped at 8: a publisher emitting a wholly wrong document produces
 * dozens of cascading errors, and a wall of them buries the first real
 * cause in terminal output and HTML reports alike.
 */
export function formatErrors(fn: ValidateFunction, limit = 8): string[] {
    const lines: string[] = (fn.errors ?? []).map((e): string => {
        const where = e.instancePath && e.instancePath.length > 0 ? e.instancePath : '(root)';
        const extra =
            e.keyword === 'additionalProperties' && e.params && 'additionalProperty' in e.params
                ? `: ${String((e.params as { additionalProperty: unknown }).additionalProperty)}`
                : '';
        return `${where} ${e.message ?? 'is invalid'}${extra}`;
    });
    const unique = [...new Set(lines)];
    if (unique.length <= limit) return unique;
    return [...unique.slice(0, limit), `…and ${unique.length - limit} more`];
}
