/**
 * Shared zod schemas + graph checks. OWNER: lead.
 */
import { z } from 'zod';
import type { FlowGraph, FlowNode } from './types';

export const LABEL_MAX = 32;
export const NICKNAME_MAX = 24;

export const flowNodeSchema = z.object({
  id: z.string().min(1).max(16),
  kind: z.enum(['source', 'service', 'sink']),
  label: z.string().trim().min(1, 'Label is empty').max(LABEL_MAX, `Label must be at most ${LABEL_MAX} characters`),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});

export const flowEdgeSchema = z.object({
  from: z.string().min(1).max(16),
  to: z.string().min(1).max(16),
});

export const flowGraphSchema = z.object({
  nodes: z.array(flowNodeSchema).min(1).max(8),
  edges: z.array(flowEdgeSchema).max(12),
});

export const assumptionsSchema = z.object({
  arrivalIntervalSec: z.number().int().min(5).max(600),
  serviceTimeSec: z.number().int().min(5).max(900),
  autoArrivalUntilSec: z.number().int().min(0).max(3600),
  initialWorkers: z.union([z.literal(1), z.literal(2)]),
});

export const buildWorldSchema = z.object({
  graph: flowGraphSchema,
  assumptions: assumptionsSchema,
  source: z.enum(['example', 'vision', 'manual']),
});

export const addOrderSchema = z.object({
  id: z.string().trim().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/, 'Invalid order id'),
  origin: z.enum(['audience', 'presenter']),
  nickname: z
    .string()
    .trim()
    .max(NICKNAME_MAX, `Nickname must be at most ${NICKNAME_MAX} characters`)
    .optional()
    .transform((v) => (v ? v.replace(/[\u0000-\u001f\u007f<>]/g, '').trim() || undefined : undefined)),
});

export type ChainCheck =
  | { ok: true; chain: [FlowNode, FlowNode, FlowNode] }
  | { ok: false; errors: string[] };

/**
 * The MVP supports exactly one linear chain: source → service → sink.
 * Returns the ordered chain or human-readable problems.
 */
export function checkChain(graph: FlowGraph): ChainCheck {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const n of graph.nodes) {
    if (ids.has(n.id)) errors.push(`Duplicate node id "${n.id}".`);
    ids.add(n.id);
  }
  const byKind = (k: FlowNode['kind']) => graph.nodes.filter((n) => n.kind === k);
  const sources = byKind('source');
  const services = byKind('service');
  const sinks = byKind('sink');
  if (sources.length !== 1) errors.push(`Need exactly one starting step (source); found ${sources.length}.`);
  if (services.length !== 1) errors.push(`Need exactly one service step; found ${services.length}.`);
  if (sinks.length !== 1) errors.push(`Need exactly one end step (sink); found ${sinks.length}.`);
  if (graph.nodes.length !== 3) errors.push(`Need exactly three steps; found ${graph.nodes.length}.`);
  for (const e of graph.edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) errors.push(`Arrow ${e.from} → ${e.to} points to an unknown step.`);
  }
  if (errors.length) return { ok: false, errors };
  const [src, svc, snk] = [sources[0], services[0], sinks[0]];
  const has = (a: string, b: string) => graph.edges.some((e) => e.from === a && e.to === b);
  if (!has(src.id, svc.id)) errors.push(`Missing arrow ${src.label} → ${svc.label}.`);
  if (!has(svc.id, snk.id)) errors.push(`Missing arrow ${svc.label} → ${snk.label}.`);
  const extra = graph.edges.filter(
    (e) => !(e.from === src.id && e.to === svc.id) && !(e.from === svc.id && e.to === snk.id),
  );
  if (extra.length) errors.push('Only one straight chain is supported (no branches or loops).');
  if (errors.length) return { ok: false, errors };
  return { ok: true, chain: [src, svc, snk] };
}
