import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyInteraction, createPetState, decayPet, setAction } from '../../server/creation/petSim';
import { isSingleLoop, solveCircuit } from '../../server/creation/circuit';
import { EXAMPLE_CIRCUIT, EXAMPLE_PET } from '../../shared/creationExamples';
import type { CircuitSpec } from '../../shared/creations';
import { LiveSession } from '../../server/session';

describe('petSim', () => {
  it('decays per second and clamps', () => {
    const p = decayPet({ ...createPetState(), hunger: 20, energy: 80, happiness: 80 }, 10);
    expect(p).toMatchObject({ hunger: 25, energy: 77, happiness: 78 });
    const q = decayPet(p, 10_000);
    expect(q).toMatchObject({ hunger: 100, energy: 0, happiness: 0 });
  });
  it('many small ticks equal one jump', () => {
    let p = createPetState();
    for (let i = 0; i < 100; i++) p = decayPet(p, 0.1);
    expect(p.hunger).toBeCloseTo(decayPet(createPetState(), 10).hunger, 2);
  });
  it('interactions', () => {
    const base = { ...createPetState(), hunger: 50, happiness: 50, energy: 50 };
    expect(applyInteraction(base, 'feed', 'Ann', 0)).toMatchObject({ hunger: 25, action: 'eat', lastBy: 'Ann', counts: { feed: 1 } });
    expect(applyInteraction(base, 'pet', null, 0).happiness).toBe(65);
    expect(applyInteraction(base, 'play', null, 0)).toMatchObject({ happiness: 70, energy: 40, action: 'play' });
    expect(applyInteraction({ ...base, hunger: 10 }, 'feed', null, 0).hunger).toBe(0);
    expect(base.counts.feed).toBe(0);
  });
  it('actions expire', () => {
    const p = setAction(createPetState(), 'dance', 1000, 5000);
    expect(p).toMatchObject({ action: 'dance', actionUntil: 6000 });
    expect(decayPet(p, 0.1, 5500).action).toBe('dance');
    expect(decayPet(p, 0.1, 6000).action).toBe('idle');
  });
});

describe('circuit', () => {
  it('example: 9V, 220Ω, LED → 31.8 mA when closed', () => {
    const r = solveCircuit(EXAMPLE_CIRCUIT, true);
    expect(r).toMatchObject({ valid: true, closedLoop: true, currentMa: 31.8, ledOn: true, brightness: 1 });
    expect(r.message).toMatch(/31\.8 mA through 220 Ω/);
    expect(r.warnings.join(' ')).toMatch(/burn out/);
  });
  it('switch open → no current', () => {
    expect(solveCircuit(EXAMPLE_CIRCUIT, false)).toMatchObject({ closedLoop: false, currentMa: 0, ledOn: false });
  });
  it('defaults when values are missing; dim LED with big resistor', () => {
    const spec: CircuitSpec = structuredClone(EXAMPLE_CIRCUIT);
    for (const c of spec.components) c.value = null;
    expect(solveCircuit(spec, true).currentMa).toBe(31.8);
    spec.components.find((c) => c.type === 'resistor')!.value = 1000;
    const r = solveCircuit(spec, true);
    expect(r.currentMa).toBe(7);
    expect(r.brightness).toBeCloseTo(0.35);
    spec.components.find((c) => c.type === 'resistor')!.value = 10_000;
    expect(solveCircuit(spec, true)).toMatchObject({ currentMa: 0.7, ledOn: false });
  });
  it('no resistor with LED would burn out', () => {
    const spec: CircuitSpec = {
      components: EXAMPLE_CIRCUIT.components.filter((c) => c.type !== 'resistor'),
      wires: [{ from: 'b1', to: 's1' }, { from: 's1', to: 'l1' }, { from: 'l1', to: 'b1' }],
    };
    const r = solveCircuit(spec, true);
    expect(r.warnings.join(' ')).toMatch(/No resistor: the LED would burn out/);
  });
  it('open loop detected', () => {
    const spec = structuredClone(EXAMPLE_CIRCUIT);
    spec.wires.pop();
    expect(isSingleLoop(spec)).toBe(false);
    expect(solveCircuit(spec, true)).toMatchObject({ valid: false, closedLoop: false, currentMa: 0 });
    const branched = structuredClone(EXAMPLE_CIRCUIT);
    branched.wires.push({ from: 'b1', to: 'r1' });
    expect(isSingleLoop(branched)).toBe(false);
    expect(isSingleLoop(EXAMPLE_CIRCUIT)).toBe(true);
  });
  it('bulb circuit', () => {
    const spec: CircuitSpec = {
      components: [
        { id: 'b', type: 'battery', label: 'B', value: 6, x: 0, y: 0 },
        { id: 'u', type: 'bulb', label: 'U', value: null, x: 1, y: 1 },
      ],
      wires: [{ from: 'b', to: 'u' }, { from: 'u', to: 'b' }],
    };
    expect(solveCircuit(spec, true)).toMatchObject({ currentMa: 200, brightness: 1 });
  });
});

