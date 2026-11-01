import { describe, expect, it } from 'vitest';
import type { Assumptions } from '../../shared/types';
import { DEFAULT_ASSUMPTIONS } from '../../shared/types';
import {
  addOrder,
  addWorker,
  advanceBy,
  advanceTo,
  computeMetrics,
  createSim,
  pauseSim,
  resetSim,
  snapshot,
  startSim,
  waitingPosition,
  type SimCore,
} from '../../server/sim/engine';

const twoWorkers: Assumptions = { ...DEFAULT_ASSUMPTIONS, initialWorkers: 2 };

function started(a: Assumptions = DEFAULT_ASSUMPTIONS): SimCore {
  const sim = createSim(a);
  startSim(sim);
  return sim;
}

function runInSteps(sim: SimCore, step: number, until: number) {
  let t = 0;
  while (t + step < until) {
    advanceBy(sim, step);
    t += step;
  }
  advanceTo(sim, until);
}

function expectInvariant(sim: SimCore) {
  const m = computeMetrics(sim);
  expect(m.submitted).toBe(m.waiting + m.inService + m.completed);
  const snap = snapshot(sim);
  expect(snap.orders.length).toBe(m.submitted);
  expect(snap.orders.filter((o) => o.serviceStartTime === null).length).toBe(m.waiting);
  expect(snap.orders.filter((o) => o.serviceStartTime !== null && o.completionTime === null).length).toBe(m.inService);
  expect(snap.workers.filter((w) => w.busyWith !== null).length).toBe(m.inService);
}

describe('engine: five-minute reference scenarios', () => {
  const oneWorkerExpected = { submitted: 10, completed: 6, waiting: 3, inService: 1, avgWaitSec: 50, workers: 1 };
  const twoWorkerExpected = { submitted: 10, completed: 9, waiting: 0, inService: 1, avgWaitSec: 0, workers: 2 };

  it('1 worker, single jump to t=300', () => {
    const sim = started();
    advanceTo(sim, 300);
    expect(computeMetrics(sim)).toMatchObject({ ...oneWorkerExpected, simTimeSec: 300 });
    expectInvariant(sim);
  });

  it('2 workers from start, single jump to t=300', () => {
    const sim = started(twoWorkers);
    advanceTo(sim, 300);
    expect(computeMetrics(sim)).toMatchObject({ ...twoWorkerExpected, simTimeSec: 300 });
    expectInvariant(sim);
  });

  for (const step of [0.1 * 10, 0.1 * 20, 0.1 * 5, 0.1, 7.3, 0.7, 13.37, 49.999]) {
    it(`1 worker, ticks of ${step}s give the same result`, () => {
      const sim = started();
      runInSteps(sim, step, 300);
      expect(computeMetrics(sim)).toMatchObject({ ...oneWorkerExpected, simTimeSec: 300 });
    });
    it(`2 workers, ticks of ${step}s give the same result`, () => {
      const sim = started(twoWorkers);
      runInSteps(sim, step, 300);
      expect(computeMetrics(sim)).toMatchObject({ ...twoWorkerExpected, simTimeSec: 300 });
    });
  }

  it('accumulated float ticks (t += 0.1 * 10) still hit exact event times', () => {
    const sim = started();
    let t = 0;
    for (let i = 0; i < 300; i++) {
      t += 0.1 * 10;
      advanceTo(sim, t);
    }
    expect(computeMetrics(sim)).toMatchObject(oneWorkerExpected);
    const snap = snapshot(sim);
    // Every event happened at an exact time.
    for (const o of snap.orders) {
      expect(Number.isInteger(o.arrivalTime)).toBe(true);
      if (o.serviceStartTime !== null) expect(Number.isInteger(o.serviceStartTime)).toBe(true);
      if (o.completionTime !== null) expect(Number.isInteger(o.completionTime)).toBe(true);
    }
  });

  it('automatic arrivals stop before autoArrivalUntilSec and use stable ids', () => {
    const sim = started();
    advanceTo(sim, 1000);
    const snap = snapshot(sim);
    expect(snap.orders.map((o) => o.arrivalTime)).toEqual([0, 30, 60, 90, 120, 150, 180, 210, 240, 270]);
    expect(snap.orders[0].id).toBe(`auto-${sim.epoch}-1`);
    expect(snap.orders.every((o) => o.origin === 'automatic')).toBe(true);
    expect(snap.nextAutoArrival).toBeNull();
    expect(snap.metrics.completed).toBe(10);
  });
});

