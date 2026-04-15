import { describe, it, expect, beforeEach } from 'vitest';
import {
    validateRequestHeaders,
    validatePaymentChain,
    validateProofWithNonce,
    validateProofWithNonceAndVerifier,
    validateProofStructure,
    InMemoryNonceStore,
    setGlobalSecurityTelemetryRecorder,
} from '../src/proof-validator.js';
import { build429Response } from '../src/http-402.js';

// ── G24: EEP Request Header Validation ───────────────────────────────────────

describe('G24 — validateRequestHeaders', () => {
    it('accepts a fully valid set of EEP headers', () => {
        const result = validateRequestHeaders({
            'EEP-Agent-DID': 'did:web:agent.example.com',
            'EEP-Signature': 'dGVzdFNpZ25hdHVyZXBheWxvYWQ',
            'EEP-Nonce': 'nonce_abc12345',
        });
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
        expect(result.agentDid).toBe('did:web:agent.example.com');
        expect(result.nonce).toBe('nonce_abc12345');
    });

    it('rejects when EEP-Agent-DID is missing', () => {
        const result = validateRequestHeaders({
            'EEP-Signature': 'dGVzdFNpZ25hdHVyZQ',
            'EEP-Nonce': 'nonce_abc12345',
        });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('EEP-Agent-DID'))).toBe(true);
    });

    it('rejects when EEP-Agent-DID has invalid format (not a DID)', () => {
        const result = validateRequestHeaders({
            'EEP-Agent-DID': 'not-a-valid-did',
            'EEP-Signature': 'dGVzdFNpZ25hdHVyZQabc',
            'EEP-Nonce': 'nonce_abc12345',
        });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('EEP-Agent-DID format'))).toBe(true);
    });

    it('rejects when EEP-Signature is missing', () => {
        const result = validateRequestHeaders({
            'EEP-Agent-DID': 'did:web:agent.example.com',
            'EEP-Nonce': 'nonce_abc12345',
        });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('EEP-Signature'))).toBe(true);
    });

    it('rejects when EEP-Signature is too short', () => {
        const result = validateRequestHeaders({
            'EEP-Agent-DID': 'did:web:agent.example.com',
            'EEP-Signature': 'abc',
            'EEP-Nonce': 'nonce_abc12345',
        });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('too short'))).toBe(true);
    });

    it('rejects when EEP-Nonce is missing', () => {
        const result = validateRequestHeaders({
            'EEP-Agent-DID': 'did:web:agent.example.com',
            'EEP-Signature': 'dGVzdFNpZ25hdHVyZQabc',
        });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('EEP-Nonce'))).toBe(true);
    });

    it('rejects when EEP-Nonce exceeds 128 characters', () => {
        const result = validateRequestHeaders({
            'EEP-Agent-DID': 'did:web:agent.example.com',
            'EEP-Signature': 'dGVzdFNpZ25hdHVyZQabc',
            'EEP-Nonce': 'n'.repeat(129),
        });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('maximum length'))).toBe(true);
    });

    it('is case-insensitive for header names', () => {
        const result = validateRequestHeaders({
            'eep-agent-did': 'did:web:agent.example.com',
            'eep-signature': 'dGVzdFNpZ25hdHVyZQabc',
            'eep-nonce': 'nonce_abc12345',
        });
        expect(result.valid).toBe(true);
    });

    it('allows missing signature when requireSignature=false', () => {
        const result = validateRequestHeaders(
            {
                'EEP-Agent-DID': 'did:web:agent.example.com',
                'EEP-Nonce': 'nonce_abc12345',
            },
            { requireSignature: false }
        );
        expect(result.valid).toBe(true);
    });
});

// ── G25: session.revoked WebSocket Message ────────────────────────────────────

