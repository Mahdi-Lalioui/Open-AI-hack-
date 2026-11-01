/**
 * Deterministic geometry from a Blueprint. No three.js and no DOM, so the 3D viewport and every
 * exporter draw the same triangles. Meshes are welded and closed: each edge is shared by exactly two faces.
 */
import type { AnimationClip, BlueprintComponent, DesignBlueprint, Vec3 } from './types';

export const CURVE_SEGMENTS = 48;
const SPHERE_RINGS = 24;
const CREASE_COS = Math.cos((35 * Math.PI) / 180);

export interface Mesh {
  positions: number[]; // x,y,z per vertex
  indices: number[]; // 3 per triangle, counter-clockwise from outside
}

/** Unindexed triangles with per-corner normals, ready for GPUs and glTF. */
export interface RenderMesh {
  positions: Float32Array;
  normals: Float32Array;
}

const n = (v: number | null) => v ?? 0;

/** Revolves a closed (r, z) outline around Z. r = 0 points become a single pole vertex. */
function lathe(profile: [number, number][], closedLoop = false): Mesh {
  const positions: number[] = [];
  const indices: number[] = [];
  const ids = profile.map(([r, z]) => {
    const first = positions.length / 3;
    if (r === 0) {
      positions.push(0, 0, z);
      return first;
    }
    for (let j = 0; j < CURVE_SEGMENTS; j++) {
      const a = (j / CURVE_SEGMENTS) * Math.PI * 2;
      positions.push(r * Math.cos(a), r * Math.sin(a), z);
    }
    return first;
  });
  const at = (i: number, j: number) => (profile[i][0] === 0 ? ids[i] : ids[i] + (j % CURVE_SEGMENTS));
  const spans = closedLoop ? profile.length : profile.length - 1;
  for (let k = 0; k < spans; k++) {
    const i = k;
    const next = (k + 1) % profile.length;
    for (let j = 0; j < CURVE_SEGMENTS; j++) {
      const a = at(i, j);
      const b = at(i, j + 1);
      const c = at(next, j + 1);
      const d = at(next, j);
      if (profile[next][0] !== 0) indices.push(a, c, d);
      if (profile[i][0] !== 0) indices.push(a, b, c);
    }
  }
  return { positions, indices };
}

function boxCorners(w: number, d: number, z: number): number[] {
  const x = w / 2;
  const y = d / 2;
  return [-x, -y, z, x, -y, z, x, y, z, -x, y, z];
}

function boxMesh(w: number, d: number, h: number): Mesh {
  const positions = [...boxCorners(w, d, 0), ...boxCorners(w, d, h)];
  const indices: number[] = [];
  const quad = (a: number, b: number, c: number, e: number) => indices.push(a, b, c, a, c, e);
  quad(3, 2, 1, 0);
  quad(4, 5, 6, 7);
  for (let k = 0; k < 4; k++) quad(k, (k + 1) % 4, 4 + ((k + 1) % 4), 4 + k);
  return { positions, indices };
}

/** Open-top box with a floor as thick as the wall. */
function hollowBoxMesh(w: number, d: number, h: number, t: number): Mesh {
  const positions = [
    ...boxCorners(w, d, 0),
    ...boxCorners(w, d, h),
    ...boxCorners(w - 2 * t, d - 2 * t, h),
    ...boxCorners(w - 2 * t, d - 2 * t, t),
  ];
  const indices: number[] = [];
  const quad = (a: number, b: number, c: number, e: number) => indices.push(a, b, c, a, c, e);
  quad(3, 2, 1, 0);
  quad(12, 13, 14, 15);
  for (let k = 0; k < 4; k++) {
    const m = (k + 1) % 4;
    quad(k, m, 4 + m, 4 + k);
    quad(4 + k, 4 + m, 8 + m, 8 + k);
    quad(8 + k, 8 + m, 12 + m, 12 + k);
  }
  return { positions, indices };
}

