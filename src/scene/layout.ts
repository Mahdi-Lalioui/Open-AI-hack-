/**
 * Pure layout math for the 3D café. No three.js / React imports so it can be unit tested.
 *
 * World units: the paper sheet lies on the XZ plane (X → right, Z → towards the viewer).
 * The sketch's node x (0..1, right) maps to world X and node y (0..1, down) maps to world Z.
 */
import type { FlowGraph, FlowNode, NodeKind, Order, SimSnapshot, Worker } from '../../shared/types';

export interface Vec2 {
  x: number;
  z: number;
}

export const PAPER = { width: 12, depth: 7.5, top: 0.06 } as const;

/** Where station centres may go on the paper. */
export const STATION_X_RANGE: readonly [number, number] = [-4.9, 4.9];
export const STATION_Z_RANGE: readonly [number, number] = [-1.9, 0.3];
/** Minimum X distance between source and service (the queue lane lives there). */
export const GAP_SOURCE_SERVICE = 4.4;
/** Minimum X distance between service and sink. */
export const GAP_SERVICE_SINK = 3.4;

/** Approximate footprint half-sizes (x, z) of each station model, used for overlap checks. */
export const STATION_HALF: Record<NodeKind, Vec2> = {
  source: { x: 0.95, z: 0.5 },
  service: { x: 1.35, z: 0.6 },
  sink: { x: 0.8, z: 0.45 },
};

export const QUEUE_VISUAL_CAP = 14;
export const QUEUE_ROW_GAP = 0.75;
export const RECENT_DONE_WINDOW_SEC = 20;
export const RECENT_DONE_MAX = 4;
export const COUNTER_HEIGHT = 0.78;

export interface StationLayout {
  source: Vec2;
  service: Vec2;
  sink: Vec2;
}

