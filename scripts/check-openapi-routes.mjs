#!/usr/bin/env node
/**
 * Verify that `schemas/v0.1/openapi.yaml` and the reference middleware's route
 * table describe the same HTTP surface.
 *
 * Why this exists: the subscription resource was addressed five different ways
 * across the repository — two of them load-bearing for conformance — because
 * nothing compared the spec, the middleware and the CLI. `@eep-dev/setup-cli`
 * generated a *per-deployment* OpenAPI document, which inverted the
 * dependency: every publisher authored its own description of a shared
 * protocol, so there was no canonical description for anything to drift from.
 *
 * This gate makes that drift a build failure. It compares method+path pairs
 * and operationIds in both directions.
 *
 * Usage:
 *   node scripts/check-openapi-routes.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OPENAPI = resolve(REPO_ROOT, 'schemas/v0.1/openapi.yaml');

/**
 * Minimal extraction of `paths:` entries from the OpenAPI document.
 *
 * A full YAML parser would be a dependency this repo does not otherwise need
 * at the root, and the structure we care about — path keys and the HTTP method
 * keys nested one level under them — is unambiguous at fixed indentation.
 */
function parseOpenApiOperations(yaml) {
    const lines = yaml.split('\n');
    const operations = [];
    let inPaths = false;
    let currentPath = null;

    for (const line of lines) {
        if (/^paths:\s*$/.test(line)) {
            inPaths = true;
            continue;
        }
        if (!inPaths) continue;
        // A non-indented, non-empty, non-comment line ends the paths block.
        if (/^\S/.test(line) && line.trim().length > 0 && !line.startsWith('#')) break;

        const pathMatch = /^ {2}(\/\S*):\s*$/.exec(line);
        if (pathMatch) {
            currentPath = pathMatch[1];
            continue;
        }
        const methodMatch = /^ {4}(get|put|post|delete|patch|head|options):\s*$/.exec(line);
        if (methodMatch && currentPath) {
            operations.push({ method: methodMatch[1].toUpperCase(), path: currentPath, operationId: null });
            continue;
        }
        const opIdMatch = /^ {6}operationId:\s*(\S+)\s*$/.exec(line);
        if (opIdMatch && operations.length > 0) {
            operations[operations.length - 1].operationId = opIdMatch[1];
        }
    }
    return operations;
}

/** `/eep/subscriptions/:subscriptionId` → `/eep/subscriptions/{subscriptionId}` */
function normalizeExpressPath(path) {
    return path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

const { EEPServer } = await import(
    resolve(REPO_ROOT, 'packages/@eep-dev/middleware/dist/index.js')
).catch((err) => {
    console.error(
        '\n✗ Could not load @eep-dev/middleware.\n' +
        '  Build it first: (cd packages/@eep-dev/middleware && npm run build)\n'
    );
    throw err;
});

const server = new EEPServer({ baseUrl: 'https://api.example.com', did: 'did:web:example.com' });
const routes = server.getRouteDefinitions();

const openapiOps = parseOpenApiOperations(readFileSync(OPENAPI, 'utf8'));
if (openapiOps.length === 0) {
    console.error('\n✗ No operations parsed from schemas/v0.1/openapi.yaml.\n');
    process.exit(1);
}

const key = (method, path) => `${method} ${path}`;
const openapiByKey = new Map(openapiOps.map((op) => [key(op.method, op.path), op]));

const problems = [];

for (const route of routes) {
    // Deprecated compatibility aliases are deliberately not advertised in the
    // canonical description: implementations accept them, publishers should
    // not publish them.
    if (route.operationId.endsWith('Deprecated')) continue;

    const normalized = normalizeExpressPath(route.path);
    const op = openapiByKey.get(key(route.method, normalized));
    if (!op) {
        problems.push(
            `middleware serves ${route.method} ${normalized} (${route.operationId}), ` +
            `which openapi.yaml does not describe`
        );
        continue;
    }
    if (op.operationId !== route.operationId) {
        problems.push(
            `${route.method} ${normalized}: middleware operationId '${route.operationId}' ` +
            `!= openapi.yaml '${op.operationId}'`
        );
    }
}

const middlewareKeys = new Set(
    routes
        .filter((r) => !r.operationId.endsWith('Deprecated'))
        .map((r) => key(r.method, normalizeExpressPath(r.path)))
);
for (const op of openapiOps) {
    if (!middlewareKeys.has(key(op.method, op.path))) {
        problems.push(
            `openapi.yaml describes ${op.method} ${op.path} (${op.operationId ?? 'no operationId'}), ` +
            `which the reference middleware does not serve`
        );
    }
}

if (problems.length > 0) {
    console.error('\n✗ openapi.yaml and the reference middleware disagree:\n');
    for (const problem of problems) console.error(`  ${problem}`);
    console.error(
        '\n  The canonical description and the reference implementation must\n' +
        '  describe the same surface. Update whichever is wrong — but do not\n' +
        '  let them diverge silently.\n'
    );
    process.exit(1);
}

console.error(`✓ openapi.yaml matches the reference middleware (${openapiOps.length} operations)`);
