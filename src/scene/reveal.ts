/** Reveal timeline + easing helpers (pure). All times in seconds since the reveal started. */

export const REVEAL = {
  total: 1.6,
  inkStart: 0,
  inkEnd: 0.6,
  /** source → service → sink, ~180 ms apart. */
  stationDelay: { source: 0.35, service: 0.53, sink: 0.71 },
  riseDuration: 0.55,
  beanDelay: 1.05,
  beanDuration: 0.55,
  customersDelay: 1.15,
} as const;

/** A time far past the reveal (used for reduced motion / no reveal). */
export const REVEAL_DONE = 1e6;

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function easeOutBack(x: number, overshoot = 1.9): number {
  const c3 = overshoot + 1;
  const p = x - 1;
  return 1 + c3 * p * p * p + overshoot * p * p;
}

export function easeOutCubic(x: number): number {
  const p = 1 - x;
  return 1 - p * p * p;
}

/** Vertical scale for a station rising out of the paper: 0.02 → springy overshoot → 1. */
export function riseScale(t: number, delay: number, duration: number = REVEAL.riseDuration): number {
  const x = clamp01((t - delay) / duration);
  if (x <= 0) return 0.02;
  if (x >= 1) return 1;
  return Math.max(0.02, easeOutBack(x));
}

/** 0..1 progress of a phase. */
export function phase(t: number, start: number, end: number): number {
  return clamp01((t - start) / (end - start));
}

/** Bean's hop-in height offset: falls from above and bounces once. */
export function hopOffset(t: number, delay: number = REVEAL.beanDelay, duration: number = REVEAL.beanDuration): number {
  const x = clamp01((t - delay) / duration);
  if (x >= 1) return 0;
  if (x <= 0) return 1.4;
  if (x < 0.6) {
    const k = x / 0.6;
    return 1.4 * (1 - k * k);
  }
  const k = (x - 0.6) / 0.4;
  return 0.22 * Math.sin(Math.PI * k);
}