const DEFAULT_NODE_POS: Record<NodeKind, { x: number; y: number }> = {
  source: { x: 0.16, y: 0.5 },
  service: { x: 0.5, y: 0.46 },
  sink: { x: 0.84, y: 0.52 },
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const finite01 = (v: unknown, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? clamp(v, 0, 1) : fallback;

export function nodeOfKind(graph: FlowGraph | null | undefined, kind: NodeKind): FlowNode | undefined {
  return graph?.nodes.find((n) => n.kind === kind);
}

/**
 * Map the three nodes onto the paper. The flow is always laid out left → right
 * (source, service, sink) with enough room for the queue lane, then centred.
 */
export function layoutStations(graph: FlowGraph | null | undefined): StationLayout {
  const raw = (kind: NodeKind): Vec2 => {
    const n = nodeOfKind(graph, kind);
    const d = DEFAULT_NODE_POS[kind];
    return {
      x: lerp(STATION_X_RANGE[0], STATION_X_RANGE[1], finite01(n?.x, d.x)),
      z: lerp(STATION_Z_RANGE[0], STATION_Z_RANGE[1], finite01(n?.y, d.y)),
    };
  };
  const src = raw('source');
  const svc = raw('service');
  const snk = raw('sink');

  const [lo, hi] = STATION_X_RANGE;
  svc.x = clamp(svc.x, lo + GAP_SOURCE_SERVICE, hi - GAP_SERVICE_SINK);
  src.x = clamp(Math.min(src.x, svc.x - GAP_SOURCE_SERVICE), lo, hi);
  snk.x = clamp(Math.max(snk.x, svc.x + GAP_SERVICE_SINK), lo, hi);

  // Centre the whole flow horizontally so it sits in the middle of the sheet.
  const shift = clamp(-(src.x + snk.x) / 2, lo - src.x, hi - snk.x);
  src.x += shift;
  svc.x += shift;
  snk.x += shift;

  return { source: src, service: svc, sink: snk };
}

/** True when two station footprints (with a small margin) intersect. */
export function stationsOverlap(a: Vec2, ah: Vec2, b: Vec2, bh: Vec2, margin = 0.2): boolean {
  return Math.abs(a.x - b.x) < ah.x + bh.x + margin && Math.abs(a.z - b.z) < ah.z + bh.z + margin;
}

// ---------------------------------------------------------------------------
// Workers, serving spots, Bean
// ---------------------------------------------------------------------------

/** Stable X offsets (from the service centre) for worker slots behind the counter. */
export const WORKER_SLOT_OFFSETS = [-0.3, 0.45] as const;

export function workerSlotIndex(workers: Worker[], workerId: number | null): number {
  const sorted = [...workers].sort((a, b) => a.id - b.id);
  const i = sorted.findIndex((w) => w.id === workerId);
  return i < 0 ? 0 : Math.min(i, WORKER_SLOT_OFFSETS.length - 1);
}

export function workerPosition(st: StationLayout, slot: number): Vec2 {
  const off = WORKER_SLOT_OFFSETS[Math.min(Math.max(slot, 0), WORKER_SLOT_OFFSETS.length - 1)];
  return { x: st.service.x + off, z: st.service.z - 0.55 };
}

/** Where the customer being served stands (in front of the counter, facing its worker). */
export function serveSpot(st: StationLayout, slot: number): Vec2 {
  const w = workerPosition(st, slot);
  return { x: w.x, z: st.service.z + 0.95 };
}

export function beanPosition(st: StationLayout): Vec2 {
  return { x: st.service.x + 1.02, z: st.service.z + 0.12 };
}

export function beanImageStandPosition(st: StationLayout): Vec2 {
  return { x: st.service.x + 1.85, z: st.service.z + 0.35 };
}

export function doorFront(st: StationLayout): Vec2 {
  return { x: st.source.x + 0.35, z: st.source.z + 0.75 };
}

export function pickupSpot(st: StationLayout, index: number): Vec2 {
  return { x: st.sink.x + (index - 1.5) * 0.42, z: st.sink.z + 0.9 };
}

// ---------------------------------------------------------------------------
// Queue lane (a snake from the counter back towards the door)
// ---------------------------------------------------------------------------

export interface QueueLane {
  /** Polyline from the head of the line (near the counter) to the tail. */
  points: Vec2[];
  length: number;
  /** Distance between neighbouring customers along the lane. */
  spacing: number;
}

export function polylineLength(points: Vec2[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
  }
  return len;
}

export function queueLane(st: StationLayout, cap = QUEUE_VISUAL_CAP): QueueLane {
  const head: Vec2 = { x: st.service.x - 1.5, z: st.service.z + 1.0 };
  const door: Vec2 = { x: st.source.x + 1.1, z: st.source.z + 1.0 };
  let dx = door.x - head.x;
  let dz = door.z - head.z;
  const d = Math.hypot(dx, dz) || 1;
  dx /= d;
  dz /= d;
  // Perpendicular that points towards the viewer (+Z).
  let nx = dz;
  let nz = -dx;
  if (nz < 0) {
    nx = -nx;
    nz = -nz;
  }
  const g = QUEUE_ROW_GAP;
  const points: Vec2[] = [
    head,
    door,
    { x: door.x + nx * g, z: door.z + nz * g },
    { x: head.x + nx * g, z: head.z + nz * g },
    { x: head.x + nx * 2 * g, z: head.z + nz * 2 * g },
    { x: door.x + nx * 2 * g, z: door.z + nz * 2 * g },
  ];
  const length = polylineLength(points);
  // One spare spacing at the end leaves room for the "+N" tag.
  const spacing = clamp(length / (cap + 0.5), 0.42, 0.62);
  return { points, length, spacing };
}

export interface LanePoint extends Vec2 {
  /** Heading (radians around +Y) pointing back towards the counter, i.e. where a customer faces. */
  facing: number;
}

/** Point at arc length `s` along the lane (clamped to the lane). */
export function pointOnLane(points: Vec2[], s: number): LanePoint {
  let remaining = Math.max(0, s);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const seg = Math.hypot(b.x - a.x, b.z - a.z);
    if (remaining <= seg || i === points.length - 1) {
      const t = seg > 0 ? Math.min(remaining / seg, 1) : 0;
      // Face against walking direction (towards the head of the line).
      const facing = Math.atan2(a.x - b.x, a.z - b.z);
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, facing };
    }
    remaining -= seg;
  }
  return { ...points[0], facing: 0 };
}

