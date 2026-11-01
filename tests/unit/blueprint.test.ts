/** Blueprint validation, geometry and edits, across every demo scenario plus the pet and circuit conversions. */
import { describe, expect, it } from 'vitest';
import { DEFAULT_PET, type PetSpec } from '../../shared/creations';
import { scaleBlueprint } from '../../shared/blueprint/edit';
import { circuitToBlueprint, petToBlueprint } from '../../shared/blueprint/fromCreation';
import { clipPhase, clipPose, meshBounds, meshVolume, primitiveMesh, type Mesh, worldMesh } from '../../shared/blueprint/geometry';
import { part } from '../../shared/blueprint/build';
import { DESIGN_TEMPLATES } from '../../shared/blueprint/templates';
import { PRIMITIVES, type DesignBlueprint } from '../../shared/blueprint/types';
import { validateBlueprint } from '../../shared/blueprint/validate';
import { exampleCircuit } from '../../shared/blueprint/examples';

function valid(bp: unknown): DesignBlueprint {
  const r = validateBlueprint(bp);
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.blueprint;
}

const scenarios: [string, () => DesignBlueprint][] = [
  ...DESIGN_TEMPLATES.map((t) => [t.id, t.build] as [string, () => DesignBlueprint]),
  ['pet', () => petToBlueprint(DEFAULT_PET)],
  ['circuit', () => circuitToBlueprint(exampleCircuit())],
];

/** Closed and consistently oriented: each directed edge appears once and its reverse once. */
function openEdges(m: Mesh): number {
  const edges = new Map<string, number>();
  const add = (a: number, b: number) => edges.set(`${a}>${b}`, (edges.get(`${a}>${b}`) ?? 0) + 1);
  for (let i = 0; i < m.indices.length; i += 3) {
    const [a, b, c] = [m.indices[i], m.indices[i + 1], m.indices[i + 2]];
    add(a, b);
    add(b, c);
    add(c, a);
  }
  let bad = 0;
  for (const [key, count] of edges) {
    const [a, b] = key.split('>');
    if (count !== 1 || edges.get(`${b}>${a}`) !== 1) bad++;
  }
  return bad;
}

describe('demo scenarios', () => {
  it.each(scenarios)('%s passes validation with no warnings about floating parts', (_name, build) => {
    const r = validateBlueprint(build());
    if (!r.ok) throw new Error(r.errors.join('; '));
    expect(r.warnings.filter((w) => w.includes('does not touch'))).toEqual([]);
    expect(r.blueprint.dimensions.width).toBeGreaterThan(0);
  });

  it('real-world sizes hold', () => {
    const size = (id: string) => valid(DESIGN_TEMPLATES.find((t) => t.id === id)?.build()).dimensions;
    expect(size('bedside_table').height).toBeGreaterThan(440);
    expect(size('bedside_table').height).toBeLessThan(520);
    expect(size('electronics_case').width).toBeGreaterThan(85);
    expect(size('electronics_case').depth).toBeGreaterThan(56);
    expect(size('desk_organiser').width).toBe(240);
  });

  it('every pet option converts to a valid blueprint', () => {
    for (const bodyShape of ['round', 'oval', 'bean', 'blob', 'tall'] as const) {
      for (const ears of ['none', 'pointy', 'round', 'floppy', 'antenna'] as const) {
        for (const legs of [0, 2, 4] as const) {
          const pet: PetSpec = { ...DEFAULT_PET, bodyShape, ears, legs, eyeCount: 3, extras: ['wings', 'horn', 'spots', 'hat', 'whiskers'] };
          expect(validateBlueprint(petToBlueprint(pet)).ok, `${bodyShape}/${ears}/${legs}`).toBe(true);
        }
      }
    }
  });
});

describe('circuits and pets inside the Blueprint', () => {
  it('keep their spec on the design', () => {
    expect(valid(circuitToBlueprint(exampleCircuit())).circuit?.components).toHaveLength(4);
    expect(valid(petToBlueprint(DEFAULT_PET)).pet?.name).toBe('Pixel');
    expect(valid(DESIGN_TEMPLATES[0].build()).circuit).toBeNull();
  });
  it('are built-in examples like any other design', () => {
    expect(valid(DESIGN_TEMPLATES.find((t) => t.id === 'led_circuit')!.build()).circuit).not.toBeNull();
    expect(valid(DESIGN_TEMPLATES.find((t) => t.id === 'pixel_pet')!.build()).pet).not.toBeNull();
  });
  it('rejects a circuit wire to nowhere, and a design that is both', () => {
    const bad = circuitToBlueprint(exampleCircuit());
    bad.circuit!.wires[0].to = 'ghost';
    const r = validateBlueprint(bad);
    expect(!r.ok && r.errors.join()).toContain('missing component');
    expect(validateBlueprint({ ...circuitToBlueprint(exampleCircuit()), pet: DEFAULT_PET }).ok).toBe(false);
  });
  it('a recoloured or renamed pet stays in step with its live view', () => {
    const bp = valid(petToBlueprint(DEFAULT_PET));
    const edited = valid({ ...bp, name: 'Nova', materials: bp.materials.map((m) => (m.id === 'body' ? { ...m, color: '#112233' } : m)) });
    expect(edited.pet).toMatchObject({ name: 'Nova', bodyColor: '#112233' });
  });
  it('older Blueprint files without these fields still open', () => {
    const { circuit: _c, pet: _p, ...old } = valid(DESIGN_TEMPLATES[0].build());
    expect(valid(old as DesignBlueprint).circuit).toBeNull();
  });
});

