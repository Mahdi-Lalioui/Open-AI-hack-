import type { CircuitSpec, PetSpec } from '../creations';
import { DEFAULT_PET } from '../creations';

export const examplePet = (): PetSpec => structuredClone(DEFAULT_PET);

export const PET_STARTERS: { id: string; label: string; note: string; pet: PetSpec }[] = [
  { id: 'pixel', label: 'Pixel', note: 'The curious one', pet: { ...DEFAULT_PET } },
  { id: 'mochi', label: 'Mochi', note: 'A soft little daydream', pet: { ...DEFAULT_PET, name: 'Mochi', bodyShape: 'bean', bodyColor: '#DB9EB6', accentColor: '#FFF0D7', ears: 'floppy', eyeStyle: 'sleepy', legs: 2, tail: 'short', extras: ['whiskers'] } },
  { id: 'orbit', label: 'Orbit', note: 'From another notebook', pet: { ...DEFAULT_PET, name: 'Orbit', bodyShape: 'tall', bodyColor: '#A996D8', accentColor: '#F3D574', ears: 'antenna', eyeCount: 3, legs: 2, tail: 'long', extras: ['wings'] } },
];

export const exampleCircuit = (): CircuitSpec => ({
  components: [
    { id: 'c1', type: 'battery', label: 'Battery', value: 9, x: 0.15, y: 0.5 },
    { id: 'c2', type: 'switch', label: 'Switch', value: null, x: 0.35, y: 0.2 },
    { id: 'c3', type: 'resistor', label: 'Resistor', value: 470, x: 0.6, y: 0.2 },
    { id: 'c4', type: 'led', label: 'LED', value: 2, x: 0.85, y: 0.5 },
  ],
  wires: [
    { from: 'c1', to: 'c2' }, { from: 'c2', to: 'c3' }, { from: 'c3', to: 'c4' }, { from: 'c4', to: 'c1' },
  ],
});
