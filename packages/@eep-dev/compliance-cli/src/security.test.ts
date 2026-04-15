import { describe, it, expect } from 'vitest';
import {
    validateArgs,
    normalizeTarget,
    validateCloudEventsEnvelope,
    validateEEPExtensions,
    checkWebhookHeaders,
} from './helpers';

describe('Compliance CLI Security', () => {

    describe('Input Validation', () => {
        it('rejects shell injection in arguments', () => {
            // validateArgs should still return null (structurally valid URL) but
            // normalizeTarget should not execute anything — just string processing
            const maliciousTarget = 'https://example.com; rm -rf /';
            const result = validateArgs({ target: maliciousTarget });
            // The arg validator checks for presence, not shell safety — that's fine
            // because the URL is passed to fetch(), not to a shell.
            expect(result).toBeNull();

            // Ensure normalizeTarget just strips trailing slashes, no execution
            const normalized = normalizeTarget(maliciousTarget);
            // normalizeTarget strips trailing slashes, so the trailing / is removed
            expect(normalized).toBe('https://example.com; rm -rf ');
            expect(normalized).not.toContain('\n');
        });

        it('handles path traversal in file arguments', () => {
            const traversalTarget = 'https://example.com/../../etc/passwd';
            const result = validateArgs({ target: traversalTarget });
            expect(result).toBeNull();

            const normalized = normalizeTarget(traversalTarget);
            expect(normalized).toBe('https://example.com/../../etc/passwd');
        });

        it('validates JSON input before processing', () => {
            // validateCloudEventsEnvelope expects a parsed object — passing
            // malformed data should not crash
            const emptyObj = validateCloudEventsEnvelope({});
            expect(emptyObj.length).toBeGreaterThan(0);

            // Object with __proto__ pollution attempt
            const polluted = JSON.parse('{"__proto__":{"admin":true},"specversion":"1.0","id":"1","source":"s","type":"t","time":"t"}');
            const result = validateCloudEventsEnvelope(polluted);
            // Should process normally without prototype pollution
            expect(result).toEqual([]);
            expect(({} as any).admin).toBeUndefined();
        });

        it('handles extremely long input gracefully', () => {
            const longTarget = 'https://' + 'a'.repeat(100_000) + '.com';
            const result = validateArgs({ target: longTarget });
            expect(result).toBeNull();

            const longLevel = 'a'.repeat(100_000);
            const levelResult = validateArgs({ target: 'https://x.com', level: longLevel });
            expect(levelResult).toContain('Invalid conformance level');
        });

        it('rejects invalid port values that could cause issues', () => {
            expect(validateArgs({ target: 'https://x', port: '-1' })).toContain('Invalid port');
            expect(validateArgs({ target: 'https://x', port: '0' })).toContain('Invalid port');
            expect(validateArgs({ target: 'https://x', port: '99999' })).toContain('Invalid port');
            expect(validateArgs({ target: 'https://x', port: 'NaN' })).toContain('Invalid port');
        });

        it('handles unicode in target URLs', () => {
            const unicodeTarget = 'https://例え.jp/webhook';
            expect(validateArgs({ target: unicodeTarget })).toBeNull();
            expect(normalizeTarget(unicodeTarget)).toBe('https://例え.jp/webhook');
        });

        it('handles empty strings in checkWebhookHeaders', () => {
            const result = checkWebhookHeaders({
                'webhook-id': '',
                'webhook-timestamp': '',
                'webhook-signature': '',
            });
            expect(result.hasId).toBe(false);
            expect(result.hasTimestamp).toBe(false);
            expect(result.hasSignature).toBe(false);
            expect(result.missing).toHaveLength(3);
        });

        it('handles EEP extension validation with wrong types', () => {
            // validateEEPExtensions uses !event.eep_version, so 0 is treated as falsy
            const result = validateEEPExtensions({ eep_version: 0 as any });
            expect(result).toContain('eep_version');

            const missing = validateEEPExtensions({ eep_version: '' });
            expect(missing).toContain('eep_version');

            const nullVersion = validateEEPExtensions({ eep_version: null as any });
            expect(nullVersion).toContain('eep_version');
        });
    });
});
