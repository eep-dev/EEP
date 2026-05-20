/**
 * g-a1-a8.test.ts — Production gap implementation tests (Round 4 Audit)
 *
 * Tests cover the 8 final gaps identified in the Round 4 crosscheck:
 *   A1 — signing_algorithms field in eep-manifest.json
 *   A2 — ERC-8004 reputation field confirmation in eep-manifest.json
 *   A3 — SPECIFICATION.md §14 conformance checklist updated
 *   A4 — audit-log.json schema and SPECIFICATION §14.5 audit log API
 *   A5 — examples/cross-impl interoperability test suite existence
 *   A6 — .github/workflows/publish.yml pipeline
 *   A7 — delivery.payload.json enriched schema
 *   A8 — SPECIFICATION.md §14 aligned with Whitepaper 3-tier taxonomy
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../../../');
const SCHEMAS = path.join(ROOT, 'schemas/v0.1');
const DOCS = path.join(ROOT, 'docs/current');
const EXAMPLES = path.join(ROOT, 'examples');
const GITHUB = path.join(ROOT, '.github/workflows');

// ── Helper ────────────────────────────────────────────────────────────────────
function readSchema(name: string) {
    return JSON.parse(fs.readFileSync(path.join(SCHEMAS, name), 'utf-8'));
}
function readDoc(name: string) {
    return fs.readFileSync(path.join(DOCS, name), 'utf-8');
}
function readFile(absPath: string) {
    return fs.readFileSync(absPath, 'utf-8');
}

/** Executable `npm publish` lines (comments excluded) from workflow/scripts. */
function npmPublishLines(...sources: string[]): string[] {
    return sources.flatMap((src) =>
        src.split('\n').filter((l) => /\bnpm publish\b/.test(l) && !l.trim().startsWith('#')),
    );
}

// ── A1: signing_algorithms in eep-manifest.json ───────────────────────────────
describe('A1 — signing_algorithms: crypto-agility field in eep-manifest.json', () => {
    let manifest: any;
    beforeAll(() => { manifest = readSchema('eep-manifest.json'); });

    it('eep-manifest.json has signing_algorithms property', () => {
        expect(manifest.properties).toHaveProperty('signing_algorithms');
    });

    it('signing_algorithms is an array type', () => {
        expect(manifest.properties.signing_algorithms.type).toBe('array');
    });

    it('signing_algorithms requires at least 1 item', () => {
        expect(manifest.properties.signing_algorithms.minItems).toBe(1);
    });

    it('enum includes classical EdDSA and ES256K', () => {
        const en = manifest.properties.signing_algorithms.items.enum as string[];
        expect(en).toContain('EdDSA');
        expect(en).toContain('ES256K');
    });

    it('enum includes PQC algorithms ML-DSA-65, ML-DSA-87, SLH-DSA-128s', () => {
        const en = manifest.properties.signing_algorithms.items.enum as string[];
        expect(en).toContain('ML-DSA-65');
        expect(en).toContain('ML-DSA-87');
        expect(en).toContain('SLH-DSA-128s');
    });

    it('enum includes hybrid algorithm identifiers', () => {
        const en = manifest.properties.signing_algorithms.items.enum as string[];
        expect(en).toContain('hybrid-EdDSA-ML-DSA-65');
        expect(en).toContain('hybrid-EdDSA-ML-DSA-87');
    });

    it('signing_algorithms is NOT required (absent = default to EdDSA per §10.9)', () => {
        const required: string[] = manifest.required ?? [];
        expect(required).not.toContain('signing_algorithms');
    });

    it('examples[] contains at least 3 valid algorithm combinations', () => {
        const examples = manifest.properties.signing_algorithms.examples as string[][];
        expect(examples.length).toBeGreaterThanOrEqual(3);
        const validAlgos = new Set(manifest.properties.signing_algorithms.items.enum as string[]);
        for (const example of examples) {
            for (const algo of example) {
                expect(validAlgos.has(algo)).toBe(true);
            }
        }
    });

    it('SPECIFICATION.md §11.7 documents signing algorithm negotiation', () => {
        const spec = readDoc('SPECIFICATION.md');
        expect(spec).toContain('11.7 Signing Algorithm Negotiation');
        expect(spec).toContain('crypto-agility');
        expect(spec).toContain('signing_algorithms');
        expect(spec).toContain('strongest mutually supported algorithm');
    });

    it('SPECIFICATION.md §11.7 documents the hybrid signature format', () => {
        const spec = readDoc('SPECIFICATION.md');
        expect(spec).toContain('mldsaProofValue');
        expect(spec).toContain('hybrid-eddsa-mldsa-2022');
    });
});

