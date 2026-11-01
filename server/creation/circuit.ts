/** Pure series-DC circuit solver for one loop: battery, resistors, LEDs, bulbs, switches. */
import type { CircuitResult, CircuitSpec, CircuitComponent } from '../../shared/creations';

export const CIRCUIT_DEFAULTS = { batteryV: 9, resistorOhm: 220, ledVf: 2, bulbOhm: 30 } as const;
export const LED_ON_MA = 1;
export const FULL_BRIGHT_MA = 20;
export const LED_MAX_SAFE_MA = 30;

const val = (c: CircuitComponent, d: number) => (typeof c.value === 'number' && Number.isFinite(c.value) && c.value > 0 ? c.value : d);
const r1 = (v: number) => Math.round(v * 10) / 10;

/** True when the wires form exactly one cycle passing through every component. */
export function isSingleLoop(spec: CircuitSpec): boolean {
  const ids = new Set(spec.components.map((c) => c.id));
  if (ids.size < 2 || ids.size !== spec.components.length) return false;
  const adj = new Map<string, string[]>([...ids].map((id) => [id, []]));
  const seenPairs = new Set<string>();
  for (const w of spec.wires) {
    if (!ids.has(w.from) || !ids.has(w.to) || w.from === w.to) return false;
    const key = [w.from, w.to].sort().join('|');
    // Two components joined by two wires is a valid 2-element loop; more duplicates are not.
    if (seenPairs.has(key) && ids.size > 2) return false;
    seenPairs.add(key);
    adj.get(w.from)!.push(w.to);
    adj.get(w.to)!.push(w.from);
  }
  for (const n of adj.values()) if (n.length !== 2) return false;
  // Connected?
  const start = spec.components[0].id;
  const stack = [start];
  const vis = new Set([start]);
  while (stack.length) for (const n of adj.get(stack.pop()!)!) if (!vis.has(n)) (vis.add(n), stack.push(n));
  return vis.size === ids.size;
}

export function solveCircuit(spec: CircuitSpec, switchClosed: boolean): CircuitResult {
  const warnings: string[] = [];
  const of = (t: CircuitComponent['type']) => spec.components.filter((c) => c.type === t);
  const batteries = of('battery'), resistors = of('resistor'), leds = of('led'), bulbs = of('bulb'), switches = of('switch');
  const base = { switchClosed, currentMa: 0, ledOn: false, brightness: 0 };

  if (batteries.length === 0) {
    return { ...base, valid: false, closedLoop: false, message: 'No battery: nothing powers the circuit.', warnings: ['Add a battery.'] };
  }
  const loop = isSingleLoop(spec);
  if (!loop) {
    return { ...base, valid: false, closedLoop: false, message: 'Open circuit: the wires do not form one closed loop through every part.', warnings: ['Open circuit: connect the parts in a single loop.'] };
  }
  const open = switches.length > 0 && !switchClosed;
  if (open) return { ...base, valid: true, closedLoop: false, message: 'Switch is open: no current flows.', warnings };

  const V = batteries.reduce((s, b) => s + val(b, CIRCUIT_DEFAULTS.batteryV), 0);
  const Vf = leds.reduce((s, l) => s + val(l, CIRCUIT_DEFAULTS.ledVf), 0);
  const R = resistors.reduce((s, r) => s + val(r, CIRCUIT_DEFAULTS.resistorOhm), 0) + bulbs.reduce((s, b) => s + val(b, CIRCUIT_DEFAULTS.bulbOhm), 0);

  if (V <= Vf) {
    return { ...base, valid: true, closedLoop: true, message: `Battery ${V} V is below the LED forward voltage ${Vf} V: the LED stays off.`, warnings: ['Not enough voltage to light the LED.'] };
  }
  if (R === 0) {
    warnings.push(leds.length ? 'No resistor: the LED would burn out.' : 'Short circuit: no resistance in the loop.');
    return { ...base, valid: true, closedLoop: true, currentMa: 1000, ledOn: leds.length > 0, brightness: 1, message: 'Short circuit: current is limited only by the battery.', warnings };
  }
  const currentMa = ((V - Vf) / R) * 1000;
  const roundedCurrentMa = r1(currentMa);
  // Finite inputs can still overflow division or decimal rounding. JSON would turn
  // Infinity into null, so reject the calculation before it reaches either client.
  if (!Number.isFinite(roundedCurrentMa)) {
    return {
      ...base,
      valid: false,
      closedLoop: true,
      message: 'Circuit values exceed the supported numerical range. No current is simulated.',
      warnings: ['Use less extreme component values, then rebuild the circuit.'],
    };
  }
  if (leds.length && currentMa > LED_MAX_SAFE_MA) warnings.push(`${roundedCurrentMa} mA is above a typical LED's ${LED_MAX_SAFE_MA} mA: it would burn out.`);
  const ledOn = leds.length > 0 && currentMa > LED_ON_MA;
  const brightness = Math.min(1, Math.max(0, currentMa / FULL_BRIGHT_MA));
  const what = leds.length ? `LED ${ledOn ? 'on' : 'off'}` : bulbs.length ? 'Bulb lit' : 'Current';
  return { valid: true, closedLoop: true, switchClosed, currentMa: roundedCurrentMa, ledOn, brightness, message: `${what}: ${roundedCurrentMa} mA through ${R} Ω`, warnings };
}
