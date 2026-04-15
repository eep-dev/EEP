/**
 * @eep-dev/gates — G13-G22 Tests
 *
 * Comprehensive unit tests for all whitepaper alignment gaps G13-G22:
 * - G13: data_request gate proof validation
 * - G14: agreement gate proof validation
 * - G15: SessionToken schema validation
 * - G16: DelegationProof VC validation
 * - G17: data.withdrawal WebSocket message
 * - G18: OperatorPrivacyPolicy + OperatorSpendingPolicy schemas
 * - G19: Auction/RFP pricing mode in commerce.negotiation
 * - G20: eep-registry.json federation schema
 * - G21: eep_versions manifest fields
 * - G22: data_residency, payment_networks, pricing_mode manifest fields
 */

import { describe, it, expect } from 'vitest';
import { validateProofStructure, validateProofs } from './proof-validator.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load schemas from EEP/schemas/v0.1
// Path: packages/@eep-dev/gates/src → packages/@eep-dev/gates → packages/@eep-dev → packages → EEP/schemas/v0.1
const SCHEMAS_DIR = path.resolve(__dirname, '../../../../schemas/v0.1');


function loadSchema(name: string): object {
    const filePath = path.join(SCHEMAS_DIR, name);
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

// ── G13: data_request Proof Validation ────────────────────────────────────────

describe('G13: data_request gate proof validation', () => {
    it('accepts a valid data_request proof with JWT VP', () => {
        const proof = {
            type: 'data_request',
            verifiable_presentation: 'eyJhbGciOiJFZERTQSJ9.eyJzdWIiOiJkaWQ6d2ViOmFnZW50In0.sig',
            claimed_fields: ['org_type', 'use_case_category'],
        };
        const result = validateProofStructure(proof);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('rejects data_request proof missing verifiable_presentation', () => {
        const proof = {
            type: 'data_request',
            claimed_fields: ['org_type'],
        };
        const result = validateProofStructure(proof);
        expect(result.valid).toBe(false);
        expect(result.errors).toEqual(expect.arrayContaining([
            expect.stringContaining('verifiable_presentation'),
        ]));
    });

    it('rejects data_request proof with too-short VP string', () => {
        const proof = {
            type: 'data_request',
            verifiable_presentation: 'short',
        };
        const result = validateProofStructure(proof);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('verifiable_presentation'))).toBe(true);
    });

    it('rejects data_request proof with non-array claimed_fields', () => {
        const proof = {
            type: 'data_request',
            verifiable_presentation: 'eyJhbGciOiJFZERTQSJ9.valid_payload.signature_here',
            claimed_fields: 'org_type',  // Should be array
        };
        const result = validateProofStructure(proof);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('claimed_fields'))).toBe(true);
    });

    it('accepts data_request proof without claimed_fields (optional)', () => {
        const proof = {
            type: 'data_request',
            verifiable_presentation: 'eyJhbGciOiJFZERTQSJ9.valid_payload.signature_here',
        };
        const result = validateProofStructure(proof);
        expect(result.valid).toBe(true);
    });

    it('accepts data_request proof with freshness timestamps', () => {
        const future = new Date(Date.now() + 3600_000).toISOString();
        const proof = {
            type: 'data_request',
            verifiable_presentation: 'eyJhbGciOiJFZERTQSJ9.valid_payload.signature_here',
            issued_at: new Date().toISOString(),
            expires_at: future,
            nonce: 'abc123',
        };
        const result = validateProofStructure(proof);
        expect(result.valid).toBe(true);
    });
});

// ── G14: agreement Proof Validation ───────────────────────────────────────────

