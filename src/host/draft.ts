/** The host's editable flow draft (labels + assumptions) and its conversion to a BuildWorldInput. */
import type {
  BuildWorldInput,
  FlowGraph,
  NodeKind,
  RecognizedSketch,
  WorldConfig,
  WorldSource,
} from '../../shared/types';
import { DEFAULT_ASSUMPTIONS, MAX_WORKERS } from '../../shared/types';
import { EXAMPLE_GRAPH } from '../../shared/example';
import { LABEL_MAX, checkChain } from '../../shared/validation';
import { parseWholeSeconds } from '../lib/format';

export type DraftOrigin = 'none' | 'example' | 'vision' | 'world';
/** Where an assumption value came from, shown next to the input. */
export type ValueMark = 'sketch' | 'default' | 'edited' | 'world';

export const KINDS: NodeKind[] = ['source', 'service', 'sink'];

export const ARRIVAL_RANGE = [5, 600] as const;
export const SERVICE_RANGE = [5, 900] as const;

export interface Draft {
  origin: DraftOrigin;
  /** Source of the world this draft was loaded from (origin === 'world'). */
  worldSource?: WorldSource;
  /** True once the host changed anything by hand. */
  edited: boolean;
  /** Node ids + positions to keep (example / vision / world). */
  base: FlowGraph | null;
  labels: Record<NodeKind, string>;
  arrival: string;
  service: string;
  workers: 1 | 2;
  autoArrivalUntilSec: number;
  marks: { arrival: ValueMark; service: ValueMark; workers: ValueMark };
  /** Notes for the host, e.g. a worker count on the drawing outside the supported range. */
  notes: string[];
}

export function emptyDraft(): Draft {
  return {
    origin: 'none',
    edited: false,
    base: null,
    labels: { source: '', service: '', sink: '' },
    arrival: String(DEFAULT_ASSUMPTIONS.arrivalIntervalSec),
    service: String(DEFAULT_ASSUMPTIONS.serviceTimeSec),
    workers: DEFAULT_ASSUMPTIONS.initialWorkers,
    autoArrivalUntilSec: DEFAULT_ASSUMPTIONS.autoArrivalUntilSec,
    marks: { arrival: 'default', service: 'default', workers: 'default' },
    notes: [],
  };
}

function labelsOf(graph: FlowGraph): Record<NodeKind, string> {
  const get = (k: NodeKind) => graph.nodes.find((n) => n.kind === k)?.label ?? '';
  return { source: get('source'), service: get('service'), sink: get('sink') };
}

export function draftFromExample(): Draft {
  const base = structuredClone(EXAMPLE_GRAPH);
  return { ...emptyDraft(), origin: 'example', base, labels: labelsOf(base) };
}

export function draftFromWorld(world: WorldConfig): Draft {
  const a = world.assumptions;
  return {
    origin: 'world',
    worldSource: world.source,
    edited: false,
    base: structuredClone(world.graph),
    labels: labelsOf(world.graph),
    arrival: String(a.arrivalIntervalSec),
    service: String(a.serviceTimeSec),
    workers: a.initialWorkers,
    autoArrivalUntilSec: a.autoArrivalUntilSec,
    marks: { arrival: 'world', service: 'world', workers: 'world' },
    notes: [],
  };
}

export type SketchDraftResult = { ok: true; draft: Draft } | { ok: false; errors: string[] };

/** Turns a vision read into a draft, or explains why it cannot be used. */
export function draftFromSketch(sketch: RecognizedSketch): SketchDraftResult {
  if (!sketch.inScope) {
    return {
      ok: false,
      errors: ['This drawing does not look like one simple chain (start → service → end), so it was not used.'],
    };
  }
  const chain = checkChain(sketch.graph);
  if (!chain.ok) return { ok: false, errors: chain.errors };
  const [src, svc, snk] = chain.chain;
  const base: FlowGraph = {
    nodes: chain.chain.map((n) => ({ ...n, label: n.label.slice(0, LABEL_MAX) })),
    edges: [
      { from: src.id, to: svc.id },
      { from: svc.id, to: snk.id },
    ],
  };
  const d: Draft = {
    ...emptyDraft(),
    origin: 'vision',
    base,
    labels: { source: src.label.slice(0, LABEL_MAX), service: svc.label.slice(0, LABEL_MAX), sink: snk.label.slice(0, LABEL_MAX) },
  };
  const notes: string[] = [];
  const inRange = (v: number | null, [lo, hi]: readonly [number, number]) =>
    v !== null && Number.isInteger(v) && v >= lo && v <= hi;
  if (inRange(sketch.arrivalIntervalSec, ARRIVAL_RANGE)) {
    d.arrival = String(sketch.arrivalIntervalSec);
    d.marks.arrival = 'sketch';
  } else if (sketch.arrivalIntervalSec !== null) {
    notes.push(`The drawing says an arrival every ${sketch.arrivalIntervalSec} s, outside 5–600 s; using the default.`);
  }
  if (inRange(sketch.serviceTimeSec, SERVICE_RANGE)) {
    d.service = String(sketch.serviceTimeSec);
    d.marks.service = 'sketch';
  } else if (sketch.serviceTimeSec !== null) {
    notes.push(`The drawing says ${sketch.serviceTimeSec} s per order, outside 5–900 s; using the default.`);
  }
  if (sketch.workers === 1 || sketch.workers === 2) {
    d.workers = sketch.workers;
    d.marks.workers = 'sketch';
  } else if (sketch.workers !== null) {
    notes.push(`The drawing shows ${sketch.workers} workers; this demo starts with 1 or 2 (up to ${MAX_WORKERS}).`);
  }
  d.notes = notes;
  return { ok: true, draft: d };
}

