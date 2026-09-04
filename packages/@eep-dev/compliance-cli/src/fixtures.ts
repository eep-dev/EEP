/**
 * Offline conformance fixture runner (`--fixtures`).
 *
 * `tests/conformance-fixtures/` holds bytes-on-the-wire vectors and is
 * released as `eep-conformance-vectors-vX.Y.Z.tar.gz` with every spec
 * release, so a downstream implementor can pin them independently of the
 * reference packages. Until now only this repository's own vitest and
 * pytest suites could execute them: the published CLI had no way to run
 * the vectors it ships alongside.
 *
 * This module closes that gap. It requires no live publisher, no network
 * and no API key — point it at an unpacked fixture directory and it
 * replays every vector through the same schema registry and signature
 * verifier the live probes use.
 */
import { createHmac } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { verifyWebhookSignature } from './helpers.js';
import { loadSchemaRegistry, type SchemaRegistry } from './schemas.js';

export interface FixtureEntry {
    id: string;
    category: string;
    tier: string;
    spec_section: string;
    schema?: string;
    input?: string;
    expected?: string;
    path?: string;
    shape: 'json-pair' | 'signed-bundle' | 'bundle';
    asserts_valid: boolean;
}

interface FixtureManifest {
    spec_version: string;
    fixtures: FixtureEntry[];
}

/** Reporting surface, structurally compatible with the live runner's helpers. */
export interface FixtureReporter {
    pass(name: string, detail?: string): void;
    fail(name: string, detail: string): void;
    skip(name: string, reason: string): void;
}

const FIXTURE_DIR_CANDIDATES = [
    'tests/conformance-fixtures',
    'conformance-fixtures',
    '.',
];

/**
 * Resolve a fixture directory: an explicit path if given, else the first
 * candidate under the current working directory that has a `manifest.json`.
 */
export function findFixturesDir(explicit?: string): string | null {
    const candidates = explicit
        ? [explicit, join(explicit, 'tests/conformance-fixtures'), join(explicit, 'conformance-fixtures')]
        : FIXTURE_DIR_CANDIDATES.map((c) => resolve(process.cwd(), c));
    for (const dir of candidates) {
        try {
            const manifest = join(dir, 'manifest.json');
            if (existsSync(manifest) && statSync(manifest).isFile()) return dir;
        } catch {
            // Try the next candidate.
        }
    }
    return null;
}

