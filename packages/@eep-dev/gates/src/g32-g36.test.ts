import { describe, it, expect, beforeEach, vi } from 'vitest';

// G32 imports
import {
    InMemoryPaymentHashStore,
    validatePaymentProofForDoubleSpend,
    CRITICAL_SECURITY_METRICS,
    type SecurityMetricName,
    type PaymentHashStore,
    type PaymentDoubleSpendResult,
} from '../src/proof-validator.js';

// G33 imports
import {
    WsCloseCode,
    SSE_BACKPRESSURE_THRESHOLD_EVENTS,
    SSE_BACKPRESSURE_LAG_SECONDS,
    type PaymentHashEntry,
} from '../src/types.js';

// ════════════════════════════════════════════════════════════════════════════════
// G32 — Consumed-Hash Ledger (Payment Double-Spend Prevention)
// Whitepaper §9.7: "Publishers MUST track seen tx hashes and reject duplicates."
// ════════════════════════════════════════════════════════════════════════════════

describe('G32 — Payment Double-Spend Prevention', () => {
    let store: InMemoryPaymentHashStore;

    beforeEach(() => {
        store = new InMemoryPaymentHashStore();
    });

    // ── InMemoryPaymentHashStore ────────────────────────────────────────────────

    describe('InMemoryPaymentHashStore', () => {
        it('returns false for an unseen hash', async () => {
            expect(await store.isSeen('0xdeadbeef')).toBe(false);
        });

        it('returns true after markSeen', async () => {
            await store.markSeen('0xdeadbeef', 600);
            expect(await store.isSeen('0xdeadbeef')).toBe(true);
        });

        it('expires entries after TTL', async () => {
            vi.useFakeTimers();
            await store.markSeen('0xexpiring', 1); // 1s TTL
            vi.advanceTimersByTime(1001);
            expect(await store.isSeen('0xexpiring')).toBe(false);
            vi.useRealTimers();
        });

        it('tracks multiple different hashes independently', async () => {
            await store.markSeen('0xhash1', 600);
            await store.markSeen('0xhash2', 600);
            expect(await store.isSeen('0xhash1')).toBe(true);
            expect(await store.isSeen('0xhash2')).toBe(true);
            expect(await store.isSeen('0xhash3')).toBe(false);
        });

        it('evictExpired cleans up stale entries', async () => {
            vi.useFakeTimers();
            await store.markSeen('0xold', 1);
            await store.markSeen('0xfresh', 600);
            vi.advanceTimersByTime(2000);
            store.evictExpired();
            // After eviction, the stale key is gone but the store still manages 0xfresh
            expect(await store.isSeen('0xold')).toBe(false);
            expect(await store.isSeen('0xfresh')).toBe(true);
            vi.useRealTimers();
        });

        it('reports correct size after operations', async () => {
            expect(store.size).toBe(0);
            await store.markSeen('0xa', 600);
            await store.markSeen('0xb', 600);
            expect(store.size).toBe(2);
        });
    });

    // ── validatePaymentProofForDoubleSpend ─────────────────────────────────────

    describe('validatePaymentProofForDoubleSpend()', () => {
        it('accepts a fresh on-chain tx_hash payment proof', async () => {
            const proof = {
                type: 'payment',
                tx_hash: '0x1234567890abcdef',
                chain: 'ethereum',
            };
            const result = await validatePaymentProofForDoubleSpend(proof, store);
            expect(result.valid).toBe(true);
            expect(result.isDoubleSpend).toBeUndefined();
            expect(result.txHash).toBe('0x1234567890abcdef');
        });

        it('rejects a replayed tx_hash as double-spend', async () => {
            const proof = { type: 'payment', tx_hash: '0xdeadbeef11223344' };
            // First submission — should succeed
            await validatePaymentProofForDoubleSpend(proof, store);
            // Second submission — should fail as double-spend
            const result = await validatePaymentProofForDoubleSpend(proof, store);
            expect(result.valid).toBe(false);
            expect(result.isDoubleSpend).toBe(true);
            expect(result.errors[0]).toMatch(/double-spend/i);
            expect(result.txHash).toBe('0xdeadbeef11223344');
        });

        it('accepts a fresh legacy string x402 payload hash', async () => {
            const proof = {
                type: 'payment',
                x402_payload: 'x402_eyJhbGciOiJFZERTQSJ9...',
            };
            const result = await validatePaymentProofForDoubleSpend(proof, store);
            expect(result.valid).toBe(true);
            expect(result.txHash).toBe('x402_eyJhbGciOiJFZERTQSJ9...');
        });

        it('accepts structured x402 payload and hashes payload field', async () => {
            const proof = {
                type: 'payment',
                x402_payload: {
                    payload: '{"from":"0xabc","to":"0xdef","value":100}',
                    signature: '0x' + 'a'.repeat(130),
                    network: 'base',
                },
            };
            const result = await validatePaymentProofForDoubleSpend(proof, store);
            expect(result.valid).toBe(true);
            expect(result.txHash).toBeTypeOf('string');
            expect(result.txHash).not.toBe(proof.x402_payload.payload);
        });

        it('rejects a replayed structured x402 payload hash', async () => {
            const proof = {
                type: 'payment',
                x402_payload: {
                    payload: '{"from":"0xabc","to":"0xdef","value":100}',
                    signature: '0x' + 'a'.repeat(130),
                    network: 'base',
                },
            };
            await validatePaymentProofForDoubleSpend(proof, store);
            const result = await validatePaymentProofForDoubleSpend(proof, store);
            expect(result.valid).toBe(false);
            expect(result.isDoubleSpend).toBe(true);
        });

        it('rejects a replayed legacy string x402 payload hash', async () => {
            const proof = { type: 'payment', x402_payload: 'x402_duplicate_payload' };
            await validatePaymentProofForDoubleSpend(proof, store);
            const result = await validatePaymentProofForDoubleSpend(proof, store);
            expect(result.valid).toBe(false);
            expect(result.isDoubleSpend).toBe(true);
        });

        it('passes through off-chain token payments (no hash check needed)', async () => {
            const proof = {
                type: 'payment',
                token: 'tok_stripe_4242424242424242',
            };
            const result = await validatePaymentProofForDoubleSpend(proof, store);
            expect(result.valid).toBe(true);
            expect(result.isDoubleSpend).toBeUndefined();
        });

        it('passes through non-payment proofs without hash check', async () => {
            const credentialProof = {
                type: 'credential',
                vc: { '@context': ['https://www.w3.org/2018/credentials/v1'] },
            };
            const result = await validatePaymentProofForDoubleSpend(credentialProof, store);
            expect(result.valid).toBe(true);
        });

        it('returns error for payment proof with no hash or token', async () => {
            const proof = { type: 'payment', amount: 1.0 }; // missing hash/token
            const result = await validatePaymentProofForDoubleSpend(proof, store);
            expect(result.valid).toBe(false);
            expect(result.errors[0]).toMatch(/tx_hash|x402_payload|token/i);
        });

        it('returns error for non-object proof', async () => {
            const result = await validatePaymentProofForDoubleSpend('not an object', store);
            expect(result.valid).toBe(false);
        });

        it('uses custom TTL for hash retention', async () => {
            vi.useFakeTimers();
            const proof = { type: 'payment', tx_hash: '0xcustomttl' };
            await validatePaymentProofForDoubleSpend(proof, store, 30); // 30s TTL
            vi.advanceTimersByTime(31_000);
            // After TTL, hash expires — same hash can be resubmitted
            const result = await validatePaymentProofForDoubleSpend(proof, store, 30);
            expect(result.valid).toBe(true); // expired, so not double-spend
            vi.useRealTimers();
        });

        it('handles two different hashes without interference', async () => {
            const proof1 = { type: 'payment', tx_hash: '0xaaa' };
            const proof2 = { type: 'payment', tx_hash: '0xbbb' };
            await validatePaymentProofForDoubleSpend(proof1, store);
            const r1 = await validatePaymentProofForDoubleSpend(proof1, store);
            const r2 = await validatePaymentProofForDoubleSpend(proof2, store);
            expect(r1.isDoubleSpend).toBe(true);
            expect(r2.valid).toBe(true); // different hash — fresh
        });

        it('emits telemetry metrics for consume and double-spend detection', async () => {
            const metrics: SecurityMetricName[] = [];
            const telemetry = {
                emit(metric: SecurityMetricName) {
                    metrics.push(metric);
                },
            };
            const proof = { type: 'payment', tx_hash: '0xtelemetry' };
            const first = await validatePaymentProofForDoubleSpend(proof, store, { telemetry });
            const second = await validatePaymentProofForDoubleSpend(proof, store, { telemetry });
            expect(first.valid).toBe(true);
            expect(second.valid).toBe(false);
            expect(metrics).toContain('eep.payment.hash_consumed_total');
            expect(metrics).toContain('eep.payment.double_spend_detected_total');
            expect(CRITICAL_SECURITY_METRICS.length).toBeGreaterThan(0);
        });

        it('custom PaymentHashStore implementation works correctly', async () => {
            // Implement a custom store to verify the interface contract
            const customStore: PaymentHashStore = {
                seen: new Set<string>(),
                async isSeen(hash: string) { return (this.seen as Set<string>).has(hash); },
                async markSeen(hash: string) { (this.seen as Set<string>).add(hash); },
            } as PaymentHashStore & { seen: Set<string> };

            const proof = { type: 'payment', tx_hash: '0xcustom' };
            const r1 = await validatePaymentProofForDoubleSpend(proof, customStore);
            const r2 = await validatePaymentProofForDoubleSpend(proof, customStore);
            expect(r1.valid).toBe(true);
            expect(r2.isDoubleSpend).toBe(true);
        });
    });

    // ── PaymentHashEntry type ──────────────────────────────────────────────────

    describe('PaymentHashEntry type (structural)', () => {
        it('constructs a valid PaymentHashEntry object', () => {
            const entry: PaymentHashEntry = {
                txHash: '0xdeadbeef',
                acceptedAt: Date.now(),
                expiresAt: Date.now() + 600_000,
                agentDid: 'did:web:agent.example.com',
                amountUsd: 0.01,
            };
            expect(entry.txHash).toBe('0xdeadbeef');
            expect(entry.agentDid).toBeDefined();
            expect(entry.amountUsd).toBe(0.01);
        });

        it('allows optional fields to be omitted', () => {
            const entry: PaymentHashEntry = {
                txHash: '0xminimal',
                acceptedAt: Date.now(),
                expiresAt: Date.now() + 600_000,
            };
            expect(entry.agentDid).toBeUndefined();
            expect(entry.amountUsd).toBeUndefined();
        });
    });
});

