/**
 * Pure, deterministic FIFO queue engine for one service step (source -> service -> sink).
 *
 * - No timers, no I/O, no wall clock. The caller drives time with `advanceTo` / `advanceBy`.
 * - Time is kept internally as integer milliseconds so that many small (or odd-sized)
 *   floating-point ticks land on exactly the same event times as one big jump.
 *   Public snapshots expose seconds.
 * - At each event time the order of work is always:
 *     1. finish services that complete at that time,
 *     2. process automatic arrivals at that time,
 *     3. assign the oldest waiting orders (FIFO) to free workers (lowest worker id first).
 * - The SimCore object is mutable; every exported function mutates it in place.
 */
import type {
  Assumptions,
  Metrics,
  Order,
  OrderOrigin,
  SimSnapshot,
  Worker,
  WorkerAddedBy,
} from '../../shared/types';
import { DEFAULT_ASSUMPTIONS, MAX_WORKERS } from '../../shared/types';

export const DEFAULT_SPEED = 10;

interface OrderCore {
  id: string;
  origin: OrderOrigin;
  nickname?: string;
  arrivalMs: number;
  serviceStartMs: number | null;
  completionMs: number | null;
  workerId: number | null;
}

interface WorkerCore {
  id: number;
  busyWith: OrderCore | null;
  /** Completion time of the order in service, or null when idle. */
  busyUntilMs: number | null;
  addedBy: WorkerAddedBy;
  addedAtMs: number;
}

export interface SimCore {
  assumptions: Assumptions;
  /** Current simulated time in integer milliseconds. */
  timeMs: number;
  running: boolean;
  started: boolean;
  epoch: number;
  /** Simulated seconds per real second. Stored here so snapshots are complete; the engine never uses it. */
  speed: number;
  workers: WorkerCore[];
  /** All orders of this epoch in arrival order. */
  orders: OrderCore[];
  byId: Map<string, OrderCore>;
  /** FIFO of orders waiting for a worker. */
  waiting: OrderCore[];
  /** Next automatic arrival (ms) or null when no more are scheduled. */
  nextAutoMs: number | null;
  autoCount: number;
  completedCount: number;
  /** Sum of (serviceStart - arrival) over completed orders, in ms. */
  completedWaitMs: number;
}

export interface AddOrderSpec {
  id: string;
  origin: OrderOrigin;
  nickname?: string;
}

export interface AddOrderOutcome {
  order: Order;
  duplicate: boolean;
}

/** Converts seconds to integer milliseconds (removes float drift such as 0.1 * 10 = 1.0000000000000002). */
export function toMs(sec: number): number {
  return Math.round(sec * 1000);
}

function firstAutoArrival(a: Assumptions): number | null {
  return toMs(a.autoArrivalUntilSec) > 0 ? 0 : null;
}

function initialWorkers(a: Assumptions): WorkerCore[] {
  const n = Math.max(1, Math.min(MAX_WORKERS, a.initialWorkers));
  const workers: WorkerCore[] = [];
  for (let i = 1; i <= n; i++) {
    workers.push({ id: i, busyWith: null, busyUntilMs: null, addedBy: 'initial', addedAtMs: 0 });
  }
  return workers;
}

/** Creates a fresh, not-yet-started simulation at t=0, epoch 0. */
export function createSim(assumptions: Assumptions = DEFAULT_ASSUMPTIONS, speed: number = DEFAULT_SPEED): SimCore {
  return {
    assumptions: { ...assumptions },
    timeMs: 0,
    running: false,
    started: false,
    epoch: 0,
    speed,
    workers: initialWorkers(assumptions),
    orders: [],
    byId: new Map(),
    waiting: [],
    nextAutoMs: firstAutoArrival(assumptions),
    autoCount: 0,
    completedCount: 0,
    completedWaitMs: 0,
  };
}

/**
 * Back to t=0 with the given assumptions: stopped, not started, no orders, initial workers,
 * epoch + 1. Speed is kept.
 */
