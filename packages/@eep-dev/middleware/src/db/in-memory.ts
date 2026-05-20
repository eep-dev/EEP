import type { DBAdapter, SubscriptionRecord, SubscriptionUpdate } from "../core/request-handler.js";

export class InMemoryDBAdapter implements DBAdapter {
  private readonly records = new Map<string, SubscriptionRecord>();

  async saveSubscription(subscription: SubscriptionRecord): Promise<void> {
    this.records.set(subscription.subscription_id, subscription);
  }

  async getSubscription(subscriptionId: string): Promise<SubscriptionRecord | null> {
    return this.records.get(subscriptionId) ?? null;
  }

  async listSubscriptions(): Promise<SubscriptionRecord[]> {
    return Array.from(this.records.values());
  }

  async updateSubscription(subscriptionId: string, updates: SubscriptionUpdate): Promise<void> {
    const existing = this.records.get(subscriptionId);
    if (!existing) {
      return;
    }
    this.records.set(subscriptionId, { ...existing, ...updates });
  }

  async deleteSubscription(subscriptionId: string): Promise<boolean> {
    return this.records.delete(subscriptionId);
  }
}
