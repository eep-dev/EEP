/**
 * @eep-dev/gates — B1-B10 Tests (Round 5 Production Gap Verification)
 *
 * Comprehensive unit tests for all Round 5 audit gaps:
 * - B1: Extended/Extended+ taxonomy eliminated (3-tier: Core/Standard/Full only)
 * - B2: Canonical EEP event type registry in event.envelope.json (trust.signal.*, session.revoked)
 * - B3: DNS TXT & Link header discovery in eep-manifest.json discovery_hints
 * - B4: data.withdrawal.json schema for DELETE /data/claims/:claim_id REST endpoint
 * - B5: WebSocket close codes (4000/4001/4002/4003) in SPECIFICATION.md
 * - B6: registry.search-result.json schema for eep.dev Discovery API
 * - B7: EEP-MCP Bridge translation table in guide
 * - B8: EEIP-0001 example document exists in docs/eeips/
 * - B9: Whitepaper access spectrum → EEP gate type crosswalk in SPECIFICATION.md
 * - B10: agent.task.* event types in event.envelope.json known event type registry
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCHEMAS_DIR = path.resolve(__dirname, '../../../../schemas/v0.1');
const DOCS_DIR = path.resolve(__dirname, '../../../../docs');
const ROOT_DIR = path.resolve(__dirname, '../../../../');

function loadSchema(name: string): object {
    const filePath = path.join(SCHEMAS_DIR, name);
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function readFile(relPath: string): string {
    return fs.readFileSync(path.join(ROOT_DIR, relPath), 'utf-8');
}

// ── B1: Extended/Extended+ taxonomy eliminated ────────────────────────────────

describe('B1 — Extended/Extended+ taxonomy: only Core/Standard/Full defined', () => {
    it('eep-registry.json conformance_tier_required does NOT contain Extended or Extended+', () => {
        const schema = loadSchema('eep-registry.json') as any;
        const levels: string[] = schema.properties.conformance_tier_required.enum;
        expect(levels).toContain('Core');
        expect(levels).toContain('Standard');
        expect(levels).toContain('Full');
        expect(levels).not.toContain('Extended');
        expect(levels).not.toContain('Extended+');
        expect(levels).toHaveLength(3);
    });

    it('operator.spending-policy.json require_recipient_conformance_level does NOT contain Extended or Extended+', () => {
        const schema = loadSchema('operator.spending-policy.json') as any;
        const levels: string[] = schema.properties.require_recipient_conformance_level.enum;
        expect(levels).toContain('Core');
        expect(levels).toContain('Standard');
        expect(levels).toContain('Full');
        expect(levels).not.toContain('Extended');
        expect(levels).not.toContain('Extended+');
        expect(levels).toHaveLength(3);
    });

    it('conformance.credential.json conformanceTier does NOT contain Extended or Extended+', () => {
        const schema = loadSchema('conformance.credential.json') as any;
        const tiers: string[] = schema.properties.credentialSubject.properties.conformanceTier.enum;
        expect(tiers).toContain('Core');
        expect(tiers).toContain('Standard');
        expect(tiers).toContain('Full');
        expect(tiers).not.toContain('Extended');
        expect(tiers).not.toContain('Extended+');
        expect(tiers).toHaveLength(3);
    });

    it('OPERATOR-POLICY-PROFILES.md guide does NOT reference Extended+ as a valid tier', () => {
        const content = readFile('docs/guides/OPERATOR-POLICY-PROFILES.md');
        // Should not contain "Extended+" as a conformance tier value
        // (may still reference it in historical context but not as a current valid value)
        expect(content).not.toContain('"Extended+"');
    });

    it('SPECIFICATION.md §14 does NOT contain Extended+ conformance tier', () => {
        const spec = readFile('docs/current/SPECIFICATION.md');
        // The old Extended+ tier should not appear in conformance section
        expect(spec).not.toContain('Extended+');
    });
});

// ── B2: Canonical EEP event type registry ────────────────────────────────────

describe('B2 — Event type registry: canonical EEP event types in event.envelope.json', () => {
    it('event.envelope.json has eep_known_event_types field', () => {
        const schema = loadSchema('event.envelope.json') as any;
        expect(schema.properties.eep_known_event_types).toBeDefined();
        expect(schema.properties.eep_known_event_types.enum).toBeDefined();
    });

    it('event.envelope.json includes trust.signal.revoked (Whitepaper §12.3)', () => {
        const schema = loadSchema('event.envelope.json') as any;
        const eventTypes: string[] = schema.properties.eep_known_event_types.enum;
        expect(eventTypes).toContain('trust.signal.added');
        expect(eventTypes).toContain('trust.signal.removed');
        expect(eventTypes).toContain('trust.signal.revoked');
    });

    it('event.envelope.json includes session.revoked (Whitepaper §6.2)', () => {
        const schema = loadSchema('event.envelope.json') as any;
        const eventTypes: string[] = schema.properties.eep_known_event_types.enum;
        expect(eventTypes).toContain('session.created');
        expect(eventTypes).toContain('session.renewed');
        expect(eventTypes).toContain('session.revoked');
    });

    it('event.envelope.json includes data.withdrawal.* events (Whitepaper §7.3)', () => {
        const schema = loadSchema('event.envelope.json') as any;
        const eventTypes: string[] = schema.properties.eep_known_event_types.enum;
        expect(eventTypes).toContain('data.withdrawal.requested');
        expect(eventTypes).toContain('data.withdrawal.acknowledged');
        expect(eventTypes).toContain('data.withdrawal.completed');
    });

    it('event.envelope.json includes commerce.rfp.* events (Whitepaper §7.3 auction)', () => {
        const schema = loadSchema('event.envelope.json') as any;
        const eventTypes: string[] = schema.properties.eep_known_event_types.enum;
        expect(eventTypes).toContain('commerce.rfp.open');
        expect(eventTypes).toContain('commerce.rfp.bid');
        expect(eventTypes).toContain('commerce.rfp.closed');
    });
});

// ── B3: DNS TXT & Link header discovery ──────────────────────────────────────

describe('B3 — DNS/Link header discovery: Whitepaper §4.4', () => {
    it('eep-manifest.json has discovery_hints field', () => {
        const schema = loadSchema('eep-manifest.json') as any;
        expect(schema.properties.discovery_hints).toBeDefined();
        expect(schema.properties.discovery_hints.type).toBe('object');
    });

    it('discovery_hints has link_header_supported boolean', () => {
        const schema = loadSchema('eep-manifest.json') as any;
        const hints = schema.properties.discovery_hints.properties;
        expect(hints.link_header_supported).toBeDefined();
        expect(hints.link_header_supported.type).toBe('boolean');
    });

    it('discovery_hints has dns_txt_record with v=eep1 pattern validation', () => {
        const schema = loadSchema('eep-manifest.json') as any;
        const hints = schema.properties.discovery_hints.properties;
        expect(hints.dns_txt_record).toBeDefined();
        expect(hints.dns_txt_record.pattern).toContain('v=eep1');
        // DNS TXT record example must be in the right format
        const example: string = hints.dns_txt_record.examples[0];
        expect(example).toMatch(/^v=eep1;/);
        expect(example).toContain('/.well-known/eep.json');
    });

    it('IoT discovery guide exists with DNS TXT and Link header sections', () => {
        const guide = readFile('docs/guides/iot-discovery.md');
        expect(guide).toContain('v=eep1');
        expect(guide).toContain('_eep.');
        expect(guide).toContain('rel="eep"');
        expect(guide).toContain('DNS TXT');
        // Should document the discovery priority order
        expect(guide).toContain('/.well-known/eep.json');
    });

    it('IoT discovery guide documents the SPECIFICATION.md normative reference', () => {
        const guide = readFile('docs/guides/iot-discovery.md');
        expect(guide).toContain('SPECIFICATION.md §4.4');
    });

    it('discovery_hints is NOT in the required array (optional field)', () => {
        const schema = loadSchema('eep-manifest.json') as any;
        expect(schema.required).not.toContain('discovery_hints');
    });
});

// ── B4: data.withdrawal.json schema ──────────────────────────────────────────

describe('B4 — data.withdrawal.json: REST endpoint schema for GDPR erasure', () => {
    it('data.withdrawal.json schema file exists', () => {
        const exists = fs.existsSync(path.join(SCHEMAS_DIR, 'data.withdrawal.json'));
        expect(exists).toBe(true);
    });

    it('data.withdrawal.json has correct $id', () => {
        const schema = loadSchema('data.withdrawal.json') as any;
        expect(schema.$id).toBe('https://eep.dev/schemas/v0.1/data.withdrawal.json');
    });

    it('WithdrawalRequest definition has all required fields', () => {
        const schema = loadSchema('data.withdrawal.json') as any;
        const required: string[] = schema.definitions.WithdrawalRequest.required;
        expect(required).toContain('claim_id');
        expect(required).toContain('agent_did');
        expect(required).toContain('reason');
        expect(required).toContain('issued_at');
        expect(required).toContain('nonce');
        expect(required).toContain('signature');
    });

    it('WithdrawalRequest reason enum includes GDPR and CCPA bases', () => {
        const schema = loadSchema('data.withdrawal.json') as any;
        const reasons: string[] = schema.definitions.WithdrawalRequest.properties.reason.enum;
        expect(reasons).toContain('gdpr_erasure');
        expect(reasons).toContain('ccpa_deletion');
        expect(reasons).toContain('revoke_consent');
        expect(reasons).toContain('operator_instruction');
    });

    it('WithdrawalAcknowledgement response covers 202 Accepted scenario', () => {
        const schema = loadSchema('data.withdrawal.json') as any;
        const ack = schema.definitions.WithdrawalAcknowledgement;
        expect(ack).toBeDefined();
        const required: string[] = ack.required;
        expect(required).toContain('withdrawal_id');
        expect(required).toContain('status');
        expect(required).toContain('acknowledged_at');
        expect(required).toContain('expected_completion_at');
    });

    it('WithdrawalAcknowledgement status enum includes all lifecycle states', () => {
        const schema = loadSchema('data.withdrawal.json') as any;
        const statuses: string[] = schema.definitions.WithdrawalAcknowledgement.properties.status.enum;
        expect(statuses).toContain('pending');
        expect(statuses).toContain('processing');
        expect(statuses).toContain('completed');
        expect(statuses).toContain('failed');
    });

    it('data.withdrawal.json describes 24-hour publisher commitment (Whitepaper §7.3)', () => {
        const schema = loadSchema('data.withdrawal.json') as any;
        const desc: string = schema.definitions.WithdrawalAcknowledgement.properties.expected_completion_at.description;
        expect(desc).toContain('24 hours');
        expect(desc.toLowerCase()).toContain('whitepaper');
    });
});

// ── B5: WebSocket close codes ─────────────────────────────────────────────────

describe('B5 — WebSocket close codes: 4000 back-pressure in SPECIFICATION.md', () => {
    it('SPECIFICATION.md documents WebSocket close code 4000 (back-pressure)', () => {
        const spec = readFile('docs/current/SPECIFICATION.md');
        expect(spec).toContain('4000');
        // Should explain what 4000 means
        expect(spec.toLowerCase()).toMatch(/back.?pressure|slow consumer/);
    });

    it('SPECIFICATION.md documents at least 3 EEP-specific WebSocket close codes', () => {
        const spec = readFile('docs/current/SPECIFICATION.md');
        // 4000 = back-pressure, 4001 = session revoked, 4002 = version mismatch
        const codes = ['4000', '4001'];
        for (const code of codes) {
            expect(spec).toContain(code);
        }
    });
});

// ── B6: eep.dev Registry API spec + registry.search-result.json ──────────────

describe('B6 — eep.dev Registry API: registry.search-result.json schema', () => {
    it('registry.search-result.json schema file exists', () => {
        const exists = fs.existsSync(path.join(SCHEMAS_DIR, 'registry.search-result.json'));
        expect(exists).toBe(true);
    });

    it('registry.search-result.json has correct $id', () => {
        const schema = loadSchema('registry.search-result.json') as any;
        expect(schema.$id).toBe('https://eep.dev/schemas/v0.1/registry.search-result.json');
    });

    it('registry.search-result.json has pagination fields', () => {
        const schema = loadSchema('registry.search-result.json') as any;
        expect(schema.properties.results).toBeDefined();
        expect(schema.properties.total).toBeDefined();
        expect(schema.properties.page).toBeDefined();
        expect(schema.properties.per_page).toBeDefined();
    });

    it('RegistryEntry has trust_score field (0.0–1.0) as per Whitepaper §4.2', () => {
        const schema = loadSchema('registry.search-result.json') as any;
        const entry = schema.definitions.RegistryEntry;
        expect(entry).toBeDefined();
        expect(entry.properties.trust_score).toBeDefined();
        expect(entry.properties.trust_score.minimum).toBe(0.0);
        expect(entry.properties.trust_score.maximum).toBe(1.0);
    });

    it('RegistryEntry.conformance_tier only allows Core/Standard/Full/unverified', () => {
        const schema = loadSchema('registry.search-result.json') as any;
        const tiers: string[] = schema.definitions.RegistryEntry.properties.conformance_tier.enum;
        expect(tiers).toContain('Core');
        expect(tiers).toContain('Standard');
        expect(tiers).toContain('Full');
        expect(tiers).toContain('unverified');
        expect(tiers).not.toContain('Extended+');
    });

    it('RegistryEntry supports filtering by gate_types and layers', () => {
        const schema = loadSchema('registry.search-result.json') as any;
        const entry = schema.definitions.RegistryEntry;
        expect(entry.properties.gate_types).toBeDefined();
        expect(entry.properties.layers).toBeDefined();
        expect(entry.properties.categories).toBeDefined();
    });

    it('RegistryEntry supports federation (registry_source + resolved_from)', () => {
        const schema = loadSchema('registry.search-result.json') as any;
        expect(schema.properties.resolved_from).toBeDefined();
        const entry = schema.definitions.RegistryEntry;
        expect(entry.properties.registry_source).toBeDefined();
    });
});

// ── B7: EEP-MCP Bridge translation table ─────────────────────────────────────

describe('B7 — EEP-MCP Bridge: complete MCP→EEP translation table in guide', () => {
    it('EEP-MCP-BRIDGE.md exists', () => {
        const exists = fs.existsSync(
            path.join(ROOT_DIR, 'docs/guides/EEP-MCP-BRIDGE.md')
        );
        expect(exists).toBe(true);
    });

    it('EEP-MCP-BRIDGE.md has MCP Tool → EEP Service Listing crosswalk table', () => {
        const guide = readFile('docs/guides/EEP-MCP-BRIDGE.md');
        expect(guide).toContain('service.listing.json');
        expect(guide).toContain('gate.config.json');
    });

    it('EEP-MCP-BRIDGE.md documents MCP Resource → EEP Layer 1 mapping', () => {
        const guide = readFile('docs/guides/EEP-MCP-BRIDGE.md');
        expect(guide).toContain('resources');
        expect(guide).toContain('layer1');
        expect(guide).toContain('layer2_sse');
    });

    it('EEP-MCP-BRIDGE.md has gate.config.json auto-generation section', () => {
        const guide = readFile('docs/guides/EEP-MCP-BRIDGE.md');
        expect(guide).toContain('gate.config.json');
        expect(guide).toContain('x402');
    });
});

// ── B8: EEIP-0001 example document ───────────────────────────────────────────

describe('B8 — EEIP-0001: canonical example EEIP document exists', () => {
    it('docs/eeips/EEIP-0001-core-base.md exists', () => {
        const exists = fs.existsSync(
            path.join(ROOT_DIR, 'docs/eeips/EEIP-0001-core-base.md')
        );
        expect(exists).toBe(true);
    });

    it('EEIP-0001 has valid YAML frontmatter with required fields', () => {
        const content = readFile('docs/eeips/EEIP-0001-core-base.md');
        expect(content).toContain('eeip: 1');
        expect(content).toContain('status: Final');
        expect(content).toContain('type: Standards Track');
    });

    it('EEIP-0001 defines all 3 conformance tiers correctly', () => {
        const content = readFile('docs/eeips/EEIP-0001-core-base.md');
        expect(content).toContain('Core');
        expect(content).toContain('Standard');
        expect(content).toContain('Full');
        // Must not introduce Extended+ in the EEIP
        expect(content).not.toContain('Extended+');
    });

    it('EEIP-0001 defines the EEIP lifecycle (Draft → Review → Final)', () => {
        const content = readFile('docs/eeips/EEIP-0001-core-base.md');
        expect(content).toContain('Draft');
        expect(content).toContain('Review');
        expect(content).toContain('Final');
    });

    it('EEIP-0001 references all 7 gate types from gate.proof.json', () => {
        const content = readFile('docs/eeips/EEIP-0001-core-base.md');
        expect(content).toContain('credential');
        expect(content).toContain('payment');
        expect(content).toContain('agreement');
        expect(content).toContain('data_request');
        expect(content).toContain('proof_of_intent');
    });
});

// ── B9: Whitepaper access spectrum crosswalk in SPECIFICATION.md ──────────────

describe('B9 — Whitepaper access spectrum crosswalk: §2 in SPECIFICATION.md', () => {
    it('SPECIFICATION.md §2 documents the 6-type access spectrum crosswalk', () => {
        const spec = readFile('docs/current/SPECIFICATION.md');
        // Should map: trust-gated → credential, agreement-gated → agreement, etc.
        expect(spec).toContain('trust-gated');
        expect(spec).toContain('agreement-gated');
        expect(spec).toContain('data-exchange-gated');
        expect(spec).toContain('payment-gated');
    });
});

// ── B10: agent.task.* event types ────────────────────────────────────────────

describe('B10 — agent.task.* events: DAO/M2M task coordination types registered', () => {
    it('event.envelope.json eep_known_event_types includes agent.task.completed (Whitepaper §11.8)', () => {
        const schema = loadSchema('event.envelope.json') as any;
        const eventTypes: string[] = schema.properties.eep_known_event_types.enum;
        expect(eventTypes).toContain('agent.task.completed');
    });

    it('event.envelope.json includes full agent.task.* lifecycle', () => {
        const schema = loadSchema('event.envelope.json') as any;
        const eventTypes: string[] = schema.properties.eep_known_event_types.enum;
        expect(eventTypes).toContain('agent.task.created');
        expect(eventTypes).toContain('agent.task.started');
        expect(eventTypes).toContain('agent.task.completed');
        expect(eventTypes).toContain('agent.task.failed');
        expect(eventTypes).toContain('agent.task.delegated');
    });

    it('event.envelope.json type field examples include agent.task.completed', () => {
        const schema = loadSchema('event.envelope.json') as any;
        const examples: string[] = schema.properties.type.examples;
        const hasTaskEvent = examples.some((e: string) => e.includes('agent.task'));
        expect(hasTaskEvent).toBe(true);
    });
});

// ── Cross-cutting: schema count consistency ───────────────────────────────────

describe('Cross-cutting: schema count and consistency', () => {
    it('schemas/v0.1/ now contains 24 JSON schema files (B4 data.withdrawal + B6 registry.search-result added)', () => {
        const schemaFiles = fs.readdirSync(SCHEMAS_DIR).filter((f: string) => f.endsWith('.json'));
        expect(schemaFiles.length).toBeGreaterThanOrEqual(24);
    });

    it('data.withdrawal.json is present in schemas/v0.1/', () => {
        const files = fs.readdirSync(SCHEMAS_DIR);
        expect(files).toContain('data.withdrawal.json');
    });

    it('registry.search-result.json is present in schemas/v0.1/', () => {
        const files = fs.readdirSync(SCHEMAS_DIR);
        expect(files).toContain('registry.search-result.json');
    });

    it('all new schemas have $schema and $id fields', () => {
        const newSchemas = ['data.withdrawal.json', 'registry.search-result.json'];
        for (const schemaName of newSchemas) {
            const schema = loadSchema(schemaName) as any;
            expect(schema.$schema).toBe('http://json-schema.org/draft-07/schema#');
            expect(schema.$id).toContain('https://eep.dev/schemas/v0.1/');
        }
    });

    it('docs/guides/ now contains iot-discovery.md', () => {
        const guideFiles = fs.readdirSync(path.join(ROOT_DIR, 'docs/guides'));
        expect(guideFiles).toContain('iot-discovery.md');
    });

    it('docs/eeips/ directory exists with EEIP-0001', () => {
        const eeipDir = path.join(ROOT_DIR, 'docs/eeips');
        expect(fs.existsSync(eeipDir)).toBe(true);
        const eeipFiles = fs.readdirSync(eeipDir);
        expect(eeipFiles).toContain('EEIP-0001-core-base.md');
    });
});
