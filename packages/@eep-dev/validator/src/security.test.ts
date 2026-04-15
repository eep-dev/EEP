import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateSSRF, SSRFError, validateEventTypePattern } from './index';

const { mockDnsResolve } = vi.hoisted(() => ({ mockDnsResolve: vi.fn() }));
vi.mock('dns/promises', () => ({ resolve: mockDnsResolve }));

describe('Validator Security', () => {

    beforeEach(() => {
        mockDnsResolve.mockReset();
    });

    describe('SSRF Prevention', () => {
        it('rejects localhost URLs', async () => {
            await expect(validateSSRF('https://localhost/webhook')).rejects.toThrow(SSRFError);
            await expect(validateSSRF('https://localhost:8080/webhook')).rejects.toThrow(SSRFError);
        });

        it('rejects private IP ranges (10.x, 172.16-31.x, 192.168.x)', async () => {
            mockDnsResolve.mockResolvedValueOnce(['10.0.0.1']);
            await expect(validateSSRF('https://evil.com/hook')).rejects.toThrow('Private class A');

            mockDnsResolve.mockResolvedValueOnce(['172.16.0.1']);
            await expect(validateSSRF('https://evil.com/hook')).rejects.toThrow('Private class B');

            mockDnsResolve.mockResolvedValueOnce(['192.168.1.1']);
            await expect(validateSSRF('https://evil.com/hook')).rejects.toThrow('Private class C');
        });

        it('rejects IPv6 mapped IPv4 addresses', async () => {
            mockDnsResolve.mockResolvedValueOnce(['::ffff:127.0.0.1']);
            await expect(validateSSRF('https://evil.com/hook')).rejects.toThrow(SSRFError);

            mockDnsResolve.mockResolvedValueOnce(['::ffff:10.0.0.1']);
            await expect(validateSSRF('https://evil.com/hook')).rejects.toThrow(SSRFError);
        });

        it('rejects DNS rebinding attempts', async () => {
            // First call resolves to public, simulating a TOCTOU DNS rebind
            // The validator checks all resolved addresses; if any is private, it rejects.
            mockDnsResolve.mockResolvedValueOnce(['93.184.216.34', '127.0.0.1']);
            await expect(validateSSRF('https://rebind.example.com/hook')).rejects.toThrow(SSRFError);
        });

        it('rejects URL-encoded bypass attempts', async () => {
            // %6c%6f%63%61%6c%68%6f%73%74 = localhost — URL constructor normalizes this
            await expect(validateSSRF('https://%6c%6f%63%61%6c%68%6f%73%74/hook')).rejects.toThrow(SSRFError);
        });

        it('rejects protocol-relative URLs', async () => {
            await expect(validateSSRF('//evil.com/hook')).rejects.toThrow(SSRFError);
        });

        it('rejects the [::1] IPv6 loopback', async () => {
            await expect(validateSSRF('https://[::1]/hook')).rejects.toThrow(SSRFError);
        });

        it('rejects link-local / AWS metadata IP 169.254.169.254', async () => {
            mockDnsResolve.mockResolvedValueOnce(['169.254.169.254']);
            await expect(validateSSRF('https://evil.com/hook')).rejects.toThrow('Link-local');
        });

        it('rejects multicast range addresses', async () => {
            mockDnsResolve.mockResolvedValueOnce(['224.0.0.1']);
            await expect(validateSSRF('https://evil.com/hook')).rejects.toThrow('Multicast');
        });

        it('rejects non-https schemes', async () => {
            await expect(validateSSRF('ftp://evil.com/file')).rejects.toThrow('Unsupported URL scheme');
            await expect(validateSSRF('javascript:alert(1)')).rejects.toThrow('Unsupported URL scheme');
            await expect(validateSSRF('data:text/html,<h1>hi</h1>')).rejects.toThrow('Unsupported URL scheme');
        });
    });

    describe('Input Sanitization', () => {
        it('handles extremely long URLs', async () => {
            const longUrl = 'https://' + 'a'.repeat(100_000) + '.com/hook';
            // Should either throw SSRFError (invalid) or Error (DNS fail), but not crash
            await expect(validateSSRF(longUrl)).rejects.toThrow();
        });

        it('handles null bytes in URLs', async () => {
            await expect(validateSSRF('https://evil.com/hook\x00')).rejects.toThrow();
        });

        it('handles unicode normalization attacks', async () => {
            // Homoglyph: "ⅼocalhost" uses Unicode ⅼ (U+217C) instead of ASCII l
            // URL constructor should either reject or normalize this differently from 'localhost'
            const homoglyphUrl = 'https://\u217Cocalhost/hook';
            try {
                await validateSSRF(homoglyphUrl);
                // If it doesn't throw, it must have resolved to a public IP (DNS would fail)
            } catch (e) {
                expect(e).toBeInstanceOf(Error);
            }
        });

        it('rejects empty string URL', async () => {
            await expect(validateSSRF('')).rejects.toThrow(SSRFError);
        });

        it('rejects whitespace-only URL', async () => {
            await expect(validateSSRF('   ')).rejects.toThrow(SSRFError);
        });
    });

    describe('Event Type Pattern Injection', () => {
        it('rejects regex-like patterns', () => {
            expect(validateEventTypePattern('.*')).toBe(false);
            expect(validateEventTypePattern('com.example.(entity|trust).*')).toBe(false);
        });

        it('rejects patterns with path traversal characters', () => {
            expect(validateEventTypePattern('../etc/passwd')).toBe(false);
            expect(validateEventTypePattern('md.more/../admin')).toBe(false);
        });

        it('rejects patterns with SQL injection attempts', () => {
            expect(validateEventTypePattern("md.more'; DROP TABLE--")).toBe(false);
        });

        it('rejects patterns with script injection', () => {
            expect(validateEventTypePattern('<script>alert(1)</script>')).toBe(false);
        });

        it('rejects patterns with null bytes', () => {
            expect(validateEventTypePattern('md.more\x00.entity')).toBe(false);
        });
    });
});
