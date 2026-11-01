/** Reads the (optional) creation fields from PublicState without depending on their final placement. */
import type { PublicState } from '../../shared/types';
import type { CircuitResult, CreationConfig, PetState } from '../../shared/creations';

type WithCreation = PublicState & {
  creation?: CreationConfig | null;
  pet?: PetState | null;
  circuit?: { result?: CircuitResult | null; switchClosed?: boolean } | CircuitResult | null;
};

export function getCreation(s: PublicState): CreationConfig | null {
  return (s as WithCreation).creation ?? null;
}

export function getPetState(s: PublicState): PetState | null {
  return (s as WithCreation).pet ?? null;
}

export function getCircuitResult(s: PublicState): CircuitResult | null {
  const c = (s as WithCreation).circuit as unknown;
  if (!c || typeof c !== 'object') return null;
  const o = c as { result?: CircuitResult | null };
  if ('result' in o) return o.result ?? null;
  if ('currentMa' in (c as object)) return c as CircuitResult;
  return null;
}

export type PetMood = 'happy' | 'hungry' | 'sleepy' | 'sad' | 'content';

export function petMood(p: PetState | null): PetMood {
  if (!p) return 'content';
  if (p.energy < 25) return 'sleepy';
  if (p.hunger > 70) return 'hungry';
  if (p.happiness < 30) return 'sad';
  if (p.happiness > 70) return 'happy';
  return 'content';
}
