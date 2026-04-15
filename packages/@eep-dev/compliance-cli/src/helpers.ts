/**
 * @eep-dev/compliance-cli — Testable helper utilities
 *
 * This module extracts pure, testable functions from the CLI.
 * The main CLI entry point (index.ts) imports from here.
 */

export interface TestResult {
    name: string;
    status: 'pass' | 'fail' | 'skip';
    detail?: string;
}

/**
 * Create a test result collector.
 * Returns { pass, fail, skip, results, summary }.
 */
export function createTestRunner() {
    const results: TestResult[] = [];

    function pass(name: string, detail?: string) {
        results.push({ name, status: 'pass', detail });
    }

    function fail(name: string, detail: string) {
        results.push({ name, status: 'fail', detail });
    }

    function skip(name: string, reason: string) {
        results.push({ name, status: 'skip', detail: reason });
    }

    function summary() {
        const passed = results.filter(r => r.status === 'pass').length;
        const failed = results.filter(r => r.status === 'fail').length;
        const skipped = results.filter(r => r.status === 'skip').length;
        return { passed, failed, skipped, total: results.length };
    }

    function conformanceLabel(level: string): string {
        const { failed } = summary();
        if (failed === 0 && level === 'core') return '🥉 Core EEP Compliant';
        if (failed === 0 && level === 'standard') return '🥈 Standard EEP Compliant';
        if (failed === 0 && level === 'full') return '🏆 Full EEP Compliant';
        return `❌ Not EEP Compliant (${failed} failure${failed !== 1 ? 's' : ''})`;
    }

    return { pass, fail, skip, results, summary, conformanceLabel };
}

/**
 * Validate CLI arguments.
 * Returns an error message string if invalid, null if valid.
 */
export function validateArgs(args: {
    target?: string;
    level?: string;
    port?: string;
}): string | null {
    if (!args.target) {
        return 'Missing required argument: --target';
    }
    if (args.level && !['core', 'standard', 'full'].includes(args.level)) {
        return `Invalid conformance level: '${args.level}'. Must be one of: core, standard, full`;
    }
    if (args.port) {
        const port = parseInt(args.port, 10);
        if (isNaN(port) || port < 1 || port > 65535) {
            return `Invalid port: '${args.port}'. Must be a number between 1 and 65535`;
        }
    }
    return null;
}

/**
 * Normalize a target URL by stripping trailing slashes.
 */
export function normalizeTarget(url: string): string {
    return url.replace(/\/+$/, '');
}

/**
 * Validate a CloudEvents envelope has the required EEP fields.
 * Returns an array of missing field names (empty = valid).
 */
export function validateCloudEventsEnvelope(event: Record<string, unknown>): string[] {
    const missing: string[] = [];
    const requiredFields = ['specversion', 'id', 'source', 'type', 'time'];
    for (const field of requiredFields) {
        if (!event[field]) missing.push(field);
    }
    if (event.specversion !== '1.0') {
        missing.push('specversion (must be "1.0")');
    }
    return missing;
}

/**
 * Validate that EEP extension attributes are present.
 * Returns an array of missing attribute names.
 */
export function validateEEPExtensions(event: Record<string, unknown>): string[] {
    const missing: string[] = [];
    if (!event.eep_version) missing.push('eep_version');
    return missing;
}

/**
 * Check if Standard Webhooks headers are present.
 * Returns { hasId, hasTimestamp, hasSignature, missing[] }.
 */
export function checkWebhookHeaders(headers: Record<string, string | undefined>): {
    hasId: boolean;
    hasTimestamp: boolean;
    hasSignature: boolean;
    missing: string[];
} {
    const hasId = !!headers['webhook-id'];
    const hasTimestamp = !!headers['webhook-timestamp'];
    const hasSignature = !!headers['webhook-signature'];
    const missing: string[] = [];
    if (!hasId) missing.push('webhook-id');
    if (!hasTimestamp) missing.push('webhook-timestamp');
    if (!hasSignature) missing.push('webhook-signature');
    return { hasId, hasTimestamp, hasSignature, missing };
}