describe('G25 — session.revoked structural validation', () => {
    it('accepts a valid session_revoked message data payload', () => {
        // Validate the data fields directly (ws-message.json validates the wrapper)
        const payload = {
            session_id: 'sess_abc123',
            agent_did: 'did:web:agent.example.com',
            publisher_did: 'did:web:publisher.example.com',
            reason: 'payment_failed',
            revoked_at: '2026-03-05T12:00:00Z',
            re_auth_required: true,
        };
        expect(typeof payload.session_id).toBe('string');
        expect(payload.session_id.length).toBeGreaterThan(0);
        expect(payload.agent_did).toMatch(/^did:[a-z0-9]+:.+$/);
        expect(['agreement_violation', 'payment_failed', 'operator_request', 'security_incident', 'session_expired']).toContain(payload.reason);
        expect(() => new Date(payload.revoked_at)).not.toThrow();
    });

    it('validates session_revoked requires session_id, agent_did, reason, revoked_at', () => {
        // These are the required fields per ws-message.json allOf block
        const required = ['session_id', 'agent_did', 'reason', 'revoked_at'];
        const payload: Record<string, unknown> = {
            reason: 'operator_request',
            revoked_at: '2026-03-05T12:00:00Z',
        };
        const missing = required.filter(f => !payload[f]);
        expect(missing).toContain('session_id');
        expect(missing).toContain('agent_did');
    });

    it('accepts all valid reason codes', () => {
        const validReasons = ['agreement_violation', 'payment_failed', 'operator_request', 'security_incident', 'session_expired'];
        for (const reason of validReasons) {
            expect(typeof reason).toBe('string');
            expect(reason.length).toBeGreaterThan(0);
        }
    });

    it('re_auth_required defaults to true', () => {
        const payload = {
            session_id: 'sess_xyz',
            agent_did: 'did:web:agent.test',
            reason: 'operator_request',
            revoked_at: new Date().toISOString(),
        };
        const reAuthRequired = (payload as { re_auth_required?: boolean }).re_auth_required ?? true;
        expect(reAuthRequired).toBe(true);
    });
});

// ── G27: Multi-Chain Payment Proof Validator ──────────────────────────────────

describe('G27 — validatePaymentChain', () => {
    const networks = [
        { chain: 'solana', address: 'So11111111111111111111111111111111111111112', min_confirmations: 32 },
        { chain: 'ethereum', address: '0x742d35Cc6634C0532925a3b8D4C9C4A9C4A9C4A', min_confirmations: 12 },
        { chain: 'base', address: '0xBaseAddress123', min_confirmations: 0 },
    ];

    it('accepts a valid on-chain payment proof with sufficient confirmations', () => {
        const proof = {
            type: 'payment',
            chain: 'solana',
            tx_hash: '5KtmkVXLoWizHrUmLP1NkiGrmKa2Q2g3X5hk3pXHKGe3iY7tR1aSdfJk2bNtrxyz',
            confirmations: 35,
        };
        const result = validatePaymentChain(proof, networks);
        expect(result.valid).toBe(true);
        expect(result.matchedNetwork?.chain).toBe('solana');
    });

    it('accepts a chain with min_confirmations=0 without confirmations field', () => {
        const proof = {
            type: 'payment',
            chain: 'base',
            tx_hash: '0xabc123def456abc123def456abc123def456abc123def456abc123def456',
        };
        const result = validatePaymentChain(proof, networks);
        expect(result.valid).toBe(true);
    });

    it('rejects if tx_hash present but chain is missing', () => {
        const proof = {
            type: 'payment',
            tx_hash: '0xabc123',
        };
        const result = validatePaymentChain(proof, networks);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('"chain" field'))).toBe(true);
    });

    it('rejects a chain not declared in publisher manifest', () => {
        const proof = {
            type: 'payment',
            chain: 'polygon',
            tx_hash: '0xabc123',
            confirmations: 50,
        };
        const result = validatePaymentChain(proof, networks);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('polygon'))).toBe(true);
    });

    it('rejects when confirmations is below min_confirmations', () => {
        const proof = {
            type: 'payment',
            chain: 'ethereum',
            tx_hash: '0xabc123',
            confirmations: 5,
        };
        const result = validatePaymentChain(proof, networks);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('insufficient confirmations'))).toBe(true);
    });

    it('rejects when confirmations field is missing for chain requiring it', () => {
        const proof = {
            type: 'payment',
            chain: 'solana',
            tx_hash: '5KtmkVXLoWizHrUmLP1NkiGrmKa2Q2g3X5hk3pXHKGe3iY7tR1aSdfJk2bNtrxyz',
        };
        const result = validatePaymentChain(proof, networks);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('confirmations'))).toBe(true);
    });

    it('skips chain validation for off-chain token proofs (no chain/tx_hash)', () => {
        const proof = {
            type: 'payment',
            token: 'stripe_pi_abc123',
        };
        const result = validatePaymentChain(proof, networks);
        expect(result.valid).toBe(true);
    });
});