// ════════════════════════════════════════════════════════════════════════════════
// G33 — SSE/WS Backpressure Close Codes
// Whitepaper §9.6: "terminated with a 4000 close code rather than buffering indefinitely"
// ════════════════════════════════════════════════════════════════════════════════

describe('G33 — WebSocket/SSE Backpressure Close Codes', () => {
    describe('WsCloseCode enum values', () => {
        it('BACKPRESSURE is 4000 (per Whitepaper §9.6)', () => {
            expect(WsCloseCode.BACKPRESSURE).toBe(4000);
        });

        it('SESSION_REVOKED is 4001', () => {
            expect(WsCloseCode.SESSION_REVOKED).toBe(4001);
        });

        it('RATE_LIMITED is 4002', () => {
            expect(WsCloseCode.RATE_LIMITED).toBe(4002);
        });

        it('PROOF_EXPIRED is 4003', () => {
            expect(WsCloseCode.PROOF_EXPIRED).toBe(4003);
        });

        it('VERSION_MISMATCH is 4004', () => {
            expect(WsCloseCode.VERSION_MISMATCH).toBe(4004);
        });

        it('all codes are in the user-defined range (4000-4999)', () => {
            const values = Object.values(WsCloseCode).filter(v => typeof v === 'number') as number[];
            for (const code of values) {
                expect(code).toBeGreaterThanOrEqual(4000);
                expect(code).toBeLessThan(5000);
            }
        });

        it('all codes are unique', () => {
            const values = Object.values(WsCloseCode).filter(v => typeof v === 'number') as number[];
            const unique = new Set(values);
            expect(unique.size).toBe(values.length);
        });
    });

    describe('Backpressure threshold constants', () => {
        it('SSE_BACKPRESSURE_THRESHOLD_EVENTS is a positive integer', () => {
            expect(SSE_BACKPRESSURE_THRESHOLD_EVENTS).toBeGreaterThan(0);
            expect(Number.isInteger(SSE_BACKPRESSURE_THRESHOLD_EVENTS)).toBe(true);
        });

        it('SSE_BACKPRESSURE_LAG_SECONDS is a positive integer', () => {
            expect(SSE_BACKPRESSURE_LAG_SECONDS).toBeGreaterThan(0);
            expect(Number.isInteger(SSE_BACKPRESSURE_LAG_SECONDS)).toBe(true);
        });

        it('threshold is within expected range (100-10000 events)', () => {
            expect(SSE_BACKPRESSURE_THRESHOLD_EVENTS).toBeGreaterThanOrEqual(100);
            expect(SSE_BACKPRESSURE_THRESHOLD_EVENTS).toBeLessThanOrEqual(10_000);
        });

        it('lag window is at least 60 seconds', () => {
            expect(SSE_BACKPRESSURE_LAG_SECONDS).toBeGreaterThanOrEqual(60);
        });
    });

    describe('Publisher backpressure logic simulation', () => {
        // Simulates a publisher's subscriber lag checker
        function shouldDisconnect(lag: number): { disconnect: boolean; code?: WsCloseCode } {
            if (lag > SSE_BACKPRESSURE_THRESHOLD_EVENTS) {
                return { disconnect: true, code: WsCloseCode.BACKPRESSURE };
            }
            return { disconnect: false };
        }

        it('does not disconnect a subscriber within threshold', () => {
            const result = shouldDisconnect(SSE_BACKPRESSURE_THRESHOLD_EVENTS - 1);
            expect(result.disconnect).toBe(false);
        });

        it('disconnects with code 4000 when subscriber exceeds threshold', () => {
            const result = shouldDisconnect(SSE_BACKPRESSURE_THRESHOLD_EVENTS + 1);
            expect(result.disconnect).toBe(true);
            expect(result.code).toBe(WsCloseCode.BACKPRESSURE);
            expect(result.code).toBe(4000);
        });

        it('disconnects with code 4000 for a very lagged subscriber (e.g., 50k events behind)', () => {
            const result = shouldDisconnect(50_000);
            expect(result.disconnect).toBe(true);
            expect(result.code).toBe(WsCloseCode.BACKPRESSURE);
        });

        it('close code 4000 is numerically correct for WS close frame', () => {
            // WebSocket close frames use codes 4000-4999 for user-defined purposes
            // The code must be a valid unsigned 16-bit integer
            const code = WsCloseCode.BACKPRESSURE;
            expect(code >= 0 && code <= 65535).toBe(true);
            expect(code).toBe(4000);
        });
    });
});

