/**
 * The Design Blueprint: the single source of truth for a design.
 * AI, templates and manual edits produce it; every renderer and exporter consumes it.
 *
 * Conventions (same everywhere): millimetres, Z up, X = width, Y = depth.
 * `position` is the centre of a component's base, before `rotation` (degrees, applied X then Y then Z).
 */
import type { CircuitSpec, PetSpec } from '../creations';

export const BLUEPRINT_VERSION = 1;

export const PRIMITIVES = ['box', 'cylinder', 'cone', 'sphere', 'ellipsoid', 'hollowBox', 'hollowCylinder', 'outline', 'stroke'] as const;
export type PrimitiveType = (typeof PRIMITIVES)[number];

export const RELATIONSHIP_TYPES = ['attached_to', 'rests_on', 'inside', 'slides_in', 'hinged_to'] as const;
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

export const AXES = ['x', 'y', 'z'] as const;
export type Axis = (typeof AXES)[number];

export interface Vec3 { x: number; y: number; z: number }

/**
 * Flat on purpose: Structured Outputs requires every key, so unused parameters are null.
 * box/ellipsoid: width, depth, height. hollowBox: + wall. cylinder: radius, height.
 * cone: radius (base), radiusTop, height. sphere: radius. hollowCylinder: radius, height, wall, holeRadius (floor drain).
 */
export interface ComponentParams {
  width: number | null;
  depth: number | null;
  height: number | null;
  radius: number | null;
  radiusTop: number | null;
  wall: number | null;
  holeRadius: number | null;
  /** outline: a closed traced shape. stroke: a drawn line. Local X and Z in mm, seen from the front. */
  points: { x: number; z: number }[] | null;
}

export interface BlueprintMaterial {
  id: string;
  name: string;
  color: string; // #RRGGBB
  roughness: number; // 0..1
  metalness: number; // 0..1
}

export interface BlueprintComponent {
  id: string;
  name: string;
  purpose: string;
  primitive: PrimitiveType;
  params: ComponentParams;
  position: Vec3;
  rotation: Vec3;
  materialId: string;
}

export interface BlueprintRelationship {
  from: string;
  to: string;
  type: RelationshipType;
}

/** Offsets from the rest pose; a clip plays from -> to -> from. */
export interface AnimationTrack {
  componentId: string;
  property: 'translate' | 'rotate'; // mm or degrees
  axis: Axis;
  from: number;
  to: number;
}

export interface AnimationClip {
  name: string;
  durationSeconds: number;
  tracks: AnimationTrack[];
}

export interface BlueprintInteraction {
  turntable: boolean;
  explodedView: boolean;
}

export interface DesignBlueprint {
  version: typeof BLUEPRINT_VERSION;
  name: string;
  description: string;
  useCase: string;
  style: string;
  units: 'mm';
  /** Always recomputed from the geometry by validation. */
  dimensions: { width: number; depth: number; height: number };
  materials: BlueprintMaterial[];
  components: BlueprintComponent[];
  relationships: BlueprintRelationship[];
  animations: AnimationClip[];
  interaction: BlueprintInteraction;
  /** Things the interpreter assumed or was unsure about; shown to the user. */
  assumptions: string[];
  /** Set when the design is an electric circuit: the source for its 3D layout and its live simulation. */
  circuit: CircuitSpec | null;
  /** Set when the design is a character: the source for its 3D figure and its live behaviour. */
  pet: PetSpec | null;
  /** True when a character's look comes from its own parts (what was drawn), not from `pet`, which then only drives behaviour. */
  customModel: boolean;
}

export const NO_PARAMS: ComponentParams = {
  width: null, depth: null, height: null, radius: null, radiusTop: null, wall: null, holeRadius: null, points: null,
};

/** Which parameters each primitive needs. holeRadius is optional and validated separately. */
export const REQUIRED_PARAMS: Record<PrimitiveType, (keyof ComponentParams)[]> = {
  box: ['width', 'depth', 'height'],
  ellipsoid: ['width', 'depth', 'height'],
  hollowBox: ['width', 'depth', 'height', 'wall'],
  cylinder: ['radius', 'height'],
  cone: ['radius', 'radiusTop', 'height'],
  sphere: ['radius'],
  hollowCylinder: ['radius', 'height', 'wall'],
  outline: ['depth', 'points'],
  stroke: ['depth', 'wall', 'points'],
};
