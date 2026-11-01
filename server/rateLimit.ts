/**
 * Small in-memory sliding-window rate limiter keyed by a string (e.g. client IP).
 * Several rules can be combined, e.g. "1 per 1.5 s" and "12 per minute".
 */

export interface RateLimitRule {
  windowMs: number;
  max: number;
}

export type RateLimitResult = { ok: true } | { ok: false; retryAfterMs: number };

export interface RateLimiterOptions {
  rules: RateLimitRule[];
  now?: () => number;
  /** Upper bound on tracked keys; stale keys are dropped first. Default 10000. */
  maxKeys?: number;
}

export const AUDIENCE_ORDER_RULES: RateLimitRule[] = [
  { windowMs: 1500, max: 1 },
  { windowMs: 60_000, max: 12 },
];

/** Broad ceiling shared by guest browsers behind one NAT; individual limits still apply. */
export const AUDIENCE_IP_RULES: RateLimitRule[] = [
  { windowMs: 10_000, max: 60 },
  { windowMs: 60_000, max: 300 },
];

export class SlidingWindowRateLimiter {
  private readonly rules: RateLimitRule[];
  private readonly now: () => number;
  private readonly maxKeys: number;
  private readonly longestWindowMs: number;
  private readonly hits = new Map<string, number[]>();

  constructor(opts: RateLimiterOptions) {
    this.rules = opts.rules.filter((r) => r.max > 0 && r.windowMs > 0);
    this.now = opts.now ?? (() => Date.now());
    this.maxKeys = opts.maxKeys ?? 10_000;
    this.longestWindowMs = this.rules.reduce((m, r) => Math.max(m, r.windowMs), 0);
  }

  /** Checks without recording. */
  check(key: string): RateLimitResult {
    return this.evaluate(key, this.now());
  }

  /** Checks and, when allowed, records one hit. */
  consume(key: string): RateLimitResult {
    const now = this.now();
    const result = this.evaluate(key, now);
    if (!result.ok) return result;
    const list = this.hits.get(key) ?? [];
    list.push(now);
    // Re-insert so the Map's insertion order approximates recency for eviction.
    this.hits.delete(key);
    this.hits.set(key, list);
    this.evictIfNeeded(now);
    return result;
  }

  clear(): void {
    this.hits.clear();
  }

  get size(): number {
    return this.hits.size;
  }

  private evaluate(key: string, now: number): RateLimitResult {
    const list = this.hits.get(key);
    if (!list || list.length === 0) return { ok: true };
    // Drop hits outside the longest window.
    const cutoff = now - this.longestWindowMs;
    let drop = 0;
    while (drop < list.length && list[drop] <= cutoff) drop++;
    if (drop) list.splice(0, drop);
    if (list.length === 0) {
      this.hits.delete(key);
      return { ok: true };
    }
    let retryAfterMs = 0;
    for (const rule of this.rules) {
      const inWindow = list.filter((t) => t > now - rule.windowMs);
      if (inWindow.length >= rule.max) {
        // The hit that must expire before one more is allowed.
        const blocker = inWindow[inWindow.length - rule.max];
        retryAfterMs = Math.max(retryAfterMs, blocker + rule.windowMs - now);
      }
    }
    return retryAfterMs > 0 ? { ok: false, retryAfterMs } : { ok: true };
  }

  private evictIfNeeded(now: number): void {
    if (this.hits.size <= this.maxKeys) return;
    const cutoff = now - this.longestWindowMs;
    for (const [k, list] of this.hits) {
      if (list.length === 0 || list[list.length - 1] <= cutoff) this.hits.delete(k);
    }
    // Still too many: drop least recently used keys.
    while (this.hits.size > this.maxKeys) {
      const oldest = this.hits.keys().next().value;
      if (oldest === undefined) break;
      this.hits.delete(oldest);
    }
  }
}