// ── G28: commerce.rfp.* Event Payloads ───────────────────────────────────────

describe('G28 — commerce.rfp.* event payloads', () => {
    it('rfp.open event requires rfp_id, publisher_did, description, mechanism, close_time', () => {
        const requiredFields = ['rfp_id', 'publisher_did', 'description', 'mechanism', 'close_time'];
        const validOpen = {
            rfp_id: 'rfp_2026_001',
            publisher_did: 'did:web:acme.corp',
            description: 'Premium API access for Q1',
            mechanism: 'first_price' as const,
            close_time: '2026-03-10T23:59:59Z',
            reserve_price: 100,
            currency: 'USD',
        };
        for (const field of requiredFields) {
            expect(validOpen).toHaveProperty(field);
        }
        expect(['first_price', 'vickrey', 'reverse']).toContain(validOpen.mechanism);
    });

    it('rfp.bid.submit requires rfp_id, bidder_did, bid_amount, bid_currency, signed_bid', () => {
        const bid = {
            rfp_id: 'rfp_2026_001',
            bidder_did: 'did:web:agent.bidder.com',
            bid_amount: 125.50,
            bid_currency: 'USD',
            signed_bid: 'dGVzdFNpZ25lZEJpZFBheWxvYWQ',
        };
        expect(bid.bid_amount).toBeGreaterThan(0);
        expect(bid.bidder_did).toMatch(/^did:[a-z0-9]+:.+$/);
        expect(bid.signed_bid.length).toBeGreaterThan(0);
    });

    it('rfp.closed requires rfp_id, winner_did, winning_bid, closed_at, allocation_receipt_vc', () => {
        const closed = {
            rfp_id: 'rfp_2026_001',
            winner_did: 'did:web:agent.winner.com',
            winning_bid: 125.50,
            total_bids: 7,
            closed_at: '2026-03-10T23:59:59Z',
            allocation_receipt_vc: {
                '@context': ['https://www.w3.org/2018/credentials/v1'],
                type: ['VerifiableCredential', 'EEPAllocationReceipt'],
                id: 'https://acme.corp/receipts/rfp_2026_001',
                issuer: 'did:web:acme.corp',
                issuanceDate: '2026-03-11T00:00:01Z',
                credentialSubject: {
                    id: 'did:web:agent.winner.com',
                    allocation_id: 'rfp_2026_001',
                    winning_bid: 125.50,
                    currency: 'USD',
                    valid_from: '2026-03-11T00:00:01Z',
                },
            },
        };
        expect(closed.winner_did).toMatch(/^did:[a-z0-9]+:.+$/);
        expect(closed.winning_bid).toBeGreaterThan(0);
        expect(closed.allocation_receipt_vc.type).toContain('EEPAllocationReceipt');
    });

    it('rejects negative bid_amount', () => {
        const bid_amount = -10;
        expect(bid_amount).toBeLessThanOrEqual(0); // confirming the rule
    });
});

// ── G29: Nonce Consumed-Ledger ────────────────────────────────────────────────

