/**
 * Sketch → creation (pet or circuit) with the Responses API + Structured Outputs (strict json_schema).
 * Same verified request shape as vision.ts (input_image base64 data URL, text.format json_schema strict).
 */
import { z } from 'zod';
import type { CircuitSpec, PetSpec, RecognizedCreation, SketchMode } from '../../shared/creations';
import { invalidOutputError } from './errors';
import type { ImageMime } from './vision';
import { extractOutputText } from './vision';

const BODY = ['round', 'oval', 'bean', 'blob', 'tall'] as const;
const EARS = ['none', 'pointy', 'round', 'floppy', 'antenna'] as const;
const TAIL = ['none', 'short', 'long', 'curly'] as const;
const EYES = ['round', 'big', 'sleepy'] as const;
const EXTRAS = ['wings', 'horn', 'spots', 'hat', 'whiskers'] as const;
const MOUTH = ['smile', 'open', 'none'] as const;
const COMPONENTS = ['battery', 'resistor', 'led', 'bulb', 'switch'] as const;
const HEX = '^#[0-9A-Fa-f]{6}$';

const obj = (properties: Record<string, unknown>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

export const PET_JSON_SCHEMA = obj({
  inScope: { type: 'boolean', description: 'True if the drawing is a creature/pet.' },
  pet: obj({
    name: { type: 'string', description: 'Name written on the drawing, else a short cute name (max 20 chars).' },
    bodyShape: { type: 'string', enum: BODY },
    bodyColor: { type: 'string', pattern: HEX, description: '#rrggbb' },
    accentColor: { type: 'string', pattern: HEX, description: '#rrggbb' },
    eyeCount: { type: 'integer', enum: [1, 2, 3] },
    eyeStyle: { type: 'string', enum: EYES },
    ears: { type: 'string', enum: EARS },
    legs: { type: 'integer', enum: [0, 2, 4] },
    tail: { type: 'string', enum: TAIL },
    mouth: { type: 'string', enum: MOUTH },
    extras: { type: 'array', items: { type: 'string', enum: EXTRAS } },
  }),
  uncertainties: { type: 'array', items: { type: 'string' } },
});

export const CIRCUIT_JSON_SCHEMA = obj({
  inScope: { type: 'boolean', description: 'True if the drawing is a simple circuit of the supported parts.' },
  circuit: obj({
    components: {
      type: 'array',
      items: obj({
        id: { type: 'string' },
        type: { type: 'string', enum: COMPONENTS },
        label: { type: 'string' },
        value: { type: ['number', 'null'], description: 'Only if clearly written (V for battery, ohms for resistor/bulb, forward V for LED); else null.' },
        x: { type: 'number', minimum: 0, maximum: 1 },
        y: { type: 'number', minimum: 0, maximum: 1 },
      }),
    },
    wires: { type: 'array', items: obj({ from: { type: 'string' }, to: { type: 'string' } }) },
  }),
  uncertainties: { type: 'array', items: { type: 'string' } },
});

export const PET_INSTRUCTIONS = [
  'You read a photo of a hand-drawn creature/pet and describe its parts for a 3D toy builder.',
  'Pick the closest enum value for each part. Colors: use the colors drawn (#rrggbb); if drawn in plain ink, pick friendly colors and say so in uncertainties.',
  'Use a name only if written; otherwise invent a short cute name and note it in uncertainties.',
  'Set inScope false if the picture is not a creature. List anything unclear in uncertainties.',
].join('\n');

export const CIRCUIT_INSTRUCTIONS = [
  'You read a photo of a hand-drawn electric circuit using only: battery, resistor, led, bulb, switch.',
  'Return each component with a short id (c1, c2…), its label as written (max 32 chars), centre position normalised 0..1, and wires between component ids.',
  'value must be null unless a number is clearly written next to that part (convert kΩ to ohms). Never invent values.',
  'Set inScope false if it is not such a circuit. List anything unclear in uncertainties.',
].join('\n');

export function buildCreationRequest(model: string, image: Buffer, mime: ImageMime, mode: SketchMode) {
  return {
    model,
    instructions: mode === 'pet' ? PET_INSTRUCTIONS : CIRCUIT_INSTRUCTIONS,
    input: [
      {
        role: 'user',
        content: [
          { type: 'input_text', text: `Read this ${mode} sketch and return JSON.` },
          { type: 'input_image', image_url: `data:${mime};base64,${image.toString('base64')}`, detail: 'high' },
        ],
      },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: mode === 'pet' ? 'pet_reading' : 'circuit_reading',
        strict: true,
        schema: mode === 'pet' ? PET_JSON_SCHEMA : CIRCUIT_JSON_SCHEMA,
      },
    },
    store: false,
    max_output_tokens: 6000,
  };
}