describe('G14: agreement gate proof validation', () => {
    const validHash = 'sha256:' + 'a'.repeat(64);
    const validSig = 'dGVzdHNpZ25hdHVyZWZvcmVlcHByb3RvY29s';
    const validDid = 'did:web:agent.acme.ai';

    it('accepts a valid agreement proof', () => {
        const proof = {
            type: 'agreement',
            document_hash: validHash,
            signature: validSig,
            signer_did: validDid,
        };
        const result = validateProofStructure(proof);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('accepts agreement proof with explicit EdDSA algo', () => {
        const proof = {
            type: 'agreement',
            document_hash: validHash,
            signature: validSig,
            signer_did: validDid,
            signature_algo: 'EdDSA',
        };
        expect(validateProofStructure(proof).valid).toBe(true);
    });

    it('accepts agreement proof with ES256K algo', () => {
        const proof = {
            type: 'agreement',
            document_hash: validHash,
            signature: validSig,
            signer_did: validDid,
            signature_algo: 'ES256K',
        };
        expect(validateProofStructure(proof).valid).toBe(true);
    });

    it('rejects agreement proof with invalid document_hash format', () => {
        const proof = {
            type: 'agreement',
            document_hash: 'md5:notasha256hash',
            signature: validSig,
            signer_did: validDid,
        };
        const result = validateProofStructure(proof);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('document_hash'))).toBe(true);
    });

    it('rejects agreement proof with missing signature', () => {
        const proof = {
            type: 'agreement',
            document_hash: validHash,
            signer_did: validDid,
        };
        const result = validateProofStructure(proof);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('signature'))).toBe(true);
    });

    it('rejects agreement proof with too-short signature', () => {
        const proof = {
            type: 'agreement',
            document_hash: validHash,
            signature: 'short',
            signer_did: validDid,
        };
        const result = validateProofStructure(proof);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('signature'))).toBe(true);
    });

    it('rejects agreement proof with missing signer_did', () => {
        const proof = {
            type: 'agreement',
            document_hash: validHash,
            signature: validSig,
        };
        const result = validateProofStructure(proof);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('signer_did'))).toBe(true);
    });

    it('rejects agreement proof with malformed signer_did', () => {
        const proof = {
            type: 'agreement',
            document_hash: validHash,
            signature: validSig,
            signer_did: 'not-a-did',
        };
        const result = validateProofStructure(proof);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('signer_did'))).toBe(true);
    });

    it('rejects agreement proof with unsupported signature_algo', () => {
        const proof = {
            type: 'agreement',
            document_hash: validHash,
            signature: validSig,
            signer_did: validDid,
            signature_algo: 'RSA',  // Not allowed
        };
        const result = validateProofStructure(proof);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('signature_algo'))).toBe(true);
    });
});

// ── G15: Session Token Schema ─────────────────────────────────────────────────

describe('G15: Session Token schema validation', () => {
    const now = Math.floor(Date.now() / 1000);

    it('session.token.json schema is valid JSON', () => {
        const schema = loadSchema('session.token.json');
        expect(schema).toBeDefined();
        expect((schema as any).$id).toBe('https://eep.dev/schemas/v0.1/session.token.json');
    });

    it('session.token.json has all required fields', () => {
        const schema = loadSchema('session.token.json') as any;
        expect(schema.required).toContain('agent_did');
        expect(schema.required).toContain('issuer_did');
        expect(schema.required).toContain('tiers');
        expect(schema.required).toContain('iat');
        expect(schema.required).toContain('exp');
        expect(schema.required).toContain('signature');
    });

    it('SessionToken TypeScript interface has exp > iat constraint documented', () => {
        // Structural: verify schema has exp and iat as integers
        const schema = loadSchema('session.token.json') as any;
        expect(schema.properties.exp.type).toBe('integer');
        expect(schema.properties.iat.type).toBe('integer');
        expect(schema.properties.tiers.type).toBe('array');
        expect(schema.properties.agent_did.pattern).toMatch(/\^did:/);
    });

    it('session token schema includes optional refresh_threshold and context_id', () => {
        const schema = loadSchema('session.token.json') as any;
        expect(schema.properties.refresh_threshold).toBeDefined();
        expect(schema.properties.context_id).toBeDefined();
        // These should NOT be in required
        expect(schema.required).not.toContain('refresh_threshold');
        expect(schema.required).not.toContain('context_id');
    });
});

// ── G16: Delegation Proof VC Schema ───────────────────────────────────────────

