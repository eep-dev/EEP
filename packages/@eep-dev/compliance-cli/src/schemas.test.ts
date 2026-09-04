import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import {
    loadSchemaRegistry,
    findSchemasDir,
    SCHEMA_MANIFEST,
    SCHEMA_EVENT_ENVELOPE,
    SCHEMA_SUBSCRIPTION_REQUEST,
} from './schemas.js';

const REPO_SCHEMAS = resolve(import.meta.dirname, '../../../../schemas/v0.1');

describe('schema registry', () => {
    it('locates schemas/v0.1 from a source checkout', () => {
        expect(findSchemasDir()).not.toBeNull();
    });

    it('loads every schema in the directory', () => {
        const registry = loadSchemaRegistry(REPO_SCHEMAS);
        expect(registry).not.toBeNull();
        // The repo ships 24 today; assert a floor rather than an exact count
        // so adding a schema doesn't fail this test for the wrong reason.
        expect(registry!.count).toBeGreaterThanOrEqual(24);
        expect(registry!.has(SCHEMA_MANIFEST)).toBe(true);
        expect(registry!.has(SCHEMA_EVENT_ENVELOPE)).toBe(true);
        expect(registry!.has(SCHEMA_SUBSCRIPTION_REQUEST)).toBe(true);
    });

    it('falls back to the built-in candidates when an explicit path is bad', () => {
        // A bad --schemas value must not be fatal: the packaged dist/schemas
        // (or the repo copy) still resolves.
        const registry = loadSchemaRegistry('/nonexistent/path/that/should/never/exist');
        expect(registry).not.toBeNull();
        expect(registry!.has(SCHEMA_MANIFEST)).toBe(true);
    });

    describe('manifest validation', () => {
        const registry = loadSchemaRegistry(REPO_SCHEMAS)!;

        const validManifest = {
            did: 'did:web:example.com',
            eep_version: '0.1',
            layers: {
                layer1: 'https://api.example.com/u/u/acme',
                layer2_sse: 'https://api.example.com/eep/stream',
                layer2_webhook: 'https://api.example.com/eep/subscribe',
            },
            supported_content_types: ['application/json'],
            pqc_ready: false,
            x402_enabled: false,
        };

        it('accepts a conformant manifest', () => {
            const result = registry.validate(SCHEMA_MANIFEST, validManifest);
            expect(result.errors).toEqual([]);
            expect(result.valid).toBe(true);
        });

        // This is the whole point of the change: the old probe checked five
        // fields, so a manifest with the right `did` and `eep_version` passed
        // regardless of what else was wrong with it.
        it('rejects a manifest that the old five-field probe would have passed', () => {
            const result = registry.validate(SCHEMA_MANIFEST, {
                did: 'did:web:example.com',
                eep_version: '0.1',
                pqc_ready: false,
                x402_enabled: false,
                // `layers` and `supported_content_types` are required and absent.
            });
            expect(result.valid).toBe(false);
            expect(result.errors.join(' ')).toContain('layers');
        });

        it('rejects a manifest with a malformed layers object', () => {
            const result = registry.validate(SCHEMA_MANIFEST, {
                ...validManifest,
                layers: { layer1: 'not-a-uri', unknown_layer: 'https://x.example' },
            });
            expect(result.valid).toBe(false);
        });

        it('reports readable, deduplicated error lines', () => {
            const result = registry.validate(SCHEMA_MANIFEST, {});
            expect(result.valid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
            expect(result.errors.length).toBeLessThanOrEqual(9); // 8 + "…and N more"
            for (const line of result.errors) {
                expect(typeof line).toBe('string');
                expect(line.length).toBeGreaterThan(0);
            }
        });
    });

    describe('event envelope validation', () => {
        const registry = loadSchemaRegistry(REPO_SCHEMAS)!;

        it('accepts a conformant CloudEvents envelope', () => {
            const result = registry.validate(SCHEMA_EVENT_ENVELOPE, {
                specversion: '1.0',
                id: 'evt-1',
                source: 'did:web:example.com:u:acme',
                type: 'com.example.entity.updated',
                time: '2026-02-22T14:30:00Z',
                datacontenttype: 'application/json',
                data: { field: 'bio' },
            });
            expect(result.errors).toEqual([]);
            expect(result.valid).toBe(true);
        });

        it('rejects an envelope missing a required attribute', () => {
            const result = registry.validate(SCHEMA_EVENT_ENVELOPE, {
                specversion: '1.0',
                id: 'evt-1',
                type: 'com.example.entity.updated',
                time: '2026-02-22T14:30:00Z',
                datacontenttype: 'application/json',
                // `source` is absent.
            });
            expect(result.valid).toBe(false);
            expect(result.errors.join(' ')).toContain('source');
        });
    });

    it('reports a clear error for an unregistered schema name', () => {
        const registry = loadSchemaRegistry(REPO_SCHEMAS)!;
        const result = registry.validate('not-a-real-schema.json', {});
        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain('schema not found');
    });
});
