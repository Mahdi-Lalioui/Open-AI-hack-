/**
 * Validation and normalisation. Nothing reaches a renderer or exporter without passing here:
 * shape (zod), references, physical limits, then dimensions are recomputed from the real geometry.
 */
import { z } from 'zod';
import { designBounds, meshBounds, primitiveMesh, worldMesh } from './geometry';
import { circuitSpecSchema, petSpecSchema } from './specs';
import {
  AXES, BLUEPRINT_VERSION, NO_PARAMS, PRIMITIVES, RELATIONSHIP_TYPES, REQUIRED_PARAMS,
  type BlueprintComponent, type ComponentParams, type DesignBlueprint,
} from './types';

export const LIMITS = {
  components: 80,
  materials: 16,
  relationships: 160,
  clips: 4,
  tracksPerClip: 80,
  assumptions: 12,
  pointsPerShape: 120,
  sizeMm: 3000,
  minSizeMm: 0.2,
  positionMm: 5000,
  /** Thinner walls generally fail on a hobby 3D printer. */
  printableWallMm: 1.2,
};

const id = z.string().regex(/^[a-z][a-z0-9_]{0,31}$/, 'must be lowercase letters, digits and underscores, starting with a letter');
const text = (max: number) => z.string().trim().min(1).max(max);
const num = z.number().finite();
const param = num.positive().max(LIMITS.sizeMm).nullable();
const vec = z.object({
  x: num.min(-LIMITS.positionMm).max(LIMITS.positionMm),
  y: num.min(-LIMITS.positionMm).max(LIMITS.positionMm),
  z: num.min(-LIMITS.positionMm).max(LIMITS.positionMm),
});

const blueprintSchema = z.object({
  version: z.literal(BLUEPRINT_VERSION),
  name: text(60),
  description: text(400),
  useCase: text(200),
  style: text(120),
  units: z.literal('mm'),
  dimensions: z.object({ width: num, depth: num, height: num }),
  materials: z.array(z.object({
    id,
    name: text(40),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must look like #rrggbb'),
    roughness: num.min(0).max(1),
    metalness: num.min(0).max(1),
  })).min(1).max(LIMITS.materials),
  components: z.array(z.object({
    id,
    name: text(48),
    purpose: z.string().trim().max(160),
    primitive: z.enum(PRIMITIVES),
    params: z.object({
      width: param, depth: param, height: param, radius: param,
      radiusTop: num.min(0).max(LIMITS.sizeMm).nullable(),
      wall: param,
      holeRadius: num.min(0).max(LIMITS.sizeMm).nullable(),
      points: z.array(z.object({ x: num.min(-LIMITS.positionMm).max(LIMITS.positionMm), z: num.min(-LIMITS.positionMm).max(LIMITS.positionMm) })).max(LIMITS.pointsPerShape).nullable().optional().transform((p) => p ?? null),
    }),
    position: vec,
    rotation: vec,
    materialId: id,
  })).min(1).max(LIMITS.components),
  relationships: z.array(z.object({ from: id, to: id, type: z.enum(RELATIONSHIP_TYPES) })).max(LIMITS.relationships),
  animations: z.array(z.object({
    name: text(40),
    durationSeconds: num.min(0.5).max(30),
    tracks: z.array(z.object({
      componentId: id,
      property: z.enum(['translate', 'rotate']),
      axis: z.enum(AXES),
      from: num.min(-LIMITS.positionMm).max(LIMITS.positionMm),
      to: num.min(-LIMITS.positionMm).max(LIMITS.positionMm),
    })).min(1).max(LIMITS.tracksPerClip),
  })).max(LIMITS.clips),
  interaction: z.object({ turntable: z.boolean(), explodedView: z.boolean() }),
  assumptions: z.array(z.string().trim().min(1).max(200)).max(LIMITS.assumptions),
  circuit: circuitSpecSchema.nullable().optional().transform((v) => v ?? null),
  pet: petSpecSchema.nullable().optional().transform((v) => v ?? null),
  customModel: z.boolean().optional().transform((v) => v ?? false),
});

