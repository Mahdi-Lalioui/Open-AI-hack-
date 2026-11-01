/**
 * PIVOT contract (lead-owned): sketch → structured parts → live 3D creation.
 * Two modes: 'pet' (first priority) and 'circuit'. The café queue is retired from the UI.
 */

export type SketchMode = 'pet' | 'circuit';

// ---------------------------------------------------------------- Pet
export type BodyShape = 'round' | 'oval' | 'bean' | 'blob' | 'tall';
export type EarStyle = 'none' | 'pointy' | 'round' | 'floppy' | 'antenna';
export type TailStyle = 'none' | 'short' | 'long' | 'curly';
export type EyeStyle = 'round' | 'big' | 'sleepy';
export type PetExtra = 'wings' | 'horn' | 'spots' | 'hat' | 'whiskers';

export interface PetSpec {
  name: string; // ≤ 20 chars
  bodyShape: BodyShape;
  bodyColor: string; // #rrggbb
  accentColor: string; // #rrggbb
  eyeCount: 1 | 2 | 3;
  eyeStyle: EyeStyle;
  ears: EarStyle;
  legs: 0 | 2 | 4;
  tail: TailStyle;
  mouth: 'smile' | 'open' | 'none';
  extras: PetExtra[];
}

export const DEFAULT_PET: PetSpec = {
  name: 'Pixel',
  bodyShape: 'round',
  bodyColor: '#1F8A84',
  accentColor: '#E8735A',
  eyeCount: 2,
  eyeStyle: 'big',
  ears: 'pointy',
  legs: 4,
  tail: 'curly',
  mouth: 'smile',
  extras: ['spots'],
};

export type PetActionName = 'eat' | 'play' | 'sleep' | 'dance' | 'wave' | 'idle';
export type InteractionKind = 'feed' | 'pet' | 'play' | 'toggle_switch';

/** Server-simulated needs, 0..100. Deterministic decay per sim second. */
export interface PetState {
  hunger: number; // higher = hungrier
  happiness: number;
  energy: number;
  action: PetActionName;
  actionUntil: number; // wall ms
  counts: Record<'feed' | 'pet' | 'play', number>;
  lastBy: string | null; // last guest nickname
}

// ---------------------------------------------------------------- Circuit
export type ComponentType = 'battery' | 'resistor' | 'led' | 'bulb' | 'switch';

export interface CircuitComponent {
  id: string;
  type: ComponentType;
  label: string;
  /** battery: volts; resistor/bulb: ohms; led: forward volts; switch: null. null = not written → default used. */
  value: number | null;
  x: number; // 0..1
  y: number; // 0..1
}

export interface CircuitSpec {
  components: CircuitComponent[];
  wires: { from: string; to: string }[];
}

/** Result of the real (series DC) calculation. */
export interface CircuitResult {
  valid: boolean;
  closedLoop: boolean;
  switchClosed: boolean;
  currentMa: number;
  ledOn: boolean;
  /** 0..1 brightness for LEDs/bulbs. */
  brightness: number;
  message: string; // e.g. "LED on: 13.6 mA through 220 Ω"
  warnings: string[]; // e.g. "No resistor: LED would burn out"
}

// ---------------------------------------------------------------- Recognition
export interface RecognizedCreation {
  mode: SketchMode;
  inScope: boolean;
  pet: PetSpec | null;
  circuit: CircuitSpec | null;
  uncertainties: string[];
}

export interface CreationConfig {
  mode: SketchMode;
  pet: PetSpec | null;
  circuit: CircuitSpec | null;
  source: 'example' | 'vision' | 'manual';
  version: number; // reveal trigger
}