/** Ear clipping for a simple polygon. Throws if the outline crosses itself. */
export function triangulate(points: { x: number; z: number }[]): number[] {
  const indices: number[] = [];
  const remaining = points.map((_, i) => i);
  const cross = (a: number, b: number, c: number) =>
    (points[b].x - points[a].x) * (points[c].z - points[a].z) - (points[b].z - points[a].z) * (points[c].x - points[a].x);
  for (let i = 0; i < points.length; i++) {
    const i2 = (i + 1) % points.length;
    for (let j = i + 1; j < points.length; j++) {
      const j2 = (j + 1) % points.length;
      if (i2 === j || j2 === i) continue;
      if (cross(i, i2, j) * cross(i, i2, j2) < 0 && cross(j, j2, i) * cross(j, j2, i2) < 0) throw new Error('outline crosses itself');
    }
  }
  let guard = points.length * points.length + 8;
  while (remaining.length > 3) {
    if (guard-- <= 0) throw new Error('outline crosses itself');
    let clipped = false;
    for (let i = 0; i < remaining.length; i++) {
      const a = remaining[(i + remaining.length - 1) % remaining.length];
      const b = remaining[i];
      const c = remaining[(i + 1) % remaining.length];
      if (cross(a, b, c) <= 1e-9) continue;
      const blocked = remaining.some((p) => p !== a && p !== b && p !== c
        && cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0);
      if (blocked) continue;
      indices.push(a, b, c);
      remaining.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) throw new Error('outline crosses itself');
  }
  if (cross(remaining[0], remaining[1], remaining[2]) <= 1e-9) throw new Error('outline has no area');
  indices.push(remaining[0], remaining[1], remaining[2]);
  return indices;
}

/** Counter-clockwise when seen from the front, with repeated points removed. */
export function cleanOutline(points: { x: number; z: number }[]): { x: number; z: number }[] {
  const out = points.filter((p, i) => {
    const prev = points[(i + points.length - 1) % points.length];
    return Math.hypot(p.x - prev.x, p.z - prev.z) > 1e-6;
  });
  let area = 0;
  out.forEach((p, i) => {
    const q = out[(i + 1) % out.length];
    area += p.x * q.z - q.x * p.z;
  });
  return area < 0 ? [...out].reverse() : out;
  // triangulate() rejects shapes that cross themselves, whichever way round they were drawn.
}

/** A flat shape traced from a drawing, given thickness along Y. */
function extrudedMesh(raw: { x: number; z: number }[], thickness: number): Mesh {
  const points = cleanOutline(raw);
  const n2 = points.length;
  const positions: number[] = [];
  for (const p of points) positions.push(p.x, -thickness / 2, p.z);
  for (const p of points) positions.push(p.x, thickness / 2, p.z);
  const indices: number[] = [];
  const caps = triangulate(points);
  for (let t = 0; t < caps.length; t += 3) {
    indices.push(caps[t], caps[t + 1], caps[t + 2]);
    indices.push(caps[t + 2] + n2, caps[t + 1] + n2, caps[t] + n2);
  }
  for (let i = 0; i < n2; i++) {
    const j = (i + 1) % n2;
    indices.push(i, n2 + i, n2 + j, i, n2 + j, j);
  }
  return { positions, indices };
}

/** A drawn line: one rectangle per segment, extended past each end so corners stay closed. */
export function strokeSegments(points: { x: number; z: number }[], width: number): { x: number; z: number }[][] {
  const out: { x: number; z: number }[][] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const [a, b] = [points[i], points[i + 1]];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < 1e-6) continue;
    const [ux, uz] = [(b.x - a.x) / len, (b.z - a.z) / len];
    const [nx, nz] = [-uz * width / 2, ux * width / 2];
    const [ex, ez] = [ux * width / 2, uz * width / 2];
    out.push([
      { x: a.x - ex - nx, z: a.z - ez - nz },
      { x: b.x + ex - nx, z: b.z + ez - nz },
      { x: b.x + ex + nx, z: b.z + ez + nz },
      { x: a.x - ex + nx, z: a.z - ez + nz },
    ]);
  }
  return out;
}

function mergeMeshes(meshes: Mesh[]): Mesh {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const m of meshes) {
    const offset = positions.length / 3;
    positions.push(...m.positions);
    for (const i of m.indices) indices.push(i + offset);
  }
  return { positions, indices };
}

function sphereProfile(r: number): [number, number][] {
  const out: [number, number][] = [[0, 0]];
  for (let i = 1; i < SPHERE_RINGS; i++) {
    const a = -Math.PI / 2 + (i / SPHERE_RINGS) * Math.PI;
    out.push([r * Math.cos(a), r + r * Math.sin(a)]);
  }
  out.push([0, 2 * r]);
  return out;
}

