/** Built-in example creations (no image analysis). */
import type { CircuitSpec, PetSpec } from './creations';
import { DEFAULT_PET } from './creations';

export const EXAMPLE_PET: PetSpec = DEFAULT_PET;

export const EXAMPLE_CIRCUIT: CircuitSpec = {
  components: [
    { id: 'b1', type: 'battery', label: '9V battery', value: 9, x: 0.15, y: 0.5 },
    { id: 's1', type: 'switch', label: 'Switch', value: null, x: 0.5, y: 0.15 },
    { id: 'r1', type: 'resistor', label: '220Ω', value: 220, x: 0.85, y: 0.5 },
    { id: 'l1', type: 'led', label: 'LED', value: 2, x: 0.5, y: 0.85 },
  ],
  wires: [
    { from: 'b1', to: 's1' },
    { from: 's1', to: 'r1' },
    { from: 'r1', to: 'l1' },
    { from: 'l1', to: 'b1' },
  ],
};