describe('G16: Delegation Proof VC schema validation', () => {
    it('delegation.proof.json schema is valid JSON', () => {
        const schema = loadSchema('delegation.proof.json');
        expect(schema).toBeDefined();
        expect((schema as any).$id).toBe('https://eep.dev/schemas/v0.1/delegation.proof.json');
    });

    it('delegation.proof.json has W3C VC required fields', () => {
        const schema = loadSchema('delegation.proof.json') as any;
        expect(schema.required).toContain('@context');
        expect(schema.required).toContain('type');
        expect(schema.required).toContain('issuer');
        expect(schema.required).toContain('issuanceDate');
        expect(schema.required).toContain('credentialSubject');
        expect(schema.required).toContain('proof');
    });

    it('credentialSubject requires id and permitted_actions', () => {
        const schema = loadSchema('delegation.proof.json') as any;
        const cs = schema.properties.credentialSubject;
        expect(cs.required).toContain('id');
        expect(cs.required).toContain('permitted_actions');
        expect(cs.properties.permitted_actions.minItems).toBe(1);
    });

    it('delegation schema includes max_payment_amount for payment controls', () => {
        const schema = loadSchema('delegation.proof.json') as any;
        const cs = schema.properties.credentialSubject;
        expect(cs.properties.max_payment_amount).toBeDefined();
        expect(cs.properties.scope_hash).toBeDefined();
    });

    it('delegation proof type array must include EEPDelegationProof', () => {
        const schema = loadSchema('delegation.proof.json') as any;
        const typeField = schema.properties.type;
        expect(typeField.contains.const).toBe('EEPDelegationProof');
    });
});

// ── G17: data.withdrawal Message ─────────────────────────────────────────────

describe('G17: data.withdrawal WebSocket message schema', () => {
    it('ws-message.json includes data_withdrawal in action examples', () => {
        const schema = loadSchema('ws-message.json') as any;
        const examples = schema.properties.action.examples;
        expect(examples).toContain('data_withdrawal');
    });

    it('ws-message.json has allOf block for data_withdrawal data structure', () => {
        const schema = loadSchema('ws-message.json') as any;
        const withdrawalBlock = schema.allOf.find((b: any) =>
            b.if?.properties?.action?.const === 'data_withdrawal'
        );
        expect(withdrawalBlock).toBeDefined();
        const requiredFields = withdrawalBlock.then.properties.data.required;
        expect(requiredFields).toContain('claim_id');
        expect(requiredFields).toContain('agent_did');
        expect(requiredFields).toContain('reason');
    });

    it('data_withdrawal block validates agent_did as DID', () => {
        const schema = loadSchema('ws-message.json') as any;
        const withdrawalBlock = schema.allOf.find((b: any) =>
            b.if?.properties?.action?.const === 'data_withdrawal'
        );
        const agentDidField = withdrawalBlock.then.properties.data.properties.agent_did;
        expect(agentDidField.pattern).toMatch(/\^did:/);
    });
});

// ── G18: Operator Policy Profile Schemas ─────────────────────────────────────

describe('G18: Operator Privacy Policy schema', () => {
    it('operator.privacy-policy.json is valid JSON with required fields', () => {
        const schema = loadSchema('operator.privacy-policy.json') as any;
        expect(schema.$id).toBe('https://eep.dev/schemas/v0.1/operator.privacy-policy.json');
        expect(schema.required).toContain('operator_did');
        expect(schema.required).toContain('version');
        expect(schema.required).toContain('issued_at');
    });

    it('operator.privacy-policy.json has the three claim lists', () => {
        const schema = loadSchema('operator.privacy-policy.json') as any;
        expect(schema.properties.freely_shareable_claims).toBeDefined();
        expect(schema.properties.human_confirmation_required).toBeDefined();
        expect(schema.properties.unconditionally_refused).toBeDefined();
    });

    it('operator.privacy-policy.json has max_retention_days with bounds', () => {
        const schema = loadSchema('operator.privacy-policy.json') as any;
        const mrd = schema.properties.max_retention_days;
        expect(mrd.minimum).toBe(0);
        expect(mrd.maximum).toBe(3650);
    });

    it('operator.privacy-policy.json has dpv_purposes_allowed with DPV pattern', () => {
        const schema = loadSchema('operator.privacy-policy.json') as any;
        const dpa = schema.properties.dpv_purposes_allowed;
        expect(dpa.type).toBe('array');
        expect(dpa.items.pattern).toMatch(/\^dpv:/);
    });
});

