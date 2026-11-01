import { describe, expect, it } from 'vitest';
import { DEFAULT_PET } from '../../shared/creations';
import { exampleCircuit } from '../../src/host/examples';
import { parseBlueprint, serializeBlueprint, MAX_BLUEPRINT_BYTES } from '../../src/lib/blueprintFile';

describe('portable creation files', () => {
  it('exports the confirmed pet and imports all its editable parts', () => {
    const pet = { ...DEFAULT_PET, name: 'Mochi / <3', bodyColor: '#EDB7CF', extras: ['wings'] as const };
    const file = serializeBlueprint({ mode: 'pet', pet: { ...pet, extras: [...pet.extras] }, circuit: null, source: 'vision', version: 17 });
    expect(file.filename).toBe('mochi-3.living-paper.json');
    expect(JSON.parse(file.contents)).toMatchObject({ format: 'living-paper/blueprint', version: 1 });
    expect(parseBlueprint(file.contents)).toEqual({ mode: 'pet', pet, source: 'manual' });
    expect(file.contents).not.toContain('"version": 17');
  });

  it('round trips circuit geometry and component values', () => {
    const circuit = exampleCircuit();
    const file = serializeBlueprint({ mode: 'circuit', pet: null, circuit, source: 'example', version: 2 });
    expect(file.filename).toBe('circuit.living-paper.json');
    expect(parseBlueprint(file.contents)).toEqual({ mode: 'circuit', circuit, source: 'manual' });
  });

  it('rejects malformed, unrelated and future-version files', () => {
    expect(() => parseBlueprint('not json')).toThrow(/valid JSON/i);
    expect(() => parseBlueprint('null')).toThrow(/Living Paper/i);
    expect(() => parseBlueprint('{"format":"other","version":1}')).toThrow(/Living Paper/i);
    expect(() => parseBlueprint('{"format":"living-paper/blueprint","version":2}')).toThrow(/version/i);
  });

  it('validates imported specifications and bounds file size', () => {
    const invalid = { format: 'living-paper/blueprint', version: 1, design: { mode: 'pet', pet: { ...DEFAULT_PET, bodyColor: 'javascript:bad' }, source: 'manual' } };
    expect(() => parseBlueprint(JSON.stringify(invalid))).toThrow(/blueprint/i);
    expect(() => parseBlueprint(' '.repeat(MAX_BLUEPRINT_BYTES + 1))).toThrow(/128 KB/i);
    expect(() => serializeBlueprint({ mode: 'pet', pet: null, circuit: null, source: 'manual', version: 1 })).toThrow(/blueprint/i);
  });
});