describe('validation', () => {
  const base = () => valid(DESIGN_TEMPLATES[0].build());
  const errorsOf = (bp: unknown) => {
    const r = validateBlueprint(bp);
    return r.ok ? [] : r.errors;
  };

  it('rejects non-objects and missing fields', () => {
    expect(validateBlueprint(null).ok).toBe(false);
    expect(validateBlueprint({ name: 'x' }).ok).toBe(false);
  });
  it('rejects a missing material reference', () => {
    const bp = base();
    bp.components[0].materialId = 'nope';
    expect(errorsOf(bp).join()).toContain('missing material');
  });
  it('rejects duplicate component ids', () => {
    const bp = base();
    bp.components[1].id = bp.components[0].id;
    expect(errorsOf(bp).join()).toContain('used twice');
  });
  it('rejects a relationship or animation that points nowhere', () => {
    const a = base();
    a.relationships[0].to = 'ghost';
    expect(errorsOf(a).join()).toContain('missing component');
    const b = base();
    b.animations[0].tracks[0].componentId = 'ghost';
    expect(errorsOf(b).join()).toContain('missing component');
  });
  it('rejects a primitive without its parameters', () => {
    const bp = base();
    bp.components[0].params.width = null;
    expect(errorsOf(bp).join()).toContain('needs width');
  });
  it('rejects walls that leave no cavity, and impossible values', () => {
    const bp = base();
    bp.components[0] = part('tub', 'Tub', '', 'hollowBox', { width: 10, depth: 10, height: 10, wall: 6 }, [0, 0, 0], bp.materials[0].id);
    expect(errorsOf(bp).join()).toContain('no cavity');
    const huge = base();
    huge.components[0].params.width = 99999;
    expect(validateBlueprint(huge).ok).toBe(false);
    const nan = base();
    nan.components[0].position.x = Number.NaN;
    expect(validateBlueprint(nan).ok).toBe(false);
  });
  it('rejects ids that could inject into generated source', () => {
    const bp = base();
    bp.components[0].id = 'x; import("evil.scad");';
    expect(validateBlueprint(bp).ok).toBe(false);
  });
  it('recomputes dimensions from the geometry instead of trusting the input', () => {
    const bp = base();
    bp.dimensions = { width: 1, depth: 1, height: 1 };
    expect(valid(bp).dimensions.width).toBe(240);
  });
  it('warns about floating parts and thin walls without rejecting', () => {
    const bp = base();
    bp.components.push(part('stray', 'Stray block', '', 'box', { width: 10, depth: 10, height: 10 }, [1000, 0, 0], bp.materials[0].id));
    bp.components.push(part('thin', 'Thin cup', '', 'hollowCylinder', { radius: 20, height: 20, wall: 0.6 }, [0, 0, 6], bp.materials[0].id));
    const r = validateBlueprint(bp);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings.join()).toMatch(/Stray block.*does not touch.*Thin cup.*thin/);
  });
});

