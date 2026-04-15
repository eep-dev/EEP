/**
 * @eep-dev/discovery — EEP Discovery Utilities
 *
 * Implements the three discovery mechanisms from Whitepaper §4:
 *   1. Well-known manifest validation (§4.1)
 *   2. HTTP Link header parsing (§4.4)
 *   3. DNS TXT record parsing (§4.4)
 *
 * @license Apache-2.0
 */

export { validateManifest, type ManifestValidationResult } from './manifest.js';
export { parseLinkHeader, type EEPLinkInfo } from './link-header.js';
export { parseDnsTxtRecord, type DnsTxtResult } from './dns.js';
