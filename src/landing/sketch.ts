/**
 * Traces a pencil drawing from a Blueprint's real geometry, seen from the same camera as BlueprintViewport.
 * The lines land on the rendered model because they are the model: feature edges and silhouettes of
 * worldMesh(), with hidden lines removed by a small software depth buffer.
 */
import { designBounds, worldMesh } from '../../shared/blueprint/geometry';
import type { DesignBlueprint } from '../../shared/blueprint/types';

type V3 = [number, number, number];
interface Point { x: number; y: number; z: number }

export interface SketchPath {
  d: string;
  /** 0..1 position in the drawing order, bottom of the object first. */
  order: number;
  /** A lighter second pass of the pencil over the same line. */
  light: boolean;
}

/** BlueprintViewport's starting camera, looking at the middle of the design as LandingViewport makes sure it does. */
const CAMERA: V3 = [3, 2.9, 4.8];
const TARGET: V3 = [0, 1, 0];
const TAN_HALF_FOV = Math.tan((40 / 2) * (Math.PI / 180));
const SCENE_SIZE = 2.4;

/** Half the height of the SVG viewBox; see SketchLines. */
export const SKETCH_HALF_HEIGHT = 500;

const CREASE_COS = Math.cos((32 * Math.PI) / 180);
const CORNER_COS = Math.cos((40 * Math.PI) / 180);
const DEPTH_BIAS = 0.035;
const GRID_PER_UNIT = 130;
const GRID_U = 1.9;
const GRID_V = 1.5;

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

const FORWARD = unit(sub(TARGET, CAMERA));
const RIGHT = unit(cross(FORWARD, [0, 1, 0]));
const UP = cross(RIGHT, FORWARD);

/** Camera-space projection: u and v are in units of half the view height, z is the distance along the view. */
function project(p: V3): { u: number; v: number; z: number } {
  const d = sub(p, CAMERA);
  const z = dot(d, FORWARD);
  return { u: dot(d, RIGHT) / (z * TAN_HALF_FOV), v: dot(d, UP) / (z * TAN_HALF_FOV), z };
}

class DepthBuffer {
  private width = Math.ceil(GRID_U * 2 * GRID_PER_UNIT);
  private height = Math.ceil(GRID_V * 2 * GRID_PER_UNIT);
  private inverse = new Float32Array(this.width * this.height);

  private gx(u: number) { return (u + GRID_U) * GRID_PER_UNIT; }
  private gy(v: number) { return (v + GRID_V) * GRID_PER_UNIT; }

  triangle(a: ReturnType<typeof project>, b: ReturnType<typeof project>, c: ReturnType<typeof project>) {
    const [ax, ay, bx, by, cx, cy] = [this.gx(a.u), this.gy(a.v), this.gx(b.u), this.gy(b.v), this.gx(c.u), this.gy(c.v)];
    const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
    if (Math.abs(area) < 1e-6) return;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
    const x1 = Math.min(this.width - 1, Math.ceil(Math.max(ax, bx, cx)));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy)));
    const y1 = Math.min(this.height - 1, Math.ceil(Math.max(ay, by, cy)));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const w0 = ((bx - x) * (cy - y) - (cx - x) * (by - y)) / area;
        const w1 = ((cx - x) * (ay - y) - (ax - x) * (cy - y)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const inv = w0 / a.z + w1 / b.z + w2 / c.z;
        const i = y * this.width + x;
        if (inv > this.inverse[i]) this.inverse[i] = inv;
      }
    }
  }

  /** Lenient on purpose: a line stays visible if any neighbouring cell lets it through. */
  visible(u: number, v: number, z: number): boolean {
    const x = Math.round(this.gx(u));
    const y = Math.round(this.gy(v));
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cx = x + dx;
        const cy = y + dy;
        if (cx < 0 || cy < 0 || cx >= this.width || cy >= this.height) return true;
        const inv = this.inverse[cy * this.width + cx];
        if (inv === 0 || 1 / inv >= z - DEPTH_BIAS) return true;
      }
    }
    return false;
  }
}

