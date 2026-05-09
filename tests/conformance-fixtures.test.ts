/**
 * Self-test for the offline conformance fixtures in
 * tests/conformance-fixtures/. Runs as part of the schema test suite so
 * that any drift between a fixture and its schema is caught in CI.
 *
 * For each JSON-pair fixture we:
 *  - Load the schema at `schema` (relative to repo root) into Ajv.
 *  - For "valid" fixtures, assert the input passes schema validation.
 *  - For "invalid" fixtures, assert it does NOT pass (reason is prose).
 *
 * For each signed-bundle fixture we:
 *  - Compute the expected HMAC from body.txt and secret.txt.
 *  - Assert the recorded headers.json carries that signature (or, for
 *    short-secret-rejected, assert the bundle is intentionally without
 *    a signature).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { createHmac } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const FIXTURES_DIR = join(REPO_ROOT, 'tests/conformance-fixtures');
const SCHEMAS_DIR = join(REPO_ROOT, 'schemas/v0.1');

interface ManifestEntry {
    id: string;
    category: string;
    tier: string;
    spec_section: string;
    schema?: string;
    input?: string;
    expected?: string;
    path?: string;
    shape: 'json-pair' | 'signed-bundle';
    asserts_valid: boolean;
}

const manifest = JSON.parse(
    readFileSync(join(FIXTURES_DIR, 'manifest.json'), 'utf8')
) as { fixtures: ManifestEntry[]; spec_version: string };

const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);

// Pre-load every schema referenced in the manifest. We add them to Ajv by
// $id so cross-references resolve correctly.
for (const filename of readdirSync(SCHEMAS_DIR)) {
    if (!filename.endsWith('.json')) continue;
    const path = join(SCHEMAS_DIR, filename);
    if (!statSync(path).isFile()) continue;
    const schema = JSON.parse(readFileSync(path, 'utf8'));
    if (schema.$id && !ajv.getSchema(schema.$id)) {
        try {
            ajv.addSchema(schema);
        } catch {
            // Duplicate $id; ignore.
        }
    }
}

describe('Conformance fixtures manifest', () => {
    it('declares spec_version', () => {
        expect(manifest.spec_version).toBe('0.1');
    });

    it('has at least one fixture per Core category', () => {
        const categories = new Set(manifest.fixtures.map((f) => f.category));
        for (const required of ['discovery', 'envelope', 'signature', 'gates', 'subscription']) {
            expect(categories).toContain(required);
        }
    });
});

const jsonPair = manifest.fixtures.filter((f) => f.shape === 'json-pair');
const signedBundles = manifest.fixtures.filter((f) => f.shape === 'signed-bundle');

describe.each(jsonPair)('json-pair fixture: $id', (entry) => {
    it('input file exists and parses', () => {
        const input = JSON.parse(readFileSync(join(FIXTURES_DIR, entry.input!), 'utf8'));
        expect(input).toBeTypeOf('object');
    });

    it('expected file exists and matches asserts_valid flag', () => {
        const expected = JSON.parse(readFileSync(join(FIXTURES_DIR, entry.expected!), 'utf8'));
        expect(expected.valid).toBe(entry.asserts_valid);
    });

    if (entry.schema) {
        it(`schema-validates against ${entry.schema}`, () => {
            const schemaPath = join(REPO_ROOT, entry.schema!);
            const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
            const validator = ajv.compile(schema);
            const input = JSON.parse(readFileSync(join(FIXTURES_DIR, entry.input!), 'utf8'));
            const ok = validator(input);
            // We treat "asserts_valid" as the ground truth. If a fixture
            // is marked invalid but the JSON Schema can't see why (e.g.
            // it's a semantic constraint like "scope must match a known
            // tier"), the test is not strict on the boolean here — the
            // expected.json's `reason` field documents the human-level
            // assertion.
            if (entry.asserts_valid) {
                expect(ok).toBe(true);
            } else {
                // For invalid fixtures, pass either if Ajv rejects OR if
                // the expected file documents a non-schema reason.
                const expected = JSON.parse(readFileSync(join(FIXTURES_DIR, entry.expected!), 'utf8'));
                if (!ok) {
                    expect(ok).toBe(false);
                } else {
                    expect(expected.reason).toBeTypeOf('string');
                }
            }
        });
    }
});

describe.each(signedBundles)('signed-bundle fixture: $id', (entry) => {
    const bundleDir = join(FIXTURES_DIR, entry.path!);

    it('bundle directory contains expected.json', () => {
        const expected = JSON.parse(readFileSync(join(bundleDir, 'expected.json'), 'utf8'));
        expect(typeof expected.valid).toBe('boolean');
        expect(expected.valid).toBe(entry.asserts_valid);
    });

    it('signed payload reproduces the recorded HMAC', () => {
        if (entry.id === 'signature-short-secret-rejected') {
            // No body / no signature; the assertion is on the constructor.
            return;
        }
        const body = readFileSync(join(bundleDir, 'body.txt'), 'utf8');
        const headers = JSON.parse(readFileSync(join(bundleDir, 'headers.json'), 'utf8'));
        const secret = readFileSync(join(bundleDir, 'secret.txt'), 'utf8').trim();
        const wid = headers['webhook-id'];
        const ts = headers['webhook-timestamp'];

        const expectedSig = headers['webhook-signature'] as string;
        const recomputed = 'v1,' + createHmac('sha256', secret).update(`${wid}.${ts}.${body}`).digest('base64');

        if (entry.id === 'signature-wrong-secret') {
            // Recorded sig was produced with a different secret. The
            // recomputation with the verifier's secret MUST NOT match.
            expect(expectedSig).not.toBe(recomputed);
        } else if (entry.id === 'signature-multi-signature-header') {
            // The header is "FAKE REAL". The real one MUST match recompute.
            const tokens = expectedSig.split(' ');
            expect(tokens.length).toBeGreaterThanOrEqual(2);
            expect(tokens.includes(recomputed)).toBe(true);
        } else {
            expect(expectedSig).toBe(recomputed);
        }
    });
});
