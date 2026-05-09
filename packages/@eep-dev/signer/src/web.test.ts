import { describe, it, expect } from 'vitest';
import { EEPSigner } from './index.js';
import { EEPWebSigner, EEPWebSignatureError, verifyEEPWebhookWeb } from './web.js';

const SECRET = 'super-secret-test-key-1234';

describe('EEPWebSigner — WebCrypto parity', () => {
    it('signs the same value as the Node EEPSigner for a fixed input', async () => {
        const node = new EEPSigner(SECRET);
        const web = new EEPWebSigner(SECRET);
        const ts = String(Math.floor(Date.now() / 1000));
        const id = 'msg_01HN3QK7GX';
        const body = '{"hello":"world"}';

        const nodeSig = node.sign(id, ts, body);
        const webSig = await web.sign(id, ts, body);

        expect(webSig).toBe(nodeSig);
    });

    it('verifies a Node-produced signature', async () => {
        const node = new EEPSigner(SECRET);
        const web = new EEPWebSigner(SECRET);
        const ts = String(Math.floor(Date.now() / 1000));
        const id = 'msg_X';
        const body = '{"v":1}';
        const nodeSig = node.sign(id, ts, body);

        const ok = await web.verify(id, ts, nodeSig, body);
        expect(ok).toBe(true);
    });

    it('rejects an invalid signature', async () => {
        const web = new EEPWebSigner(SECRET);
        const ts = String(Math.floor(Date.now() / 1000));
        const ok = await web.verify('msg_X', ts, 'v1,deadbeef', '{"v":1}');
        expect(ok).toBe(false);
    });

    it('rejects an expired timestamp', async () => {
        const web = new EEPWebSigner(SECRET);
        const expired = String(Math.floor(Date.now() / 1000) - 120);
        await expect(
            web.verify('msg_X', expired, 'v1,whatever', '{"v":1}')
        ).rejects.toBeInstanceOf(EEPWebSignatureError);
    });

    it('rejects a non-numeric timestamp', async () => {
        const web = new EEPWebSigner(SECRET);
        await expect(
            web.verify('msg_X', 'not-a-number', 'v1,deadbeef', '{}')
        ).rejects.toBeInstanceOf(EEPWebSignatureError);
    });

    it('rejects a too-short secret', () => {
        expect(() => new EEPWebSigner('short')).toThrow();
    });

    it('verifyEEPWebhookWeb returns false for missing headers', async () => {
        const ok = await verifyEEPWebhookWeb('{}', {}, SECRET);
        expect(ok).toBe(false);
    });

    it('verifyEEPWebhookWeb verifies a complete header set', async () => {
        const node = new EEPSigner(SECRET);
        const ts = String(Math.floor(Date.now() / 1000));
        const id = 'msg_OK';
        const body = '{"a":42}';
        const sig = node.sign(id, ts, body);

        const headers = {
            'webhook-id': id,
            'webhook-timestamp': ts,
            'webhook-signature': sig,
        };
        const ok = await verifyEEPWebhookWeb(body, headers, SECRET);
        expect(ok).toBe(true);
    });

    it('accepts a multi-value signature header (returns true if any match)', async () => {
        const node = new EEPSigner(SECRET);
        const ts = String(Math.floor(Date.now() / 1000));
        const id = 'msg_MULTI';
        const body = '{"x":1}';
        const realSig = node.sign(id, ts, body);
        const fake = 'v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
        const combined = `${fake} ${realSig}`;
        const web = new EEPWebSigner(SECRET);
        const ok = await web.verify(id, ts, combined, body);
        expect(ok).toBe(true);
    });
});