/** Local-space mesh: centred on X/Y with its base on Z = 0. */
export function primitiveMesh(c: Pick<BlueprintComponent, 'primitive' | 'params'>): Mesh {
  const p = c.params;
  switch (c.primitive) {
    case 'box':
      return boxMesh(n(p.width), n(p.depth), n(p.height));
    case 'hollowBox':
      return hollowBoxMesh(n(p.width), n(p.depth), n(p.height), n(p.wall));
    case 'cylinder':
      return lathe([[0, 0], [n(p.radius), 0], [n(p.radius), n(p.height)], [0, n(p.height)]]);
    case 'cone':
      return lathe(n(p.radiusTop) > 0
        ? [[0, 0], [n(p.radius), 0], [n(p.radiusTop), n(p.height)], [0, n(p.height)]]
        : [[0, 0], [n(p.radius), 0], [0, n(p.height)]]);
    case 'sphere':
      return lathe(sphereProfile(n(p.radius)));
    case 'ellipsoid': {
      const m = lathe(sphereProfile(1));
      const positions = m.positions.map((v, i) => v * (i % 3 === 0 ? n(p.width) / 2 : i % 3 === 1 ? n(p.depth) / 2 : n(p.height) / 2));
      return { positions, indices: m.indices };
    }
    case 'outline':
      return extrudedMesh(p.points ?? [], n(p.depth));
    case 'stroke':
      return mergeMeshes(strokeSegments(p.points ?? [], n(p.wall)).map((s) => extrudedMesh(s, n(p.depth))));
    case 'hollowCylinder': {
      const r = n(p.radius);
      const h = n(p.height);
      const t = n(p.wall);
      const hole = n(p.holeRadius);
      return hole > 0
        ? lathe([[hole, 0], [r, 0], [r, h], [r - t, h], [r - t, t], [hole, t]], true)
        : lathe([[0, 0], [r, 0], [r, h], [r - t, h], [r - t, t], [0, t]]);
    }
  }
}

const rad = (deg: number) => (deg * Math.PI) / 180;

/** R = Rz * Ry * Rx, the same order as OpenSCAD's rotate([x, y, z]). Row-major 3x3. */
export function rotationMatrix(r: Vec3): number[] {
  const [cx, sx] = [Math.cos(rad(r.x)), Math.sin(rad(r.x))];
  const [cy, sy] = [Math.cos(rad(r.y)), Math.sin(rad(r.y))];
  const [cz, sz] = [Math.cos(rad(r.z)), Math.sin(rad(r.z))];
  return [
    cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx,
    sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx,
    -sy, cy * sx, cy * cx,
  ];
}

/** Unit quaternion [x, y, z, w] for the same rotation. */
export function rotationQuaternion(r: Vec3): [number, number, number, number] {
  const q = (axis: 0 | 1 | 2, deg: number): [number, number, number, number] => {
    const out: [number, number, number, number] = [0, 0, 0, Math.cos(rad(deg) / 2)];
    out[axis] = Math.sin(rad(deg) / 2);
    return out;
  };
  return multiplyQuaternions(multiplyQuaternions(q(2, r.z), q(1, r.y)), q(0, r.x));
}

export function multiplyQuaternions(a: [number, number, number, number], b: [number, number, number, number]): [number, number, number, number] {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

/** The component's mesh in design space (mm). */
export function worldMesh(c: BlueprintComponent): Mesh {
  const m = primitiveMesh(c);
  const R = rotationMatrix(c.rotation);
  const positions = new Array<number>(m.positions.length);
  for (let i = 0; i < m.positions.length; i += 3) {
    const [x, y, z] = [m.positions[i], m.positions[i + 1], m.positions[i + 2]];
    positions[i] = R[0] * x + R[1] * y + R[2] * z + c.position.x;
    positions[i + 1] = R[3] * x + R[4] * y + R[5] * z + c.position.y;
    positions[i + 2] = R[6] * x + R[7] * y + R[8] * z + c.position.z;
  }
  return { positions, indices: m.indices };
}

export interface Bounds { min: Vec3; max: Vec3 }

export function meshBounds(m: Mesh): Bounds {
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (let i = 0; i < m.positions.length; i += 3) {
    min.x = Math.min(min.x, m.positions[i]);
    max.x = Math.max(max.x, m.positions[i]);
    min.y = Math.min(min.y, m.positions[i + 1]);
    max.y = Math.max(max.y, m.positions[i + 1]);
    min.z = Math.min(min.z, m.positions[i + 2]);
    max.z = Math.max(max.z, m.positions[i + 2]);
  }
  return { min, max };
}

export function designBounds(components: BlueprintComponent[]): Bounds {
  const out: Bounds = { min: { x: Infinity, y: Infinity, z: Infinity }, max: { x: -Infinity, y: -Infinity, z: -Infinity } };
  for (const c of components) {
    const b = meshBounds(worldMesh(c));
    for (const k of ['x', 'y', 'z'] as const) {
      out.min[k] = Math.min(out.min[k], b.min[k]);
      out.max[k] = Math.max(out.max[k], b.max[k]);
    }
  }
  return out;
}

/** Signed volume in mm³ (positive for a closed, outward-facing mesh). */
export function meshVolume(m: Mesh): number {
  let v = 0;
  const p = m.positions;
  for (let i = 0; i < m.indices.length; i += 3) {
    const [a, b, c] = [m.indices[i] * 3, m.indices[i + 1] * 3, m.indices[i + 2] * 3];
    v += p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1])
      - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c])
      + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]);
  }
  return v / 6;
}