// ════════════════════════════════════════════════════════════════════════════════
// G34 — mTLS Schema Validation
// Whitepaper §9.1: "EEP recommends mTLS for high-sensitivity deployments"
// Schema: eep-manifest.json tls_mode field
// ════════════════════════════════════════════════════════════════════════════════

describe('G34 — mTLS tls_mode manifest field', () => {
    // Represents a minimal eep-manifest conforming object
    interface ManifestTlsConfig {
        did: string;
        tls_mode?: 'standard' | 'mTLS' | 'mTLS-required';
        eep_versions: string[];
    }

    function validateTlsMode(manifest: ManifestTlsConfig): { valid: boolean; error?: string } {
        const allowed = ['standard', 'mTLS', 'mTLS-required'] as const;
        if (manifest.tls_mode !== undefined && !allowed.includes(manifest.tls_mode as typeof allowed[number])) {
            return { valid: false, error: `Invalid tls_mode: "${manifest.tls_mode}". Must be one of: ${allowed.join(', ')}` };
        }
        return { valid: true };
    }

    it('accepts manifest without tls_mode (defaults to standard)', () => {
        const manifest = { did: 'did:web:example.com', eep_versions: ['0.1'] };
        const result = validateTlsMode(manifest);
        expect(result.valid).toBe(true);
    });

    it('accepts tls_mode: standard', () => {
        const manifest = { did: 'did:web:example.com', eep_versions: ['0.1'], tls_mode: 'standard' as const };
        expect(validateTlsMode(manifest).valid).toBe(true);
    });

    it('accepts tls_mode: mTLS', () => {
        const manifest = { did: 'did:web:finserv.example.com', eep_versions: ['0.1'], tls_mode: 'mTLS' as const };
        expect(validateTlsMode(manifest).valid).toBe(true);
    });

    it('accepts tls_mode: mTLS-required', () => {
        const manifest = { did: 'did:web:gov.example.com', eep_versions: ['0.1'], tls_mode: 'mTLS-required' as const };
        expect(validateTlsMode(manifest).valid).toBe(true);
    });

    it('rejects invalid tls_mode value', () => {
        const manifest = { did: 'did:web:example.com', eep_versions: ['0.1'], tls_mode: 'TLS1.2' as 'standard' };
        const result = validateTlsMode(manifest);
        expect(result.valid).toBe(false);
        expect(result.error).toMatch(/invalid tls_mode/i);
    });

    it('mTLS-required publishers should reject agents without client certs (simulation)', () => {
        // Simulate what an mTLS-required publisher checks at connection time
        function agentMeetsTransportRequirement(
            tlsMode: ManifestTlsConfig['tls_mode'],
            agentHasClientCert: boolean
        ): boolean {
            if (tlsMode === 'mTLS-required') return agentHasClientCert;
            if (tlsMode === 'mTLS') return true; // preferred but not required
            return true; // 'standard'
        }

        expect(agentMeetsTransportRequirement('mTLS-required', false)).toBe(false);
        expect(agentMeetsTransportRequirement('mTLS-required', true)).toBe(true);
        expect(agentMeetsTransportRequirement('mTLS', false)).toBe(true); // preferred, not required
        expect(agentMeetsTransportRequirement('standard', false)).toBe(true);
    });
});