describe('engine: start, pause, reset', () => {
  it('first arrival only happens on start, not on create/reset', () => {
    const sim = createSim();
    expect(sim.orders.length).toBe(0);
    expect(snapshot(sim).nextAutoArrival).toBe(0);
    expect(snapshot(sim).started).toBe(false);
    // Not running: advancing does nothing.
    expect(advanceTo(sim, 100)).toBe(false);
    expect(computeMetrics(sim).submitted).toBe(0);

    startSim(sim);
    const snap = snapshot(sim);
    expect(snap.started).toBe(true);
    expect(snap.running).toBe(true);
    expect(snap.metrics).toMatchObject({ submitted: 1, inService: 1, waiting: 0, simTimeSec: 0 });
    expect(snap.nextAutoArrival).toBe(30);

    resetSim(sim, DEFAULT_ASSUMPTIONS);
    expect(computeMetrics(sim).submitted).toBe(0);
    expect(snapshot(sim).started).toBe(false);
  });

  it('pause stops advancing; resume continues from the same time', () => {
    const sim = started();
    advanceTo(sim, 40);
    pauseSim(sim);
    expect(advanceTo(sim, 200)).toBe(false);
    expect(advanceBy(sim, 50)).toBe(false);
    expect(snapshot(sim).time).toBe(40);
    expect(snapshot(sim).running).toBe(false);
    expect(computeMetrics(sim).submitted).toBe(2);
    startSim(sim);
    advanceTo(sim, 300);
    expect(computeMetrics(sim)).toMatchObject({ submitted: 10, completed: 6, waiting: 3, inService: 1, avgWaitSec: 50 });
  });

  it('reset clears orders, restores initial workers, bumps epoch and keeps speed', () => {
    const sim = createSim(DEFAULT_ASSUMPTIONS, 20);
    startSim(sim);
    addOrder(sim, { id: 'user-order-1', origin: 'audience', nickname: 'Ada' });
    addWorker(sim, 'manual');
    advanceTo(sim, 123);
    const epochBefore = sim.epoch;

    resetSim(sim, DEFAULT_ASSUMPTIONS);
    const snap = snapshot(sim);
    expect(snap).toMatchObject({ time: 0, running: false, started: false, speed: 20, epoch: epochBefore + 1 });
    expect(snap.orders).toEqual([]);
    expect(snap.workers).toEqual([{ id: 1, busyWith: null, addedBy: 'initial', addedAt: 0 }]);
    expect(snap.metrics).toEqual({
      submitted: 0,
      waiting: 0,
      inService: 0,
      completed: 0,
      avgWaitSec: null,
      workers: 1,
      simTimeSec: 0,
    });
    expect(snap.nextAutoArrival).toBe(0);

    // New epoch ids differ from the old epoch.
    startSim(sim);
    expect(snapshot(sim).orders[0].id).toBe(`auto-${epochBefore + 1}-1`);
  });

  it('reset applies new assumptions (2 workers, no automatic arrivals)', () => {
    const sim = started();
    resetSim(sim, { ...DEFAULT_ASSUMPTIONS, initialWorkers: 2, autoArrivalUntilSec: 0 });
    expect(snapshot(sim).workers.map((w) => w.id)).toEqual([1, 2]);
    expect(snapshot(sim).nextAutoArrival).toBeNull();
    startSim(sim);
    advanceTo(sim, 500);
    expect(computeMetrics(sim).submitted).toBe(0);
  });
});

