import type { DBAdapter, SubscriptionRecord, SubscriptionUpdate } from "../core/request-handler.js";

export type SQLClientLike = {
  execute: (
    query: string,
    params?: unknown[]
  ) => Promise<{ rows?: Array<Record<string, unknown>>; rowCount?: number } | void>;
};

const COLUMNS =
  "subscription_id, source_did, delivery_method, callback_url, event_types, status, failure_count, delivery_secret, metadata, tier, created_at";

function parseEventTypes(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((entry) => String(entry));
  }
  if (typeof raw === "string" && raw.length > 0) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed.map((entry) => String(entry)) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function parseMetadata(raw: unknown): Record<string, string> | undefined {
  if (!raw) return undefined;
  // `jsonb` columns (and drivers that auto-parse JSON) hand back an object
  // directly; `text` columns hand back the serialized string.
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, string>;
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, string>;
      }
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function rowToRecord(row: Record<string, unknown>): SubscriptionRecord {
  return {
    subscription_id: String(row.subscription_id),
    source_did: String(row.source_did),
    delivery_method: String(row.delivery_method) as SubscriptionRecord["delivery_method"],
    callback_url: row.callback_url ? String(row.callback_url) : undefined,
    event_types: parseEventTypes(row.event_types),
    status: row.status === "paused" ? "paused" : "active",
    failure_count: Number(row.failure_count ?? 0),
    delivery_secret: row.delivery_secret ? String(row.delivery_secret) : undefined,
    metadata: parseMetadata(row.metadata),
    tier: row.tier ? String(row.tier) : undefined,
    created_at: String(row.created_at)
  };
}

/**
 * Columns added after the original `eep_subscriptions` table shipped.
 * `initSchema` issues an idempotent `ADD COLUMN IF NOT EXISTS` for each so a
 * table created by an earlier release is upgraded in place — without this,
 * the `SELECT`/`INSERT` statements below fail with `column does not exist`.
 */
const ADDED_COLUMNS: ReadonlyArray<readonly [name: string, type: string]> = [
  ["event_types", "TEXT"],
  ["status", "TEXT NOT NULL DEFAULT 'active'"],
  ["failure_count", "INTEGER NOT NULL DEFAULT 0"],
  ["delivery_secret", "TEXT"],
  ["metadata", "TEXT"],
  ["tier", "TEXT"]
];

export class PostgresDBAdapter implements DBAdapter {
  constructor(private readonly client: SQLClientLike, private readonly tableName = "eep_subscriptions") {}

  /**
   * Create the subscriptions table if absent, and add any columns introduced
   * by later releases. Idempotent — safe to call on every boot. Requires
   * PostgreSQL ≥ 9.6 for `ADD COLUMN IF NOT EXISTS`.
   */
  async initSchema(): Promise<void> {
    await this.client.execute(
      `CREATE TABLE IF NOT EXISTS ${this.tableName} (
         subscription_id TEXT PRIMARY KEY,
         source_did TEXT NOT NULL,
         delivery_method TEXT NOT NULL,
         callback_url TEXT,
         event_types TEXT,
         status TEXT NOT NULL DEFAULT 'active',
         failure_count INTEGER NOT NULL DEFAULT 0,
         delivery_secret TEXT,
         metadata TEXT,
         tier TEXT,
         created_at TEXT NOT NULL
       )`
    );
    for (const [name, type] of ADDED_COLUMNS) {
      await this.client.execute(`ALTER TABLE ${this.tableName} ADD COLUMN IF NOT EXISTS ${name} ${type}`);
    }
  }

  async saveSubscription(subscription: SubscriptionRecord): Promise<void> {
    await this.client.execute(
      `INSERT INTO ${this.tableName} (${COLUMNS})
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        subscription.subscription_id,
        subscription.source_did,
        subscription.delivery_method,
        subscription.callback_url ?? null,
        JSON.stringify(subscription.event_types),
        subscription.status,
        subscription.failure_count,
        subscription.delivery_secret ?? null,
        subscription.metadata ? JSON.stringify(subscription.metadata) : null,
        subscription.tier ?? null,
        subscription.created_at
      ]
    );
  }

  async getSubscription(subscriptionId: string): Promise<SubscriptionRecord | null> {
    const result = await this.client.execute(
      `SELECT ${COLUMNS} FROM ${this.tableName} WHERE subscription_id = $1`,
      [subscriptionId]
    );
    const row = result && "rows" in result ? result.rows?.[0] : undefined;
    return row ? rowToRecord(row) : null;
  }

  async listSubscriptions(): Promise<SubscriptionRecord[]> {
    const result = await this.client.execute(`SELECT ${COLUMNS} FROM ${this.tableName}`);
    const rows = result && "rows" in result && result.rows ? result.rows : [];
    return rows.map(rowToRecord);
  }

  async deleteSubscription(subscriptionId: string): Promise<boolean> {
    const result = await this.client.execute(
      `DELETE FROM ${this.tableName} WHERE subscription_id = $1`,
      [subscriptionId]
    );
    // `rowCount` is the standard pg driver field. Drivers that don't surface it
    // (or our void-returning test stub) fall through to `true` — the caller
    // will get a 204 even for a no-op, which matches DELETE semantics anyway.
    if (result && typeof result === "object" && "rowCount" in result && typeof result.rowCount === "number") {
      return result.rowCount > 0;
    }
    return true;
  }

  async updateSubscription(subscriptionId: string, updates: SubscriptionUpdate): Promise<void> {
    const sets: string[] = [];
    const params: unknown[] = [];
    if (updates.status !== undefined) {
      params.push(updates.status);
      sets.push(`status = $${params.length}`);
    }
    if (updates.failure_count !== undefined) {
      params.push(updates.failure_count);
      sets.push(`failure_count = $${params.length}`);
    }
    if (sets.length === 0) {
      return;
    }
    params.push(subscriptionId);
    await this.client.execute(
      `UPDATE ${this.tableName} SET ${sets.join(", ")} WHERE subscription_id = $${params.length}`,
      params
    );
  }
}
