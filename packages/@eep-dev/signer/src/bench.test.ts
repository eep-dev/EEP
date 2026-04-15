import { describe, it, expect } from 'vitest';
import { EEPSigner } from './index';

describe('Signer Performance', () => {
    const SECRET = 'whsec_benchmark-secret-at-least-16-chars';
    const WEBHOOK_ID = 'msg_bench';
    const BODY = '{"type":"com.example.entity.updated","data":{"id":"u/test","ts":1700000000}}';

    it('performs 10,000 sign operations per second', () => {
        const signer = new EEPSigner(SECRET);
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const iterations = 10_000;
        const start = performance.now();
        for (let i = 0; i < iterations; i++) {
            signer.sign(WEBHOOK_ID, timestamp, BODY);
        }
        const elapsed = performance.now() - start;
        console.log(`sign: ${iterations} calls in ${elapsed.toFixed(2)}ms (${(iterations / elapsed * 1000).toFixed(0)} ops/sec)`);
        expect(elapsed).toBeLessThan(10_000);
    });

    it('performs 10,000 verify operations per second', () => {
        const signer = new EEPSigner(SECRET);
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const signature = signer.sign(WEBHOOK_ID, timestamp, BODY);
        const iterations = 10_000;
        const start = performance.now();
        for (let i = 0; i < iterations; i++) {
            signer.verify(WEBHOOK_ID, timestamp, signature, BODY);
        }
        const elapsed = performance.now() - start;
        console.log(`verify: ${iterations} calls in ${elapsed.toFixed(2)}ms (${(iterations / elapsed * 1000).toFixed(0)} ops/sec)`);
        expect(elapsed).toBeLessThan(10_000);
    });

    it('handles large payloads efficiently', () => {
        const signer = new EEPSigner(SECRET);
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const largeBody = JSON.stringify({ data: 'x'.repeat(50_000) });
        const iterations = 1_000;
        const start = performance.now();
        for (let i = 0; i < iterations; i++) {
            signer.sign(WEBHOOK_ID, timestamp, largeBody);
        }
        const elapsed = performance.now() - start;
        console.log(`sign (50KB body): ${iterations} calls in ${elapsed.toFixed(2)}ms (${(iterations / elapsed * 1000).toFixed(0)} ops/sec)`);
        expect(elapsed).toBeLessThan(10_000);
    });
});