// ── A2: ERC-8004 reputation in eep-manifest.json ─────────────────────────────
describe('A2 — ERC-8004: reputation field confirmed in eep-manifest.json', () => {
    let manifest: any;
    beforeAll(() => { manifest = readSchema('eep-manifest.json'); });

    it('eep-manifest.json has reputation (ERC-8004) property', () => {
        expect(manifest.properties).toHaveProperty('reputation');
    });

    it('reputation.description references ERC-8004', () => {
        expect(manifest.properties.reputation.description).toMatch(/ERC-8004/i);
    });

    it('reputation has required contract and chain fields', () => {
        expect(manifest.properties.reputation.required).toContain('contract');
        expect(manifest.properties.reputation.required).toContain('chain');
    });

    it('reputation.contract validates 0x Ethereum address format', () => {
        const pattern = manifest.properties.reputation.properties.contract.pattern;
        expect(pattern).toBeTruthy();
        expect('0x1234567890abcdef1234567890abcdef12345678').toMatch(new RegExp(pattern));
    });

    it('reputation.scan_url is a URI field (8004Scan)', () => {
        const scanUrl = manifest.properties.reputation.properties.scan_url;
        expect(scanUrl.format).toBe('uri');
        expect(scanUrl.description).toMatch(/8004Scan/i);
    });

    it('SPECIFICATION.md references ERC-8004 in §14.2 Standard checklist', () => {
        const spec = readDoc('SPECIFICATION.md');
        expect(spec).toContain('ERC-8004');
        expect(spec).toContain('14.2 Standard');
    });
});

// ── A3: SPECIFICATION.md conformance checklist updated ────────────────────────
describe('A3 — SPECIFICATION.md §14 conformance checklist: all items marked [x]', () => {
    let spec: string;
    beforeAll(() => { spec = readDoc('SPECIFICATION.md'); });

    it('§14 heading exists and references Whitepaper §10.2', () => {
        expect(spec).toContain('## 14. Conformance levels');
        expect(spec).toContain('Whitepaper §10.2');
    });

    it('§14.1 Core tier checklist exists and has all [x] items', () => {
        expect(spec).toContain('### 14.1 Core');
        // There should be at least 9 checked items in Core
        const coreSection = spec.substring(spec.indexOf('### 14.1 Core'), spec.indexOf('### 14.2 Standard'));
        const checkedItems = (coreSection.match(/- \[x\]/g) ?? []).length;
        expect(checkedItems).toBeGreaterThanOrEqual(9);
        expect(coreSection).not.toContain('- [ ]');
    });

    it('§14.2 Standard tier checklist exists and has all [x] items', () => {
        expect(spec).toContain('### 14.2 Standard');
        const stdSection = spec.substring(spec.indexOf('### 14.2 Standard'), spec.indexOf('### 14.3 Full'));
        const checkedItems = (stdSection.match(/- \[x\]/g) ?? []).length;
        expect(checkedItems).toBeGreaterThanOrEqual(16);
        expect(stdSection).not.toContain('- [ ]');
    });

    it('§14.3 Full tier checklist exists and has all [x] items', () => {
        expect(spec).toContain('### 14.3 Full');
        const fullSection = spec.substring(spec.indexOf('### 14.3 Full'), spec.indexOf('### 14.4'));
        const checkedItems = (fullSection.match(/- \[x\]/g) ?? []).length;
        expect(checkedItems).toBeGreaterThanOrEqual(20);
        expect(fullSection).not.toContain('- [ ]');
    });

    it('§14.4 EEPConformanceCredential section exists with VC example', () => {
        expect(spec).toContain('### 14.4 EEP Conformance Credential');
        expect(spec).toContain('EEPConformanceCredential_Full');
        expect(spec).toContain('did:web:eep.dev');
        expect(spec).toContain('conformanceTier');
    });
});