const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
export const petSpecSchema = z.object({
  name: z.string().trim().min(1).max(20),
  bodyShape: z.enum(BODY),
  bodyColor: hex,
  accentColor: hex,
  eyeCount: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  eyeStyle: z.enum(EYES),
  ears: z.enum(EARS),
  legs: z.union([z.literal(0), z.literal(2), z.literal(4)]),
  tail: z.enum(TAIL),
  mouth: z.enum(MOUTH),
  extras: z.array(z.enum(EXTRAS)).max(5),
});
export const circuitSpecSchema = z.object({
  components: z
    .array(
      z.object({
        id: z.string().min(1).max(16),
        type: z.enum(COMPONENTS),
        label: z.string().trim().min(1).max(32),
        value: z.number().finite().positive().nullable(),
        x: z.number().min(0).max(1),
        y: z.number().min(0).max(1),
      }),
    )
    .max(12),
  wires: z.array(z.object({ from: z.string().min(1).max(16), to: z.string().min(1).max(16) })).max(24),
});

const notes = (u: unknown) =>
  (Array.isArray(u) ? u : []).filter((x): x is string => typeof x === 'string').map((x) => x.trim().slice(0, 200)).filter(Boolean).slice(0, 12);

/** Validates the model's JSON (zod) into a RecognizedCreation. Light normalisation only, noted in uncertainties. */
export function parseCreation(jsonText: string, mode: SketchMode): RecognizedCreation {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(jsonText);
  } catch {
    throw invalidOutputError('vision', 'not valid JSON');
  }
  if (!data || typeof data !== 'object' || typeof data.inScope !== 'boolean') throw invalidOutputError('vision', 'missing inScope');
  const uncertainties = notes(data.uncertainties);
  if (mode === 'pet') {
    const raw = data.pet as Record<string, unknown> | undefined;
    if (raw && typeof raw.name === 'string' && raw.name.trim().length > 20) {
      uncertainties.push(`Shortened the name "${raw.name.trim().slice(0, 30)}".`);
      raw.name = raw.name.trim().slice(0, 20);
    }
    if (raw && Array.isArray(raw.extras)) raw.extras = [...new Set(raw.extras)];
    const p = petSpecSchema.safeParse(raw);
    if (!p.success) throw invalidOutputError('vision', `pet failed validation at "${p.error.issues[0]?.path.join('.')}"`);
    const pet: PetSpec = { ...p.data, bodyColor: p.data.bodyColor.toUpperCase(), accentColor: p.data.accentColor.toUpperCase() };
    return { mode, inScope: data.inScope, pet, circuit: null, uncertainties };
  }
  const raw = data.circuit as { components?: Array<Record<string, unknown>>; wires?: unknown } | undefined;
  if (raw && Array.isArray(raw.components)) {
    for (const c of raw.components) {
      if (typeof c.label === 'string' && c.label.trim().length > 32) c.label = c.label.trim().slice(0, 32);
      if (typeof c.label === 'string' && !c.label.trim()) c.label = String(c.type ?? '?');
      if (typeof c.value === 'number' && !(c.value > 0)) {
        uncertainties.push(`Ignored an unclear value on ${String(c.label)}.`);
        c.value = null;
      }
    }
  }
  const c = circuitSpecSchema.safeParse(raw);
  if (!c.success) throw invalidOutputError('vision', `circuit failed validation at "${c.error.issues[0]?.path.join('.')}"`);
  const ids = new Set(c.data.components.map((x) => x.id));
  const wires = c.data.wires.filter((w) => ids.has(w.from) && ids.has(w.to));
  if (wires.length < c.data.wires.length) uncertainties.push('Ignored wires that did not connect two recognised parts.');
  const circuit: CircuitSpec = { components: c.data.components, wires };
  return { mode, inScope: data.inScope, pet: null, circuit, uncertainties };
}

export { extractOutputText };