describe('G18: Operator Spending Policy schema', () => {
    it('operator.spending-policy.json is valid JSON with required fields', () => {
        const schema = loadSchema('operator.spending-policy.json') as any;
        expect(schema.$id).toBe('https://eep.dev/schemas/v0.1/operator.spending-policy.json');
        expect(schema.required).toContain('operator_did');
        expect(schema.required).toContain('version');
        expect(schema.required).toContain('issued_at');
    });

    it('spending policy has per-transaction and per-hour limits', () => {
        const schema = loadSchema('operator.spending-policy.json') as any;
        expect(schema.properties.max_per_transaction).toBeDefined();
        expect(schema.properties.max_per_hour).toBeDefined();
        expect(schema.properties.max_per_day).toBeDefined();
    });

    it('spending policy has approved_chains and approved_recipient_categories', () => {
        const schema = loadSchema('operator.spending-policy.json') as any;
        expect(schema.properties.approved_chains.type).toBe('array');
        expect(schema.properties.approved_recipient_categories.type).toBe('array');
    });

    it('spending policy conformance level enum contains only whitepaper-defined tiers (Core/Standard/Full)', () => {
        // Per Whitepaper §10.2 Table 2: three conformance tiers — Core, Standard, Full.
        // 'Extended' and 'Extended+' are legacy names that must not appear.
        const schema = loadSchema('operator.spending-policy.json') as any;
        const levels = schema.properties.require_recipient_conformance_level.enum;
        expect(levels).toContain('Core');
        expect(levels).toContain('Standard');
        expect(levels).toContain('Full');
        expect(levels).not.toContain('Extended');
        expect(levels).not.toContain('Extended+');
        expect(levels).toHaveLength(3);
    });
});

// ── G19: Auction / RFP Pricing ────────────────────────────────────────────────

describe('G19: Auction/RFP pricing mode in commerce.negotiation.json', () => {
    it('commerce.negotiation.json has pricing_mode field', () => {
        const schema = loadSchema('commerce.negotiation.json') as any;
        expect(schema.properties.pricing_mode).toBeDefined();
        const modes = schema.properties.pricing_mode.enum;
        expect(modes).toContain('fixed');
        expect(modes).toContain('negotiable');
        expect(modes).toContain('auction');
    });

    it('commerce.negotiation.json has auction config object', () => {
        const schema = loadSchema('commerce.negotiation.json') as any;
        const auction = schema.properties.auction;
        expect(auction).toBeDefined();
        expect(auction.required).toContain('mechanism');
        expect(auction.required).toContain('close_time');
        expect(auction.required).toContain('currency');
    });

    it('auction mechanism enum includes all three modes', () => {
        const schema = loadSchema('commerce.negotiation.json') as any;
        const mechanisms = schema.properties.auction.properties.mechanism.enum;
        expect(mechanisms).toContain('first_price');
        expect(mechanisms).toContain('vickrey');
        expect(mechanisms).toContain('reverse');
    });

    it('commerce.negotiation.json has AllocationReceipt field for winners', () => {
        const schema = loadSchema('commerce.negotiation.json') as any;
        const ar = schema.properties.allocation_receipt;
        expect(ar).toBeDefined();
        const csRequired = ar.properties.credentialSubject.required;
        expect(csRequired).toContain('allocation_id');
        expect(csRequired).toContain('winning_bid');
        expect(csRequired).toContain('valid_from');
    });
});

// ── G20: Registry Federation Schema ──────────────────────────────────────────

describe('G20: eep-registry.json federation manifest schema', () => {
    it('eep-registry.json is valid JSON with required fields', () => {
        const schema = loadSchema('eep-registry.json') as any;
        expect(schema.$id).toBe('https://eep.dev/schemas/v0.1/eep-registry.json');
        expect(schema.required).toContain('did');
        expect(schema.required).toContain('registry_name');
        expect(schema.required).toContain('scope');
        expect(schema.required).toContain('conformance_tier_required');
        expect(schema.required).toContain('federation_credential_url');
    });

    it('eep-registry.json conformance_tier_required only allows whitepaper-defined tiers (Core/Standard/Full)', () => {
        // Per Whitepaper §10.2 Table 2: three conformance tiers only.
        // 'Extended' and 'Extended+' are stale names that must NOT appear here.
        const schema = loadSchema('eep-registry.json') as any;
        const levels = schema.properties.conformance_tier_required.enum;
        expect(levels).toContain('Core');
        expect(levels).toContain('Standard');
        expect(levels).toContain('Full');
        expect(levels).not.toContain('Extended');
        expect(levels).not.toContain('Extended+');
        expect(levels).toHaveLength(3);
    });

    it('eep-registry.json scope has geography, sectors, capabilities', () => {
        const schema = loadSchema('eep-registry.json') as any;
        const scope = schema.properties.scope.properties;
        expect(scope.geography).toBeDefined();
        expect(scope.sectors).toBeDefined();
        expect(scope.capabilities).toBeDefined();
    });

    it('eep-registry.json trust_criteria documents verification steps', () => {
        const schema = loadSchema('eep-registry.json') as any;
        const tc = schema.properties.trust_criteria.properties;
        expect(tc.did_verification).toBeDefined();
        expect(tc.manifest_consistency_check).toBeDefined();
        expect(tc.additional_checks).toBeDefined();
    });
});