// ════════════════════════════════════════════════════════════════════════════════
// G35 — Bad-Actor Response Protocol
// Whitepaper §12.2: 3-step revocation: DID revoke → registry remove → signal broadcast
// ════════════════════════════════════════════════════════════════════════════════

describe('G35 — Bad-Actor Response Protocol', () => {
    interface BadActorResponseStep {
        step: 1 | 2 | 3;
        action: string;
        completed: boolean;
    }

    function executeBadActorProtocol(targetDid: string): BadActorResponseStep[] {
        // Represents the three mandatory steps from Whitepaper §12.2
        return [
            { step: 1, action: `Revoke DID ${targetDid} in authoritative registry`, completed: true },
            { step: 2, action: `Remove ${targetDid} from eep.dev discovery registry`, completed: true },
            { step: 3, action: `Broadcast trust.signal.revoked for ${targetDid}`, completed: true },
        ];
    }

    it('protocol produces exactly 3 steps', () => {
        const steps = executeBadActorProtocol('did:web:bad-actor.example');
        expect(steps).toHaveLength(3);
    });

    it('step 1 is DID revocation', () => {
        const steps = executeBadActorProtocol('did:web:bad-actor.example');
        expect(steps[0].step).toBe(1);
        expect(steps[0].action).toMatch(/revoke.*DID/i);
    });

    it('step 2 is registry removal', () => {
        const steps = executeBadActorProtocol('did:web:bad-actor.example');
        expect(steps[1].step).toBe(2);
        expect(steps[1].action).toMatch(/registry/i);
    });

    it('step 3 is trust.signal.revoked broadcast', () => {
        const steps = executeBadActorProtocol('did:web:bad-actor.example');
        expect(steps[2].step).toBe(3);
        expect(steps[2].action).toMatch(/trust.signal.revoked/i);
    });

    it('generates a valid trust.signal.revoked event structure', () => {
        interface TrustSignalRevokedEvent {
            type: string;
            source: string;
            data: {
                target_did: string;
                reason: string;
                revocation_timestamp: string;
            };
        }

        function buildTrustRevokedEvent(
            targetDid: string,
            reason: string,
            committeeDid: string
        ): TrustSignalRevokedEvent {
            return {
                type: 'trust.signal.revoked',
                source: committeeDid,
                data: {
                    target_did: targetDid,
                    reason,
                    revocation_timestamp: new Date().toISOString(),
                },
            };
        }

        const event = buildTrustRevokedEvent(
            'did:web:bad-actor.example',
            'fraudulent_gate_requirements',
            'did:web:eep.dev'
        );

        expect(event.type).toBe('trust.signal.revoked');
        expect(event.source).toBe('did:web:eep.dev');
        expect(event.data.target_did).toBe('did:web:bad-actor.example');
        expect(event.data.reason).toBeTruthy();
        expect(new Date(event.data.revocation_timestamp).getTime()).not.toBeNaN();
    });

    it('revoked DID proof is rejected by agent (zero-trust check)', () => {
        interface DIDDocument { id: string; revoked?: boolean }

        function isProofAcceptable(
            proof: { agent_did: string },
            didDoc: DIDDocument
        ): boolean {
            // Per Whitepaper §12.2: agents MUST check DID Document for revocation
            if (didDoc.revoked) return false;
            return true;
        }

        const revokedDoc: DIDDocument = { id: 'did:web:bad-actor.example', revoked: true };
        const freshDoc: DIDDocument = { id: 'did:web:good-agent.example', revoked: false };

        expect(isProofAcceptable({ agent_did: 'did:web:bad-actor.example' }, revokedDoc)).toBe(false);
        expect(isProofAcceptable({ agent_did: 'did:web:good-agent.example' }, freshDoc)).toBe(true);
    });
});