/** Slot i (0 = next to be served) along the lane. */
export function queueSlot(lane: QueueLane, i: number): LanePoint {
  return pointOnLane(lane.points, i * lane.spacing);
}

// ---------------------------------------------------------------------------
// Which customers to draw
// ---------------------------------------------------------------------------

export type CustomerPhase = 'waiting' | 'serving' | 'done';

export interface CustomerVisual {
  order: Order;
  phase: CustomerPhase;
  /** waiting: queue slot; serving: worker slot; done: pickup index. */
  index: number;
  /** done only: sim seconds since completion. */
  age: number;
}

export interface CustomerPlan {
  visible: CustomerVisual[];
  waitingTotal: number;
  /** Waiting customers not drawn because of the visual cap. */
  overflow: number;
}

export function waitingOrders(orders: Order[]): Order[] {
  return orders
    .map((o, i) => ({ o, i }))
    .filter(({ o }) => o.serviceStartTime == null && o.completionTime == null)
    .sort((a, b) => a.o.arrivalTime - b.o.arrivalTime || a.i - b.i)
    .map(({ o }) => o);
}

export function planCustomers(sim: SimSnapshot | null | undefined, cap = QUEUE_VISUAL_CAP): CustomerPlan {
  if (!sim) return { visible: [], waitingTotal: 0, overflow: 0 };
  const visible: CustomerVisual[] = [];

  const waiting = waitingOrders(sim.orders);
  waiting.slice(0, cap).forEach((order, index) => visible.push({ order, phase: 'waiting', index, age: 0 }));

  for (const order of sim.orders) {
    if (order.serviceStartTime != null && order.completionTime == null) {
      const busy = sim.workers.find((w) => w.busyWith === order.id);
      const index = workerSlotIndex(sim.workers, busy?.id ?? order.workerId);
      visible.push({ order, phase: 'serving', index, age: 0 });
    }
  }

  const done = sim.orders
    .filter((o) => o.completionTime != null && sim.time - o.completionTime >= 0 && sim.time - o.completionTime <= RECENT_DONE_WINDOW_SEC)
    .sort((a, b) => (b.completionTime ?? 0) - (a.completionTime ?? 0))
    .slice(0, RECENT_DONE_MAX)
    .reverse();
  done.forEach((order, index) =>
    visible.push({ order, phase: 'done', index, age: sim.time - (order.completionTime ?? sim.time) }),
  );

  return { visible, waitingTotal: waiting.length, overflow: Math.max(0, waiting.length - cap) };
}

// ---------------------------------------------------------------------------
// Ink path drawn on the paper (source → service → sink)
// ---------------------------------------------------------------------------

export function inkLegs(st: StationLayout): Vec2[][] {
  return [
    [
      { x: st.source.x + 1.05, z: st.source.z + 0.05 },
      { x: st.service.x - 1.6, z: st.service.z + 0.05 },
    ],
    [
      { x: st.service.x + 2.3, z: st.service.z + 0.05 },
      { x: st.sink.x - 1.0, z: st.sink.z + 0.05 },
    ],
  ];
}

export interface Dash {
  x: number;
  z: number;
  angle: number;
  length: number;
}

/** Split a polyline into dashes (ordered from start to end, for the draw-in animation). */
export function dashesAlong(points: Vec2[], dash = 0.22, gap = 0.14): Dash[] {
  const out: Dash[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const seg = Math.hypot(b.x - a.x, b.z - a.z);
    if (seg <= 0) continue;
    const ux = (b.x - a.x) / seg;
    const uz = (b.z - a.z) / seg;
    const angle = Math.atan2(-uz, ux);
    for (let s = 0; s < seg; s += dash + gap) {
      const len = Math.min(dash, seg - s);
      const mid = s + len / 2;
      out.push({ x: a.x + ux * mid, z: a.z + uz * mid, angle, length: len });
    }
  }
  return out;
}

/** Deterministic small hash for picking colours etc. from an order id. */
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
