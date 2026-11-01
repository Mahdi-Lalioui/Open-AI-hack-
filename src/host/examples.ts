import type { CircuitSpec, PetSpec } from '../../shared/creations';
import { DEFAULT_PET } from '../../shared/creations';

export const examplePet = (): PetSpec => structuredClone(DEFAULT_PET);

export const exampleCircuit = (): CircuitSpec => ({
  components: [
    { id: 'c1', type: 'battery', label: 'Battery', value: 9, x: 0.15, y: 0.5 },
    { id: 'c2', type: 'switch', label: 'Switch', value: null, x: 0.35, y: 0.2 },
    { id: 'c3', type: 'resistor', label: 'Resistor', value: 220, x: 0.6, y: 0.2 },
    { id: 'c4', type: 'led', label: 'LED', value: 2, x: 0.85, y: 0.5 },
  ],
  wires: [
    { from: 'c1', to: 'c2' }, { from: 'c2', to: 'c3' }, { from: 'c3', to: 'c4' }, { from: 'c4', to: 'c1' },
  ],
});