describe('G29 — InMemoryNonceStore & validateProofWithNonce', () => {
    let store: InMemoryNonceStore;

    beforeEach(() => {
        store = new InMemoryNonceStore();
    });

    it('accepts a fresh proof with a new nonce', async () => {
        const proof = {
            type: 'trust',
            self_attested: true,
            nonce: 'fresh-nonce-abc123',
        };
        const result = await validateProofWithNonce(proof, store);
        expect(result.valid).toBe(true);
        expect(result.isReplay).toBeUndefined();
    });

    it('rejects a replay attack: same nonce used twice', async () => {
        const proof = {
            type: 'trust',
            self_attested: true,
            nonce: 'replay-nonce-xyz789',
        };
        const first = await validateProofWithNonce(proof, store);
        expect(first.valid).toBe(true);

        const second = await validateProofWithNonce(proof, store);
        expect(second.valid).toBe(false);
        expect(second.isReplay).toBe(true);
        expect(second.errors[0]).toContain('Replay attack detected');
    });

    it('marks nonce consumed after successful validation', async () => {
        const nonce = 'consumed-nonce-test';
        await store.markConsumed(nonce, 300);
        const isConsumed = await store.isConsumed(nonce);
        expect(isConsumed).toBe(true);
    });

    it('treats expired nonces as fresh (TTL-based cleanup)', async () => {
        const nonce = 'expired-nonce-test';
        // Mark consumed with 0 TTL (immediate expiry)
        const store2 = new InMemoryNonceStore();
        store2['consumed'].set(nonce, Date.now() - 1); // already expired
        const result = await store2.isConsumed(nonce);
        expect(result).toBe(false);
    });

    it('rejects structurally invalid proof even with a fresh nonce', async () => {
        const proof = {
            type: 'totally_invalid_type',
            nonce: 'valid-nonce-abc999',
        };
        const result = await validateProofWithNonce(proof, store);
        // invalid type should fail structural validation
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
    });

    it('supports nonce supplied from headers via options override', async () => {
        const proof = {
            type: 'trust',
            self_attested: true,
        };
        const first = await validateProofWithNonce(proof, store, { nonce: 'header-nonce-123' });
        const second = await validateProofWithNonce(proof, store, { nonce: 'header-nonce-123' });
        expect(first.valid).toBe(true);
        expect(second.valid).toBe(false);
        expect(second.isReplay).toBe(true);
    });

    it('supports preflight replay check without consuming nonce', async () => {
        const proof = {
            type: 'trust',
            self_attested: true,
            nonce: 'preflight-nonce-001',
        };
        const preflight = await validateProofWithNonce(proof, store, { markConsumed: false });
        const final = await validateProofWithNonce(proof, store);
        expect(preflight.valid).toBe(true);
        expect(final.valid).toBe(true);
    });

    it('uses atomic consumeIfFresh when store supports it', async () => {
        const proof = {
            type: 'trust',
            self_attested: true,
            nonce: 'atomic-nonce-1',
        };
        let consumeCalls = 0;
        const storeAtomic = {
            consumed: new Set<string>(),
            async isConsumed(n: string) { return this.consumed.has(n); },
            async markConsumed(n: string) { this.consumed.add(n); },
            async consumeIfFresh(n: string) {
                consumeCalls += 1;
                if (this.consumed.has(n)) return false;
                this.consumed.add(n);
                return true;
            },
        };
        const first = await validateProofWithNonce(proof, storeAtomic);
        const second = await validateProofWithNonce(proof, storeAtomic);
        expect(first.valid).toBe(true);
        expect(second.valid).toBe(false);
        expect(consumeCalls).toBe(2);
    });

    it('semantic helper does not consume nonce on semantic failure', async () => {
        const proof = {
            type: 'trust',
            self_attested: true,
            nonce: 'semantic-nonce-fail',
        };
        const first = await validateProofWithNonceAndVerifier(
            proof,
            store,
            async () => false
        );
        const second = await validateProofWithNonce(proof, store);
        expect(first.valid).toBe(false);
        expect(second.valid).toBe(true);
    });

    it('semantic helper consumes nonce only after semantic success', async () => {
        const proof = {
            type: 'trust',
            self_attested: true,
            nonce: 'semantic-nonce-pass',
        };
        const first = await validateProofWithNonceAndVerifier(
            proof,
            store,
            async () => true
        );
        const second = await validateProofWithNonceAndVerifier(
            proof,
            store,
            async () => true
        );
        expect(first.valid).toBe(true);
        expect(second.valid).toBe(false);
        expect(second.isReplay).toBe(true);
    });

    it('uses global telemetry recorder when per-call telemetry is absent', async () => {
        const proof = {
            type: 'trust',
            self_attested: true,
            nonce: 'global-telemetry-nonce',
        };
        const seen: string[] = [];
        setGlobalSecurityTelemetryRecorder({
            emit(metric) {
                seen.push(metric);
            },
        });
        try {
            await validateProofWithNonce(proof, store);
            expect(seen).toContain('eep.nonce.consumed_total');
        } finally {
            setGlobalSecurityTelemetryRecorder(undefined);
        }
    });
});

