import { resolve4, resolve6 } from 'dns/promises';

/**
 * @eep-dev/validator
 *
 * SSRF prevention and payload validation for EEP-compliant publishers.
 *
 * Security rationale: see EEP/docs/current/security.md §3
 */

/**
 * Thrown when a URL is detected as pointing to an internal/private network address.
 */
export class SSRFError extends Error {
    constructor(message: string) {
        super(`SSRFError: ${message}`);
        this.name = 'SSRFError';
    }
}

/**
 * Private/reserved IP CIDR ranges that MUST be blocked.
 * Source: RFC 1918, RFC 5735, RFC 6890.
 */
const BLOCKED_CIDRS: Array<{ start: bigint; end: bigint; label: string }> = [
    // IPv4 loopback
    { start: ipv4ToBigInt('127.0.0.0'), end: ipv4ToBigInt('127.255.255.255'), label: 'IPv4 loopback (127.0.0.0/8)' },
    // Private class A
    { start: ipv4ToBigInt('10.0.0.0'), end: ipv4ToBigInt('10.255.255.255'), label: 'Private class A (10.0.0.0/8)' },
    // Private class B
    { start: ipv4ToBigInt('172.16.0.0'), end: ipv4ToBigInt('172.31.255.255'), label: 'Private class B (172.16.0.0/12)' },
    // Private class C
    { start: ipv4ToBigInt('192.168.0.0'), end: ipv4ToBigInt('192.168.255.255'), label: 'Private class C (192.168.0.0/16)' },
    // Link-local (includes AWS metadata: 169.254.169.254)
    { start: ipv4ToBigInt('169.254.0.0'), end: ipv4ToBigInt('169.254.255.255'), label: 'Link-local (169.254.0.0/16)' },
    // This network
    { start: ipv4ToBigInt('0.0.0.0'), end: ipv4ToBigInt('0.255.255.255'), label: 'Reserved (0.0.0.0/8)' },
    // Multicast
    { start: ipv4ToBigInt('224.0.0.0'), end: ipv4ToBigInt('239.255.255.255'), label: 'Multicast (224.0.0.0/4)' },
    // Reserved/Broadcast
    { start: ipv4ToBigInt('240.0.0.0'), end: ipv4ToBigInt('255.255.255.255'), label: 'Reserved (240.0.0.0/4)' },
];

/**
 * Validates that a URL is safe to use as a webhook delivery endpoint.
 *
 * Checks performed:
 * 1. URL must use https:// scheme (http:// allowed only if allowHttp=true)
 * 2. DNS resolved to a public IP address (no private/reserved ranges)
 * 3. Hostname must not be a localhost alias
 *
 * This MUST be called before making any outbound HTTP request to a user-supplied URL.
 *
 * @param urlString - The delivery_url from the subscription request.
 * @param options.allowHttp - Allow http:// (for local dev only, never in production).
 * @throws {SSRFError} if the URL is unsafe.
 * @throws {Error} if DNS resolution fails.
 */
