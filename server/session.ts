/**
 * The one authoritative in-memory live session: world, queue simulation, Bean and API status.
 *
 * - Exactly one interval timer exists while the simulation is running. It is created only by
 *   start() and cleared by pause(), reset(), buildWorld() and dispose(). Client reconnects never
 *   touch timers.
 * - Each tick advances simulated time by (elapsed real ms / 1000) * speed using the injectable
 *   clock. Very long real-time gaps (event-loop stalls, laptop sleep) are capped per tick.
 * - Change notifications are coalesced into one microtask, so a burst of mutations (or one tick)
 *   produces a single broadcast.
 */
import { randomBytes } from 'node:crypto';
import type {
  AddOrderInput,
  AddOrderResult,
  ApiError,
  ApiKind,
  ApiStatusEntry,
  ApiStatusMap,
  Assumptions,
  BeanDecision,
  BeanImageState,
  BeanState,
  BuildWorldInput,
  Order,
  PublicState,
  WorkerAddedBy,
  WorldConfig,
} from '../shared/types';
import { DEFAULT_ASSUMPTIONS, MAX_WORKERS, SIM_SPEEDS } from '../shared/types';
import { addOrderSchema, buildWorldSchema, checkChain } from '../shared/validation';
import type { AddWorkerResult, LiveSessionApi, LiveSessionOptions } from './types';
import * as engine from './sim/engine';
import { AUDIENCE_ORDER_RULES, SlidingWindowRateLimiter, type RateLimitRule } from './rateLimit';

export const STALE_EPOCH_REASON = 'Session was reset; stale action ignored.';
export const WORKER_CAP_REASON = 'Both workers are already on shift.';

/** Max orders (automatic + user) per epoch; further user orders get `queue_full`. */
export const DEFAULT_MAX_ORDERS_PER_EPOCH = 500;
/** How many submitted order ids are remembered across resets for idempotency. */
export const DEFAULT_SEEN_ORDER_IDS = 5000;

/** Thrown by buildWorld() when the input is not a valid world. */
export class WorldValidationError extends Error {
  readonly errors: string[];
  constructor(errors: string[]) {
    super(errors.join(' '));
    this.name = 'WorldValidationError';
    this.errors = errors;
  }
}

export interface LiveSessionExtraOptions {
  maxOrdersPerEpoch?: number;
  seenOrderIds?: number;
  audienceRateRules?: RateLimitRule[];
}

function speedList(): string {
  return SIM_SPEEDS.join(', ');
}

export function isValidSpeed(speed: unknown): speed is (typeof SIM_SPEEDS)[number] {
  return typeof speed === 'number' && (SIM_SPEEDS as readonly number[]).includes(speed);
}

function apiError(code: string, error: string): ApiError {
  return { ok: false, error, code };
}

export class LiveSession implements LiveSessionApi {
  private readonly serverId = randomBytes(8).toString('hex');
  private readonly publicBaseUrl: string | null;
  private readonly tickMs: number;
  private readonly maxTickGapMs: number;
  private readonly now: () => number;
  private readonly maxOrdersPerEpoch: number;
  private readonly seenLimit: number;

  private world: WorldConfig | null = null;
  private sim: engine.SimCore;
  private bean: BeanState = {
    thinking: false,
    aiManagement: false,
    lastDecision: null,
    lastError: null,
    image: { status: 'none' },
  };
  private api: ApiStatusMap;

  private timer: ReturnType<typeof setInterval> | null = null;
  private lastTickWall = 0;
  private listeners = new Set<(state: PublicState) => void>();
  private notifyPending = false;
  private disposed = false;
  /** Order ids seen in any epoch (bounded, oldest evicted first) -> last known copy. */
  private seenOrders = new Map<string, Order>();
  private readonly audienceLimiter: SlidingWindowRateLimiter;

