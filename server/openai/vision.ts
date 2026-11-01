/**
 * Sketch reading with the Responses API + Structured Outputs.
 *
 * Request shape verified against (2026-11-01):
 * - https://developers.openai.com/api/docs/guides/images-vision  (input_image with base64 data URL, `detail`)
 * - https://developers.openai.com/api/docs/guides/structured-outputs (text.format json_schema, strict, refusals)
 * - https://developers.openai.com/api/reference/resources/responses/methods/create (instructions, store, output[])
 */
import { z } from 'zod';
import type { FlowEdge, FlowNode, RecognizedSketch } from '../../shared/types';
import { LABEL_MAX, checkChain, flowGraphSchema } from '../../shared/validation';
import { OpenAIError, invalidOutputError } from './errors';

export type ImageMime = 'image/png' | 'image/jpeg' | 'image/webp';

export const VISION_SCHEMA_NAME = 'sketch_reading';

export const VISION_INSTRUCTIONS = [
  'You read photos of hand-drawn process sketches for a live queue simulation.',
  'Extract exactly ONE linear chain of three steps: a source (where people or orders arrive),',
  'a service step (where work is done), and a sink (where they leave), connected by directed arrows',
  'source → service → sink.',
  '',
  'Rules:',
  '- Use the words written in each box as the label (at most 32 characters). Do not translate or embellish.',
  '- x and y are the centre of each box, normalised to 0..1 of the image (x to the right, y downward).',
  '- Give nodes short ids such as "n1", "n2", "n3". Edges go in the direction of the arrows.',
  '- serviceTimeSec, workers and arrivalIntervalSec must be null unless a number for them is clearly written',
  '  on the drawing (e.g. "50 s per order", "2 baristas", "every 30 s"). Never guess or invent numbers.',
  '  Convert written minutes to seconds.',
  '- List anything you could not read or were unsure about in uncertainties (short sentences).',
  '- Set inScope to false if the drawing is not a simple three-step chain (branches, loops, more or fewer',
  '  steps, or not a process sketch at all). Still return the boxes you can see, if any.',
].join('\n');

const nullableNumber = (description: string) => ({ type: ['number', 'null'], description });

/**
 * Strict JSON schema for Structured Outputs.
 * Uses only keywords listed as supported in the Structured Outputs guide (all fields required,
 * additionalProperties false, nullable via type union, number minimum/maximum, enum).
 * Label length is enforced on the server (zod), not in the schema.
 */
export const VISION_JSON_SCHEMA = {
  type: 'object',
  properties: {
    inScope: { type: 'boolean', description: 'True only if the drawing is one source → service → sink chain.' },
    graph: {
      type: 'object',
      properties: {
        nodes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Short id such as n1.' },
              kind: { type: 'string', enum: ['source', 'service', 'sink'] },
              label: { type: 'string', description: 'Text written in the box, at most 32 characters.' },
              x: { type: 'number', minimum: 0, maximum: 1 },
              y: { type: 'number', minimum: 0, maximum: 1 },
            },
            required: ['id', 'kind', 'label', 'x', 'y'],
            additionalProperties: false,
          },
        },
        edges: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              from: { type: 'string' },
              to: { type: 'string' },
            },
            required: ['from', 'to'],
            additionalProperties: false,
          },
        },
      },
      required: ['nodes', 'edges'],
      additionalProperties: false,
    },
    serviceTimeSec: nullableNumber('Seconds per order, only if clearly written on the drawing; otherwise null.'),
    workers: { type: ['integer', 'null'], description: 'Number of workers, only if clearly written; otherwise null.' },
    arrivalIntervalSec: nullableNumber('Seconds between arrivals, only if clearly written; otherwise null.'),
    uncertainties: { type: 'array', items: { type: 'string' } },
  },
  required: ['inScope', 'graph', 'serviceTimeSec', 'workers', 'arrivalIntervalSec', 'uncertainties'],
  additionalProperties: false,
} as const;

export function buildVisionRequest(model: string, image: Buffer, mime: ImageMime) {
  return {
    model,
    instructions: VISION_INSTRUCTIONS,
    input: [
      {
        role: 'user',
        content: [
          { type: 'input_text', text: 'Read this sketch and return the chain as JSON.' },
          {
            type: 'input_image',
            image_url: `data:${mime};base64,${image.toString('base64')}`,
            // "high" caps the image at 2,500 patches. "auto" means "original" for gpt-6-astra, and large
            // phone photos could exceed the 30,000-patch limit and be rejected (images-vision guide).
            detail: 'high',
          },
        ],
      },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: VISION_SCHEMA_NAME,
        strict: true,
        schema: VISION_JSON_SCHEMA,
      },
    },
    // Uploaded photos do not need to be retained by the API.
    store: false,
    max_output_tokens: 6000,
  };
}

/**
 * Pulls the JSON text out of a Responses API result.
 * `output_text` is an SDK-only convenience, so the raw `output[]` items are read
 * (message → content[] → output_text | refusal), with output_text as a fallback.
 */
