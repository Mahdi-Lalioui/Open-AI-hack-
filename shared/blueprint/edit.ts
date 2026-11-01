/** Deterministic Blueprint edits shared by the inspector and the rule-based refiner. */
import type { BlueprintComponent, DesignBlueprint } from './types';

const scaled = (v: number | null, s: number) => (v === null ? null : v * s);

/**
 * Resizes the whole design like a real parametric change: wall thickness stays the same,
 * positions move with the new size, and round parts keep their circular section.
 */
export function scaleBlueprint(bp: DesignBlueprint, sx: number, sy: number, sz: number): DesignBlueprint {
  const round = Math.min(sx, sy);
  const uniform = Math.cbrt(sx * sy * sz);
  const components: BlueprintComponent[] = bp.components.map((c) => ({
    ...c,
    position: { x: c.position.x * sx, y: c.position.y * sy, z: c.position.z * sz },
    params: {
      width: scaled(c.params.width, sx),
      depth: scaled(c.params.depth, sy),
      height: scaled(c.params.height, sz),
      radius: scaled(c.params.radius, c.primitive === 'sphere' ? uniform : round),
      radiusTop: scaled(c.params.radiusTop, round),
      wall: c.params.wall,
      holeRadius: scaled(c.params.holeRadius, round),
      points: c.params.points && c.params.points.map((p) => ({ x: p.x * sx, z: p.z * sz })),
    },
  }));
  const factor = { x: sx, y: sy, z: sz };
  const animations = bp.animations.map((clip) => ({
    ...clip,
    tracks: clip.tracks.map((t) => (t.property === 'translate'
      ? { ...t, from: t.from * factor[t.axis], to: t.to * factor[t.axis] }
      : t)),
  }));
  return { ...bp, components, animations };
}

/** Removes parts along with everything that referred to them. */
export function removeComponents(bp: DesignBlueprint, ids: Set<string>): DesignBlueprint {
  return {
    ...bp,
    components: bp.components.filter((c) => !ids.has(c.id)),
    relationships: bp.relationships.filter((r) => !ids.has(r.from) && !ids.has(r.to)),
    animations: bp.animations
      .map((clip) => ({ ...clip, tracks: clip.tracks.filter((t) => !ids.has(t.componentId)) }))
      .filter((clip) => clip.tracks.length > 0),
  };
}
