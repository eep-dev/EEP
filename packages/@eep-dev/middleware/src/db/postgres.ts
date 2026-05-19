import type { DBAdapter, SubscriptionRecord, SubscriptionUpdate } from "../core/request-handler.js";

export type SQLClientLike = {
  execute: (query: string, params?: unknown[]) => Promise<{ rows?: Array<Record<string, unknown>> } | void>;
};

const COLUMNS =
  "subscription_id, source_did, delivery_method, callback_url, event_types, status, failure_count, delivery_secret, created_at";

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
    created_at: String(row.created_at)
  };
}

export class PostgresDBAdapter implements DBAdapter {
  constructor(private readonly client: SQLClientLike, private readonly tableName = "eep_subscriptions") {}

  async saveSubscription(subscription: SubscriptionRecord): Promise<void> {
    await this.client.execute(
      `INSERT INTO ${this.tableName} (${COLUMNS})
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        subscription.subscription_id,
        subscription.source_did,
        subscription.delivery_method,
        subscription.callback_url ?? null,
        JSON.stringify(subscription.event_types),
        subscription.status,
        subscription.failure_count,
        subscription.delivery_secret ?? null,
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