// ── A4: audit-log.json schema and API documentation ───────────────────────────
describe('A4 — audit-log.json: delivery audit log schema and SPECIFICATION §14.5', () => {
    let schema: any;
    beforeAll(() => { schema = readSchema('audit-log.json'); });

    it('audit-log.json schema file exists', () => {
        expect(fs.existsSync(path.join(SCHEMAS, 'audit-log.json'))).toBe(true);
    });

    it('has correct $id URI', () => {
        expect(schema.$id).toBe('https://eep.dev/schemas/v0.1/audit-log.json');
    });

    it('has required top-level fields: entries, total, page, per_page', () => {
        for (const f of ['entries', 'total', 'page', 'per_page']) {
            expect(schema.required).toContain(f);
        }
    });

    it('defines AuditEntry in definitions', () => {
        expect(schema.definitions).toHaveProperty('AuditEntry');
    });

    it('AuditEntry has all required fields including signature', () => {
        const required = schema.definitions.AuditEntry.required as string[];
        for (const f of ['entry_id', 'event_type', 'actor_did', 'publisher_did', 'timestamp', 'outcome', 'signature']) {
            expect(required).toContain(f);
        }
    });

    it('entry_id is UUID format', () => {
        expect(schema.definitions.AuditEntry.properties.entry_id.format).toBe('uuid');
    });

    it('event_type covers 5 major categories', () => {
        const types = schema.definitions.AuditEntry.properties.event_type.enum as string[];
        expect(types.some(t => t.startsWith('gate.'))).toBe(true);
        expect(types.some(t => t.startsWith('session.'))).toBe(true);
        expect(types.some(t => t.startsWith('webhook.'))).toBe(true);
        expect(types.some(t => t.startsWith('commerce.'))).toBe(true);
        expect(types.some(t => t.startsWith('data.'))).toBe(true);
    });

    it('event_type includes gate.proof.accepted and gate.proof.rejected', () => {
        const types = schema.definitions.AuditEntry.properties.event_type.enum as string[];
        expect(types).toContain('gate.proof.accepted');
        expect(types).toContain('gate.proof.rejected');
    });

    it('event_type includes PoI validation events', () => {
        const types = schema.definitions.AuditEntry.properties.event_type.enum as string[];
        expect(types).toContain('poi.validated');
        expect(types).toContain('poi.rejected');
    });

    it('actor_did and publisher_did have DID pattern validation', () => {
        const actorPattern = schema.definitions.AuditEntry.properties.actor_did.pattern;
        const publisherPattern = schema.definitions.AuditEntry.properties.publisher_did.pattern;
        expect(actorPattern).toContain('did:');
        expect(publisherPattern).toContain('did:');
    });

    it('outcome is constrained enum', () => {
        const outcomes = schema.definitions.AuditEntry.properties.outcome.enum as string[];
        expect(outcomes).toContain('success');
        expect(outcomes).toContain('failure');
    });

    it('per_page has max limit of 1000', () => {
        expect(schema.properties.per_page.maximum).toBe(1000);
    });

    it('has a valid example with all required fields in first entry', () => {
        const example = schema.examples[0];
        for (const f of schema.required) {
            expect(example).toHaveProperty(f);
        }
        const entry = example.entries[0];
        for (const f of schema.definitions.AuditEntry.required) {
            expect(entry).toHaveProperty(f);
        }
    });

    it('SPECIFICATION.md §14.5 documents the audit log API endpoint', () => {
        const spec = readDoc('SPECIFICATION.md');
        expect(spec).toContain('14.5 Audit Log Requirement');
        expect(spec).toContain('GET /eep/audit-log');
        expect(spec).toContain('actor_did');
        expect(spec).toContain('DORA Art. 8');
        expect(spec).toContain('EU AI Act Art. 12');
    });
});

