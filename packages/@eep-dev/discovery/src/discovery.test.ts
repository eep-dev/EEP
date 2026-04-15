import { describe, it, expect } from 'vitest';
import { validateManifest } from './manifest';
import { parseLinkHeader } from './link-header';
import { parseDnsTxtRecord } from './dns';

// ═══════════════════════════════════════════════════════════════════
// Manifest Validation Tests
// ═══════════════════════════════════════════════════════════════════

describe('validateManifest', () => {
    const validManifest = {
        did: 'did:web:example.com',
        eep_version: '0.1',
        layers: { layer1: 'https://api.example.com/eep' },
        supported_content_types: ['application/json'],
        pqc_ready: false,
        x402_enabled: true,
    };

    it('should accept a valid minimal manifest', () => {
        const result = validateManifest(validManifest);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
        expect(result.manifest).toBeDefined();
    });

    it('should accept a manifest with all optional fields', () => {
        const full = {
            ...validManifest,
            eep_versions: ['0.1', '1.0'],
            preferred_version: '0.1',
            signing_algorithms: ['EdDSA', 'ES256K'],
            tls_mode: 'mTLS',
            pricing_mode: 'negotiable',
            gates_url: 'https://api.example.com/eep/gates',
            services_url: 'https://api.example.com/eep/services',
        };
        const result = validateManifest(full);
        expect(result.valid).toBe(true);
    });

    it('should reject null input', () => {
        const result = validateManifest(null);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Manifest must be a non-null object');
    });

    it('should reject non-object input', () => {
        expect(validateManifest('string')).toEqual({ valid: false, errors: ['Manifest must be a non-null object'] });
        expect(validateManifest(42)).toEqual({ valid: false, errors: ['Manifest must be a non-null object'] });
    });

    it('should require did field', () => {
        const { did, ...rest } = validManifest;
        const result = validateManifest(rest);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('did'))).toBe(true);
    });

    it('should reject invalid DID format', () => {
        const result = validateManifest({ ...validManifest, did: 'not-a-did' });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('Invalid DID format'))).toBe(true);
    });

    it('should accept valid DID formats', () => {
        expect(validateManifest({ ...validManifest, did: 'did:web:example.com' }).valid).toBe(true);
        expect(validateManifest({ ...validManifest, did: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK' }).valid).toBe(true);
    });

    it('should require eep_version', () => {
        const { eep_version, ...rest } = validManifest;
        const result = validateManifest(rest);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('eep_version'))).toBe(true);
    });

    it('should reject invalid version format', () => {
        const result = validateManifest({ ...validManifest, eep_version: 'latest' });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('Invalid eep_version'))).toBe(true);
    });

    it('should require layers with layer1', () => {
        const result = validateManifest({ ...validManifest, layers: {} });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('layers.layer1'))).toBe(true);
    });

    it('should require layers object', () => {
        const { layers, ...rest } = validManifest;
        const result = validateManifest(rest);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('layers'))).toBe(true);
    });

    it('should require supported_content_types', () => {
        const result = validateManifest({ ...validManifest, supported_content_types: [] });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('supported_content_types'))).toBe(true);
    });

    it('should require pqc_ready as boolean', () => {
        const result = validateManifest({ ...validManifest, pqc_ready: 'yes' });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('pqc_ready'))).toBe(true);
    });

    it('should require x402_enabled as boolean', () => {
        const result = validateManifest({ ...validManifest, x402_enabled: 1 });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('x402_enabled'))).toBe(true);
    });

    it('should validate signing_algorithms values', () => {
        const result = validateManifest({ ...validManifest, signing_algorithms: ['EdDSA', 'INVALID'] });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('Unknown signing algorithm'))).toBe(true);
    });

    it('should accept all valid signing algorithms', () => {
        const result = validateManifest({
            ...validManifest,
            signing_algorithms: ['EdDSA', 'ES256K', 'ES256', 'ML-DSA-65', 'ML-DSA-87', 'SLH-DSA-128s', 'hybrid-EdDSA-ML-DSA-65', 'hybrid-EdDSA-ML-DSA-87'],
        });
        expect(result.valid).toBe(true);
    });

    it('should reject invalid tls_mode', () => {
        const result = validateManifest({ ...validManifest, tls_mode: 'none' });
        expect(result.valid).toBe(false);
    });

    it('should reject invalid pricing_mode', () => {
        const result = validateManifest({ ...validManifest, pricing_mode: 'free' });
        expect(result.valid).toBe(false);
    });

    it('should validate eep_versions entries', () => {
        const result = validateManifest({ ...validManifest, eep_versions: ['0.1', 'bad'] });
        expect(result.valid).toBe(false);
    });

    it('should report multiple errors at once', () => {
        const result = validateManifest({});
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThanOrEqual(5);
    });
});