export function resetSim(sim: SimCore, assumptions: Assumptions = sim.assumptions): void {
  sim.assumptions = { ...assumptions };
  sim.timeMs = 0;
  sim.running = false;
  sim.started = false;
  sim.epoch += 1;
  sim.workers = initialWorkers(assumptions);
  sim.orders = [];
  sim.byId = new Map();
  sim.waiting = [];
  sim.nextAutoMs = firstAutoArrival(assumptions);
  sim.autoCount = 0;
  sim.completedCount = 0;
  sim.completedWaitMs = 0;
}

/** Assigns oldest waiting orders to idle workers, lowest worker id first. */
function assign(sim: SimCore): void {
  if (sim.waiting.length === 0) return;
  const free = sim.workers.filter((w) => w.busyWith === null).sort((a, b) => a.id - b.id);
  const serviceMs = toMs(sim.assumptions.serviceTimeSec);
  for (const w of free) {
    const order = sim.waiting.shift();
    if (!order) break;
    order.serviceStartMs = sim.timeMs;
    order.workerId = w.id;
    w.busyWith = order;
    w.busyUntilMs = sim.timeMs + serviceMs;
  }
}

function pushOrder(sim: SimCore, spec: AddOrderSpec, arrivalMs: number): OrderCore {
  const order: OrderCore = {
    id: spec.id,
    origin: spec.origin,
    arrivalMs,
    serviceStartMs: null,
    completionMs: null,
    workerId: null,
  };
  if (spec.nickname) order.nickname = spec.nickname;
  sim.orders.push(order);
  sim.byId.set(order.id, order);
  sim.waiting.push(order);
  return order;
}

/** Earliest pending event time (completion or automatic arrival), or null when nothing is scheduled. */
function nextEventMs(sim: SimCore): number | null {
  let t: number | null = sim.nextAutoMs;
  for (const w of sim.workers) {
    if (w.busyUntilMs !== null && (t === null || w.busyUntilMs < t)) t = w.busyUntilMs;
  }
  return t;
}

/** Processes every event with time <= limitMs, in time order. Does not move time past the last event. */
function processEventsUpTo(sim: SimCore, limitMs: number): boolean {
  let changed = false;
  for (;;) {
    const t = nextEventMs(sim);
    if (t === null || t > limitMs) break;
    if (t > sim.timeMs) sim.timeMs = t;
    changed = true;

    // 1. Finish services completing at t.
    for (const w of sim.workers) {
      if (w.busyWith && w.busyUntilMs !== null && w.busyUntilMs <= t) {
        const order = w.busyWith;
        order.completionMs = w.busyUntilMs;
        sim.completedCount += 1;
        sim.completedWaitMs += (order.serviceStartMs ?? order.arrivalMs) - order.arrivalMs;
        w.busyWith = null;
        w.busyUntilMs = null;
      }
    }

    // 2. Automatic arrivals at t.
    while (sim.nextAutoMs !== null && sim.nextAutoMs <= t) {
      const at = sim.nextAutoMs;
      pushOrder(sim, { id: `auto-${sim.epoch}-${sim.autoCount + 1}`, origin: 'automatic' }, at);
      sim.autoCount += 1;
      const next = at + toMs(sim.assumptions.arrivalIntervalSec);
      sim.nextAutoMs = next < toMs(sim.assumptions.autoArrivalUntilSec) ? next : null;
    }

    // 3. Assign oldest waiting orders to free workers.
    assign(sim);
  }
  return changed;
}

/**
 * Starts (or resumes) the clock. On the first start of an epoch it also processes events at the
 * current time, so the arrival at t=0 happens on Start rather than on reset.
 */
export function startSim(sim: SimCore): void {
  sim.running = true;
  sim.started = true;
  processEventsUpTo(sim, sim.timeMs);
}

export function pauseSim(sim: SimCore): void {
  sim.running = false;
}

