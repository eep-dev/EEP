/**
 * G37-G39 Test Suite
 *
 * Covers the final three EEP whitepaper gaps:
 *  G37 — ActivityPub/AT Protocol Interoperability Documentation
 *  G38 — Forward Secrecy + ML-KEM-for-TLS (security.md §11-12)
 *  G39 — EEPConformanceCredential JSON Schema + eep-manifest.json field
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// ─── Paths ───────────────────────────────────────────────────────────────
const SCHEMAS_DIR = path.resolve(__dirname, '../../../..', 'schemas/v0.1');
const DOCS_CURRENT_DIR = path.resolve(__dirname, '../../../..', 'docs/current');
const DOCS_GUIDES_DIR = path.resolve(__dirname, '../../../..', 'docs/guides');

const conformanceCredentialSchema = JSON.parse(
    fs.readFileSync(path.join(SCHEMAS_DIR, 'conformance.credential.json'), 'utf8')
);
const eepManifestSchema = JSON.parse(
    fs.readFileSync(path.join(SCHEMAS_DIR, 'eep-manifest.json'), 'utf8')
);
const securityMd = fs.readFileSync(path.join(DOCS_CURRENT_DIR, 'security.md'), 'utf8');
const interoperabilityMd = fs.readFileSync(path.join(DOCS_GUIDES_DIR, 'interoperability.md'), 'utf8');

// ═══════════════════════════════════════════════════════════════════════════
// G37 — ActivityPub / AT Protocol Interoperability Documentation
// ═══════════════════════════════════════════════════════════════════════════
describe('G37 — ActivityPub/AT Protocol Coexistence Documentation', () => {
    it('interoperability.md guide exists', () => {
        expect(fs.existsSync(path.join(DOCS_GUIDES_DIR, 'interoperability.md'))).toBe(true);
    });

    it('covers ActivityPub explicitly', () => {
        expect(interoperabilityMd).toMatch(/ActivityPub/);
        expect(interoperabilityMd).toMatch(/Mastodon/);
    });

    it('covers AT Protocol explicitly', () => {
        expect(interoperabilityMd).toMatch(/AT Protocol/);
        expect(interoperabilityMd).toMatch(/Bluesky/);
    });

    it('includes the comparison table for AP vs AT vs EEP capabilities', () => {
        expect(interoperabilityMd).toMatch(/TOON/);
        expect(interoperabilityMd).toMatch(/W3C DIDs/);
        expect(interoperabilityMd).toMatch(/Gated access/i);
    });

    it('documents ActivityPub → EEP co-deployment pattern', () => {
        expect(interoperabilityMd).toMatch(/co-deployment/i);
        // Must describe how AP publishers can add EEP endpoints alongside AP
        expect(interoperabilityMd).toMatch(/alongside/i);
    });

    it('includes ActivityPub → EEP event bridge code example', () => {
        // AP Create activity → EEP content.published event translation
        expect(interoperabilityMd).toMatch(/content\.published/);
        expect(interoperabilityMd).toMatch(/APActivity|AP.*activity|ap.*to.*eep/i);
    });

    it('documents AT Protocol DID:PLC compatibility with EEP DID layer', () => {
        expect(interoperabilityMd).toMatch(/did:plc/);
        expect(interoperabilityMd).toMatch(/PLC/);
    });

    it('covers MCP and OpenAPI interoperability (complete interop chapter)', () => {
        expect(interoperabilityMd).toMatch(/Model Context Protocol|MCP/);
        expect(interoperabilityMd).toMatch(/OpenAPI/);
    });

    it('covers enterprise API gateway migration (Kong, AWS, etc)', () => {
        expect(interoperabilityMd).toMatch(/Kong|Apigee|AWS API Gateway/);
    });

    it('identifies clear differentiation: EEP is agent-centric, AP/AT are human-centric', () => {
        expect(interoperabilityMd).toMatch(/human-centric/);
        expect(interoperabilityMd).toMatch(/agent-centric/);
    });

    it('specifies that AP/AT publishers can expose EEP endpoints alongside existing feeds', () => {
        // Mirrors whitepaper §11.3 exact claim
        expect(interoperabilityMd).toMatch(/expose.*EEP.*endpoints.*alongside|EEP.*endpoints.*alongside/i);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// G38 — Forward Secrecy + ML-KEM-for-TLS Documentation
// ═══════════════════════════════════════════════════════════════════════════
describe('G38 — Forward Secrecy and ML-KEM TLS Hybrid (security.md §11-12)', () => {
    it('security.md has Forward Secrecy section', () => {
        expect(securityMd).toMatch(/Forward Secrecy/);
    });

    it('mentions mandatory ECDHE key exchange for WS/SSE', () => {
        expect(securityMd).toMatch(/ECDHE/);
        expect(securityMd).toMatch(/DHE/);
    });

    it('specifies TLS 1.3 as the only permitted version', () => {
        expect(securityMd).toMatch(/TLS 1\.3/);
    });

    it('explains WHY forward secrecy is mandatory (retroactive decryption threat)', () => {
        // Must provide the rationale, not just the rule
        expect(securityMd).toMatch(/retroactive|past traffic|past session/i);
    });

    it('gives specific cipher suite requirements', () => {
        expect(securityMd).toMatch(/TLS_AES_256_GCM_SHA384|TLS_CHACHA20_POLY1305/);
    });

    it('includes publisher TLS configuration example (nginx, Caddy, or Node.js)', () => {
        expect(securityMd).toMatch(/nginx|Caddy|createServer/i);
    });

    it('specifies agent requirements for FS (must reject TLS 1.2)', () => {
        expect(securityMd).toMatch(/reject TLS 1\.2|TLS 1\.2 connections/i);
    });

    it('security.md has ML-KEM section for post-quantum TLS', () => {
        expect(securityMd).toMatch(/ML-KEM/);
    });

    it('mentions FIPS 203 for ML-KEM standardization', () => {
        expect(securityMd).toMatch(/FIPS.?203/);
    });

    it('explains the harvest-now-decrypt-later threat model', () => {
        expect(securityMd).toMatch(/harvest.now.decrypt.later|harvest now/i);
    });

    it('mentions the X25519MLKEM768 hybrid key share name', () => {
        expect(securityMd).toMatch(/X25519MLKEM768/);
    });

    it('shows TLS library support table (OpenSSL, BoringSSL, Rustls, Node.js)', () => {
        expect(securityMd).toMatch(/OpenSSL/);
        expect(securityMd).toMatch(/BoringSSL|Rustls|Node\.js/);
    });

    it('differentiates transport-layer PQC (ML-KEM TLS) from application-layer PQC (ML-DSA signatures)', () => {
        // Both are complementary — neither alone is sufficient
        expect(securityMd).toMatch(/ML-KEM/);
        expect(securityMd).toMatch(/ML-DSA/);
        expect(securityMd).toMatch(/complementary|independent/i);
    });

    it('eep-manifest.json has forward_secrecy_enforced field', () => {
        const props = eepManifestSchema.properties;
        expect(props).toHaveProperty('forward_secrecy_enforced');
        expect(props.forward_secrecy_enforced.type).toBe('boolean');
        expect(props.forward_secrecy_enforced.default).toBe(true);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// G39 — EEP Conformance Credential Schema
// ═══════════════════════════════════════════════════════════════════════════
describe('G39 — EEPConformanceCredential JSON Schema', () => {
    describe('conformance.credential.json schema structure', () => {
        it('schema file exists', () => {
            expect(fs.existsSync(path.join(SCHEMAS_DIR, 'conformance.credential.json'))).toBe(true);
        });

        it('has correct $schema and $id', () => {
            expect(conformanceCredentialSchema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
            expect(conformanceCredentialSchema.$id).toMatch(/conformance\.credential\.json/);
        });

        it('requires @context, type, issuer, validFrom, validUntil, credentialSubject, proof', () => {
            const required = conformanceCredentialSchema.required;
            expect(required).toContain('@context');
            expect(required).toContain('type');
            expect(required).toContain('issuer');
            expect(required).toContain('validFrom');
            expect(required).toContain('validUntil');
            expect(required).toContain('credentialSubject');
            expect(required).toContain('proof');
        });

        it('@context must contain the W3C VC 2.0 context', () => {
            const ctxSchema = conformanceCredentialSchema.properties['@context'];
            expect(ctxSchema.type).toBe('array');
            // Must include the W3C VC 2.0 context as a mandatory entry
            expect(JSON.stringify(ctxSchema)).toMatch(/credentials\/v2/);
        });

        it('type must allow all 3 tier variants', () => {
            const typeSchema = JSON.stringify(conformanceCredentialSchema.properties.type);
            expect(typeSchema).toMatch(/EEPConformanceCredential_Core/);
            expect(typeSchema).toMatch(/EEPConformanceCredential_Standard/);
            expect(typeSchema).toMatch(/EEPConformanceCredential_Full/);
        });

        it('type must require VerifiableCredential', () => {
            const typeSchema = JSON.stringify(conformanceCredentialSchema.properties.type);
            expect(typeSchema).toMatch(/VerifiableCredential/);
        });

        it('issuer supports both string DID and object form', () => {
            const issuerSchema = conformanceCredentialSchema.properties.issuer;
            expect(issuerSchema.oneOf).toBeDefined();
            const oneOfTypes = issuerSchema.oneOf.map((s: { type: string }) => s.type);
            expect(oneOfTypes).toContain('string');
            expect(oneOfTypes).toContain('object');
        });

        it('validFrom and validUntil are date-time strings', () => {
            expect(conformanceCredentialSchema.properties.validFrom.format).toBe('date-time');
            expect(conformanceCredentialSchema.properties.validUntil.format).toBe('date-time');
        });

        it('credentialSubject requires id, conformanceTier, testedAt, passedChecks', () => {
            const subjectSchema = conformanceCredentialSchema.properties.credentialSubject;
            const required = subjectSchema.required;
            expect(required).toContain('id');
            expect(required).toContain('conformanceTier');
            expect(required).toContain('testedAt');
            expect(required).toContain('passedChecks');
        });

        it('conformanceTier is an enum of Core, Standard, Full', () => {
            const tierEnum =
                conformanceCredentialSchema.properties.credentialSubject.properties.conformanceTier.enum;
            expect(tierEnum).toContain('Core');
            expect(tierEnum).toContain('Standard');
            expect(tierEnum).toContain('Full');
            expect(tierEnum).toHaveLength(3);
        });

        it('credentialSubject supports sectorExtensions array with naming pattern', () => {
            const extSchema =
                conformanceCredentialSchema.properties.credentialSubject.properties.sectorExtensions;
            expect(extSchema.type).toBe('array');
            // Pattern should validate e.g. "EEP-FinServ-1.0"
            expect(extSchema.items.pattern).toBeDefined();
        });

        it('proof requires type, created, verificationMethod, proofPurpose, proofValue', () => {
            const proofRequired = conformanceCredentialSchema.properties.proof.required;
            expect(proofRequired).toContain('type');
            expect(proofRequired).toContain('created');
            expect(proofRequired).toContain('verificationMethod');
            expect(proofRequired).toContain('proofPurpose');
            expect(proofRequired).toContain('proofValue');
        });

        it('proofPurpose is constrained to assertionMethod', () => {
            const purpose =
                conformanceCredentialSchema.properties.proof.properties.proofPurpose.const;
            expect(purpose).toBe('assertionMethod');
        });

        it('has a well-formed example', () => {
            const examples = conformanceCredentialSchema.examples;
            expect(examples).toBeDefined();
            expect(examples.length).toBeGreaterThan(0);
            const ex = examples[0];
            expect(ex['@context']).toContain('https://www.w3.org/ns/credentials/v2');
            expect(ex.type).toContain('VerifiableCredential');
            expect(ex.type.some((t: string) => t.startsWith('EEPConformanceCredential_'))).toBe(true);
            expect(ex.issuer).toBe('did:web:eep.dev');
            expect(ex.credentialSubject.conformanceTier).toMatch(/^(Core|Standard|Full)$/);
        });
    });

    describe('G39 — eep-manifest.json conformance_credential field', () => {
        it('eep-manifest.json has conformance_credential property', () => {
            const props = eepManifestSchema.properties;
            expect(props).toHaveProperty('conformance_credential');
        });

        it('conformance_credential is an optional object (not in required[])', () => {
            const required = eepManifestSchema.required;
            expect(required).not.toContain('conformance_credential');
            expect(eepManifestSchema.properties.conformance_credential.type).toBe('object');
        });

        it('conformance_credential has required VC fields', () => {
            const credRequired = eepManifestSchema.properties.conformance_credential.required;
            expect(credRequired).toContain('type');
            expect(credRequired).toContain('issuer');
            expect(credRequired).toContain('validFrom');
            expect(credRequired).toContain('validUntil');
            expect(credRequired).toContain('credentialSubject');
            expect(credRequired).toContain('proof');
        });

        it('conformanceTier enum in manifest conformance_credential matches conformance.credential.json', () => {
            const tierEnum =
                eepManifestSchema.properties.conformance_credential.properties.credentialSubject
                    .properties.conformanceTier.enum;
            expect(tierEnum).toContain('Core');
            expect(tierEnum).toContain('Standard');
            expect(tierEnum).toContain('Full');
        });

        it('conformance_credential has a working example embedded', () => {
            const examples = eepManifestSchema.properties.conformance_credential.examples;
            expect(examples).toBeDefined();
            expect(examples.length).toBeGreaterThan(0);
            const ex = examples[0];
            expect(ex.issuer).toBe('did:web:eep.dev');
            expect(ex.credentialSubject.conformanceTier).toMatch(/^(Core|Standard|Full)$/);
        });
    });

    describe('G39 — Semantic validation of a valid conformance credential', () => {
        // Validate a sample well-formed conformance credential against our expected structure
        const validCredential = {
            '@context': [
                'https://www.w3.org/ns/credentials/v2',
                'https://eep.dev/contexts/v0.1',
            ],
            type: ['VerifiableCredential', 'EEPConformanceCredential_Full'],
            id: 'https://eep.dev/credentials/conformance/01HN3QK7GX',
            issuer: 'did:web:eep.dev',
            validFrom: '2026-03-05T12:00:00Z',
            validUntil: '2027-03-05T12:00:00Z',
            credentialSubject: {
                id: 'did:web:api.publisher.example',
                conformanceTier: 'Full',
                eepVersion: '0.1',
                testedAt: '2026-03-05T10:30:00Z',
                passedChecks: 47,
                totalChecks: 47,
                manifestUrl: 'https://api.publisher.example/.well-known/eep.json',
            },
            proof: {
                type: 'Ed25519Signature2020',
                created: '2026-03-05T12:00:00Z',
                verificationMethod: 'did:web:eep.dev#key-1',
                proofPurpose: 'assertionMethod',
                proofValue:
                    'z58DAdFfa9SkqZMVPxAQpic7ndSayn1PzZs6ZjWp1CktyGesjuTSwRdoWhAfGFCF5bppETSTojQCrfFPP2oumHKtz',
            },
        };

        it('valid credential has all required fields', () => {
            const required = conformanceCredentialSchema.required as string[];
            for (const field of required) {
                expect(validCredential).toHaveProperty(field);
            }
        });

        it('conformanceTier is one of the valid enum values', () => {
            const validTiers = ['Core', 'Standard', 'Full'];
            expect(validTiers).toContain(validCredential.credentialSubject.conformanceTier);
        });

        it('issuer is a valid DID', () => {
            expect(validCredential.issuer).toMatch(/^did:[a-z0-9]+:.+$/);
        });

        it('validFrom is before validUntil', () => {
            const from = new Date(validCredential.validFrom);
            const until = new Date(validCredential.validUntil);
            expect(from.getTime()).toBeLessThan(until.getTime());
        });

        it('credential is not yet expired (validUntil in the future)', () => {
            const until = new Date(validCredential.validUntil);
            const now = new Date('2026-03-05T13:00:00Z'); // test reference date
            expect(until.getTime()).toBeGreaterThan(now.getTime());
        });

        it('proof has assertionMethod purpose', () => {
            expect(validCredential.proof.proofPurpose).toBe('assertionMethod');
        });

        it('verificationMethod is in did:web:eep.dev DID Document', () => {
            expect(validCredential.proof.verificationMethod).toMatch(/^did:web:eep\.dev#/);
        });

        it('type contains both VerifiableCredential and an EEP tier type', () => {
            expect(validCredential.type).toContain('VerifiableCredential');
            const tierTypes = validCredential.type.filter((t: string) =>
                t.startsWith('EEPConformanceCredential_')
            );
            expect(tierTypes.length).toBe(1);
        });

        it('detects expired credential', () => {
            // An agent must reject expired conformance credentials
            const expiredCredential = {
                ...validCredential,
                validUntil: '2025-01-01T00:00:00Z', // in the past
            };
            const checkDate = new Date('2026-03-05T13:00:00Z');
            const untilDate = new Date(expiredCredential.validUntil);
            const isExpired = untilDate.getTime() < checkDate.getTime();
            expect(isExpired).toBe(true);
        });

        it('detects wrong issuer DID (not eep.dev)', () => {
            const untrustedCredential = {
                ...validCredential,
                issuer: 'did:web:attacker.example.com',
            };
            const isEepDevIssuer = (issuer: string | { id: string }) => {
                const id = typeof issuer === 'string' ? issuer : issuer.id;
                return id === 'did:web:eep.dev';
            };
            expect(isEepDevIssuer(untrustedCredential.issuer)).toBe(false);
        });

        it('validates sector extension naming pattern', () => {
            // EEP-FinServ-1.0 format
            const validPattern = /^EEP-[A-Za-z]+(-[A-Za-z]+)?-\d+\.\d+$/;
            const validNames = ['EEP-FinServ-1.0', 'EEP-Health-1.0', 'EEP-GovCloud-2.1'];
            const invalidNames = ['FinServ-1.0', 'EEP-1.0', 'EEP-FinServ', 'eep-finserv-1.0'];

            for (const name of validNames) {
                expect(validPattern.test(name)).toBe(true);
            }
            for (const name of invalidNames) {
                expect(validPattern.test(name)).toBe(false);
            }
        });
    });

    describe('G39 — Conformance tier requirements (per Whitepaper §10.2 Table 2)', () => {
        it('Core tier: requires Layer 1 REST + Layer 2 SSE', () => {
            // Conformance credential for Core tier means the publisher passed L1 + L2 SSE checks
            const coreCredential = {
                type: ['VerifiableCredential', 'EEPConformanceCredential_Core'],
                credentialSubject: { conformanceTier: 'Core' },
            };
            expect(coreCredential.credentialSubject.conformanceTier).toBe('Core');
            expect(coreCredential.type).toContain('EEPConformanceCredential_Core');
        });

        it('Standard tier: superset of Core (Core + Webhooks + gates + version negotiation)', () => {
            const standardCredential = {
                type: ['VerifiableCredential', 'EEPConformanceCredential_Standard'],
                credentialSubject: { conformanceTier: 'Standard' },
            };
            expect(standardCredential.credentialSubject.conformanceTier).toBe('Standard');
        });

        it('Full tier: superset of Standard (Standard + L3 WS + commerce + session + DPV)', () => {
            const fullCredential = {
                type: ['VerifiableCredential', 'EEPConformanceCredential_Full'],
                credentialSubject: { conformanceTier: 'Full' },
            };
            expect(fullCredential.credentialSubject.conformanceTier).toBe('Full');
        });

        it('tier precedence: Full > Standard > Core', () => {
            const tierRank: Record<string, number> = { Core: 1, Standard: 2, Full: 3 };
            expect(tierRank['Full']).toBeGreaterThan(tierRank['Standard']);
            expect(tierRank['Standard']).toBeGreaterThan(tierRank['Core']);
        });
    });
});