/** Small deterministic generator, so a design's drawing is the same on every visit. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Joins edges into runs, starting from the junctions so that closed loops are left for last. */
function chainEdges(edges: [number, number][]): number[][] {
  const links = new Map<number, number[]>();
  edges.forEach(([a, b], i) => {
    (links.get(a) ?? links.set(a, []).get(a)!).push(i);
    (links.get(b) ?? links.set(b, []).get(b)!).push(i);
  });
  const used = new Array<boolean>(edges.length).fill(false);
  const walk = (start: number): number[] => {
    const run = [start];
    let at = start;
    for (;;) {
      const next = (links.get(at) ?? []).find((e) => !used[e]);
      if (next === undefined) return run;
      used[next] = true;
      at = edges[next][0] === at ? edges[next][1] : edges[next][0];
      run.push(at);
      if (at === start) return run;
      if ((links.get(at) ?? []).length !== 2) return run;
    }
  };
  const runs: number[][] = [];
  for (const [v, list] of links) {
    if (list.length === 2) continue;
    while (list.some((e) => !used[e])) runs.push(walk(v));
  }
  edges.forEach(([a], i) => { if (!used[i]) runs.push(walk(a)); });
  return runs;
}

function length(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return total;
}

function splitAtCorners(points: Point[]): Point[][] {
  const out: Point[][] = [];
  let current = [points[0]];
  for (let i = 1; i < points.length; i++) {
    current.push(points[i]);
    if (i === points.length - 1) break;
    const [a, b, c] = [points[i - 1], points[i], points[i + 1]];
    const [ux, uy, vx, vy] = [b.x - a.x, b.y - a.y, c.x - b.x, c.y - b.y];
    const cos = (ux * vx + uy * vy) / ((Math.hypot(ux, uy) * Math.hypot(vx, vy)) || 1);
    if (cos < CORNER_COS) {
      out.push(current);
      current = [points[i]];
    }
  }
  out.push(current);
  return out;
}

function resample(points: Point[], step: number): Point[] {
  const out: Point[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const [a, b] = [points[i - 1], points[i]];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
    }
  }
  return out;
}

/** A hand does not hold a ruler: a slow wander across the line, and straight strokes run slightly past their ends. */
function pencilPath(points: Point[], random: () => number, amplitude: number): string {
  const total = length(points);
  const first = points[0];
  const last = points[points.length - 1];
  const straight = Math.hypot(last.x - first.x, last.y - first.y) > total * 0.97 && total > 30;
  const pts = points.map((p) => ({ x: p.x, y: p.y }));
  if (straight) {
    const [dx, dy] = [(last.x - first.x) / total, (last.y - first.y) / total];
    const [a, b] = [2 + random() * 7, 2 + random() * 7];
    pts[0] = { x: first.x - dx * a, y: first.y - dy * a };
    pts[pts.length - 1] = { x: last.x + dx * b, y: last.y + dy * b };
  }
  const [p1, p2] = [random() * 6.28, random() * 6.28];
  let travelled = 0;
  const moved = pts.map((p, i) => {
    if (i > 0) travelled += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y);
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    const [tx, ty] = [next.x - prev.x, next.y - prev.y];
    const l = Math.hypot(tx, ty) || 1;
    const w = amplitude * (Math.sin(travelled * 0.014 + p1) + 0.45 * Math.sin(travelled * 0.041 + p2));
    return { x: p.x - (ty / l) * w, y: p.y + (tx / l) * w };
  });
  const f = (v: number) => v.toFixed(1);
  let d = `M${f(moved[0].x)} ${f(moved[0].y)}`;
  for (let i = 1; i < moved.length - 1; i++) {
    d += `Q${f(moved[i].x)} ${f(moved[i].y)} ${f((moved[i].x + moved[i + 1].x) / 2)} ${f((moved[i].y + moved[i + 1].y) / 2)}`;
  }
  const end = moved[moved.length - 1];
  return `${d}L${f(end.x)} ${f(end.y)}`;
}