/** Sum of the parts' volumes. Parts that overlap are counted twice, so treat it as an upper estimate. */
export function designVolumeMm3(bp: DesignBlueprint): number {
  return bp.components.reduce((sum, c) => sum + meshVolume(primitiveMesh(c)), 0);
}

function triangleNormal(p: number[], a: number, b: number, c: number): [number, number, number] {
  const ux = p[b * 3] - p[a * 3];
  const uy = p[b * 3 + 1] - p[a * 3 + 1];
  const uz = p[b * 3 + 2] - p[a * 3 + 2];
  const vx = p[c * 3] - p[a * 3];
  const vy = p[c * 3 + 1] - p[a * 3 + 1];
  const vz = p[c * 3 + 2] - p[a * 3 + 2];
  const x = uy * vz - uz * vy;
  const y = uz * vx - ux * vz;
  const z = ux * vy - uy * vx;
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
}

/** Splits a welded mesh into render triangles: curved surfaces shade smooth, hard edges stay hard. */
export function toRenderMesh(m: Mesh): RenderMesh {
  const triCount = m.indices.length / 3;
  const faceNormals: [number, number, number][] = [];
  const atVertex = new Map<number, number[]>();
  for (let t = 0; t < triCount; t++) {
    faceNormals.push(triangleNormal(m.positions, m.indices[t * 3], m.indices[t * 3 + 1], m.indices[t * 3 + 2]));
    for (let k = 0; k < 3; k++) {
      const v = m.indices[t * 3 + k];
      const list = atVertex.get(v);
      if (list) list.push(t);
      else atVertex.set(v, [t]);
    }
  }
  const positions = new Float32Array(triCount * 9);
  const normals = new Float32Array(triCount * 9);
  for (let t = 0; t < triCount; t++) {
    const fn = faceNormals[t];
    for (let k = 0; k < 3; k++) {
      const v = m.indices[t * 3 + k];
      let [x, y, z] = [0, 0, 0];
      for (const other of atVertex.get(v) ?? []) {
        const o = faceNormals[other];
        if (o[0] * fn[0] + o[1] * fn[1] + o[2] * fn[2] >= CREASE_COS) {
          x += o[0];
          y += o[1];
          z += o[2];
        }
      }
      const len = Math.hypot(x, y, z) || 1;
      const out = t * 9 + k * 3;
      positions[out] = m.positions[v * 3];
      positions[out + 1] = m.positions[v * 3 + 1];
      positions[out + 2] = m.positions[v * 3 + 2];
      normals[out] = x / len;
      normals[out + 1] = y / len;
      normals[out + 2] = z / len;
    }
  }
  return { positions, normals };
}

/** Smooth ping-pong: 0 at the ends of the clip, 1 halfway. */
export function clipPhase(clip: AnimationClip, seconds: number): number {
  const u = ((seconds % clip.durationSeconds) + clip.durationSeconds) % clip.durationSeconds / clip.durationSeconds;
  const tri = u < 0.5 ? u * 2 : 2 - u * 2;
  return tri * tri * (3 - 2 * tri);
}

export interface ComponentPose {
  translate: Vec3; // mm offset from rest
  rotate: Vec3; // degrees added on top of rest, about the design axes
}

/** The animated offset of one component at a phase of a clip. Renderers and the GLB exporter share this. */
export function clipPose(clip: AnimationClip, componentId: string, phase: number): ComponentPose {
  const pose: ComponentPose = { translate: { x: 0, y: 0, z: 0 }, rotate: { x: 0, y: 0, z: 0 } };
  for (const t of clip.tracks) {
    if (t.componentId !== componentId) continue;
    pose[t.property][t.axis] += t.from + (t.to - t.from) * phase;
  }
  return pose;
}
