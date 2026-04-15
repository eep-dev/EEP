import type { DBAdapter, SubscriptionRecord } from "../core/request-handler.js";

export type SQLClientLike = {
  execute: (query: string, params?: unknown[]) => Promise<{ rows?: Array<Record<string, unknown>> } | void>;
};

export class PostgresDBAdapter implements DBAdapter {
  constructor(private readonly client: SQLClientLike, private readonly tableName = "eep_subscriptions") {}

  async saveSubscription(subscription: SubscriptionRecord): Promise<void> {
    await this.client.execute(
      `INSERT INTO ${this.tableName} (subscription_id, source_did, delivery_method, callback_url, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        subscription.subscription_id,
        subscription.source_did,
        subscription.delivery_method,
        subscription.callback_url ?? null,
        subscription.created_at
      ]
    );
  }

  async getSubscription(subscriptionId: string): Promise<SubscriptionRecord | null> {
    const result = await this.client.execute(
      `SELECT subscription_id, source_did, delivery_method, callback_url, created_at
       FROM ${this.tableName} WHERE subscription_id = $1`,
      [subscriptionId]
    );
    const row = result && "rows" in result ? result.rows?.[0] : undefined;
    if (!row) {
      return null;
    }
    return {
      subscription_id: String(row.subscription_id),
      source_did: String(row.source_did),
      delivery_method: String(row.delivery_method) as SubscriptionRecord["delivery_method"],
      callback_url: row.callback_url ? String(row.callback_url) : undefined,
      created_at: String(row.created_at)
    };
  }

  async listSubscriptions(): Promise<SubscriptionRecord[]> {
    const result = await this.client.execute(
      `SELECT subscription_id, source_did, delivery_method, callback_url, created_at
       FROM ${this.tableName}`
    );
    const rows = result && "rows" in result && result.rows ? result.rows : [];
    return rows.map((row) => ({
      subscription_id: String(row.subscription_id),
      source_did: String(row.source_did),
      delivery_method: String(row.delivery_method) as SubscriptionRecord["delivery_method"],
      callback_url: row.callback_url ? String(row.callback_url) : undefined,
      created_at: String(row.created_at)
    }));
  }
}