// ── G21/G22: Manifest Extensions ─────────────────────────────────────────────

describe('G21: eep_versions manifest fields', () => {
    it('eep-manifest.json has eep_versions array field', () => {
        const schema = loadSchema('eep-manifest.json') as any;
        expect(schema.properties.eep_versions).toBeDefined();
        expect(schema.properties.eep_versions.type).toBe('array');
        expect(schema.properties.eep_versions.minItems).toBe(1);
    });

    it('eep-manifest.json has preferred_version field', () => {
        const schema = loadSchema('eep-manifest.json') as any;
        expect(schema.properties.preferred_version).toBeDefined();
        expect(schema.properties.preferred_version.type).toBe('string');
    });

    it('eep_versions and preferred_version are optional (not in required array)', () => {
        const schema = loadSchema('eep-manifest.json') as any;
        expect(schema.required).not.toContain('eep_versions');
        expect(schema.required).not.toContain('preferred_version');
    });
});

describe('G22: Extended manifest fields', () => {
    it('eep-manifest.json has data_residency field', () => {
        const schema = loadSchema('eep-manifest.json') as any;
        expect(schema.properties.data_residency).toBeDefined();
        expect(schema.properties.data_residency.type).toBe('string');
    });

    it('eep-manifest.json has payment_networks array with required chain+address', () => {
        const schema = loadSchema('eep-manifest.json') as any;
        const pn = schema.properties.payment_networks;
        expect(pn).toBeDefined();
        expect(pn.type).toBe('array');
        expect(pn.items.required).toContain('chain');
        expect(pn.items.required).toContain('address');
        expect(pn.items.properties.min_confirmations).toBeDefined();
    });

    it('eep-manifest.json has pricing_mode enum field', () => {
        const schema = loadSchema('eep-manifest.json') as any;
        const modes = schema.properties.pricing_mode.enum;
        expect(modes).toContain('fixed');
        expect(modes).toContain('negotiable');
        expect(modes).toContain('auction');
    });

    it('eep-manifest.json compliance object includes dora and eidas2 alignment flags', () => {
        const schema = loadSchema('eep-manifest.json') as any;
        const compliance = schema.properties.compliance.properties;
        expect(compliance.dora).toBeDefined();
        expect(compliance.eidas2).toBeDefined();
        expect(compliance.eu_ai_act).toBeDefined();
    });

    it('all extended manifest fields are optional', () => {
        const schema = loadSchema('eep-manifest.json') as any;
        expect(schema.required).not.toContain('data_residency');
        expect(schema.required).not.toContain('payment_networks');
        expect(schema.required).not.toContain('pricing_mode');
    });
});

// ── Proof validator: bulk coverage ───────────────────────────────────────────

describe('Proof validator: new types in batch validation', () => {
    it('validateProofs accepts mixed array with data_request and agreement', () => {
        const future = new Date(Date.now() + 3600_000).toISOString();
        const validHash = 'sha256:' + 'b'.repeat(64);
        const proofs = [
            {
                type: 'data_request',
                verifiable_presentation: 'eyJhbGciOiJFZERTQSJ9.payload.signature',
                claimed_fields: ['org_type'],
                expires_at: future,
            },
            {
                type: 'agreement',
                document_hash: validHash,
                signature: 'dGVzdHNpZ25hdHVyZWZvcmVlcHByb3RvY29s',
                signer_did: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
                signature_algo: 'EdDSA',
            },
        ];
        const result = validateProofs(proofs);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('proof type pattern includes data_request and agreement in gate.proof.json', () => {
        const schema = loadSchema('gate.proof.json') as any;
        const pattern = schema.definitions.proof.properties.type.pattern;
        expect(pattern).toContain('data_request');
        expect(pattern).toContain('agreement');
    });

    it('gate.config.json type pattern includes data_request and agreement', () => {
        const schema = loadSchema('gate.config.json') as any;
        const pattern = schema.definitions.requirement.properties.type.pattern;
        expect(pattern).toContain('data_request');
        expect(pattern).toContain('agreement');
    });
});