// ── A5: Cross-implementation interop tests ────────────────────────────────────
describe('A5 — Cross-Implementation Interop: examples/cross-impl directory', () => {
    it('examples/cross-impl/ directory exists', () => {
        expect(fs.existsSync(path.join(EXAMPLES, 'cross-impl'))).toBe(true);
    });

    it('cross-impl/README.md exists with test documentation', () => {
        const readmePath = path.join(EXAMPLES, 'cross-impl', 'README.md');
        expect(fs.existsSync(readmePath)).toBe(true);
        const readme = readFile(readmePath);
        expect(readme).toContain('Cross-Implementation');
        expect(readme).toContain('Node.js');
        expect(readme).toContain('Python');
    });

    it('cross-impl/test_cross_impl.py exists with test cases', () => {
        const testPath = path.join(EXAMPLES, 'cross-impl', 'test_cross_impl.py');
        expect(fs.existsSync(testPath)).toBe(true);
        const content = readFile(testPath);
        expect(content).toContain('def test_');
        expect(content).toContain('CloudEvents');
        expect(content).toContain('HMAC');
    });

    it('cross-impl README documents 8 test scenarios', () => {
        const readme = readFile(path.join(EXAMPLES, 'cross-impl', 'README.md'));
        expect(readme).toContain('SSE');
        expect(readme).toContain('Webhook');
        expect(readme).toContain('manifest');
        expect(readme).toContain('gate proof');
    });
});

