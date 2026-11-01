import { createContext, useContext, type MutableRefObject } from 'react';
import type { StationId } from './types';
import { REVEAL_DONE } from './reveal';

export interface SceneCtxValue {
  reducedMotion: boolean;
  /** Clock time (R3F elapsedTime) when the current reveal started. */
  revealStart: MutableRefObject<number>;
  selected: StationId | null;
  hovered: StationId | null;
  setHovered: (id: StationId | null) => void;
  select: (id: StationId | null) => void;
}

export const SceneCtx = createContext<SceneCtxValue | null>(null);

export function useSceneCtx(): SceneCtxValue {
  const v = useContext(SceneCtx);
  if (!v) throw new Error('SceneCtx missing');
  return v;
}

/** Seconds since the reveal started (huge when motion is reduced). */
export function revealTime(ctx: SceneCtxValue, elapsed: number): number {
  if (ctx.reducedMotion) return REVEAL_DONE;
  return elapsed - ctx.revealStart.current;
}

/** Frame-rate independent exponential smoothing. */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * Math.min(dt, 0.1)));
}
