/**
 * @eep-dev/discovery — DNS TXT Record Parsing
 *
 * Implements EEP discovery via DNS TXT records (Whitepaper §4.4):
 *   _eep.domain.com TXT "v=eep1; manifest=https://api.domain.com/.well-known/eep.json"
 *
 * Used as a fallback discovery mechanism for IoT and constrained environments.
 */

export interface DnsTxtResult {
    valid: boolean;
    version?: string;
    manifestUrl?: string;
    error?: string;
}

/**
 * Parse an EEP DNS TXT record value.
 *
 * Expected format: "v=eep1; manifest=https://..."
 *
 * @param txtRecord - The raw TXT record value
 * @returns Parsed result with version and manifest URL
 */
export function parseDnsTxtRecord(txtRecord: string | null | undefined): DnsTxtResult {
    if (!txtRecord || typeof txtRecord !== 'string') {
        return { valid: false, error: 'Empty or missing TXT record' };
    }

    const trimmed = txtRecord.trim();

    // Parse key=value pairs separated by semicolons
    const pairs = new Map<string, string>();
    for (const segment of trimmed.split(';')) {
        const eqIdx = segment.indexOf('=');
        if (eqIdx === -1) continue;
        const key = segment.slice(0, eqIdx).trim().toLowerCase();
        const value = segment.slice(eqIdx + 1).trim();
        pairs.set(key, value);
    }

    // Validate version
    const version = pairs.get('v');
    if (!version) {
        return { valid: false, error: 'Missing required field: v (version)' };
    }
    if (!version.startsWith('eep')) {
        return { valid: false, error: `Invalid version prefix: '${version}' — must start with 'eep'` };
    }

    // Validate manifest URL
    const manifestUrl = pairs.get('manifest');
    if (!manifestUrl) {
        return { valid: false, error: 'Missing required field: manifest' };
    }
    if (!manifestUrl.startsWith('https://')) {
        return { valid: false, error: `Manifest URL must use HTTPS: '${manifestUrl}'` };
    }

    return { valid: true, version, manifestUrl };
}