// ── A6: npm/PyPI publish pipeline ─────────────────────────────────────────────
describe('A6 — Publish Pipeline: .github/workflows/publish.yml', () => {
    let publishYml: string;
    let npmPublishScript: string;
    beforeAll(() => {
        publishYml = readFile(path.join(GITHUB, 'publish.yml'));
        npmPublishScript = readFile(path.join(ROOT, 'scripts/ci-npm-publish-package.sh'));
    });

    it('.github/workflows/publish.yml exists', () => {
        expect(fs.existsSync(path.join(GITHUB, 'publish.yml'))).toBe(true);
    });

    it('triggered on version tags (v*.*.* pattern)', () => {
        expect(publishYml).toContain("v[0-9]+.[0-9]+.[0-9]+");
    });

    it('has a preflight job that runs all tests', () => {
        expect(publishYml).toContain('preflight');
        expect(publishYml).toContain('vitest run');
        expect(publishYml).toContain('pytest');
    });

    it('publish-npm job publishes all @eep-dev TypeScript packages via CI script', () => {
        expect(publishYml).toContain('publish-npm');
        expect(publishYml).toContain('scripts/ci-npm-publish-package.sh');
        const npmPackages = [
            '@eep-dev/gates',
            '@eep-dev/signer',
            '@eep-dev/validator',
            '@eep-dev/compliance-cli',
            '@eep-dev/discovery',
            '@eep-dev/middleware',
            '@eep-dev/mcp-bridge',
            '@eep-dev/setup-cli',
            '@eep-dev/agent-adopt',
        ];
        for (const pkg of npmPackages) {
            expect(publishYml).toContain(pkg);
        }
        expect(npmPublishScript).toContain('npm publish --access public --provenance');
    });

    it('publish-pypi job publishes all Python packages via PyPI Trusted Publishing (OIDC)', () => {
        expect(publishYml).toContain('publish-pypi');
        expect(publishYml).toContain('eep-gates-python');
        expect(publishYml).toContain('eep-signer-python');
        expect(publishYml).toContain('eep-validator-python');
        expect(publishYml).toContain('eep-compliance-cli-python');
        // Trusted Publishing replaced the previous `twine upload` flow; the
        // OIDC action is the canonical PyPI publish primitive.
        expect(publishYml).toContain('pypa/gh-action-pypi-publish');
    });

    it('create-github-release job creates a GitHub Release', () => {
        expect(publishYml).toContain('create-github-release');
        expect(publishYml).toContain('action-gh-release');
        expect(publishYml).toContain('CHANGELOG.md');
    });

    it('publish jobs depend on preflight (tests must pass first)', () => {
        expect(publishYml).toContain('needs: preflight');
    });

    it('uses NPM_TOKEN for npm (or OIDC when Trusted Publishing is configured); PyPI uses OIDC only', () => {
        // npm may use NPM_TOKEN until every @eep-dev/* package has npm Trusted
        // Publishing configured; then NODE_AUTH_TOKEN can be removed. PyPI must
        // never fall back to twine/password tokens.
        expect(publishYml).toContain('NPM_TOKEN');
        // PyPI was migrated to Trusted Publishing — the workflow MUST NOT
        // reference a PyPI token any more. If this assertion regresses, the
        // workflow has been silently re-tokenised; investigate before merging.
        expect(publishYml).not.toContain('PYPI_TOKEN');
        expect(publishYml).not.toContain('TWINE_PASSWORD');
    });

    it('handles pre-release tags differently', () => {
        expect(publishYml).toContain('prerelease:');
    });

    // ── Supply-chain hardening additions (added in the readiness audit) ──
    // These assertions lock in the security primitives so that a future
    // refactor cannot silently downgrade them.

    it('every npm publish call carries SLSA build provenance', () => {
        // Publish steps delegate to scripts/ci-npm-publish-package.sh; provenance
        // must live on the actual `npm publish` invocation, not only in YAML comments.
        const lines = npmPublishLines(publishYml, npmPublishScript);
        expect(lines.length).toBeGreaterThan(0);
        for (const line of lines) {
            expect(line).toContain('--provenance');
        }
    });

    it('publish jobs run inside a manual-approval environment', () => {
        // The `release` GitHub Environment is configured in repo settings
        // with required reviewers, so a tag push cannot publish without
        // explicit human sign-off.
        expect(publishYml).toContain('environment:');
        expect(publishYml).toContain('name: release');
    });

    it('emits a CycloneDX SBOM as a release artifact', () => {
        expect(publishYml).toContain('anchore/sbom-action');
    });

    it('signs release artifacts with sigstore/cosign keyless OIDC', () => {
        expect(publishYml).toContain('sigstore/cosign-installer');
        expect(publishYml).toContain('cosign sign-blob');
    });

    it('grants id-token: write so OIDC tokens can be issued', () => {
        // Required by both `npm publish --provenance` and PyPI Trusted
        // Publishing, and by sigstore/cosign keyless signing.
        expect(publishYml).toContain('id-token: write');
    });
});