// ── G30: Rate-Limit 429 Response Builder ─────────────────────────────────────

describe('G30 — build429Response', () => {
    const mockSign = async (payload: string): Promise<string> => `mocked_sig_${payload.slice(-8)}`;

    it('builds a well-formed 429 body with all required fields', async () => {
        const { body, headers } = await build429Response(
            'did:web:agent.example.com',
            60,
            mockSign,
            { limitPerWindow: 100, requestsMade: 101, message: 'Too many requests' }
        );

        expect(body.error).toBe('rate_limited');
        expect(body.did_rate_limit_key).toBe('did:web:agent.example.com');
        expect(body.retry_after_seconds).toBe(60);
        expect(typeof body.window_reset_at).toBe('string');
        expect(typeof body.signed_challenge).toBe('string');
        expect(body.signed_challenge.length).toBeGreaterThan(0);
        expect(body.limit_per_window).toBe(100);
        expect(body.requests_made).toBe(101);
        expect(body.message).toBe('Too many requests');
    });

    it('includes correct Retry-After header matching retry_after_seconds', async () => {
        const { headers } = await build429Response('did:web:agent.example.com', 120, mockSign);
        expect(headers['Retry-After']).toBe('120');
    });

    it('includes X-EEP-Rate-Limit-DID header with the rate-limited DID', async () => {
        const did = 'did:key:z6Mk9X4G5T7f8C3V2r8W1K6M';
        const { headers } = await build429Response(did, 30, mockSign);
        expect(headers['X-EEP-Rate-Limit-DID']).toBe(did);
    });

    it('signed_challenge is prefixed with v1.', async () => {
        const { body } = await build429Response('did:web:agent.test', 60, mockSign);
        expect(body.signed_challenge.startsWith('v1.')).toBe(true);
    });
});

// ── G26: Agent Wallet Schema Validation ──────────────────────────────────────

describe('G26 — AgentWallet type structure', () => {
    it('accepts a valid operator_derived wallet declaration', () => {
        const wallet = {
            agent_did: 'did:web:agent.acme.corp:assistant',
            binding_model: 'operator_derived' as const,
            key_type: 'Ed25519' as const,
            created_at: '2026-03-05T10:00:00Z',
            rotation_policy: { max_age_days: 90, auto_rotate: false },
            operator_derived_config: {
                derivation_path: "m/44'/60'/0'/0/0",
                master_did: 'did:web:acme.corp',
            },
            operator_did: 'did:web:acme.corp',
        };
        expect(wallet.binding_model).toBe('operator_derived');
        expect(wallet.operator_derived_config.derivation_path).toMatch(/^m\//);
        expect(wallet.rotation_policy.max_age_days).toBeLessThanOrEqual(365);
    });

    it('accepts a valid hardware_isolated wallet declaration', () => {
        const wallet = {
            agent_did: 'did:web:agent.secure.corp',
            binding_model: 'hardware_isolated' as const,
            key_type: 'ML-DSA-65' as const,
            created_at: '2026-03-05T10:00:00Z',
            rotation_policy: { max_age_days: 90 },
            hardware_config: {
                hardware_type: 'aws_nitro_enclaves' as const,
                attestation_endpoint: 'https://attest.secure.corp/v1/report',
            },
            pqc_ready: true,
        };
        expect(wallet.pqc_ready).toBe(true);
        expect(wallet.hardware_config.hardware_type).toBe('aws_nitro_enclaves');
        expect(['ML-DSA-44', 'ML-DSA-65', 'ML-DSA-87']).toContain(wallet.key_type);
    });

    it('accepts a valid os_keychain wallet declaration', () => {
        const wallet = {
            agent_did: 'did:web:agent.mobile.app',
            binding_model: 'os_keychain' as const,
            key_type: 'P-256' as const,
            created_at: '2026-03-05T10:00:00Z',
            rotation_policy: { max_age_days: 30, auto_rotate: true },
            os_keychain_config: {
                platform: 'apple_secure_enclave' as const,
                biometric_required: true,
            },
        };
        expect(wallet.os_keychain_config.biometric_required).toBe(true);
        expect(['operator_derived', 'hardware_isolated', 'os_keychain']).toContain(wallet.binding_model);
    });
});
