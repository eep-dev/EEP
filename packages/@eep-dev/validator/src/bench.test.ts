import { describe, it, expect } from 'vitest';
import { validateEventTypePattern, matchesEventType, matchesAnyPattern } from './index';

describe('Validator Performance', () => {
    it('validates 10,000 event type patterns per second', () => {
        const iterations = 10_000;
        const start = performance.now();
        for (let i = 0; i < iterations; i++) {
            validateEventTypePattern('com.example.entity.updated');
        }
        const elapsed = performance.now() - start;
        console.log(`validateEventTypePattern: ${iterations} calls in ${elapsed.toFixed(2)}ms (${(iterations / elapsed * 1000).toFixed(0)} ops/sec)`);
        expect(elapsed).toBeLessThan(10_000);
    });

    it('matches 10,000 event types per second', () => {
        const iterations = 10_000;
        const start = performance.now();
        for (let i = 0; i < iterations; i++) {
            matchesEventType('com.example.entity.updated', 'com.example.entity.*');
        }
        const elapsed = performance.now() - start;
        console.log(`matchesEventType: ${iterations} calls in ${elapsed.toFixed(2)}ms (${(iterations / elapsed * 1000).toFixed(0)} ops/sec)`);
        expect(elapsed).toBeLessThan(10_000);
    });

    it('matches 10,000 patterns against arrays per second', () => {
        const patterns = [
            'com.example.entity.*',
            'com.example.trust.*',
            'com.example.content.*',
            'com.example.connection.*',
        ];
        const iterations = 10_000;
        const start = performance.now();
        for (let i = 0; i < iterations; i++) {
            matchesAnyPattern('com.example.connection.established', patterns);
        }
        const elapsed = performance.now() - start;
        console.log(`matchesAnyPattern (4 patterns): ${iterations} calls in ${elapsed.toFixed(2)}ms (${(iterations / elapsed * 1000).toFixed(0)} ops/sec)`);
        expect(elapsed).toBeLessThan(10_000);
    });

    it('validates complex patterns without catastrophic backtracking', () => {
        const iterations = 10_000;
        const longPattern = 'a' + '.b'.repeat(50) + '.*';
        const start = performance.now();
        for (let i = 0; i < iterations; i++) {
            validateEventTypePattern(longPattern);
        }
        const elapsed = performance.now() - start;
        console.log(`validateEventTypePattern (long): ${iterations} calls in ${elapsed.toFixed(2)}ms`);
        expect(elapsed).toBeLessThan(10_000);
    });
});