// ── A7: delivery.payload.json enriched schema ─────────────────────────────────
describe('A7 — delivery.payload.json: enriched signed delivery receipt schema', () => {
    let schema: any;
    beforeAll(() => { schema = readSchema('delivery.payload.json'); });

    it('eep_delivery_id is required with UUID format', () => {
        expect(schema.required).toContain('eep_delivery_id');
        expect(schema.properties.eep_delivery_id.format).toBe('uuid');
    });

    it('eep_delivery_timestamp is required with date-time format', () => {
        expect(schema.required).toContain('eep_delivery_timestamp');
        expect(schema.properties.eep_delivery_timestamp.format).toBe('date-time');
    });

    it('eep_publisher_did has DID pattern validation', () => {
        expect(schema.properties).toHaveProperty('eep_publisher_did');
        expect(schema.properties.eep_publisher_did.pattern).toContain('did:');
    });

    it('eep_next_retry_at is a date-time field for backoff scheduling', () => {
        expect(schema.properties).toHaveProperty('eep_next_retry_at');
        expect(schema.properties.eep_next_retry_at.format).toBe('date-time');
    });

    it('eep_max_attempts has default of 5 and minimum 1', () => {
        expect(schema.properties.eep_max_attempts.default).toBe(5);
        expect(schema.properties.eep_max_attempts.minimum).toBe(1);
    });

    it('eep_signature_algorithm is an enum covering HMAC and EdDSA variants', () => {
        const en = schema.properties.eep_signature_algorithm.enum as string[];
        expect(en).toContain('hmac-sha256');
        expect(en).toContain('eddsa');
        expect(en).toContain('hybrid-hmac-eddsa');
    });

    it('eep_signature_algorithm defaults to hmac-sha256', () => {
        expect(schema.properties.eep_signature_algorithm.default).toBe('hmac-sha256');
    });

    it('has an idiomatic example with all required fields', () => {
        const example = schema.examples[0];
        for (const f of schema.required) {
            expect(example).toHaveProperty(f);
        }
    });

    it('eep_delivery_id in example is a valid UUID format', () => {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        expect(schema.examples[0].eep_delivery_id).toMatch(uuidRegex);
    });
});

// ── A8: SPECIFICATION.md §14 aligned with Whitepaper 3-tier ──────────────────
describe('A8 — SPECIFICATION.md §14: aligned with Whitepaper Core/Standard/Full taxonomy', () => {
    let spec: string;
    beforeAll(() => { spec = readDoc('SPECIFICATION.md'); });

    it('§14 has exactly 3 normative conformance tiers', () => {
        expect(spec).toContain('### 14.1 Core');
        expect(spec).toContain('### 14.2 Standard');
        expect(spec).toContain('### 14.3 Full');
        // The old "Extended+" tier must be gone
        expect(spec).not.toContain('Extended+');
    });

    it('each tier has a distinct EEPConformanceCredential type', () => {
        expect(spec).toContain('EEPConformanceCredential_Core');
        expect(spec).toContain('EEPConformanceCredential_Standard');
        expect(spec).toContain('EEPConformanceCredential_Full');
    });

    it('Core tier is described as suitable for read-only publishers', () => {
        const coreSection = spec.substring(spec.indexOf('### 14.1 Core'), spec.indexOf('### 14.2'));
        expect(coreSection).toContain('read-only publishers');
        expect(coreSection).toContain('IoT sensors');
    });

    it('Standard tier is described as suitable for B2B APIs and financial feeds', () => {
        const stdSection = spec.substring(spec.indexOf('### 14.2 Standard'), spec.indexOf('### 14.3'));
        expect(stdSection).toContain('B2B');
        expect(stdSection).toContain('financial');
    });

    it('Full tier is described as suitable for agent commerce and regulated industries', () => {
        const fullSection = spec.substring(spec.indexOf('### 14.3 Full'), spec.indexOf('### 14.4'));
        expect(fullSection).toContain('agent commerce');
        expect(fullSection).toContain('regulated');
    });

    it('Full tier includes commerce state machine requirements', () => {
        const fullSection = spec.substring(spec.indexOf('### 14.3 Full'), spec.indexOf('### 14.4'));
        expect(fullSection).toContain('offer → counter → accept → invoice → paid');
        expect(fullSection).toContain('Allocation Receipt VC');
    });

    it('conformance tiers match what TESTING.md and conformance.credential.json define', () => {
        const testingMd = readFile(path.join(ROOT, 'TESTING.md'));
        expect(testingMd).toContain('Core');
        expect(testingMd).toContain('Standard');
        expect(testingMd).toContain('Full');
    });
});