export async function validateSSRF(
    urlString: string,
    options: { allowHttp?: boolean } = {}
): Promise<void> {
    let url: URL;
    try {
        url = new URL(urlString);
    } catch {
        throw new SSRFError('Invalid URL: could not parse');
    }

    // 1. Scheme validation
    if (url.protocol === 'http:' && !options.allowHttp) {
        throw new SSRFError('http:// URLs are not allowed. Use https:// instead.');
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        throw new SSRFError(`Unsupported URL scheme: ${url.protocol}`);
    }

    // 2. Localhost alias check
    const hostname = url.hostname.toLowerCase();
    const localhostAliases = ['localhost', '0', '0.0.0.0', '[::1]', '::1'];
    if (localhostAliases.includes(hostname)) {
        throw new SSRFError(`Blocked hostname: '${hostname}' resolves to localhost`);
    }

    // 3. DNS resolution and IP validation.
    //    Resolve BOTH address families: a host can present a public IPv4 (A) while
    //    hiding a private IPv6 (AAAA) — or vice versa — and the OS resolver may then
    //    connect over the unchecked family. Block if *any* resolved address is private;
    //    only treat the host as unresolvable when *both* families fail.
    const resolvedAddresses: string[] = [];
    const resolutionErrors: string[] = [];
    const settled = await Promise.allSettled([resolve4(hostname), resolve6(hostname)]);
    for (const result of settled) {
        if (result.status === 'fulfilled') {
            resolvedAddresses.push(...result.value);
        } else {
            resolutionErrors.push((result.reason as Error).message);
        }
    }
    if (resolvedAddresses.length === 0) {
        throw new SSRFError(`DNS resolution failed for '${hostname}': ${resolutionErrors.join('; ')}`);
    }

    for (const address of resolvedAddresses) {
        checkIPBlocked(address, hostname);
    }
}

function checkIPBlocked(ip: string, hostname: string): void {
    if (ip.includes(':')) {
        const lowerIp = ip.toLowerCase();

        // Block IPv6 loopback and unspecified addresses.
        if (lowerIp === '::1' || lowerIp === '::') {
            throw new SSRFError(`Blocked IPv6 address: ${ip} (${hostname}) is a private/reserved address`);
        }

        // Block IPv4-mapped IPv6 addresses like ::ffff:192.168.1.1
        if (lowerIp.startsWith('::ffff:')) {
            const ipv4Part = lowerIp.replace('::ffff:', '');
            checkIPBlocked(ipv4Part, hostname);
            return;
        }

        const firstSegment = lowerIp.split(':').find(segment => segment.length > 0);
        if (firstSegment) {
            const firstHextet = Number.parseInt(firstSegment, 16);
            if (!Number.isNaN(firstHextet)) {
                // RFC 4193 ULA range is fc00::/7, which includes both fcxx and fdxx.
                if ((firstHextet & 0xfe00) === 0xfc00) {
                    throw new SSRFError(`Blocked IPv6 address: ${ip} (${hostname}) is a private/reserved address`);
                }
                // Link-local addresses are fe80::/10.
                if ((firstHextet & 0xffc0) === 0xfe80) {
                    throw new SSRFError(`Blocked IPv6 address: ${ip} (${hostname}) is a private/reserved address`);
                }
            }
        }
        return;
    }

    // IPv4
    const ipInt = ipv4ToBigInt(ip);
    for (const range of BLOCKED_CIDRS) {
        if (ipInt >= range.start && ipInt <= range.end) {
            throw new SSRFError(`Blocked IP: ${ip} (${hostname}) falls within ${range.label}`);
        }
    }
}

function ipv4ToBigInt(ip: string): bigint {
    const parts = ip.split('.').map(Number);
    return BigInt((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) & 0xFFFFFFFFn;
}

/**
 * Validate an event type pattern string used in subscription requests.
 * Supports flat dot-notation and wildcard suffix (e.g., 'com.example.entity.*').
 */
export function validateEventTypePattern(pattern: string): boolean {
    // Allow: lowercase.separated.parts and optional .* suffix
    return /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)*(\.\*)?$/.test(pattern);
}

/**
 * Check if an event type matches a subscription pattern.
 * Supports wildcard suffix: 'com.example.entity.*' matches 'com.example.entity.updated'.
 */
export function matchesEventType(eventType: string, pattern: string): boolean {
    if (pattern.endsWith('.*')) {
        const prefix = pattern.slice(0, -2); // remove '.*'
        return eventType === prefix || eventType.startsWith(`${prefix}.`);
    }
    return eventType === pattern;
}

/**
 * Check if an event type matches any pattern in a subscription's event_types array.
 */
export function matchesAnyPattern(eventType: string, patterns: string[]): boolean {
    return patterns.some(pattern => matchesEventType(eventType, pattern));
}