/** The WorldSource that honestly describes this draft. */
export function draftSource(d: Draft): WorldSource {
  if (d.edited) return 'manual';
  if (d.origin === 'example') return 'example';
  if (d.origin === 'vision') return 'vision';
  if (d.origin === 'world') return d.worldSource ?? 'manual';
  return 'manual';
}

export interface DraftErrors {
  labels: Partial<Record<NodeKind, string>>;
  arrival?: string;
  service?: string;
  chain: string[];
}

export type DraftCheck =
  | { ok: true; input: BuildWorldInput; errors: DraftErrors }
  | { ok: false; errors: DraftErrors; messages: string[] };

const KIND_WORD: Record<NodeKind, string> = { source: 'Start', service: 'Service', sink: 'End' };

/** Validates the draft with the shared chain check + ranges and builds the request body. */
export function checkDraft(d: Draft): DraftCheck {
  const errors: DraftErrors = { labels: {}, chain: [] };
  const messages: string[] = [];
  for (const k of KINDS) {
    const v = d.labels[k].trim();
    if (!v) errors.labels[k] = `${KIND_WORD[k]} step needs a name.`;
    else if (v.length > LABEL_MAX) errors.labels[k] = `${KIND_WORD[k]} step name is longer than ${LABEL_MAX} characters.`;
  }
  const arrival = parseWholeSeconds(d.arrival, ...ARRIVAL_RANGE);
  if (arrival === null) errors.arrival = `Use a whole number from ${ARRIVAL_RANGE[0]} to ${ARRIVAL_RANGE[1]} seconds.`;
  const service = parseWholeSeconds(d.service, ...SERVICE_RANGE);
  if (service === null) errors.service = `Use a whole number from ${SERVICE_RANGE[0]} to ${SERVICE_RANGE[1]} seconds.`;

  const ids: Record<NodeKind, string> = { source: 'n1', service: 'n2', sink: 'n3' };
  const pos: Record<NodeKind, { x: number; y: number }> = {
    source: { x: 0.16, y: 0.5 },
    service: { x: 0.5, y: 0.5 },
    sink: { x: 0.84, y: 0.5 },
  };
  for (const k of KINDS) {
    const n = d.base?.nodes.find((node) => node.kind === k);
    if (n) {
      ids[k] = n.id;
      pos[k] = { x: n.x, y: n.y };
    }
  }
  const graph: FlowGraph = {
    nodes: KINDS.map((k) => ({ id: ids[k], kind: k, label: d.labels[k].trim(), x: pos[k].x, y: pos[k].y })),
    edges: [
      { from: ids.source, to: ids.service },
      { from: ids.service, to: ids.sink },
    ],
  };
  const chain = checkChain(graph);
  if (!chain.ok) errors.chain = chain.errors;

  for (const k of KINDS) if (errors.labels[k]) messages.push(errors.labels[k]!);
  if (errors.arrival) messages.push(`Arrival: ${errors.arrival}`);
  if (errors.service) messages.push(`Service time: ${errors.service}`);
  messages.push(...errors.chain);
  if (messages.length || arrival === null || service === null) return { ok: false, errors, messages };

  return {
    ok: true,
    errors,
    input: {
      graph,
      assumptions: {
        arrivalIntervalSec: arrival,
        serviceTimeSec: service,
        autoArrivalUntilSec: d.autoArrivalUntilSec,
        initialWorkers: d.workers,
      },
      source: draftSource(d),
    },
  };
}

/** True when the draft would build exactly the given world (used for the "confirmed" stamp). */
export function draftMatchesWorld(d: Draft, world: WorldConfig | null): boolean {
  if (!world) return false;
  const res = checkDraft(d);
  if (!res.ok) return false;
  const a = res.input.assumptions;
  const b = world.assumptions;
  if (a.arrivalIntervalSec !== b.arrivalIntervalSec || a.serviceTimeSec !== b.serviceTimeSec || a.initialWorkers !== b.initialWorkers) {
    return false;
  }
  const wl = labelsOf(world.graph);
  return KINDS.every((k) => wl[k] === res.input.graph.nodes.find((n) => n.kind === k)?.label);
}