describe('LiveSession creations', () => {
  let s: LiveSession;
  let clock = 1_000_000;
  const api = { state: 'not_configured' as const, model: 'x', message: '', updatedAt: 0 };
  beforeEach(() => {
    vi.useFakeTimers();
    s = new LiveSession({ initialApiStatus: { vision: api, decisions: api, image: api }, publicBaseUrl: null, now: () => clock });
  });
  afterEach(() => {
    s.dispose();
    vi.useRealTimers();
  });
  const elapse = (ms: number) => {
    for (let d = 0; d < ms; d += 100) {
      clock += 100;
      vi.advanceTimersByTime(100);
    }
  };

  it('building a pet starts one timer and decays needs', () => {
    s.buildCreation({ mode: 'pet', pet: EXAMPLE_PET, source: 'example' });
    expect(vi.getTimerCount()).toBe(1);
    s.start();
    s.pause(); // pause of the queue keeps the pet alive
    expect(vi.getTimerCount()).toBe(1);
    const h0 = s.getState().pet!.hunger;
    elapse(10_000);
    expect(s.getState().pet!.hunger).toBeCloseTo(h0 + 5, 5);
    expect(s.getState().creation).toMatchObject({ mode: 'pet', version: 1 });
  });

  it('interactions: dedupe, rate limit, wrong mode, toggle switch', () => {
    expect(s.interact({ id: 'inter-0001', kind: 'feed' })).toMatchObject({ code: 'no_creation' });
    s.buildCreation({ mode: 'pet', pet: EXAMPLE_PET, source: 'example' });
    const a = s.interact({ id: 'inter-0001', kind: 'feed', nickname: 'Zoe' }, { ip: '1' });
    expect(a).toMatchObject({ ok: true, duplicate: false, pet: { lastBy: 'Zoe', action: 'eat' } });
    expect(s.interact({ id: 'inter-0001', kind: 'feed' }, { ip: '1' })).toMatchObject({ ok: true, duplicate: true });
    expect(s.interact({ id: 'inter-0002', kind: 'pet' }, { ip: '1' })).toMatchObject({ code: 'rate_limited' });
    expect(s.interact({ id: 'inter-0003', kind: 'toggle_switch' }, { ip: '2' })).toMatchObject({ code: 'wrong_mode' });

    s.buildCreation({ mode: 'circuit', circuit: EXAMPLE_CIRCUIT, source: 'example' });
    expect(vi.getTimerCount()).toBe(0);
    expect(s.getState().circuit).toMatchObject({ switchClosed: false, result: { ledOn: false } });
    expect(s.interact({ id: 'inter-0004', kind: 'toggle_switch' }, { ip: '3' })).toMatchObject({
      circuit: { switchClosed: true, result: { currentMa: 31.8, ledOn: true } },
    });
    expect(s.getState().creation!.version).toBe(2);
  });

  it('invalid creation throws and keeps previous', () => {
    s.buildCreation({ mode: 'pet', pet: EXAMPLE_PET, source: 'example' });
    expect(() => s.buildCreation({ mode: 'pet', pet: { ...EXAMPLE_PET, bodyColor: 'red' }, source: 'example' })).toThrow(/#rrggbb/);
    expect(s.getState().creation!.version).toBe(1);
  });

  it('setPetAction', () => {
    s.setPetAction('dance', 'Bean');
    expect(s.getState().pet).toMatchObject({ action: 'dance', lastBy: 'Bean', actionUntil: clock + 3000 });
  });
});