// ════════════════════════════════════════════════════════════════════════════════
// G36 — Sector-Specific Conformance Extensions
// Whitepaper §11.4: "EEP-FinServ-1.0", "EEP-Health-1.0" sector extension process
// ════════════════════════════════════════════════════════════════════════════════

describe('G36 — Sector Conformance Extension Naming and Structure', () => {
    const SECTOR_NAME_PATTERN = /^EEP-[A-Za-z]+(-[A-Za-z]+)?-\d+\.\d+$/;

    it('validates sector extension naming convention: EEP-{Sector}-{Major}.{Minor}', () => {
        expect('EEP-FinServ-1.0').toMatch(SECTOR_NAME_PATTERN);
        expect('EEP-Health-1.0').toMatch(SECTOR_NAME_PATTERN);
        expect('EEP-Legal-1.0').toMatch(SECTOR_NAME_PATTERN);
        expect('EEP-IoT-1.0').toMatch(SECTOR_NAME_PATTERN);
    });

    it('rejects names that dont follow the convention', () => {
        expect('finserv-1.0').not.toMatch(SECTOR_NAME_PATTERN);
        expect('EEP-1.0').not.toMatch(SECTOR_NAME_PATTERN);
        expect('EEP-FinServ').not.toMatch(SECTOR_NAME_PATTERN);
        expect('EEP-FinServ-1').not.toMatch(SECTOR_NAME_PATTERN);
    });

    it('sector EEIP must declare base tier', () => {
        interface SectorEEIP {
            name: string;
            base_tier: 'Core' | 'Standard' | 'Full';
            sector: string;
            regulatory_framework: string;
        }

        const eeip: SectorEEIP = {
            name: 'EEP-FinServ-1.0',
            base_tier: 'Full',
            sector: 'Financial Services',
            regulatory_framework: 'DORA (EU 2022/2554)',
        };

        expect(eeip.base_tier).toBeTruthy();
        expect(['Core', 'Standard', 'Full']).toContain(eeip.base_tier);
    });

    it('sector credential type follows naming convention', () => {
        function sectorCredentialType(extensionName: string): string {
            // EEP-FinServ-1.0 → EEPConformanceCredential_FinServ_1_0
            return 'EEPConformanceCredential_' + extensionName
                .replace('EEP-', '')
                .replace(/\./g, '_')
                .replace(/-/g, '_');
        }

        expect(sectorCredentialType('EEP-FinServ-1.0')).toBe('EEPConformanceCredential_FinServ_1_0');
        expect(sectorCredentialType('EEP-Health-1.0')).toBe('EEPConformanceCredential_Health_1_0');
        expect(sectorCredentialType('EEP-IoT-2.1')).toBe('EEPConformanceCredential_IoT_2_1');
    });

    it('sector EEIPs may only ADD requirements, not remove them', () => {
        // Simulates constraint: sector ext cannot reduce base conformance
        interface RequirementSet { required: string[]; optional: string[] }

        function isAdditiveSectorExtension(
            baseRequirements: RequirementSet,
            sectorRequirements: RequirementSet
        ): boolean {
            // All base required fields must still be required in sector ext
            return baseRequirements.required.every(r => sectorRequirements.required.includes(r));
        }

        const base: RequirementSet = { required: ['layer_1', 'layer_2_sse', 'gates'], optional: [] };
        const finServ: RequirementSet = { required: ['layer_1', 'layer_2_sse', 'gates', 'mTLS', 'audit_log'], optional: [] };
        const invalid: RequirementSet = { required: ['layer_1'], optional: ['layer_2_sse'] }; // removed 'gates'

        expect(isAdditiveSectorExtension(base, finServ)).toBe(true);
        expect(isAdditiveSectorExtension(base, invalid)).toBe(false);
    });
});
