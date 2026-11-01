/** zod schemas for creation builds and interactions. */
import { z } from 'zod';
import { NICKNAME_MAX } from '../../shared/validation';

export { petSpecSchema, circuitSpecSchema, buildCreationSchema } from '../../shared/blueprint';
export type { BuildCreationInput } from '../../shared/blueprint';

export const interactionSchema = z.object({
  id: z.string().trim().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/, 'Invalid interaction id'),
  kind: z.enum(['feed', 'pet', 'play', 'toggle_switch']),
  /** Optional for older clients; a browser identity lets guests share venue Wi-Fi. */
  clientId: z.string().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/, 'Invalid client id').optional(),
  nickname: z
    .string()
    .trim()
    .max(NICKNAME_MAX)
    .optional()
    .transform((v) => (v ? v.replace(/[\u0000-\u001f\u007f<>]/g, '').trim() || undefined : undefined)),
});
export type InteractionInput = z.input<typeof interactionSchema>;
