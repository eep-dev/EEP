/**
 * Event history and delivery-log storage (SPECIFICATION.md §5.1.2).
 *
 * SSE subscribers recover missed events with `Last-Event-ID`; Layer 3 clients
 * recover with `system`/`replay` from a `seq`. Webhook subscribers had no
 * equivalent, which mattered most in exactly the case §10 creates: a
 * subscription is `paused` after repeated failures — that is, after the
 * subscriber's endpoint was down and it missed the most — and resuming
 * produced a silent hole.
 */
import type { CloudEvent } from "./request-handler.js";

/** One retained event, plus the ordering key history pages on. */
export interface StoredEvent {
    /** Monotonic, publisher-assigned. Ordering is by this, not by `time`. */
    seq: number;
    event: CloudEvent;
    /** Epoch millis at which this event was stored, for retention pruning. */
    stored_at: number;
}

/** One delivery attempt, per delivery_guarantees.md §4. */
export interface DeliveryLogEntry {
    subscription_id: string;
    event_id: string;
    /** 1-based attempt number within the retry schedule. */
    attempt: number;
    /** RFC 3339. */
    timestamp: string;
    /** HTTP status of the attempt, absent when the request never completed. */
    status_code?: number;
    response_time_ms: number;
    final_status: "delivered" | "failed" | "undeliverable";
}

export interface EventHistoryPage {
    events: CloudEvent[];
    /** Present only when more events remain. Absent means caught up. */
    next_cursor?: string;
}

/**
 * Thrown when `since` names an event older than the retention window.
 *
 * Surfaced as `410 Gone` rather than an empty page: an empty page is
 * indistinguishable from "you are up to date", which would let a subscriber
 * believe it caught up when it silently lost events.
 */
export class RetentionWindowExceededError extends Error {
    constructor(public readonly oldestRetainedId: string | null) {
        super(
            oldestRetainedId
                ? `cursor is older than the retention window; oldest retained event is ${oldestRetainedId}`
                : "cursor is older than the retention window and no events are retained"
        );
        this.name = "RetentionWindowExceededError";
    }
}

export interface EventStore {
    append(event: CloudEvent): Promise<void>;
    /** Events strictly after `since`, in emission order. */
    history(options: {
        source?: string;
        since?: string;
        until?: string;
        limit?: number;
    }): Promise<EventHistoryPage>;
    getByIds(eventIds: string[]): Promise<CloudEvent[]>;
    recordDelivery(entry: DeliveryLogEntry): Promise<void>;
    deliveryLog(subscriptionId: string, limit?: number): Promise<DeliveryLogEntry[]>;
}

/** §5.1.2 retention floor, matching SSE replay (§4.3). */
export const MIN_EVENT_RETENTION_MS = 24 * 60 * 60 * 1000;
/** delivery_guarantees.md §4 retention floor for the delivery log. */
export const MIN_DELIVERY_LOG_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const DEFAULT_HISTORY_LIMIT = 100;
export const MAX_HISTORY_LIMIT = 1000;

/**
 * In-memory reference implementation.
 *
 * Suitable for a single process and for tests. A deployment that must survive
 * a restart backs this interface with the same store its subscriptions live
 * in — the interface, not this class, is what §5.1.2 requires.
 */
export class InMemoryEventStore implements EventStore {
    private readonly events: StoredEvent[] = [];
    private readonly deliveries: DeliveryLogEntry[] = [];
    private nextSeq = 1;

    constructor(
        private readonly retentionMs: number = MIN_EVENT_RETENTION_MS,
        private readonly deliveryLogRetentionMs: number = MIN_DELIVERY_LOG_RETENTION_MS
    ) {}

    async append(event: CloudEvent): Promise<void> {
        this.events.push({ seq: this.nextSeq++, event, stored_at: Date.now() });
        this.prune();
    }

    async history(options: {
        source?: string;
        since?: string;
        until?: string;
        limit?: number;
    }): Promise<EventHistoryPage> {
        this.prune();

        let startSeq = 0;
        if (options.since !== undefined) {
            const cursor = this.events.find((e) => e.event.id === options.since);
            if (!cursor) {
                // The cursor is either older than retention or was never ours.
                // Either way the subscriber cannot trust a page built from it.
                throw new RetentionWindowExceededError(this.events[0]?.event.id ?? null);
            }
            startSeq = cursor.seq;
        }

        let endSeq = Number.POSITIVE_INFINITY;
        if (options.until !== undefined) {
            const cursor = this.events.find((e) => e.event.id === options.until);
            if (cursor) endSeq = cursor.seq;
        }

        const limit = clampLimit(options.limit);
        const matching = this.events.filter(
            (e) =>
                e.seq > startSeq &&
                e.seq <= endSeq &&
                (options.source === undefined || e.event.source === options.source)
        );

        const page = matching.slice(0, limit);
        const hasMore = matching.length > page.length;
        return {
            events: page.map((e) => e.event),
            // Only present when more remain; its absence is how a subscriber
            // knows it is caught up.
            ...(hasMore ? { next_cursor: page[page.length - 1]!.event.id } : {}),
        };
    }

    async getByIds(eventIds: string[]): Promise<CloudEvent[]> {
        this.prune();
        const wanted = new Set(eventIds);
        return this.events.filter((e) => wanted.has(e.event.id)).map((e) => e.event);
    }

    async recordDelivery(entry: DeliveryLogEntry): Promise<void> {
        this.deliveries.push(entry);
        this.prune();
    }

    async deliveryLog(subscriptionId: string, limit = DEFAULT_HISTORY_LIMIT): Promise<DeliveryLogEntry[]> {
        this.prune();
        return this.deliveries
            .filter((d) => d.subscription_id === subscriptionId)
            .slice(-clampLimit(limit));
    }

    private prune(): void {
        const eventCutoff = Date.now() - this.retentionMs;
        while (this.events.length > 0 && this.events[0]!.stored_at < eventCutoff) {
            this.events.shift();
        }
        const deliveryCutoff = Date.now() - this.deliveryLogRetentionMs;
        while (
            this.deliveries.length > 0 &&
            Date.parse(this.deliveries[0]!.timestamp) < deliveryCutoff
        ) {
            this.deliveries.shift();
        }
    }
}

export function clampLimit(limit: unknown): number {
    if (typeof limit !== "number" || !Number.isFinite(limit) || limit < 1) {
        return DEFAULT_HISTORY_LIMIT;
    }
    return Math.min(Math.floor(limit), MAX_HISTORY_LIMIT);
}
