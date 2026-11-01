import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AddOrderResult, ApiError, ApiStatusMap, PublicState } from '../../shared/types';
import { exampleBuildInput } from '../../shared/example';
import { LiveSession, STALE_EPOCH_REASON, WORKER_CAP_REASON } from '../../server/session';

const apiStatus: ApiStatusMap = {
  vision: { state: 'not_configured', model: 'v', message: 'No key', updatedAt: 0 },
  decisions: { state: 'not_configured', model: 'd', message: 'No key', updatedAt: 0 },
  image: { state: 'not_configured', model: 'i', message: 'No key', updatedAt: 0 },
};

let session: LiveSession;
let clock = 0;

function make(extra: Partial<ConstructorParameters<typeof LiveSession>[0]> = {}) {
  session = new LiveSession({
    initialApiStatus: apiStatus,
    publicBaseUrl: null,
    tickMs: 100,
    now: () => clock,
    ...extra,
  });
  return session;
}

/** Advances the injected clock and fake timers together. */
function elapse(ms: number, step = 100) {
  for (let done = 0; done < ms; done += step) {
    const d = Math.min(step, ms - done);
    clock += d;
    vi.advanceTimersByTime(d);
  }
}

const flush = () => new Promise<void>((r) => queueMicrotask(r));

function isOk(r: AddOrderResult | ApiError): r is AddOrderResult {
  return r.ok;
}

beforeEach(() => {
  vi.useFakeTimers();
  clock = 1_000_000;
});

afterEach(() => {
  session?.dispose();
  vi.useRealTimers();
});

