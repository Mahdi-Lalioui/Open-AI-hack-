import { describe, expect, it } from 'vitest';
import { petMood } from '../../src/scene/creation';
import { resistorBands } from '../../src/scene/CircuitBoard';
import { riseScale } from '../../src/scene/reveal';
import type { PetState } from '../../shared/creations';

const pet = (p: Partial<PetState>): PetState => ({ hunger: 30, happiness: 50, energy: 70, action: 'idle', actionUntil: 0, counts: { feed: 0, pet: 0, play: 0 }, lastBy: null, ...p });

describe('scene helpers', () => {
  it('pet mood follows needs', () => {
    expect(petMood(pet({ energy: 10 }))).toBe('sleepy');
    expect(petMood(pet({ hunger: 90 }))).toBe('hungry');
    expect(petMood(pet({ happiness: 10 }))).toBe('sad');
    expect(petMood(pet({ happiness: 90 }))).toBe('happy');
    expect(petMood(null)).toBe('content');
  });
  it('resistor bands encode value', () => {
    expect(resistorBands(220).slice(0, 3)).toEqual(['#D33A2C', '#D33A2C', '#7A4A2A']);
  });
  it('rise reveal starts flat and ends at 1', () => {
    expect(riseScale(0, 0.3)).toBe(0.02);
    expect(riseScale(5, 0.3)).toBe(1);
  });
});
