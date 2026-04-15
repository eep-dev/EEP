/**
 * @eep-dev/discovery — HTTP Link Header Parsing
 *
 * Implements EEP discovery via Link headers (Whitepaper §4.4):
 *   Link: <https://api.example.com/.well-known/eep.json>; rel="eep"
 *
 * Agents inspect HTTP responses for Link headers with rel="eep" or rel="subscribe"
 * to discover EEP capabilities.
 */

export interface EEPLinkInfo {
    /** URL of the EEP manifest or subscribe endpoint */
    url: string;
    /** Relationship type: "eep" for manifest, "subscribe" for subscription endpoint */
    rel: string;
    /** Optional media type hint */
    type?: string;
}

/**
 * Parse a Link header value and extract EEP-relevant links.
 *
 * Handles standard RFC 5988 Link header format:
 *   Link: <url>; rel="eep", <url2>; rel="subscribe"
 *
 * @param headerValue - The raw Link header value
 * @returns Array of EEP-relevant link info objects (only rel="eep" and rel="subscribe")
 */
export function parseLinkHeader(headerValue: string | null | undefined): EEPLinkInfo[] {
    if (!headerValue) return [];

    const results: EEPLinkInfo[] = [];
    const EEP_RELS = ['eep', 'subscribe'];

    // Split on commas that are outside angle brackets
    const parts = splitLinks(headerValue);

    for (const part of parts) {
        const urlMatch = part.match(/<([^>]+)>/);
        if (!urlMatch) continue;

        const url = urlMatch[1];

        // Extract rel parameter
        const relMatch = part.match(/rel="([^"]+)"/i);
        if (!relMatch) continue;

        const rel = relMatch[1].toLowerCase();
        if (!EEP_RELS.includes(rel)) continue;

        // Extract optional type parameter
        const typeMatch = part.match(/type="([^"]+)"/i);

        const info: EEPLinkInfo = { url, rel };
        if (typeMatch) info.type = typeMatch[1];

        results.push(info);
    }

    return results;
}

/**
 * Split a Link header value by commas, but only outside angle brackets.
 */
function splitLinks(value: string): string[] {
    const parts: string[] = [];
    let current = '';
    let inBracket = false;

    for (const ch of value) {
        if (ch === '<') inBracket = true;
        if (ch === '>') inBracket = false;
        if (ch === ',' && !inBracket) {
            parts.push(current.trim());
            current = '';
        } else {
            current += ch;
        }
    }

    if (current.trim()) parts.push(current.trim());
    return parts;
}