describe('engine: queue discipline', () => {
  const manual: Assumptions = { ...DEFAULT_ASSUMPTIONS, autoArrivalUntilSec: 0 };

  it('serves waiting orders first-in first-out', () => {
    const sim = started(manual);
    for (const id of ['order-aaaa', 'order-bbbb', 'order-cccc', 'order-dddd']) {
      addOrder(sim, { id, origin: 'presenter' });
      advanceBy(sim, 1);
    }
    expect(waitingPosition(sim, 'order-aaaa')).toBe(0);
    expect(waitingPosition(sim, 'order-bbbb')).toBe(1);
    expect(waitingPosition(sim, 'order-dddd')).toBe(3);
    advanceTo(sim, 1000);
    const orders = snapshot(sim).orders;
    const byStart = [...orders].sort((a, b) => (a.serviceStartTime ?? 0) - (b.serviceStartTime ?? 0));
    expect(byStart.map((o) => o.id)).toEqual(['order-aaaa', 'order-bbbb', 'order-cccc', 'order-dddd']);
    expect(orders.map((o) => o.serviceStartTime)).toEqual([0, 50, 100, 150]);
    expect(orders.map((o) => o.completionTime)).toEqual([50, 100, 150, 200]);
  });

  it('completion, arrival and assignment at the same instant: completion first, then arrival, then assignment', () => {
    const sim = started({ ...DEFAULT_ASSUMPTIONS, arrivalIntervalSec: 50, serviceTimeSec: 50, autoArrivalUntilSec: 101 });
    advanceTo(sim, 400);
    const orders = snapshot(sim).orders;
    expect(orders.map((o) => [o.arrivalTime, o.serviceStartTime, o.completionTime])).toEqual([
      [0, 0, 50],
      [50, 50, 100],
      [100, 100, 150],
    ]);
    expect(computeMetrics(sim).avgWaitSec).toBe(0);
  });

  it('same-instant events also line up when ticks straddle the event time', () => {
    const sim = started({ ...DEFAULT_ASSUMPTIONS, arrivalIntervalSec: 50, serviceTimeSec: 50, autoArrivalUntilSec: 101 });
    runInSteps(sim, 3.3, 400);
    expect(snapshot(sim).orders.map((o) => o.serviceStartTime)).toEqual([0, 50, 100]);
  });

  it('a second worker added mid-run immediately takes the oldest waiting order', () => {
    const sim = started();
    advanceTo(sim, 95); // arrivals 0,30,60,90; #1 done at 50, #2 in service 50-100
    expect(computeMetrics(sim)).toMatchObject({ waiting: 2, inService: 1, completed: 1 });
    const w = addWorker(sim, 'ai');
    expect(w).toMatchObject({ id: 2, addedBy: 'ai', addedAt: 95 });
    const snap = snapshot(sim);
    const third = snap.orders[2];
    expect(third).toMatchObject({ arrivalTime: 60, serviceStartTime: 95, workerId: 2 });
    expect(snap.workers[1].busyWith).toBe(third.id);
    expect(computeMetrics(sim)).toMatchObject({ waiting: 1, inService: 2, workers: 2 });
    expectInvariant(sim);
  });

  it('worker cap is two', () => {
    const sim = createSim();
    expect(addWorker(sim, 'manual')).not.toBeNull();
    expect(addWorker(sim, 'manual')).toBeNull();
    expect(snapshot(sim).workers.length).toBe(2);
  });

  it('lowest free worker id is used first', () => {
    const sim = started({ ...manual, initialWorkers: 2 });
    addOrder(sim, { id: 'first-order', origin: 'presenter' });
    expect(snapshot(sim).orders[0].workerId).toBe(1);
    addOrder(sim, { id: 'second-order', origin: 'presenter' });
    expect(snapshot(sim).orders[1].workerId).toBe(2);
    advanceTo(sim, 60);
    addOrder(sim, { id: 'third-order', origin: 'presenter' });
    expect(snapshot(sim).orders[2].workerId).toBe(1);
  });

  it('avgWait is null when nothing completed', () => {
    const sim = started();
    advanceTo(sim, 49);
    expect(computeMetrics(sim)).toMatchObject({ completed: 0, avgWaitSec: null, inService: 1 });
    expect(computeMetrics(createSim()).avgWaitSec).toBeNull();
  });

  it('duplicate ids are ignored within an epoch', () => {
    const sim = started(manual);
    const first = addOrder(sim, { id: 'dup-order-1', origin: 'audience', nickname: 'Kim' });
    expect(first.duplicate).toBe(false);
    advanceBy(sim, 10);
    const again = addOrder(sim, { id: 'dup-order-1', origin: 'audience', nickname: 'Someone else' });
    expect(again.duplicate).toBe(true);
    expect(again.order).toMatchObject({ id: 'dup-order-1', nickname: 'Kim', arrivalTime: 0 });
    expect(computeMetrics(sim).submitted).toBe(1);
  });

  it('orders added before start queue at t=0 and are served on start', () => {
    const sim = createSim();
    const { order } = addOrder(sim, { id: 'early-bird', origin: 'presenter' });
    expect(order).toMatchObject({ arrivalTime: 0, serviceStartTime: 0, workerId: 1 });
    startSim(sim);
    // Automatic arrival at 0 queues behind it.
    expect(computeMetrics(sim)).toMatchObject({ submitted: 2, inService: 1, waiting: 1 });
    expect(snapshot(sim).orders[1].origin).toBe('automatic');
  });

  it('snapshot is a detached copy', () => {
    const sim = started();
    const snap = snapshot(sim);
    snap.orders[0].arrivalTime = 999;
    snap.workers.pop();
    expect(snapshot(sim).orders[0].arrivalTime).toBe(0);
    expect(snapshot(sim).workers.length).toBe(1);
  });
});