export function extractOutputText(response: unknown): string {
  const r = response as Record<string, unknown> | null;
  if (!r || typeof r !== 'object') throw invalidOutputError('vision', 'empty response');
  if (r.status === 'incomplete') {
    const reason = (r.incomplete_details as { reason?: unknown } | null)?.reason;
    throw invalidOutputError('vision', `the answer was cut off${typeof reason === 'string' ? `: ${reason}` : ''}`);
  }
  if (r.status === 'failed') throw invalidOutputError('vision', 'the response failed');
  const texts: string[] = [];
  if (Array.isArray(r.output)) {
    for (const item of r.output as Array<Record<string, unknown>>) {
      if (item?.type !== 'message' || !Array.isArray(item.content)) continue;
      for (const part of item.content as Array<Record<string, unknown>>) {
        if (part?.type === 'refusal') {
          throw new OpenAIError('model_refused', 'vision', 'Sketch reading: the model declined to read this image. Try another photo or edit the steps by hand.');
        }
        if (part?.type === 'output_text' && typeof part.text === 'string') texts.push(part.text);
      }
    }
  }
  if (!texts.length && typeof r.output_text === 'string') texts.push(r.output_text);
  const text = texts.join('').trim();
  if (!text) throw invalidOutputError('vision', 'no text output');
  return text;
}

/** What the model must return (mirrors VISION_JSON_SCHEMA). */
const rawSketchSchema = z.object({
  inScope: z.boolean(),
  graph: z.object({
    nodes: z.array(
      z.object({
        id: z.string(),
        kind: z.enum(['source', 'service', 'sink']),
        label: z.string(),
        x: z.number().finite(),
        y: z.number().finite(),
      }),
    ),
    edges: z.array(z.object({ from: z.string(), to: z.string() })),
  }),
  serviceTimeSec: z.number().finite().nullable(),
  workers: z.number().finite().nullable(),
  arrivalIntervalSec: z.number().finite().nullable(),
  uncertainties: z.array(z.string()),
});

const MAX_NODES = 8;
const MAX_EDGES = 12;
const KIND_WORD: Record<FlowNode['kind'], string> = { source: 'starting step', service: 'service step', sink: 'end step' };

const clamp01 = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000;

function positiveOrNull(v: number | null, name: string, notes: string[], integer = false): number | null {
  if (v === null) return null;
  if (!(v > 0) || (integer && !Number.isInteger(v))) {
    notes.push(`Ignored an unclear value for ${name} (${v}).`);
    return null;
  }
  return v;
}

/**
 * Validates the model's JSON and turns it into a RecognizedSketch.
 * Light, transparent normalisation only (ids, label trimming, clamping); every change is noted
 * in uncertainties so the host can see it. Numbers are never invented.
 */
export function parseSketch(jsonText: string): RecognizedSketch {
  let data: unknown;
  try {
    data = JSON.parse(jsonText);
  } catch {
    throw invalidOutputError('vision', 'not valid JSON');
  }
  const parsed = rawSketchSchema.safeParse(data);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw invalidOutputError('vision', `JSON did not match the schema at "${first?.path.join('.') || '(root)'}"`);
  }
  const raw = parsed.data;
  const notes: string[] = raw.uncertainties
    .map((u) => u.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((u) => (u.length > 200 ? `${u.slice(0, 197)}...` : u))
    .slice(0, 12);
  let inScope = raw.inScope;

  let rawNodes = raw.graph.nodes;
  if (rawNodes.length > MAX_NODES) {
    notes.push(`The drawing has ${rawNodes.length} steps; only the first ${MAX_NODES} are shown.`);
    rawNodes = rawNodes.slice(0, MAX_NODES);
    inScope = false;
  }

  // Re-number ids to n1..nN so they always satisfy the shared schema; map edges accordingly.
  const idMap = new Map<string, string>();
  const nodes: FlowNode[] = rawNodes.map((n, i) => {
    const id = `n${i + 1}`;
    if (!idMap.has(n.id)) idMap.set(n.id, id);
    let label = n.label.replace(/\s+/g, ' ').trim();
    if (!label) {
      notes.push(`Could not read the label of the ${KIND_WORD[n.kind]} — please type it.`);
      label = '?';
    } else if (label.length > LABEL_MAX) {
      notes.push(`Shortened the label "${label.slice(0, 40)}" to ${LABEL_MAX} characters.`);
      label = label.slice(0, LABEL_MAX).trim();
    }
    return { id, kind: n.kind, label, x: clamp01(n.x), y: clamp01(n.y) };
  });

  const edges: FlowEdge[] = [];
  let dropped = 0;
  for (const e of raw.graph.edges) {
    const from = idMap.get(e.from);
    const to = idMap.get(e.to);
    if (!from || !to) {
      dropped++;
      continue;
    }
    if (!edges.some((x) => x.from === from && x.to === to)) edges.push({ from, to });
  }
  if (dropped) notes.push(`Ignored ${dropped} arrow(s) that did not connect two recognised steps.`);
  if (edges.length > MAX_EDGES) {
    notes.push(`Only the first ${MAX_EDGES} arrows are shown.`);
    edges.length = MAX_EDGES;
    inScope = false;
  }

  if (nodes.length) {
    const g = flowGraphSchema.safeParse({ nodes, edges });
    if (!g.success) {
      const first = g.error.issues[0];
      throw invalidOutputError('vision', `graph failed validation at "${first?.path.join('.')}"`);
    }
  } else if (inScope) {
    notes.push('No steps were recognised in the picture.');
    inScope = false;
  }

  if (inScope) {
    const check = checkChain({ nodes, edges });
    if (!check.ok) {
      // Keep the sketch: the host can fix labels/kinds by hand. Show the problems.
      for (const err of check.errors) if (!notes.includes(err)) notes.push(err);
    }
  }

  return {
    inScope,
    graph: { nodes, edges },
    serviceTimeSec: positiveOrNull(raw.serviceTimeSec, 'service time', notes),
    workers: positiveOrNull(raw.workers, 'workers', notes, true),
    arrivalIntervalSec: positiveOrNull(raw.arrivalIntervalSec, 'arrival interval', notes),
    uncertainties: notes,
  };
}
