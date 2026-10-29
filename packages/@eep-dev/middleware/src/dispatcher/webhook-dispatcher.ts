import { EEPSigner, signEd25519 } from "@eep-dev/signer";
import { matchesAnyPattern } from "@eep-dev/validator";
import { TEST_DELIVERY_EVENT_TYPE } from "../core/request-handler.js";
import type { EventStore } from "../core/event-store.js";
import { eventMatchesFilter } from "../core/event-filter.js";
import { renderDelivery } from "./content-mode.js";
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
  /**
   * Records every delivery attempt for `GET
   * /eep/subscriptions/:id/delivery-log` (SPECIFICATION.md §5.1.2). This is
   * how a subscriber tells "the publisher never sent it" apart from "my
   * endpoint rejected it" — otherwise unanswerable from its side.
   */
  eventStore?: EventStore;
  /**
   * Ed25519 private key (`whsk_`-prefixed) for asymmetric delivery signatures
   * (SPECIFICATION.md §5.3.1). When set, every delivery carries a `v1a` token
   * alongside the HMAC one, so subscribers can migrate at their own pace and
   * events become verifiable by third parties.
   */
  signingPrivateKey?: string;
  /** Key id advertised in the JWKS, carried in the signature token. */
  signingKeyId?: string;
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
/**
 * Mirror an event's trace context into HTTP headers.
 *
 * Only well-formed values are forwarded: a malformed `traceparent` is worse
 * than none, because it silently roots the subscriber's spans under a trace
 * that does not exist.
 */
const TRACEPARENT_PATTERN = /^[0-9a-f]{2}-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/;

function traceHeaders(event: CloudEvent): Record<string, string> {
  const headers: Record<string, string> = {};
  const candidate = (event as { traceparent?: unknown }).traceparent;
  if (typeof candidate === "string" && TRACEPARENT_PATTERN.test(candidate)) {
    headers.traceparent = candidate;
    const state = (event as { tracestate?: unknown }).tracestate;
    // `tracestate` is meaningless without a `traceparent` to accompany.
    if (typeof state === "string" && state.length > 0 && state.length <= 512) {
      headers.tracestate = state;
    }
  }
  return headers;
}

export class WebhookDispatcher {
  private readonly db: DBAdapter;
  private readonly fallbackSecret?: string;
  private readonly httpClient: WebhookHttpClient;
  private readonly retrySchedule: readonly number[];
  private readonly pauseAfterFailures: number;
  private readonly deliveryTimeoutMs: number;
  private readonly onDeliveryResult?: (result: DeliveryResult) => void;
  private readonly eventStore?: EventStore;
  private readonly signingPrivateKey?: string;
  private readonly signingKeyId?: string;
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
    this.eventStore = options.eventStore;
    this.signingPrivateKey = options.signingPrivateKey;
    this.signingKeyId = options.signingKeyId;
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

    if (!matchesAnyPattern(event.type, sub.event_types)) return false;

    // §5.1.3 — the filter narrows what `event_types` already selected. An
    // event that fails it is simply not delivered, and does not count toward
    // the subscription's failure counter.
    return eventMatchesFilter(event, sub.filter);
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

      const startedAt = Date.now();
      const outcome = await this.attemptDelivery(event, sub);
      lastStatus = outcome.status;
      await this.logAttempt(sub, event, attempt + 1, outcome, Date.now() - startedAt, {
        isFinalAttempt: attempt === this.retrySchedule.length - 1
      });
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

    // §5.2.1 — render in the subscription's content mode. The signature is
    // computed over whatever body this produces, so a binary-mode subscriber
    // verifies exactly what it received without reassembling an envelope.
    const { body, headers: contentHeaders } = renderDelivery(event, sub.delivery_format);
    // Stable across retries so subscribers can deduplicate; the event `id`
    // is the idempotency key per delivery_guarantees.md §1.
    const webhookId = `msg_${event.id}`;
    // Re-signed per attempt with a current timestamp so a late retry still
    // lands inside the subscriber's replay window.
    const timestamp = Math.floor(Date.now() / 1000).toString();

    let signature: string;
    try {
      signature = new EEPSigner(secret).sign(webhookId, timestamp, body);
      // Dual-sign when an Ed25519 key is configured (§5.3.1). Both tokens
      // travel space-delimited; a verifier for either scheme ignores the
      // other's token, which is what makes the migration path work.
      if (this.signingPrivateKey) {
        const asymmetric = signEd25519(
          this.signingPrivateKey,
          webhookId,
          timestamp,
          body,
          this.signingKeyId
        );
        signature = `${signature} ${asymmetric}`;
      }
    } catch {
      return { ok: false };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.deliveryTimeoutMs);
    try {
      const res = await this.httpClient(url, {
        headers: {
          ...contentHeaders,
          "webhook-id": webhookId,
          "webhook-timestamp": timestamp,
          "webhook-signature": signature,
          // W3C Trace Context is mirrored into HTTP headers per the
          // CloudEvents Distributed Tracing extension (SPECIFICATION.md
          // §7.1). Without this the subscriber's spans are orphaned and a
          // multi-hop agent workflow cannot be correlated back to the
          // originating event.
          ...traceHeaders(event)
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
  /**
   * Append one attempt to the delivery log.
   *
   * `undeliverable` is reserved for the last attempt of an exhausted schedule:
   * an interim failure is `failed` because a later attempt may still succeed,
   * and conflating them would make the log read as if every retry were fatal.
   */
  private async logAttempt(
    sub: SubscriptionRecord,
    event: CloudEvent,
    attempt: number,
    outcome: { ok: boolean; status?: number },
    elapsedMs: number,
    context: { isFinalAttempt: boolean }
  ): Promise<void> {
    if (!this.eventStore) return;
    try {
      await this.eventStore.recordDelivery({
        subscription_id: sub.subscription_id,
        event_id: event.id,
        attempt,
        timestamp: new Date().toISOString(),
        ...(outcome.status === undefined ? {} : { status_code: outcome.status }),
        response_time_ms: elapsedMs,
        final_status: outcome.ok
          ? "delivered"
          : context.isFinalAttempt
            ? "undeliverable"
            : "failed"
      });
    } catch {
      // Observability must never break delivery.
    }
  }

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
