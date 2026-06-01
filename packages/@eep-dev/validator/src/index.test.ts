import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateSSRF, SSRFError, validateEventTypePattern, matchesEventType, matchesAnyPattern } from './index';

// Mock DNS resolution for SSRF tests — vi.hoisted ensures the fn is available when vi.mock is hoisted
const { mockResolve4, mockResolve6 } = vi.hoisted(() => ({ mockResolve4: vi.fn(), mockResolve6: vi.fn() }));
vi.mock('dns/promises', () => ({ resolve4: mockResolve4, resolve6: mockResolve6 }));

describe('@eep-dev/validator', () => {

    describe('validateEventTypePattern', () => {
        it('should accept valid simple patterns', () => {
            expect(validateEventTypePattern('com.example.entity.updated')).toBe(true);
        });

        it('should accept wildcard patterns', () => {
            expect(validateEventTypePattern('com.example.entity.*')).toBe(true);
        });

        it('should accept single-segment patterns', () => {
            expect(validateEventTypePattern('entity')).toBe(true);
        });

        it('should reject patterns starting with uppercase', () => {
            expect(validateEventTypePattern('Entity.updated')).toBe(false);
        });

        it('should reject patterns with special characters', () => {
            expect(validateEventTypePattern('com.example.entity.up-dated')).toBe(false);
        });

        it('should reject patterns with double dots', () => {
            expect(validateEventTypePattern('md..more')).toBe(false);
        });

        it('should reject empty string', () => {
            expect(validateEventTypePattern('')).toBe(false);
        });

        it('should reject patterns starting with a number', () => {
            expect(validateEventTypePattern('1entity')).toBe(false);
        });

        it('should accept patterns with numbers', () => {
            expect(validateEventTypePattern('md2.more3.entity')).toBe(true);
        });
    });

    describe('matchesEventType', () => {
        it('should match exact event types', () => {
            expect(matchesEventType('com.example.entity.updated', 'com.example.entity.updated')).toBe(true);
        });

        it('should not match different event types', () => {
            expect(matchesEventType('com.example.entity.created', 'com.example.entity.updated')).toBe(false);
        });

        it('should match wildcard patterns', () => {
            expect(matchesEventType('com.example.entity.updated', 'com.example.entity.*')).toBe(true);
        });

        it('should match wildcard for sub-events', () => {
            expect(matchesEventType('com.example.entity.capability.added', 'com.example.entity.*')).toBe(true);
        });

        it('should not match wildcard for different namespace', () => {
            expect(matchesEventType('com.example.trust.changed', 'com.example.entity.*')).toBe(false);
        });

        it('should match exact prefix without children', () => {
            expect(matchesEventType('com.example.entity', 'com.example.entity.*')).toBe(true);
        });
    });

    describe('matchesAnyPattern', () => {
        it('should match if any pattern matches', () => {
            expect(matchesAnyPattern('com.example.trust.changed', [
                'com.example.entity.*',
                'com.example.trust.*',
            ])).toBe(true);
        });

        it('should not match if no pattern matches', () => {
            expect(matchesAnyPattern('com.example.commerce.sale', [
                'com.example.entity.*',
                'com.example.trust.*',
            ])).toBe(false);
        });

        it('should handle empty patterns array', () => {
            expect(matchesAnyPattern('com.example.entity.updated', [])).toBe(false);
        });

        it('should handle exact match in array', () => {
            expect(matchesAnyPattern('com.example.entity.updated', [
                'com.example.entity.updated',
            ])).toBe(true);
        });
    });

    describe('SSRFError', () => {
        it('should have correct name', () => {
            const err = new SSRFError('test');
            expect(err.name).toBe('SSRFError');
        });

        it('should include prefix in message', () => {
            const err = new SSRFError('test message');
            expect(err.message).toContain('SSRFError:');
        });

        it('should be an instance of Error', () => {
            const err = new SSRFError('test');
            expect(err).toBeInstanceOf(Error);
        });
    });

    describe('validateSSRF', () => {
        it('should reject invalid URLs', async () => {
            await expect(validateSSRF('not-a-url')).rejects.toThrow(SSRFError);
        });

        it('should reject http:// by default', async () => {
            await expect(validateSSRF('http://example.com')).rejects.toThrow('http:// URLs are not allowed');
        });

        it('should allow http:// with allowHttp option', async () => {
            // This will still fail DNS, but should not reject on scheme
            try {
                await validateSSRF('http://actual-public-host.example.com', { allowHttp: true });
            } catch (e) {
                // DNS failure is expected, but should not be SSRFError about scheme
                expect((e as Error).message).not.toContain('http:// URLs are not allowed');
            }
        });

        it('should reject ftp:// scheme', async () => {
            await expect(validateSSRF('ftp://example.com/file')).rejects.toThrow('Unsupported URL scheme');
        });

        it('should reject localhost', async () => {
            await expect(validateSSRF('https://localhost/webhook')).rejects.toThrow('localhost');
        });

        it('should reject 0.0.0.0', async () => {
            await expect(validateSSRF('https://0.0.0.0/webhook')).rejects.toThrow(SSRFError);
        });

        it('should reject [::1]', async () => {
            await expect(validateSSRF('https://[::1]/webhook')).rejects.toThrow(SSRFError);
        });

        it('should reject javascript: scheme', async () => {
            await expect(validateSSRF('javascript:alert(1)')).rejects.toThrow('Unsupported URL scheme');
        });
    });

    describe('validateSSRF — DNS-mocked private IP ranges', () => {
        beforeEach(() => {
            mockResolve4.mockReset();
            mockResolve6.mockReset();
            // Default: a host resolves to nothing in either family unless a test says so.
            mockResolve4.mockResolvedValue([]);
            mockResolve6.mockResolvedValue([]);
        });

        it('should reject 10.x.x.x (Private class A)', async () => {
            mockResolve4.mockResolvedValueOnce(['10.0.0.1']);
            await expect(validateSSRF('https://evil.example.com/hook')).rejects.toThrow(SSRFError);
        });

        it('should reject 172.16.x.x (Private class B)', async () => {
            mockResolve4.mockResolvedValueOnce(['172.16.5.10']);
            await expect(validateSSRF('https://evil.example.com/hook')).rejects.toThrow(SSRFError);
        });

        it('should reject 192.168.x.x (Private class C)', async () => {
            mockResolve4.mockResolvedValueOnce(['192.168.1.1']);
            await expect(validateSSRF('https://evil.example.com/hook')).rejects.toThrow(SSRFError);
        });

        it('should reject 169.254.169.254 (AWS metadata)', async () => {
            mockResolve4.mockResolvedValueOnce(['169.254.169.254']);
            await expect(validateSSRF('https://evil.example.com/hook')).rejects.toThrow('Link-local');
        });

        it('should reject 127.0.0.1 (loopback via DNS)', async () => {
            mockResolve4.mockResolvedValueOnce(['127.0.0.1']);
            await expect(validateSSRF('https://safe-looking.example.com')).rejects.toThrow('loopback');
        });

        it('should accept public IP addresses', async () => {
            mockResolve4.mockResolvedValueOnce(['93.184.216.34']);
            await expect(validateSSRF('https://example.com/webhook')).resolves.toBeUndefined();
        });

        it('should reject multicast range (224.x)', async () => {
            mockResolve4.mockResolvedValueOnce(['224.0.0.1']);
            await expect(validateSSRF('https://evil.example.com')).rejects.toThrow('Multicast');
        });

        it('should reject 0.0.0.0/8 range', async () => {
            mockResolve4.mockResolvedValueOnce(['0.0.0.1']);
            await expect(validateSSRF('https://evil.example.com')).rejects.toThrow('Reserved');
        });

        it('should reject a private IPv6 (AAAA) hidden behind a public IPv4 (A) — dual-stack bypass', async () => {
            mockResolve4.mockResolvedValueOnce(['93.184.216.34']); // public decoy
            mockResolve6.mockResolvedValueOnce(['fd00::1']);        // private ULA
            await expect(validateSSRF('https://dual-stack.example.com'))
                .rejects.toThrow('private/reserved');
        });

        it('should accept a public host that is IPv4-only (AAAA returns NODATA)', async () => {
            mockResolve4.mockResolvedValueOnce(['93.184.216.34']);
            mockResolve6.mockRejectedValueOnce(new Error('queryAaaa ENODATA example.com'));
            await expect(validateSSRF('https://example.com/webhook')).resolves.toBeUndefined();
        });

        it('should throw SSRFError only when BOTH families fail to resolve', async () => {
            mockResolve4.mockRejectedValueOnce(new Error('ENOTFOUND'));
            mockResolve6.mockRejectedValueOnce(new Error('ENOTFOUND'));
            await expect(validateSSRF('https://nonexistent.example.invalid'))
                .rejects.toThrow('DNS resolution failed');
        });

        it('should reject IPv6 unique-local addresses (fc00::)', async () => {
            mockResolve6.mockResolvedValueOnce(['fc00::1']);
            await expect(validateSSRF('https://evil.example.com'))
                .rejects.toThrow('private/reserved');
        });

        it('should reject IPv6 unique-local addresses in fd00::/8', async () => {
            mockResolve6.mockResolvedValueOnce(['fd12::abcd']);
            await expect(validateSSRF('https://evil.example.com'))
                .rejects.toThrow('private/reserved');
        });

        it('should reject IPv6 link-local addresses (fe80::/10)', async () => {
            mockResolve6.mockResolvedValueOnce(['fe80::1']);
            await expect(validateSSRF('https://evil.example.com'))
                .rejects.toThrow('private/reserved');
        });

        it('should reject IPv4-mapped IPv6 addresses (::ffff:192.168.x.x)', async () => {
            mockResolve6.mockResolvedValueOnce(['::ffff:192.168.1.1']);
            await expect(validateSSRF('https://evil.example.com'))
                .rejects.toThrow(SSRFError);
        });

        it('should reject resolved IPv6 loopback ::1 via DNS', async () => {
            mockResolve6.mockResolvedValueOnce(['::1']);
            await expect(validateSSRF('https://evil.example.com'))
                .rejects.toThrow('private/reserved');
        });

        it('should reject resolved IPv6 unspecified :: via DNS', async () => {
            mockResolve6.mockResolvedValueOnce(['::']);
            await expect(validateSSRF('https://evil.example.com'))
                .rejects.toThrow('private/reserved');
        });

        it('should accept public IPv6 documentation prefix (2001:db8::/32)', async () => {
            mockResolve6.mockResolvedValueOnce(['2001:db8::1']);
            await expect(validateSSRF('https://example.com/webhook')).resolves.toBeUndefined();
        });
    });
});
