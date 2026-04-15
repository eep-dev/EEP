import type { NonceStore, PaymentHashStore } from './proof-validator.js';

export interface RedisClientLike {
    exists(key: string): Promise<number>;
    set(key: string, value: string, mode: 'EX', ttlSeconds: number, nx?: 'NX'): Promise<unknown>;
    eval(script: string, numKeys: number, ...args: string[]): Promise<number | string | null>;
}

const ATOMIC_CONSUME_NONCE_SCRIPT = `
local key = KEYS[1]
local ttl = tonumber(ARGV[1])
local existing = redis.call("EXISTS", key)
if existing == 1 then
  return 0
end
redis.call("SET", key, "1", "EX", ttl)
return 1
`;

const ATOMIC_CONSUME_PAYMENT_HASH_SCRIPT = `
local key = KEYS[1]
local ttl = tonumber(ARGV[1])
local existing = redis.call("EXISTS", key)
if existing == 1 then
  return 0
end
redis.call("SET", key, "1", "EX", ttl)
return 1
`;

/**
 * Redis-backed nonce store suitable for distributed deployments.
 * Uses Lua script for atomic consume-if-fresh semantics.
 */
export class RedisNonceStore implements NonceStore {
    constructor(
        private readonly redis: RedisClientLike,
        private readonly keyPrefix = 'eep:nonce:'
    ) {}

    private key(nonce: string): string {
        return `${this.keyPrefix}${nonce}`;
    }

    async isConsumed(nonce: string): Promise<boolean> {
        return (await this.redis.exists(this.key(nonce))) === 1;
    }

    async markConsumed(nonce: string, ttlSeconds: number): Promise<void> {
        await this.redis.set(this.key(nonce), '1', 'EX', ttlSeconds);
    }

    async consumeIfFresh(nonce: string, ttlSeconds: number): Promise<boolean> {
        const raw = await this.redis.eval(
            ATOMIC_CONSUME_NONCE_SCRIPT,
            1,
            this.key(nonce),
            String(ttlSeconds)
        );
        return Number(raw) === 1;
    }
}

/**
 * Redis-backed payment hash store for double-spend prevention.
 */
export class RedisPaymentHashStore implements PaymentHashStore {
    constructor(
        private readonly redis: RedisClientLike,
        private readonly keyPrefix = 'eep:payment:'
    ) {}

    private key(txHash: string): string {
        return `${this.keyPrefix}${txHash}`;
    }

    async isSeen(txHash: string): Promise<boolean> {
        return (await this.redis.exists(this.key(txHash))) === 1;
    }

    async markSeen(txHash: string, ttlSeconds: number): Promise<void> {
        await this.redis.set(this.key(txHash), '1', 'EX', ttlSeconds);
    }

    async consumeIfFresh(txHash: string, ttlSeconds: number): Promise<boolean> {
        const raw = await this.redis.eval(
            ATOMIC_CONSUME_PAYMENT_HASH_SCRIPT,
            1,
            this.key(txHash),
            String(ttlSeconds)
        );
        return Number(raw) === 1;
    }
}
