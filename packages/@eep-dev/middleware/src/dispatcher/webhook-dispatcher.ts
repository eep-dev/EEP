import { EEPSigner } from "@eep-dev/signer";
import { matchesAnyPattern } from "@eep-dev/validator";
import { TEST_DELIVERY_EVENT_TYPE } from "../core/request-handler.js";
import type {
  CloudEvent,
  DBAdapter,
  EventBusAdapter,
  SubscriptionRecord,
  SubscriptionUpdate
} from "../core/request-handler.js";

/**
 * Webhook retry schedule from EEP `docs/current/delivery_guarantees.md` §2.
 *
 * The array index is the attempt number; the value is the delay (ms) BEFORE
 * that attempt is made. Attempt 1 fires immediately; attempt 7 fires ~6 hours
 * after the first. A delivery is considered fully failed only once every
 * attempt in this schedule has failed.
 */
export const DEFAULT_RETRY_SCHEDULE_MS: readonly number[] = [
  0, // attempt 1: immediate
  5_000, // attempt 2: +5s
  30_000, // attempt 3: +30s
  120_000, // attempt 4: +2m
  900_000, // attempt 5: +15m
  3_600_000, // attempt 6: +1h
  21_600_000 // attempt 7: +6h
];

/**
 * Consecutive fully-failed deliveries after which a subscription MUST be
 * moved to the `paused` state (delivery_guarantees.md §2).
 */
export const DEFAULT_PAUSE_AFTER_FAILURES = 5;

/**
 * Per-attempt HTTP timeout. A response slower than this counts as a failure
 * (delivery_guarantees.md §2: "No response received within 10 seconds").
 */
export const DEFAULT_DELIVERY_TIMEOUT_MS = 10_000;

/** Minimal HTTP response shape the dispatcher needs to judge an attempt. */
export type WebhookHttpResponse = {
  ok: boolean;
  status: number;
};

/**
 * Pluggable HTTP transport. The default implementation wraps the global
 * `fetch`; tests and edge runtimes can supply their own. Implementations
 * SHOULD honor `signal` so the dispatcher's timeout is enforced.
 */
export type WebhookHttpClient = (
  url: string,
  request: { headers: Record<string, string>; body: string; signal: AbortSignal }
) => Promise<WebhookHttpResponse>;

/** Outcome of a single `event → subscription` delivery, after all retries. */
export type DeliveryResult = {
  subscription_id: string;
  event_id: string;
  delivered: boolean;
  /** Attempts actually made (1-based count; never exceeds the schedule length). */
  attempts: number;
  /** HTTP status of the final attempt, when one was received. */
  last_status?: number;
  /** True when the dispatcher was stopped before the schedule was exhausted. */
  aborted?: boolean;
};

export type WebhookDispatcherOptions = {
  db: DBAdapter;
  /**
   * HMAC secret used to sign deliveries for subscriptions that have no
   * `delivery_secret` of their own. Subscriptions created by `EEPServer`
   * always carry a per-subscription secret, so this is only needed for
   * externally provisioned records. A subscription with neither a
   * `delivery_secret` nor a fallback cannot be signed and its deliveries
   * fail closed.
   */
  fallbackSecret?: string;
  /** HTTP transport. Defaults to a wrapper around the global `fetch`. */
  httpClient?: WebhookHttpClient;
  /** Override the retry schedule (ms before each attempt). Mainly for tests. */
  retryScheduleMs?: readonly number[];
  /** Consecutive failed deliveries before a subscription is paused. */
  pauseAfterFailures?: number;
  /** Per-attempt HTTP timeout in ms. */
  deliveryTimeoutMs?: number;
  /** Optional observer invoked once per subscription after its retries end. */
  onDeliveryResult?: (result: DeliveryResult) => void;
};