export function traceSketch(bp: DesignBlueprint): SketchPath[] {
  const bounds = designBounds(bp.components);
  const center: V3 = [(bounds.min.x + bounds.max.x) / 2, (bounds.min.y + bounds.max.y) / 2, (bounds.min.z + bounds.max.z) / 2];
  const size = Math.max(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y, bounds.max.z - bounds.min.z, 1);
  const scale = SCENE_SIZE / size;
  // Blueprint space is Z up, the scene is Y up, and the viewport centres the design at y = 1.
  const toScene = (x: number, y: number, z: number): V3 => [(x - center[0]) * scale, (z - center[2]) * scale + 1, -(y - center[1]) * scale];

  const depth = new DepthBuffer();
  const parts = [...bp.components].sort((a, b) => a.position.z - b.position.z).map((c) => {
    const mesh = worldMesh(c);
    const verts: V3[] = [];
    for (let i = 0; i < mesh.positions.length; i += 3) verts.push(toScene(mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2]));
    return { verts, projected: verts.map(project), indices: mesh.indices };
  });

  const runs: { part: number; points: Point[] }[] = [];
  parts.forEach(({ verts, projected, indices }, part) => {
    const normals: V3[] = [];
    const front: boolean[] = [];
    const edges = new Map<string, { a: number; b: number; faces: number[] }>();
    for (let i = 0; i < indices.length; i += 3) {
      const [a, b, c] = [indices[i], indices[i + 1], indices[i + 2]];
      const normal = unit(cross(sub(verts[b], verts[a]), sub(verts[c], verts[a])));
      const face = normals.length;
      normals.push(normal);
      const facing = dot(normal, sub(CAMERA, verts[a])) > 0;
      front.push(facing);
      if (facing) depth.triangle(projected[a], projected[b], projected[c]);
      for (const [p, q] of [[a, b], [b, c], [c, a]]) {
        const key = p < q ? `${p}:${q}` : `${q}:${p}`;
        const edge = edges.get(key);
        if (edge) edge.faces.push(face);
        else edges.set(key, { a: p, b: q, faces: [face] });
      }
    }
    const kept: [number, number][] = [];
    for (const { a, b, faces } of edges.values()) {
      if (faces.length !== 2) continue;
      const [f, g] = faces;
      if (!front[f] && !front[g]) continue;
      if (front[f] !== front[g] || dot(normals[f], normals[g]) < CREASE_COS) kept.push([a, b]);
    }
    for (const run of chainEdges(kept)) {
      const points = run.map((v) => ({ x: projected[v].u * SKETCH_HALF_HEIGHT, y: -projected[v].v * SKETCH_HALF_HEIGHT, z: projected[v].z }));
      for (const piece of splitAtCorners(points)) runs.push({ part, points: piece });
    }
  });

  const pieces: { part: number; points: Point[] }[] = [];
  for (const { part, points } of runs) {
    let current: Point[] = [];
    for (const p of resample(points, 14)) {
      if (depth.visible(p.x / SKETCH_HALF_HEIGHT, -p.y / SKETCH_HALF_HEIGHT, p.z)) current.push(p);
      else {
        if (current.length > 1) pieces.push({ part, points: current });
        current = [];
      }
    }
    if (current.length > 1) pieces.push({ part, points: current });
  }

  const random = seeded(bp.name.length * 7919 + bp.components.length);
  const last = Math.max(1, parts.length - 1);
  const paths: SketchPath[] = [];
  for (const { part, points } of pieces) {
    const total = length(points);
    if (total < 7) continue;
    const coarse = resample([points[0], ...points.filter((_, i) => i % 2 === 0), points[points.length - 1]], 28);
    const order = part / last;
    paths.push({ d: pencilPath(coarse, random, 1.5), order, light: false });
    if (total > 70) paths.push({ d: pencilPath(coarse, random, 2.6), order, light: true });
  }
  return paths;
}