describe('geometry', () => {
  const samples: Record<(typeof PRIMITIVES)[number], Parameters<typeof part>[4]> = {
    box: { width: 30, depth: 20, height: 10 },
    hollowBox: { width: 30, depth: 20, height: 10, wall: 2 },
    cylinder: { radius: 10, height: 20 },
    cone: { radius: 10, radiusTop: 4, height: 20 },
    sphere: { radius: 10 },
    ellipsoid: { width: 30, depth: 20, height: 10 },
    hollowCylinder: { radius: 10, height: 20, wall: 2 },
    outline: { depth: 5, points: [{ x: -10, z: 0 }, { x: 10, z: 0 }, { x: 14, z: 12 }, { x: 0, z: 6 }, { x: -14, z: 12 }] },
    stroke: { depth: 3, wall: 2, points: [{ x: -12, z: 8 }, { x: -6, z: 0 }, { x: 0, z: 6 }, { x: 6, z: 0 }, { x: 12, z: 8 }] },
  };

  it.each(PRIMITIVES)('%s is closed and faces outward', (primitive) => {
    const m = primitiveMesh(part('p', 'P', '', primitive, samples[primitive], [0, 0, 0], 'm'));
    expect(openEdges(m)).toBe(0);
    expect(meshVolume(m)).toBeGreaterThan(0);
  });

  it('a pointed cone and a drained cup are closed too', () => {
    expect(openEdges(primitiveMesh(part('p', 'P', '', 'cone', { radius: 10, radiusTop: 0, height: 20 }, [0, 0, 0], 'm')))).toBe(0);
    const drained = primitiveMesh(part('p', 'P', '', 'hollowCylinder', { radius: 10, height: 20, wall: 2, holeRadius: 3 }, [0, 0, 0], 'm'));
    expect(openEdges(drained)).toBe(0);
    expect(meshVolume(drained)).toBeGreaterThan(0);
  });

  it('volumes match the formulas', () => {
    const vol = (p: (typeof PRIMITIVES)[number], params: Parameters<typeof part>[4]) => meshVolume(primitiveMesh(part('p', 'P', '', p, params, [0, 0, 0], 'm')));
    expect(vol('box', samples.box)).toBeCloseTo(6000, 3);
    expect(vol('hollowBox', samples.hollowBox)).toBeCloseTo(6000 - 26 * 16 * 8, 3);
    expect(vol('cylinder', samples.cylinder) / (Math.PI * 2000)).toBeCloseTo(1, 2);
    expect(vol('sphere', samples.sphere) / ((4 / 3) * Math.PI * 1000)).toBeCloseTo(1, 1);
  });

  it('applies rotation and position: a box stood on end moves its bounds', () => {
    const b = meshBounds(worldMesh(part('p', 'P', '', 'box', { width: 100, depth: 10, height: 10 }, [5, 0, 0], 'm', [0, 90, 0])));
    expect(b.max.z - b.min.z).toBeCloseTo(100, 3);
    expect(b.max.x - b.min.x).toBeCloseTo(10, 3);
  });

  it('clips play there and back', () => {
    const clip = { name: 'c', durationSeconds: 4, tracks: [{ componentId: 'a', property: 'translate' as const, axis: 'z' as const, from: 0, to: 40 }] };
    expect(clipPose(clip, 'a', clipPhase(clip, 0)).translate.z).toBe(0);
    expect(clipPose(clip, 'a', clipPhase(clip, 2)).translate.z).toBeCloseTo(40);
    expect(clipPose(clip, 'b', clipPhase(clip, 2)).translate.z).toBe(0);
  });
});

describe('traced shapes', () => {
  const body = () => part('body', 'Square body', '', 'outline', { depth: 30, points: [{ x: -30, z: 0 }, { x: 30, z: 0 }, { x: 30, z: 60 }, { x: -30, z: 60 }] }, [0, 0, 0], 'm');
  const withParts = (...components: ReturnType<typeof part>[]) => ({ ...valid(DESIGN_TEMPLATES[0].build()), materials: [{ id: 'm', name: 'M', color: '#112233', roughness: 0.5, metalness: 0 }], components, relationships: [], animations: [] });

  it('an outline keeps the drawn proportions, wound either way round', () => {
    const b = meshBounds(primitiveMesh(body()));
    expect(b.max.x - b.min.x).toBe(60);
    expect(b.max.z - b.min.z).toBe(60);
    const flipped = part('b', 'B', '', 'outline', { depth: 30, points: [{ x: -30, z: 60 }, { x: 30, z: 60 }, { x: 30, z: 0 }, { x: -30, z: 0 }] }, [0, 0, 0], 'm');
    expect(meshVolume(primitiveMesh(flipped))).toBeCloseTo(108000, 3);
  });
  it('a stroke follows the drawn line, like a W shaped mouth', () => {
    const w = part('mouth', 'Mouth', '', 'stroke', { depth: 3, wall: 2, points: [{ x: -12, z: 8 }, { x: -6, z: 0 }, { x: 0, z: 6 }, { x: 6, z: 0 }, { x: 12, z: 8 }] }, [0, -16, 25], 'm');
    const b = meshBounds(worldMesh(w));
    expect(b.max.x - b.min.x).toBeGreaterThan(24);
    expect(valid(withParts(body(), w)).components).toHaveLength(2);
  });
  it('rejects an outline that crosses itself or has too few points', () => {
    const crossed = part('x', 'X', '', 'outline', { depth: 5, points: [{ x: 0, z: 0 }, { x: 10, z: 10 }, { x: 10, z: 0 }, { x: 0, z: 10 }] }, [0, 0, 0], 'm');
    const r = validateBlueprint(withParts(crossed));
    expect(!r.ok && r.errors.join()).toMatch(/crosses itself|no area/);
    const short = part('y', 'Y', '', 'outline', { depth: 5, points: [{ x: 0, z: 0 }, { x: 10, z: 10 }] }, [0, 0, 0], 'm');
    expect(validateBlueprint(withParts(short)).ok).toBe(false);
  });
  it('resizing moves the traced points', () => {
    const scaled = scaleBlueprint(valid(withParts(body())), 2, 1, 1);
    expect(scaled.components[0].params.points?.[1].x).toBe(60);
  });
});

describe('scaling', () => {
  it('resizes the design but keeps wall thickness', () => {
    const before = valid(DESIGN_TEMPLATES[0].build());
    const after = valid(scaleBlueprint(before, 1.5, 1, 1));
    expect(after.dimensions.width).toBeCloseTo(360, 1);
    expect(after.dimensions.height).toBe(before.dimensions.height);
    const wall = (bp: DesignBlueprint) => bp.components.find((c) => c.id === 'pen_bin')?.params.wall;
    expect(wall(after)).toBe(wall(before));
  });
});