const defaultHttpClient: WebhookHttpClient = async (url, { headers, body, signal }) => {
  const res = await fetch(url, { method: "POST", headers, body, signal });
  return { ok: res.ok, status: res.status };
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fans EEP events out to webhook subscribers with the spec-mandated
 * exponential backoff.
 *
 * Wire it to an event bus once with {@link WebhookDispatcher.start}, or call
 * {@link WebhookDispatcher.dispatch} directly. For each published event the
 * dispatcher selects every `active` webhook subscription whose `event_types`
 * match, signs the payload per Standard Webhooks, and POSTs it — retrying on
 * the {@link DEFAULT_RETRY_SCHEDULE_MS} schedule. After
 * {@link DEFAULT_PAUSE_AFTER_FAILURES} consecutive fully-failed deliveries the
 * subscription is moved to `paused`; the next successful delivery resets the
 * counter.
 *
 * This is an in-process dispatcher: a `dispatch` call does not resolve until
 * every subscriber's retry schedule is exhausted, which can take ~6 hours for
 * a down endpoint. The {@link WebhookDispatcher.start} path `void`s that
 * promise so it never blocks the event bus. Deployments that need durable,
 * restart-surviving retries should back the event bus with a queue.
 */
export class WebhookDispatcher {
  private readonly db: DBAdapter;
  private readonly fallbackSecret?: string;
  private readonly httpClient: WebhookHttpClient;
  private readonly retrySchedule: readonly number[];
  private readonly pauseAfterFailures: number;
  private readonly deliveryTimeoutMs: number;
  private readonly onDeliveryResult?: (result: DeliveryResult) => void;
  private stopped = false;

  constructor(options: WebhookDispatcherOptions) {
    this.db = options.db;
    this.fallbackSecret = options.fallbackSecret;
    this.httpClient = options.httpClient ?? defaultHttpClient;
    this.retrySchedule =
      options.retryScheduleMs && options.retryScheduleMs.length > 0
        ? options.retryScheduleMs
        : DEFAULT_RETRY_SCHEDULE_MS;
    this.pauseAfterFailures = options.pauseAfterFailures ?? DEFAULT_PAUSE_AFTER_FAILURES;
    this.deliveryTimeoutMs = options.deliveryTimeoutMs ?? DEFAULT_DELIVERY_TIMEOUT_MS;
    this.onDeliveryResult = options.onDeliveryResult;
  }

  /**
   * Subscribe the dispatcher to every event on the bus. Each event is
   * dispatched in the background so the bus handler returns immediately.
   */
  async start(eventBus: EventBusAdapter): Promise<void> {
    await eventBus.subscribe("*", (event) => {
      void this.dispatch(event);
    });
  }

  /** Stop scheduling further retries. In-flight HTTP attempts are not cancelled. */
  stop(): void {
    this.stopped = true;
  }

  /**
   * Deliver one event to every matching webhook subscription. Resolves once
   * every selected subscription's retry schedule has finished.
   */
  async dispatch(event: CloudEvent): Promise<DeliveryResult[]> {
    const subscriptions = await this.db.listSubscriptions();
    const targets = subscriptions.filter((sub) => this.isTarget(sub, event));
    return Promise.all(targets.map((sub) => this.deliverWithRetry(event, sub)));
  }

  private isTarget(sub: SubscriptionRecord, event: CloudEvent): boolean {
    const deliverable =
      sub.delivery_method === "webhook" &&
      sub.status === "active" &&
      !this.leaseHasElapsed(sub) &&
      typeof sub.callback_url === "string" &&
      sub.callback_url.length > 0;
    if (!deliverable) return false;

    // A synthetic test delivery is addressed to ONE subscription and must not
    // fan out. It also deliberately bypasses `event_types`: the whole point is
    // to exercise the signed delivery path for a subscriber whose patterns
    // would never match `com.eep.subscription.test`. See SPECIFICATION.md
    // §5.1.1.
    if (event.type === TEST_DELIVERY_EVENT_TYPE) {
      const target = (event.data as { subscription_id?: unknown } | undefined)?.subscription_id;
      return typeof target === "string" && target === sub.subscription_id;
    }

    return matchesAnyPattern(event.type, sub.event_types);
  }

  /**
   * True once the subscription's lease has elapsed (SPECIFICATION.md §10.2).
   *
   * Checked at delivery time rather than relying on a sweeper, so an expired
   * subscription stops receiving events even in a deployment that has no
   * background job — an unenforced lease is the same as no lease at all.
   */
  private leaseHasElapsed(sub: SubscriptionRecord): boolean {
    if (typeof sub.expires_at !== "string") return false;
    const expiresAt = Date.parse(sub.expires_at);
    if (Number.isNaN(expiresAt)) return false;
    return expiresAt <= Date.now();
  }

  private async deliverWithRetry(event: CloudEvent, sub: SubscriptionRecord): Promise<DeliveryResult> {
    let lastStatus: number | undefined;

    for (let attempt = 0; attempt < this.retrySchedule.length; attempt++) {
      const delay = this.retrySchedule[attempt] ?? 0;
      if (delay > 0) {
        await sleep(delay);
      }
      if (this.stopped) {
        // Shutdown, not a subscriber fault — do not penalize the subscription.
        return this.report({
          subscription_id: sub.subscription_id,
          event_id: event.id,
          delivered: false,
          attempts: attempt,
          last_status: lastStatus,
          aborted: true
        });
      }

      const outcome = await this.attemptDelivery(event, sub);
      lastStatus = outcome.status;
      if (outcome.ok) {
        await this.recordSuccess(sub.subscription_id);
        return this.report({
          subscription_id: sub.subscription_id,
          event_id: event.id,
          delivered: true,
          attempts: attempt + 1,
          last_status: lastStatus
        });
      }
    }

    await this.recordFailure(sub.subscription_id);
    return this.report({
      subscription_id: sub.subscription_id,
      event_id: event.id,
      delivered: false,
      attempts: this.retrySchedule.length,
      last_status: lastStatus
    });
  }

  private async attemptDelivery(
    event: CloudEvent,
    sub: SubscriptionRecord
  ): Promise<{ ok: boolean; status?: number }> {
    const secret = sub.delivery_secret ?? this.fallbackSecret;
    const url = sub.callback_url;
    if (!secret || !url) {
      // Cannot sign or has no destination: fail closed.
      return { ok: false };
    }

    const body = JSON.stringify(event);
    // Stable across retries so subscribers can deduplicate; the event `id`
    // is the idempotency key per delivery_guarantees.md §1.
    const webhookId = `msg_${event.id}`;
    // Re-signed per attempt with a current timestamp so a late retry still
    // lands inside the subscriber's replay window.
    const timestamp = Math.floor(Date.now() / 1000).toString();

    let signature: string;
    try {
      signature = new EEPSigner(secret).sign(webhookId, timestamp, body);
    } catch {
      return { ok: false };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.deliveryTimeoutMs);
    try {
      const res = await this.httpClient(url, {
        headers: {
          "content-type": "application/json",
          "webhook-id": webhookId,
          "webhook-timestamp": timestamp,
          "webhook-signature": signature
        },
        body,
        signal: controller.signal
      });
      return { ok: res.ok, status: res.status };
    } catch {
      return { ok: false };
    } finally {
      clearTimeout(timer);
    }
  }

  /** Reset the consecutive-failure counter after a delivery lands. */
  private async recordSuccess(subscriptionId: string): Promise<void> {
    const current = await this.db.getSubscription(subscriptionId);
    if (current && current.failure_count > 0) {
      await this.db.updateSubscription(subscriptionId, { failure_count: 0 });
    }
  }

  /** Increment the consecutive-failure counter and pause at the threshold. */
  private async recordFailure(subscriptionId: string): Promise<void> {
    const current = await this.db.getSubscription(subscriptionId);
    if (!current) {
      return;
    }
    const failureCount = current.failure_count + 1;
    const updates: SubscriptionUpdate = { failure_count: failureCount };
    if (failureCount >= this.pauseAfterFailures) {
      updates.status = "paused";
    }
    await this.db.updateSubscription(subscriptionId, updates);
  }

  private report(result: DeliveryResult): DeliveryResult {
    this.onDeliveryResult?.(result);
    return result;
  }
}