  constructor(opts: LiveSessionOptions & LiveSessionExtraOptions) {
    this.publicBaseUrl = opts.publicBaseUrl;
    this.tickMs = Math.max(10, opts.tickMs ?? 100);
    this.maxTickGapMs = Math.max(1000, this.tickMs * 10);
    const nowFn = opts.now;
    this.now = nowFn ? () => nowFn() : () => Date.now();
    this.maxOrdersPerEpoch = opts.maxOrdersPerEpoch ?? DEFAULT_MAX_ORDERS_PER_EPOCH;
    this.seenLimit = opts.seenOrderIds ?? DEFAULT_SEEN_ORDER_IDS;
    this.api = structuredClone(opts.initialApiStatus);
    this.sim = engine.createSim(DEFAULT_ASSUMPTIONS, engine.DEFAULT_SPEED);
    this.audienceLimiter = new SlidingWindowRateLimiter({
      rules: opts.audienceRateRules ?? AUDIENCE_ORDER_RULES,
      now: this.now,
    });
  }

  // -------------------------------------------------------------------------
  // State + subscriptions
  // -------------------------------------------------------------------------

  getState(): PublicState {
    return {
      serverId: this.serverId,
      world: this.world ? structuredClone(this.world) : null,
      sim: engine.snapshot(this.sim),
      bean: structuredClone(this.bean),
      api: structuredClone(this.api),
      publicBaseUrl: this.publicBaseUrl,
    };
  }