export type ValidationResult =
  | { ok: true; blueprint: DesignBlueprint; warnings: string[] }
  | { ok: false; errors: string[] };

const round = (v: number) => Math.round(v * 100) / 100;
const roundVec = (v: { x: number; y: number; z: number }) => ({ x: round(v.x), y: round(v.y), z: round(v.z) });

function normaliseParams(c: { primitive: BlueprintComponent['primitive']; params: ComponentParams }): ComponentParams {
  const out: ComponentParams = { ...NO_PARAMS };
  for (const key of REQUIRED_PARAMS[c.primitive]) {
    if (key === 'points') out.points = (c.params.points ?? []).map((p) => ({ x: round(p.x), z: round(p.z) }));
    else out[key] = round(c.params[key] as number);
  }
  if (c.primitive === 'hollowCylinder' && c.params.holeRadius) out.holeRadius = round(c.params.holeRadius);
  return out;
}

function checkComponent(c: BlueprintComponent, errors: string[]) {
  const where = `Component "${c.id}" (${c.primitive})`;
  const p = c.params;
  for (const key of REQUIRED_PARAMS[c.primitive]) {
    if (p[key] === null) {
      errors.push(`${where} needs ${key}.`);
      return;
    }
  }
  for (const key of REQUIRED_PARAMS[c.primitive]) {
    if (key !== 'radiusTop' && key !== 'points' && (p[key] as number) < LIMITS.minSizeMm) errors.push(`${where}: ${key} is below ${LIMITS.minSizeMm} mm.`);
  }
  if (c.primitive === 'outline' || c.primitive === 'stroke') {
    const needed = c.primitive === 'outline' ? 3 : 2;
    if ((p.points?.length ?? 0) < needed) {
      errors.push(`${where} needs at least ${needed} points.`);
      return;
    }
    try {
      const mesh = primitiveMesh(c);
      if (!mesh.indices.length) errors.push(`${where} has no visible shape.`);
    } catch (err) {
      errors.push(`${where}: ${(err as Error).message}.`);
    }
  }
  if (c.primitive === 'hollowBox') {
    const inner = Math.min(p.width as number, p.depth as number);
    if ((p.wall as number) * 2 >= inner) errors.push(`${where}: walls of ${p.wall} mm leave no cavity in ${inner} mm.`);
    if ((p.wall as number) >= (p.height as number)) errors.push(`${where}: wall ${p.wall} mm is not less than height ${p.height} mm.`);
  }
  if (c.primitive === 'hollowCylinder') {
    if ((p.wall as number) >= (p.radius as number)) errors.push(`${where}: wall ${p.wall} mm leaves no cavity in radius ${p.radius} mm.`);
    if ((p.wall as number) >= (p.height as number)) errors.push(`${where}: wall ${p.wall} mm is not less than height ${p.height} mm.`);
    if (p.holeRadius && p.holeRadius >= (p.radius as number) - (p.wall as number)) errors.push(`${where}: hole is wider than the cavity.`);
  }
}

/** Parts that touch nothing would fall off a real object, so they are flagged rather than rejected. */
function floatingParts(components: BlueprintComponent[]): string[] {
  if (components.length < 2) return [];
  const TOLERANCE = 0.5;
  const boxes = components.map((c) => meshBounds(worldMesh(c)));
  const touching = (i: number, j: number) => (['x', 'y', 'z'] as const).every(
    (k) => boxes[i].min[k] <= boxes[j].max[k] + TOLERANCE && boxes[j].min[k] <= boxes[i].max[k] + TOLERANCE,
  );
  const seen = new Set([0]);
  const queue = [0];
  while (queue.length) {
    const i = queue.pop() as number;
    for (let j = 0; j < components.length; j++) {
      if (!seen.has(j) && touching(i, j)) {
        seen.add(j);
        queue.push(j);
      }
    }
  }
  return components.filter((_, i) => !seen.has(i)).map((c) => c.name);
}

