/**
 * Publisher-side subscription filters (SPECIFICATION.md §5.1.3).
 *
 * Filtering was `event_types` glob only, and `subscription.request.json`
 * permits `*` solely in the final segment. A subscriber interested in one
 * field of one object still received every event of that type and discarded
 * the rest — after paying full delivery cost. For an LLM agent that cost is
 * tokens, which is exactly the "context bloat" EEP claims to remove.
 *
 * The predicate language is deliberately small and NOT Turing-complete:
 * a flat list of comparisons over dotted paths, combined with `all` or `any`.
 * There is no regex operator, so a subscriber cannot hand a publisher a
 * catastrophically backtracking pattern to evaluate on every event — the
 * ReDoS surface that a richer language would open on the publisher's hot path
 * simply does not exist here.
 */
import type { CloudEvent } from "./request-handler.js";

export type FilterOperator = "eq" | "ne" | "in" | "nin" | "prefix" | "exists" | "gt" | "lt";

export interface FilterCondition {
    /** Dotted path into the event, e.g. `subject` or `data.field`. */
    path: string;
    op: FilterOperator;
    /** Comparison operand. Absent for `exists`. */
    value?: unknown;
}

export interface EventFilter {
    /** `all` = every condition must hold; `any` = at least one. */
    match: "all" | "any";
    conditions: FilterCondition[];
}

/** Bounds keep evaluation cheap on the delivery hot path. */
export const MAX_FILTER_CONDITIONS = 20;
export const MAX_FILTER_PATH_DEPTH = 8;

export class FilterValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "FilterValidationError";
    }
}

const OPERATORS = new Set<FilterOperator>(["eq", "ne", "in", "nin", "prefix", "exists", "gt", "lt"]);

/**
 * Validate a subscriber-supplied filter.
 *
 * Rejects rather than silently ignoring a malformed filter: a subscriber that
 * believes it is filtering, but is not, receives traffic it thinks it asked to
 * be spared — the opposite of the intent, and impossible to notice from its
 * side.
 */
export function validateFilter(filter: unknown): EventFilter {
    if (typeof filter !== "object" || filter === null) {
        throw new FilterValidationError("filter must be an object");
    }
    const candidate = filter as Partial<EventFilter>;
    if (candidate.match !== "all" && candidate.match !== "any") {
        throw new FilterValidationError("filter.match must be 'all' or 'any'");
    }
    if (!Array.isArray(candidate.conditions) || candidate.conditions.length === 0) {
        throw new FilterValidationError("filter.conditions must be a non-empty array");
    }
    if (candidate.conditions.length > MAX_FILTER_CONDITIONS) {
        throw new FilterValidationError(
            `filter.conditions exceeds the maximum of ${MAX_FILTER_CONDITIONS}`
        );
    }

    for (const condition of candidate.conditions) {
        if (typeof condition !== "object" || condition === null) {
            throw new FilterValidationError("each condition must be an object");
        }
        const { path, op, value } = condition as FilterCondition;
        if (typeof path !== "string" || path.length === 0) {
            throw new FilterValidationError("condition.path must be a non-empty string");
        }
        const segments = path.split(".");
        if (segments.length > MAX_FILTER_PATH_DEPTH) {
            throw new FilterValidationError(
                `condition.path exceeds the maximum depth of ${MAX_FILTER_PATH_DEPTH}`
            );
        }
        if (segments.some((s) => s.length === 0)) {
            throw new FilterValidationError("condition.path has an empty segment");
        }
        // `__proto__` / `constructor` in a subscriber-supplied path must never
        // reach a property lookup.
        if (segments.some((s) => s === "__proto__" || s === "constructor" || s === "prototype")) {
            throw new FilterValidationError("condition.path may not traverse object internals");
        }
        if (!OPERATORS.has(op)) {
            throw new FilterValidationError(`condition.op must be one of: ${[...OPERATORS].join(", ")}`);
        }
        if ((op === "in" || op === "nin") && !Array.isArray(value)) {
            throw new FilterValidationError(`condition.value must be an array for op '${op}'`);
        }
        if (op === "prefix" && typeof value !== "string") {
            throw new FilterValidationError("condition.value must be a string for op 'prefix'");
        }
        if ((op === "gt" || op === "lt") && typeof value !== "number") {
            throw new FilterValidationError(`condition.value must be a number for op '${op}'`);
        }
    }

    return { match: candidate.match, conditions: candidate.conditions as FilterCondition[] };
}

/** Read a dotted path out of an event. Returns `undefined` when absent. */
export function readPath(event: CloudEvent, path: string): unknown {
    let current: unknown = event;
    for (const segment of path.split(".")) {
        if (current === null || typeof current !== "object") return undefined;
        if (!Object.prototype.hasOwnProperty.call(current, segment)) return undefined;
        current = (current as Record<string, unknown>)[segment];
    }
    return current;
}

function evaluateCondition(event: CloudEvent, condition: FilterCondition): boolean {
    const actual = readPath(event, condition.path);
    switch (condition.op) {
        case "exists":
            return actual !== undefined;
        case "eq":
            return actual === condition.value;
        case "ne":
            return actual !== condition.value;
        case "in":
            return Array.isArray(condition.value) && condition.value.includes(actual);
        case "nin":
            return Array.isArray(condition.value) && !condition.value.includes(actual);
        case "prefix":
            return typeof actual === "string" && typeof condition.value === "string"
                ? actual.startsWith(condition.value)
                : false;
        case "gt":
            return typeof actual === "number" && typeof condition.value === "number"
                ? actual > condition.value
                : false;
        case "lt":
            return typeof actual === "number" && typeof condition.value === "number"
                ? actual < condition.value
                : false;
        default:
            return false;
    }
}

/**
 * Does `event` satisfy `filter`?
 *
 * A subscription with no filter matches everything its `event_types` already
 * selected — the filter narrows, it never widens.
 */
export function eventMatchesFilter(event: CloudEvent, filter: EventFilter | undefined): boolean {
    if (!filter) return true;
    return filter.match === "all"
        ? filter.conditions.every((c) => evaluateCondition(event, c))
        : filter.conditions.some((c) => evaluateCondition(event, c));
}
