/**
 * @eep-dev/gates — Resource Matcher
 *
 * Wildcard resource pattern matching for gate access control.
 * Patterns use dot notation with * as a wildcard suffix.
 *
 * Examples:
 *   "profile.*"  matches "profile.bio", "profile.skills", "profile.contact.email"
 *   "*"          matches everything
 *   "events.public" matches only "events.public" exactly
 */

/**
 * Check if a resource matches a given access pattern.
 *
 * Rules:
 * - "*" matches any resource
 * - "a.b.*" matches "a.b", "a.b.c", "a.b.c.d", etc.
 * - "a.b.c" matches only "a.b.c" exactly
 */
export function matchResource(pattern: string, resource: string): boolean {
    // Universal wildcard
    if (pattern === '*') return true;

    // Exact match
    if (pattern === resource) return true;

    // Wildcard suffix: "a.b.*" matches anything starting with "a.b"
    if (pattern.endsWith('.*')) {
        const prefix = pattern.slice(0, -2); // Remove ".*"
        return resource === prefix || resource.startsWith(prefix + '.');
    }

    return false;
}

/**
 * Check if a resource matches ANY pattern in an access list.
 */
export function matchesAny(patterns: string[], resource: string): boolean {
    return patterns.some(p => matchResource(p, resource));
}

/**
 * Find all tiers that grant access to a specific resource.
 * Returns tier keys sorted by specificity (exact matches first, then wildcards).
 */
export function findTiersForResource(
    tiers: Record<string, { access: string[] }>,
    resource: string
): string[] {
    const matches: Array<{ key: string; specificity: number }> = [];

    for (const [key, tier] of Object.entries(tiers)) {
        for (const pattern of tier.access) {
            if (matchResource(pattern, resource)) {
                // Higher specificity = more specific pattern
                const specificity = pattern === '*' ? 0 :
                    pattern.endsWith('.*') ? pattern.length :
                        pattern.length + 1000; // Exact matches are most specific
                matches.push({ key, specificity });
                break; // One match per tier is enough
            }
        }
    }

    return matches
        .sort((a, b) => b.specificity - a.specificity)
        .map(m => m.key);
}