  subscribe(listener: (state: PublicState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    if (this.notifyPending || this.disposed) return;
    this.notifyPending = true;
    queueMicrotask(() => {
      this.notifyPending = false;
      if (this.disposed || this.listeners.size === 0) return;
      const state = this.getState();
      for (const listener of [...this.listeners]) {
        try {
          listener(state);
        } catch (err) {
          console.error('[session] listener failed:', (err as Error)?.message ?? err);
        }
      }
    });
  }

  // -------------------------------------------------------------------------
  // World + clock
  // -------------------------------------------------------------------------

  buildWorld(input: BuildWorldInput): WorldConfig {
    const parsed = buildWorldSchema.safeParse(input);
    if (!parsed.success) {
      throw new WorldValidationError(
        parsed.error.issues.map((i) => `${i.path.length ? `${i.path.join('.')}: ` : ''}${i.message}.`.replace(/\.\.$/, '.')),
      );
    }
    const chain = checkChain(parsed.data.graph);
    if (!chain.ok) throw new WorldValidationError(chain.errors);

    const world: WorldConfig = {
      graph: parsed.data.graph,
      assumptions: parsed.data.assumptions,
      source: parsed.data.source,
      version: (this.world?.version ?? 0) + 1,
      builtAtWall: this.now(),
    };
    this.world = world;
    this.resetInternal(world.assumptions);
    return structuredClone(world);
  }

  start(): void {
    if (this.disposed) return;
    if (this.sim.running && this.timer) return;
    engine.startSim(this.sim);
    this.lastTickWall = this.now();
    if (!this.timer) {
      this.timer = setInterval(() => this.tick(), this.tickMs);
      // Do not keep the process alive just for the simulation clock.
      (this.timer as { unref?: () => void }).unref?.();
    }
    this.notify();
  }

  pause(): void {
    if (this.sim.running) this.advanceClock();
    engine.pauseSim(this.sim);
    this.clearTimer();
    this.notify();
  }

  reset(): void {
    this.resetInternal(this.world?.assumptions ?? DEFAULT_ASSUMPTIONS);
  }

  setSpeed(speed: number): void {
    if (!isValidSpeed(speed)) throw new Error(`Speed must be one of ${speedList()}.`);
    if (this.sim.speed === speed) return;
    // Account for elapsed time at the old speed first.
    if (this.sim.running) this.advanceClock();
    engine.setSimSpeed(this.sim, speed);
    this.notify();
  }

  private resetInternal(assumptions: Assumptions): void {
    this.clearTimer();
    engine.resetSim(this.sim, assumptions);
    this.bean.thinking = false;
    this.notify();
  }

  private clearTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Advances sim time by real elapsed time * speed. Returns true if anything changed. */
  private advanceClock(): boolean {
    const now = this.now();
    let elapsed = now - this.lastTickWall;
    this.lastTickWall = now;
    if (!(elapsed > 0)) return false;
    if (elapsed > this.maxTickGapMs) elapsed = this.maxTickGapMs;
    const targetMs = this.sim.timeMs + elapsed * this.sim.speed;
    return engine.advanceTo(this.sim, targetMs / 1000);
  }

  private tick(): void {
    if (this.disposed || !this.sim.running) {
      this.clearTimer();
      return;
    }
    if (this.advanceClock()) this.notify();
  }

  // -------------------------------------------------------------------------
  // Orders + workers
  // -------------------------------------------------------------------------

  addOrder(input: AddOrderInput, meta: { ip?: string } = {}): AddOrderResult | ApiError {
    const parsed = addOrderSchema.safeParse(input);
    if (!parsed.success) {
      return apiError('invalid_input', parsed.error.issues[0]?.message ?? 'Invalid order.');
    }
    const { id, origin, nickname } = parsed.data;

    // Idempotency first: a retried submission is never rate limited or re-added.
    const current = engine.findOrder(this.sim, id);
    if (current) {
      return this.orderResult(current, true);
    }
    const previous = this.seenOrders.get(id);
    if (previous) {
      // Submitted before a reset: not re-added to the new run. Echo the last known copy.
      return { ok: true, duplicate: true, order: structuredClone(previous), position: 0, metrics: engine.computeMetrics(this.sim) };
    }

    if (this.sim.orders.length >= this.maxOrdersPerEpoch) {
      return apiError('queue_full', 'The queue is full for this run. Wait for a reset.');
    }

    if (origin === 'audience') {
      const rl = this.audienceLimiter.consume(meta.ip || 'unknown');
      if (!rl.ok) {
        const secs = Math.max(1, Math.ceil(rl.retryAfterMs / 1000));
        return apiError('rate_limited', `You're ordering too fast. Try again in ${secs} s.`);
      }
    }

    const { order } = engine.addOrder(this.sim, { id, origin, nickname: origin === 'audience' ? nickname : undefined });
    this.rememberOrder(order);
    this.notify();
    return this.orderResult(order, false);
  }

  private orderResult(order: Order, duplicate: boolean): AddOrderResult {
    return {
      ok: true,
      duplicate,
      order,
      position: engine.waitingPosition(this.sim, order.id),
      metrics: engine.computeMetrics(this.sim),
    };
  }

  private rememberOrder(order: Order): void {
    this.seenOrders.set(order.id, structuredClone(order));
    while (this.seenOrders.size > this.seenLimit) {
      const oldest = this.seenOrders.keys().next().value;
      if (oldest === undefined) break;
      this.seenOrders.delete(oldest);
    }
  }

  addWorker(by: WorkerAddedBy, opts: { expectedEpoch?: number } = {}): AddWorkerResult {
    if (opts.expectedEpoch !== undefined && opts.expectedEpoch !== this.sim.epoch) {
      return { ok: false, reason: STALE_EPOCH_REASON };
    }
    if (this.sim.workers.length >= MAX_WORKERS) return { ok: false, reason: WORKER_CAP_REASON };
    const worker = engine.addWorker(this.sim, by);
    if (!worker) return { ok: false, reason: WORKER_CAP_REASON };
    this.notify();
    return { ok: true, worker };
  }

  // -------------------------------------------------------------------------
  // Bean + API status
  // -------------------------------------------------------------------------

  setAiManagement(enabled: boolean): void {
    this.bean.aiManagement = Boolean(enabled);
    this.notify();
  }

  setBeanThinking(thinking: boolean): void {
    this.bean.thinking = Boolean(thinking);
    this.notify();
  }

  recordBeanDecision(decision: BeanDecision): void {
    this.bean.lastDecision = structuredClone(decision);
    this.notify();
  }

  setBeanError(message: string | null): void {
    this.bean.lastError = message;
    this.notify();
  }

  setBeanImage(image: BeanImageState): void {
    this.bean.image = structuredClone(image);
    this.notify();
  }

  setApiStatus(kind: ApiKind, entry: Partial<ApiStatusEntry>): void {
    const prev = this.api[kind];
    this.api[kind] = { ...prev, ...entry, updatedAt: entry.updatedAt ?? this.now() };
    this.notify();
  }

  dispose(): void {
    this.clearTimer();
    this.disposed = true;
    this.listeners.clear();
  }
}
