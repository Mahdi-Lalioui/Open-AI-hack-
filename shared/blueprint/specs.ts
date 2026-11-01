/** One validation source for editable, imported and server-built creation blueprints. */
import { z } from 'zod';

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Colour must look like #rrggbb');

export const petSpecSchema = z.object({
  name: z.string().trim().min(1, 'Name is empty').max(20, 'Name must be at most 20 characters'),
  bodyShape: z.enum(['round', 'oval', 'bean', 'blob', 'tall']),
  bodyColor: color,
  accentColor: color,
  eyeCount: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  eyeStyle: z.enum(['round', 'big', 'sleepy']),
  ears: z.enum(['none', 'pointy', 'round', 'floppy', 'antenna']),
  legs: z.union([z.literal(0), z.literal(2), z.literal(4)]),
  tail: z.enum(['none', 'short', 'long', 'curly']),
  mouth: z.enum(['smile', 'open', 'none']),
  extras: z.array(z.enum(['wings', 'horn', 'spots', 'hat', 'whiskers'])).max(5),
});

export const circuitSpecSchema = z.object({
  components: z.array(z.object({
    id: z.string().min(1).max(16),
    type: z.enum(['battery', 'resistor', 'led', 'bulb', 'switch']),
    label: z.string().trim().max(32),
    value: z.number().finite().positive().max(1e7).nullable(),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
  })).min(1).max(12),
  wires: z.array(z.object({ from: z.string().min(1).max(16), to: z.string().min(1).max(16) })).max(24),
});

export const buildCreationSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('pet'), pet: petSpecSchema, source: z.enum(['example', 'vision', 'manual']) }),
  z.object({ mode: z.literal('circuit'), circuit: circuitSpecSchema, source: z.enum(['example', 'vision', 'manual']) }),
]);

export type BuildCreationInput = z.input<typeof buildCreationSchema>;
