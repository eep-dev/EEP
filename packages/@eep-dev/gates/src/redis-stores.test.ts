import { describe, it, expect } from 'vitest';
import { RedisNonceStore, RedisPaymentHashStore, type RedisClientLike } from './redis-stores.js';

class FakeRedis implements RedisClientLike {
    private kv = new Map<string, string>();

    async exists(key: string): Promise<number> {
        return this.kv.has(key) ? 1 : 0;
    }

    async set(key: string, value: string, _mode: 'EX', _ttlSeconds: number): Promise<unknown> {
        this.kv.set(key, value);
        return 'OK';
    }

    async eval(_script: string, _numKeys: number, ...args: string[]): Promise<number | string | null> {
        const key = args[0];
        if (!key) return 0;
        if (this.kv.has(key)) return 0;
        this.kv.set(key, '1');
        return 1;
    }
}

describe('Redis-backed stores', () => {
    it('RedisNonceStore consumeIfFresh is atomic in contract', async () => {
        const redis = new FakeRedis();
        const store = new RedisNonceStore(redis);
        const first = await store.consumeIfFresh('abc', 60);
        const second = await store.consumeIfFresh('abc', 60);
        expect(first).toBe(true);
        expect(second).toBe(false);
        expect(await store.isConsumed('abc')).toBe(true);
    });

    it('RedisPaymentHashStore tracks seen hashes', async () => {
        const redis = new FakeRedis();
        const store = new RedisPaymentHashStore(redis);
        expect(await store.isSeen('tx1')).toBe(false);
        await store.markSeen('tx1', 60);
        expect(await store.isSeen('tx1')).toBe(true);
    });

    it('RedisPaymentHashStore consumeIfFresh is atomic in contract', async () => {
        const redis = new FakeRedis();
        const store = new RedisPaymentHashStore(redis);
        const first = await store.consumeIfFresh?.('tx-atomic', 60);
        const second = await store.consumeIfFresh?.('tx-atomic', 60);
        expect(first).toBe(true);
        expect(second).toBe(false);
        expect(await store.isSeen('tx-atomic')).toBe(true);
    });
});