/**
 * Moves simulated time forward to `targetSec`, processing every event with time <= target.
 * No-op while paused / not started, or when the target is not in the future.
 * Returns true if the time or any state changed.
 */
export function advanceTo(sim: SimCore, targetSec: number): boolean {
  if (!sim.running) return false;
  const target = toMs(targetSec);
  if (!(target > sim.timeMs)) return false;
  processEventsUpTo(sim, target);
  sim.timeMs = target;
  return true;
}

/** Convenience: advance by a delta in simulated seconds (rounded to whole milliseconds). */
export function advanceBy(sim: SimCore, deltaSec: number): boolean {
  return advanceTo(sim, sim.timeMs / 1000 + deltaSec);
}

export function setSimSpeed(sim: SimCore, speed: number): void {
  sim.speed = speed;
}

/**
 * Adds a user order arriving now. It is assigned immediately if a worker is free.
 * A duplicate id (within this epoch) returns the existing order with duplicate=true.
 */
export function addOrder(sim: SimCore, spec: AddOrderSpec): AddOrderOutcome {
  const existing = sim.byId.get(spec.id);
  if (existing) return { order: toOrder(existing), duplicate: true };
  const order = pushOrder(sim, spec, sim.timeMs);
  assign(sim);
  return { order: toOrder(order), duplicate: false };
}

/** Adds one worker (cap MAX_WORKERS). The new worker immediately takes the oldest waiting order. */
export function addWorker(sim: SimCore, by: WorkerAddedBy): Worker | null {
  if (sim.workers.length >= MAX_WORKERS) return null;
  const id = sim.workers.reduce((m, w) => Math.max(m, w.id), 0) + 1;
  const worker: WorkerCore = { id, busyWith: null, busyUntilMs: null, addedBy: by, addedAtMs: sim.timeMs };
  sim.workers.push(worker);
  assign(sim);
  return toWorker(worker);
}

export function findOrder(sim: SimCore, id: string): Order | null {
  const o = sim.byId.get(id);
  return o ? toOrder(o) : null;
}

/** 1-based position among waiting orders, or 0 if the order is in service, completed, or unknown. */
export function waitingPosition(sim: SimCore, id: string): number {
  const idx = sim.waiting.findIndex((o) => o.id === id);
  return idx === -1 ? 0 : idx + 1;
}

export function computeMetrics(sim: SimCore): Metrics {
  const inService = sim.workers.reduce((n, w) => n + (w.busyWith ? 1 : 0), 0);
  return {
    submitted: sim.orders.length,
    waiting: sim.waiting.length,
    inService,
    completed: sim.completedCount,
    avgWaitSec: sim.completedCount > 0 ? sim.completedWaitMs / sim.completedCount / 1000 : null,
    workers: sim.workers.length,
    simTimeSec: sim.timeMs / 1000,
  };
}

function toOrder(o: OrderCore): Order {
  const out: Order = {
    id: o.id,
    origin: o.origin,
    arrivalTime: o.arrivalMs / 1000,
    serviceStartTime: o.serviceStartMs === null ? null : o.serviceStartMs / 1000,
    completionTime: o.completionMs === null ? null : o.completionMs / 1000,
    workerId: o.workerId,
  };
  if (o.nickname) out.nickname = o.nickname;
  return out;
}

function toWorker(w: WorkerCore): Worker {
  return { id: w.id, busyWith: w.busyWith ? w.busyWith.id : null, addedBy: w.addedBy, addedAt: w.addedAtMs / 1000 };
}

/** A fresh, plain (JSON-safe) copy of the simulation state. */
export function snapshot(sim: SimCore): SimSnapshot {
  return {
    time: sim.timeMs / 1000,
    running: sim.running,
    speed: sim.speed,
    epoch: sim.epoch,
    workers: sim.workers.map(toWorker),
    orders: sim.orders.map(toOrder),
    metrics: computeMetrics(sim),
    nextAutoArrival: sim.nextAutoMs === null ? null : sim.nextAutoMs / 1000,
    started: sim.started,
  };
}