function duplicates(ids: string[]): string[] {
  return [...new Set(ids.filter((v, i) => ids.indexOf(v) !== i))];
}

export function validateBlueprint(input: unknown): ValidationResult {
  const parsed = blueprintSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.slice(0, 12).map((i) => `${i.path.join('.') || 'blueprint'}: ${i.message}`) };
  }
  const raw = parsed.data as DesignBlueprint;
  const errors: string[] = [];

  const materialIds = new Set(raw.materials.map((m) => m.id));
  const componentIds = new Set(raw.components.map((c) => c.id));
  for (const d of duplicates(raw.materials.map((m) => m.id))) errors.push(`Material id "${d}" is used twice.`);
  for (const d of duplicates(raw.components.map((c) => c.id))) errors.push(`Component id "${d}" is used twice.`);
  for (const c of raw.components) {
    if (!materialIds.has(c.materialId)) errors.push(`Component "${c.id}" uses missing material "${c.materialId}".`);
    checkComponent(c, errors);
  }
  for (const r of raw.relationships) {
    if (!componentIds.has(r.from) || !componentIds.has(r.to)) errors.push(`Relationship ${r.from} -> ${r.to} points to a missing component.`);
  }
  for (const clip of raw.animations) {
    for (const t of clip.tracks) {
      if (!componentIds.has(t.componentId)) errors.push(`Animation "${clip.name}" targets missing component "${t.componentId}".`);
    }
  }
  if (raw.circuit && raw.pet) errors.push('A design cannot be both a circuit and a pet.');
  if (raw.circuit) {
    const ids = raw.circuit.components.map((c) => c.id);
    for (const d of duplicates(ids)) errors.push(`Circuit component id "${d}" is used twice.`);
    for (const w of raw.circuit.wires) {
      if (!ids.includes(w.from) || !ids.includes(w.to)) errors.push(`Circuit wire ${w.from} -> ${w.to} points to a missing component.`);
    }
  }
  if (errors.length) return { ok: false, errors: errors.slice(0, 12) };

  const components = raw.components.map((c) => ({
    ...c,
    params: normaliseParams(c),
    position: roundVec(c.position),
    rotation: roundVec(c.rotation),
  }));
  const bounds = designBounds(components);
  const dimensions = {
    width: round(bounds.max.x - bounds.min.x),
    depth: round(bounds.max.y - bounds.min.y),
    height: round(bounds.max.z - bounds.min.z),
  };
  if (Math.max(dimensions.width, dimensions.depth, dimensions.height) > LIMITS.sizeMm) {
    return { ok: false, errors: [`The design is larger than the ${LIMITS.sizeMm} mm limit.`] };
  }

  const warnings: string[] = [];
  for (const name of floatingParts(components)) warnings.push(`"${name}" does not touch the rest of the design.`);
  for (const c of components) {
    if (c.params.wall !== null && c.params.wall < LIMITS.printableWallMm) {
      warnings.push(`"${c.name}" has ${c.params.wall} mm walls, thin for a 3D printer (${LIMITS.printableWallMm} mm or more is safer).`);
    }
  }
  if (bounds.min.z < -0.5) warnings.push('Part of the design sits below the ground plane (Z = 0).');

  const materials = raw.materials.map((m) => ({ ...m, color: m.color.toUpperCase() }));
  const colorOf = (id: string, fallback: string) => materials.find((m) => m.id === id)?.color ?? fallback;
  const blueprint: DesignBlueprint = {
    ...raw,
    dimensions,
    components,
    materials,
    relationships: raw.relationships,
    // A renamed or recoloured character stays the same character in the live view.
    pet: raw.pet && {
      ...raw.pet,
      name: raw.name.slice(0, 20).trim() || raw.pet.name,
      bodyColor: colorOf('body', raw.pet.bodyColor),
      accentColor: colorOf('accent', raw.pet.accentColor),
    },
  };
  return { ok: true, blueprint, warnings };
}