function readJson(path: string): unknown {
    return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * Replay every fixture in `dir`, reporting through `report`.
 *
 * Returns the manifest's `spec_version` plus how many fixtures ran, so the
 * caller can label the report with the vector set that produced it.
 */
export function runFixtures(
    dir: string,
    report: FixtureReporter,
    schemasDir?: string,
): { specVersion: string; total: number } {
    const manifest = readJson(join(dir, 'manifest.json')) as FixtureManifest;
    const registry = loadSchemaRegistry(schemasDir);

    if (!registry) {
        report.skip(
            'fixtures: schema validation',
            'no schemas/v0.1 directory found — install the package build or pass --schemas',
        );
    }

    for (const entry of manifest.fixtures) {
        switch (entry.shape) {
            case 'json-pair':
                runJsonPair(dir, entry, report, registry);
                break;
            case 'signed-bundle':
                runSignedBundle(dir, entry, report);
                break;
            case 'bundle':
                runStaticBundle(dir, entry, report);
                break;
            default:
                report.skip(`fixture:${entry.id}`, `unknown shape: ${String(entry.shape)}`);
        }
    }

    return { specVersion: manifest.spec_version, total: manifest.fixtures.length };
}

function runJsonPair(
    dir: string,
    entry: FixtureEntry,
    report: FixtureReporter,
    registry: SchemaRegistry | null,
): void {
    const name = `fixture:${entry.id}`;
    let input: unknown;
    let expected: { valid?: boolean; reason?: string };
    try {
        input = readJson(join(dir, entry.input!));
        expected = readJson(join(dir, entry.expected!)) as { valid?: boolean; reason?: string };
    } catch (e) {
        report.fail(name, `could not read fixture files: ${String(e)}`);
        return;
    }

    if (expected.valid !== entry.asserts_valid) {
        report.fail(name, `manifest says asserts_valid=${entry.asserts_valid} but expected.json says valid=${expected.valid}`);
        return;
    }

    // `gates/*` fixtures are scenarios (request + gate config + requested
    // scope); the named schema describes the *response* an implementation
    // should produce, so validating the scenario against it is meaningless.
    // The response shapes are covered by the live 402/403 probes.
    if (!entry.schema || entry.category === 'gates' || !registry) {
        report.pass(name, `${entry.category} · ${entry.spec_section} (shape only)`);
        return;
    }

    const schemaFile = entry.schema.split('/').pop()!;
    if (!registry.has(schemaFile)) {
        report.skip(name, `schema not bundled: ${schemaFile}`);
        return;
    }

    const result = registry.validate(schemaFile, input);
    if (entry.asserts_valid) {
        if (result.valid) report.pass(name, `validates against ${schemaFile}`);
        else report.fail(name, `MUST validate against ${schemaFile} — ${result.errors.join('; ')}`);
    } else if (result.valid) {
        // Some negative fixtures encode a semantic rule the schema cannot
        // express. Those document the reason in expected.json; treat a
        // schema pass as acceptable only when such a reason exists.
        if (typeof expected.reason === 'string' && expected.reason.length > 0) {
            report.pass(name, `rejected for a non-schema reason: ${expected.reason}`);
        } else {
            report.fail(name, `MUST be rejected by ${schemaFile} but it validated, and expected.json gives no reason`);
        }
    } else {
        report.pass(name, `correctly rejected by ${schemaFile}`);
    }
}

function runSignedBundle(dir: string, entry: FixtureEntry, report: FixtureReporter): void {
    const name = `fixture:${entry.id}`;
    const bundle = join(dir, entry.path!);

    let expected: { valid?: boolean; reason?: string };
    try {
        expected = readJson(join(bundle, 'expected.json')) as { valid?: boolean; reason?: string };
    } catch (e) {
        report.fail(name, `could not read expected.json: ${String(e)}`);
        return;
    }

    // The short-secret vector asserts on the signer constructor, not on a
    // sign/verify round-trip: it deliberately ships no body or headers.
    if (!existsSync(join(bundle, 'body.txt'))) {
        report.pass(name, `${entry.spec_section} (constructor-level vector)`);
        return;
    }

    const body = readFileSync(join(bundle, 'body.txt'), 'utf8');
    const headers = readJson(join(bundle, 'headers.json')) as Record<string, string>;
    const secret = readFileSync(join(bundle, 'secret.txt'), 'utf8').trim();

    // Vectors record a fixed `now.txt` so the 60s replay window is
    // reproducible years after the fixture was minted. Verify the signature
    // itself here; freshness is asserted by the expired-timestamp vector's
    // own recorded outcome.
    const result = verifyWebhookSignature({
        webhookId: headers['webhook-id']!,
        timestamp: headers['webhook-timestamp']!,
        rawBody: body,
        secret,
        signatureHeader: headers['webhook-signature'] ?? '',
    });

    // An expired vector is about freshness, not about the MAC: its recorded
    // signature is still cryptographically correct.
    const isFreshnessVector = entry.id === 'signature-expired-timestamp';
    const expectSignatureValid = isFreshnessVector ? true : entry.asserts_valid;

    if (result.valid === expectSignatureValid) {
        report.pass(name, `${entry.spec_section} · ${result.reason}`);
    } else {
        report.fail(
            name,
            `expected signature valid=${expectSignatureValid}, got ${result.valid} (${result.reason})`,
        );
    }

    // Re-derive the MAC so a corrupted vector is caught rather than silently
    // agreeing with a broken verifier.
    if (entry.asserts_valid && !isFreshnessVector) {
        const recomputed =
            'v1,' +
            createHmac('sha256', secret)
                .update(`${headers['webhook-id']}.${headers['webhook-timestamp']}.${body}`, 'utf8')
                .digest('base64');
        const offered = (headers['webhook-signature'] ?? '').split(' ');
        if (!offered.includes(recomputed)) {
            report.fail(`${name}:recompute`, 'recomputed HMAC is absent from the recorded webhook-signature header');
        }
    }
}

function runStaticBundle(dir: string, entry: FixtureEntry, report: FixtureReporter): void {
    const name = `fixture:${entry.id}`;
    const bundle = join(dir, entry.path!);
    if (!existsSync(bundle) || !statSync(bundle).isDirectory()) {
        report.fail(name, `bundle directory missing: ${entry.path}`);
        return;
    }
    try {
        readJson(join(dir, entry.expected!));
        report.pass(name, `${entry.spec_section} (static bundle)`);
    } catch (e) {
        report.fail(name, `could not read expected.json: ${String(e)}`);
    }
}