describe('engine: conservation over a long deterministic random sequence', () => {
  // Small seeded PRNG (mulberry32) for reproducible pseudo-random actions.
  function rng(seed: number) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  for (const seed of [1, 42, 2024]) {
    it(`submitted = waiting + inService + completed at every step (seed ${seed})`, () => {
      const rand = rng(seed);
      const sim = createSim({ ...DEFAULT_ASSUMPTIONS, arrivalIntervalSec: 20, serviceTimeSec: 35, autoArrivalUntilSec: 900 });
      let n = 0;
      let lastTime = 0;
      for (let step = 0; step < 2000; step++) {
        const r = rand();
        if (r < 0.02) startSim(sim);
        else if (r < 0.03) pauseSim(sim);
        else if (r < 0.033) resetSim(sim, sim.assumptions);
        else if (r < 0.04) addWorker(sim, 'manual');
        else if (r < 0.15) addOrder(sim, { id: `rand-${seed}-${n++}`, origin: 'audience' });
        else if (r < 0.17 && n > 0) addOrder(sim, { id: `rand-${seed}-${Math.floor(rand() * n)}`, origin: 'audience' });
        else advanceBy(sim, rand() * 12);
        expectInvariant(sim);
        const m = computeMetrics(sim);
        if (sim.timeMs !== 0) expect(sim.timeMs).toBeGreaterThanOrEqual(lastTime);
        lastTime = sim.timeMs;
        if (m.avgWaitSec !== null) expect(m.avgWaitSec).toBeGreaterThanOrEqual(0);
        if (m.completed === 0) expect(m.avgWaitSec).toBeNull();
        // Nobody waits while a worker is idle.
        if (m.waiting > 0) expect(m.inService).toBe(m.workers);
      }
    });
  }
});
