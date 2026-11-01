/** Pure pet needs simulation. No timers, no I/O; wall time is passed in. */
import type { InteractionKind, PetActionName, PetState } from '../../shared/creations';

export const PET_DECAY_PER_SEC = { hunger: 0.5, energy: -0.3, happiness: -0.2 } as const;

const clamp = (v: number) => Math.min(100, Math.max(0, v));
const round = (v: number) => Math.round(v * 1000) / 1000;

export function createPetState(): PetState {
  return { hunger: 20, happiness: 80, energy: 80, action: 'idle', actionUntil: 0, counts: { feed: 0, pet: 0, play: 0 }, lastBy: null };
}

/** Applies `dtSec` simulated seconds of decay and clears an expired action at `nowWall`. */
export function decayPet(p: PetState, dtSec: number, nowWall?: number): PetState {
  const dt = Math.max(0, dtSec);
  const next: PetState = {
    ...p,
    counts: { ...p.counts },
    hunger: round(clamp(p.hunger + PET_DECAY_PER_SEC.hunger * dt)),
    energy: round(clamp(p.energy + PET_DECAY_PER_SEC.energy * dt)),
    happiness: round(clamp(p.happiness + PET_DECAY_PER_SEC.happiness * dt)),
  };
  if (nowWall !== undefined && next.action !== 'idle' && nowWall >= next.actionUntil) {
    next.action = 'idle';
    next.actionUntil = 0;
  }
  return next;
}

export function setAction(p: PetState, name: PetActionName, durationMs: number, nowWall: number): PetState {
  return { ...p, counts: { ...p.counts }, action: name, actionUntil: name === 'idle' ? 0 : nowWall + Math.max(0, durationMs) };
}

/** Decision effects are app-owned, bounded, and do not count as guest interactions. */
export function applyPetAction(p: PetState, name: PetActionName, durationMs: number, nowWall: number): PetState {
  const next = setAction(p, name, durationMs, nowWall);
  if (name === 'eat') next.hunger = clamp(next.hunger - 25);
  if (name === 'sleep') next.energy = clamp(next.energy + 30);
  if (name === 'play') {
    next.happiness = clamp(next.happiness + 20);
    next.energy = clamp(next.energy - 10);
  }
  if (name === 'dance') {
    next.happiness = clamp(next.happiness + 8);
    next.energy = clamp(next.energy - 5);
  }
  if (name === 'wave') next.happiness = clamp(next.happiness + 5);
  return next;
}

const ACTION_FOR: Record<'feed' | 'pet' | 'play', PetActionName> = { feed: 'eat', pet: 'wave', play: 'play' };
export const INTERACTION_ACTION_MS = 2500;

/** feed: hunger −25; pet: happiness +15; play: happiness +20, energy −10. */
export function applyInteraction(
  p: PetState,
  kind: Exclude<InteractionKind, 'toggle_switch'>,
  by: string | null,
  nowWall: number,
): PetState {
  const n: PetState = { ...p, counts: { ...p.counts } };
  if (kind === 'feed') n.hunger = clamp(n.hunger - 25);
  if (kind === 'pet') n.happiness = clamp(n.happiness + 15);
  if (kind === 'play') {
    n.happiness = clamp(n.happiness + 20);
    n.energy = clamp(n.energy - 10);
  }
  n.counts[kind] += 1;
  if (by) n.lastBy = by;
  return setAction(n, ACTION_FOR[kind], INTERACTION_ACTION_MS, nowWall);
}