// ═══════════════════════════════════════════════════════════════════
// Link Header Parsing Tests
// ═══════════════════════════════════════════════════════════════════

describe('parseLinkHeader', () => {
    it('should parse a single eep link', () => {
        const result = parseLinkHeader('<https://api.example.com/.well-known/eep.json>; rel="eep"');
        expect(result).toHaveLength(1);
        expect(result[0].url).toBe('https://api.example.com/.well-known/eep.json');
        expect(result[0].rel).toBe('eep');
    });

    it('should parse a subscribe link', () => {
        const result = parseLinkHeader('<https://api.example.com/eep/subscribe>; rel="subscribe"');
        expect(result).toHaveLength(1);
        expect(result[0].rel).toBe('subscribe');
    });

    it('should parse multiple links', () => {
        const header = '<https://api.example.com/.well-known/eep.json>; rel="eep", <https://api.example.com/eep/subscribe>; rel="subscribe"';
        const result = parseLinkHeader(header);
        expect(result).toHaveLength(2);
    });

    it('should ignore non-EEP rel types', () => {
        const result = parseLinkHeader('<https://example.com>; rel="canonical"');
        expect(result).toHaveLength(0);
    });

    it('should extract type parameter', () => {
        const result = parseLinkHeader('<https://api.example.com/eep.json>; rel="eep"; type="application/json"');
        expect(result[0].type).toBe('application/json');
    });

    it('should be case-insensitive for rel', () => {
        const result = parseLinkHeader('<https://example.com/eep.json>; rel="EEP"');
        expect(result).toHaveLength(1);
        expect(result[0].rel).toBe('eep');
    });

    it('should return empty for null/undefined', () => {
        expect(parseLinkHeader(null)).toEqual([]);
        expect(parseLinkHeader(undefined)).toEqual([]);
        expect(parseLinkHeader('')).toEqual([]);
    });

    it('should handle malformed entries gracefully', () => {
        const result = parseLinkHeader('not-a-link, <https://api.example.com/eep.json>; rel="eep"');
        expect(result).toHaveLength(1);
    });

    it('should handle complex URLs with commas in query strings', () => {
        const result = parseLinkHeader('<https://api.example.com/eep?a=1&b=2>; rel="eep"');
        expect(result).toHaveLength(1);
        expect(result[0].url).toBe('https://api.example.com/eep?a=1&b=2');
    });
});

// ═══════════════════════════════════════════════════════════════════
// DNS TXT Record Parsing Tests
// ═══════════════════════════════════════════════════════════════════

describe('parseDnsTxtRecord', () => {
    it('should parse a valid TXT record', () => {
        const result = parseDnsTxtRecord('v=eep1; manifest=https://api.example.com/.well-known/eep.json');
        expect(result.valid).toBe(true);
        expect(result.version).toBe('eep1');
        expect(result.manifestUrl).toBe('https://api.example.com/.well-known/eep.json');
    });

    it('should handle extra whitespace', () => {
        const result = parseDnsTxtRecord('  v=eep1;  manifest=https://example.com/eep.json  ');
        expect(result.valid).toBe(true);
    });

    it('should reject missing version', () => {
        const result = parseDnsTxtRecord('manifest=https://example.com/eep.json');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('version');
    });

    it('should reject invalid version prefix', () => {
        const result = parseDnsTxtRecord('v=spf1; manifest=https://example.com/eep.json');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Invalid version prefix');
    });

    it('should reject missing manifest URL', () => {
        const result = parseDnsTxtRecord('v=eep1');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('manifest');
    });

    it('should reject non-HTTPS manifest URL', () => {
        const result = parseDnsTxtRecord('v=eep1; manifest=http://example.com/eep.json');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('HTTPS');
    });

    it('should reject null/undefined/empty', () => {
        expect(parseDnsTxtRecord(null).valid).toBe(false);
        expect(parseDnsTxtRecord(undefined).valid).toBe(false);
        expect(parseDnsTxtRecord('').valid).toBe(false);
    });

    it('should handle future version numbers', () => {
        const result = parseDnsTxtRecord('v=eep2; manifest=https://example.com/eep.json');
        expect(result.valid).toBe(true);
        expect(result.version).toBe('eep2');
    });
});