describe('LiveSession clock', () => {
  it('starts with an empty default stage before any world is built', () => {
    make();
    const s = session.getState();
    expect(s.world).toBeNull();
    expect(s.sim).toMatchObject({ time: 0, running: false, started: false, speed: 10, epoch: 0 });
    expect(s.sim.workers).toHaveLength(1);
    expect(typeof s.serverId).toBe('string');
    expect(s.serverId.length).toBeGreaterThan(5);
  });

  it('start() works before a world is built and the first arrival happens on start', () => {
    make();
    session.start();
    const s = session.getState();
    expect(s.sim.running).toBe(true);
    expect(s.sim.metrics.submitted).toBe(1);
  });

  it('starting twice creates a single timer: time advances at speed, not double', () => {
    make();
    session.start();
    session.start();
    session.start();
    expect(vi.getTimerCount()).toBe(1);
    elapse(1000); // 1 real second at 10x
    expect(session.getState().sim.time).toBe(10);
    elapse(3000);
    expect(session.getState().sim.time).toBe(40);
  });

  it('pause stops the timer and the clock; reset clears it', () => {
    make();
    session.start();
    elapse(500);
    session.pause();
    expect(vi.getTimerCount()).toBe(0);
    const t = session.getState().sim.time;
    expect(t).toBe(5);
    elapse(2000);
    expect(session.getState().sim.time).toBe(t);
    session.start();
    expect(vi.getTimerCount()).toBe(1);
    session.reset();
    expect(vi.getTimerCount()).toBe(0);
    expect(session.getState().sim).toMatchObject({ time: 0, running: false, started: false, epoch: 1 });
  });

  it('pause accounts for time elapsed since the last tick', () => {
    make();
    session.start();
    elapse(100);
    clock += 50; // half a tick passes without the timer firing
    session.pause();
    expect(session.getState().sim.time).toBe(1.5);
  });

  it('speed changes apply from the moment they are set', () => {
    make();
    session.start();
    elapse(1000);
    session.setSpeed(20);
    elapse(1000);
    expect(session.getState().sim).toMatchObject({ time: 30, speed: 20 });
    expect(() => session.setSpeed(3)).toThrow(/Speed must be one of/);
    expect(session.getState().sim.speed).toBe(20);
  });

  it('reproduces the 5-minute single-worker scenario through real ticks', () => {
    make();
    session.setSpeed(20);
    session.start();
    elapse(15_000); // 15 s real at 20x = 300 s sim
    session.pause();
    expect(session.getState().sim.metrics).toMatchObject({
      submitted: 10,
      completed: 6,
      waiting: 3,
      inService: 1,
      avgWaitSec: 50,
      simTimeSec: 300,
    });
  });

  it('caps a huge real-time gap so the sim does not jump', () => {
    make();
    session.start();
    clock += 60 * 60 * 1000; // an hour of laptop sleep
    vi.advanceTimersByTime(100);
    expect(session.getState().sim.time).toBeLessThanOrEqual(10);
  });

  it('dispose clears timers and listeners', async () => {
    make();
    const listener = vi.fn();
    session.subscribe(listener);
    session.start();
    session.dispose();
    expect(vi.getTimerCount()).toBe(0);
    await flush();
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('LiveSession world', () => {
  it('buildWorld stores the world, bumps version and resets the sim', () => {
    make();
    session.start();
    elapse(1000);
    const w1 = session.buildWorld(exampleBuildInput());
    expect(w1).toMatchObject({ version: 1, source: 'example', builtAtWall: clock });
    const s = session.getState();
    expect(s.world?.version).toBe(1);
    expect(s.sim).toMatchObject({ time: 0, running: false, epoch: 1 });
    expect(vi.getTimerCount()).toBe(0);

    const input = exampleBuildInput();
    input.assumptions.initialWorkers = 2;
    const w2 = session.buildWorld(input);
    expect(w2.version).toBe(2);
    expect(session.getState().sim.workers).toHaveLength(2);
    expect(session.getState().sim.epoch).toBe(2);
  });

  it('invalid world throws a readable error and keeps the last confirmed world', () => {
    make();
    session.buildWorld(exampleBuildInput());
    const bad = exampleBuildInput();
    bad.graph.edges = [{ from: 'n1', to: 'n2' }];
    expect(() => session.buildWorld(bad)).toThrow(/Missing arrow Barista → Pickup/);
    const badSchema = exampleBuildInput();
    badSchema.graph.nodes[0].label = '   ';
    expect(() => session.buildWorld(badSchema)).toThrow(/Label is empty/);
    expect(session.getState().world?.version).toBe(1);
    expect(session.getState().sim.epoch).toBe(1);
  });

  it('reset keeps the world and uses its assumptions', () => {
    make();
    const input = exampleBuildInput();
    input.assumptions = { ...input.assumptions, initialWorkers: 2, serviceTimeSec: 40 };
    session.buildWorld(input);
    session.addWorker('manual'); // no-op at cap
    session.reset();
    const s = session.getState();
    expect(s.world?.version).toBe(1);
    expect(s.sim.workers.map((w) => w.addedBy)).toEqual(['initial', 'initial']);
  });
});

describe('LiveSession orders', () => {
  it('adds an order with position and metrics', () => {
    make();
    session.start();
    const r = session.addOrder({ id: 'order-0001', origin: 'audience', nickname: '  Ada <b> ' }, { ip: '1.1.1.1' });
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.duplicate).toBe(false);
    expect(r.order).toMatchObject({ id: 'order-0001', origin: 'audience', nickname: 'Ada b', arrivalTime: 0 });
    // The automatic t=0 arrival is in service, so this one waits first in line.
    expect(r.position).toBe(1);
    expect(r.metrics).toMatchObject({ submitted: 2, waiting: 1, inService: 1 });
  });

  it('rejects invalid input', () => {
    make();
    const r = session.addOrder({ id: 'x', origin: 'audience' });
    expect(r).toMatchObject({ ok: false, code: 'invalid_input' });
    const r2 = session.addOrder({ id: 'valid-id-123', origin: 'automatic' as never });
    expect(r2).toMatchObject({ ok: false, code: 'invalid_input' });
  });

  it('same id is idempotent within an epoch (and not rate limited)', () => {
    make();
    const a = session.addOrder({ id: 'order-same-1', origin: 'audience' }, { ip: '2.2.2.2' });
    const b = session.addOrder({ id: 'order-same-1', origin: 'audience' }, { ip: '2.2.2.2' });
    expect(a).toMatchObject({ ok: true, duplicate: false });
    expect(b).toMatchObject({ ok: true, duplicate: true, order: { id: 'order-same-1' } });
    expect(session.getState().sim.metrics.submitted).toBe(1);
  });

  it('dedupes across resets: a retried submission is not re-added to the new run', () => {
    make();
    session.start();
    elapse(1000);
    const a = session.addOrder({ id: 'order-retry-1', origin: 'presenter' });
    expect(a).toMatchObject({ ok: true, duplicate: false });
    session.reset();
    const b = session.addOrder({ id: 'order-retry-1', origin: 'presenter' });
    expect(b).toMatchObject({ ok: true, duplicate: true, position: 0, order: { id: 'order-retry-1', arrivalTime: 10 } });
    expect(session.getState().sim.orders).toHaveLength(0);
  });

  it('seen ids are bounded', () => {
    make({ seenOrderIds: 3 });
    for (let i = 0; i < 5; i++) session.addOrder({ id: `bounded-${i}xx`, origin: 'presenter' });
    session.reset();
    // Oldest ids were forgotten; they can be submitted again in the new run.
    expect(session.addOrder({ id: 'bounded-0xx', origin: 'presenter' })).toMatchObject({ duplicate: false });
    expect(session.addOrder({ id: 'bounded-4xx', origin: 'presenter' })).toMatchObject({ duplicate: true });
  });

  it('rate limits audience orders per ip (1 per 1.5 s, 12 per minute); presenter is not limited', () => {
    make();
    const ip = '9.9.9.9';
    let n = 0;
    const order = (origin: 'audience' | 'presenter' = 'audience', from = ip) =>
      session.addOrder({ id: `rl-order-${n++}`, origin }, { ip: from });

    expect(order()).toMatchObject({ ok: true });
    const limited = order();
    expect(limited).toMatchObject({ ok: false, code: 'rate_limited' });
    expect((limited as ApiError).error).toMatch(/Try again in \d+ s/);
    // Another ip is unaffected; presenter orders are not limited.
    expect(order('audience', '8.8.8.8')).toMatchObject({ ok: true });
    for (let i = 0; i < 5; i++) expect(order('presenter')).toMatchObject({ ok: true });

    clock += 1500;
    expect(order()).toMatchObject({ ok: true });

    // Per-minute budget: 12 accepted within 60 s.
    let accepted = 2;
    for (let i = 0; i < 20; i++) {
      clock += 1600;
      if (order().ok) accepted++;
    }
    // 2 + 20 attempts spread over ~33.5 s; only 12 fit in one minute.
    expect(accepted).toBe(12);
    clock += 60_000;
    expect(order()).toMatchObject({ ok: true });
  });

  it('caps orders per epoch with queue_full', () => {
    make({ maxOrdersPerEpoch: 3 });
    for (let i = 0; i < 3; i++) expect(session.addOrder({ id: `cap-order-${i}`, origin: 'presenter' })).toMatchObject({ ok: true });
    expect(session.addOrder({ id: 'cap-order-x', origin: 'presenter' })).toMatchObject({ ok: false, code: 'queue_full' });
    session.reset();
    expect(session.addOrder({ id: 'cap-order-y', origin: 'presenter' })).toMatchObject({ ok: true });
  });
});

describe('LiveSession workers', () => {
  it('refuses at cap', () => {
    make();
    const r = session.addWorker('manual');
    expect(r).toMatchObject({ ok: true, worker: { id: 2, addedBy: 'manual' } });
    expect(session.addWorker('manual')).toEqual({ ok: false, reason: WORKER_CAP_REASON });
  });

  it('refuses a stale action from before a reset', () => {
    make();
    const epoch = session.getState().sim.epoch;
    session.reset();
    expect(session.addWorker('ai', { expectedEpoch: epoch })).toEqual({ ok: false, reason: STALE_EPOCH_REASON });
    expect(session.getState().sim.workers).toHaveLength(1);
    const ok = session.addWorker('ai', { expectedEpoch: session.getState().sim.epoch });
    expect(ok).toMatchObject({ ok: true, worker: { addedBy: 'ai' } });
  });

  it('a new worker takes the oldest waiting order', () => {
    make();
    session.start();
    elapse(4000); // t=40: order@0 in service, order@30 waiting
    session.addWorker('manual');
    const s = session.getState().sim;
    expect(s.orders[1]).toMatchObject({ arrivalTime: 30, serviceStartTime: 40, workerId: 2 });
  });
});

describe('LiveSession notifications and state isolation', () => {
  it('coalesces a burst of mutations into one broadcast', async () => {
    make();
    const seen: PublicState[] = [];
    session.subscribe((s) => seen.push(s));
    session.setAiManagement(true);
    session.setBeanThinking(true);
    session.addOrder({ id: 'burst-order-1', origin: 'presenter' });
    session.addWorker('manual');
    session.setApiStatus('vision', { state: 'waiting', message: 'Reading…' });
    expect(seen).toHaveLength(0);
    await flush();
    expect(seen).toHaveLength(1);
    expect(seen[0].bean).toMatchObject({ aiManagement: true, thinking: true });
    expect(seen[0].sim.metrics.submitted).toBe(1);
    expect(seen[0].api.vision).toMatchObject({ state: 'waiting', model: 'v', message: 'Reading…', updatedAt: clock });
  });

  it('broadcasts at most once per tick while running', async () => {
    make();
    const listener = vi.fn();
    session.subscribe(listener);
    session.start();
    await flush();
    listener.mockClear();
    for (let i = 0; i < 5; i++) {
      elapse(100);
      await flush();
    }
    expect(listener).toHaveBeenCalledTimes(5);
  });

  it('unsubscribe stops updates', async () => {
    make();
    const listener = vi.fn();
    const off = session.subscribe(listener);
    off();
    session.setAiManagement(true);
    await flush();
    expect(listener).not.toHaveBeenCalled();
  });

  it('getState returns a fresh copy callers cannot use to mutate internals', () => {
    make();
    session.buildWorld(exampleBuildInput());
    const s = session.getState();
    s.sim.workers.push({ id: 9, busyWith: null, addedBy: 'manual', addedAt: 0 });
    s.world!.graph.nodes[0].label = 'Hacked';
    s.bean.aiManagement = true;
    s.api.vision.state = 'live';
    const fresh = session.getState();
    expect(fresh.sim.workers).toHaveLength(1);
    expect(fresh.world!.graph.nodes[0].label).toBe('Customers');
    expect(fresh.bean.aiManagement).toBe(false);
    expect(fresh.api.vision.state).toBe('not_configured');
  });

  it('reset stops Bean thinking but keeps the last decision (tagged with its epoch)', () => {
    make();
    session.setBeanThinking(true);
    session.recordBeanDecision({
      action: 'call_backup',
      source: 'example',
      explanation: 'Queue is long',
      applied: false,
      notAppliedReason: 'AI management is off',
      simTime: 0,
      wallTime: clock,
      epoch: 0,
    });
    session.setBeanError('Oops');
    session.setBeanImage({ status: 'ready', url: '/api/bean/image.png?v=1' });
    session.reset();
    const bean = session.getState().bean;
    expect(bean.thinking).toBe(false);
    expect(bean.lastDecision?.epoch).toBe(0);
    expect(bean.lastError).toBe('Oops');
    expect(bean.image.status).toBe('ready');
    expect(session.getState().sim.epoch).toBe(1);
  });
});
