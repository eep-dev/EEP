/**
 * Discovery crosswalk v1 — fixture conformance test.
 *
 * Loads the offline crosswalk-host fixture bundle and asserts:
 *   1. eep.json still validates against `validateManifest()` even though
 *      sibling well-known files (agent.json, mcp.json) live next to it.
 *   2. Every file the guide promises to ship in the bundle is on disk.
 *
 * Backs issue #27 acceptance criterion: "Fixture directory present; at least
 * one Vitest/pytest asserts EEP manifest validation against crosswalk bundle".
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { validateManifest } from './manifest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = resolve(
    __dirname,
    '../../../..',
    'tests/conformance-fixtures/discovery/crosswalk-host',
);

describe('discovery crosswalk-host fixture bundle', () => {
    it('eep.json validates against validateManifest()', () => {
        const raw = readFileSync(resolve(FIXTURE_DIR, 'eep.json'), 'utf8');
        const result = validateManifest(JSON.parse(raw));
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
        expect(result.manifest?.did).toBe('did:web:crosswalk.example');
    });

    it('agent.json carries the x-eep extension pointing at the same origin', () => {
        const card = JSON.parse(readFileSync(resolve(FIXTURE_DIR, 'agent.json'), 'utf8'));
        expect(card['x-eep']).toBeDefined();
        expect(card['x-eep'].source_did).toBe('did:web:crosswalk.example');
        expect(card['x-eep'].subscribe_url).toMatch(/^https:\/\/crosswalk\.example\//);
        expect(card['x-eep'].stream_url).toMatch(/^https:\/\/crosswalk\.example\//);
    });

    it('expected.json summarises the bundle correctly', () => {
        const expected = JSON.parse(readFileSync(resolve(FIXTURE_DIR, 'expected.json'), 'utf8'));
        expect(expected.eep_manifest_valid).toBe(true);
        expect(expected.co_located_surfaces).toEqual(
            expect.arrayContaining(['eep', 'a2a', 'mcp', 'llms']),
        );
    });

    it('every file the crosswalk guide promises is present', () => {
        const required = [
            'eep.json',
            'agent.json',
            'mcp.json',
            'llms.txt',
            'link-header.http',
            'dns-txt.txt',
            'expected.json',
            'README.md',
        ];
        for (const name of required) {
            expect(existsSync(resolve(FIXTURE_DIR, name))).toBe(true);
        }
    });
});
