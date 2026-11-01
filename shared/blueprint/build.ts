/** Small helpers for writing Blueprints in code. */
import {
  BLUEPRINT_VERSION, NO_PARAMS, type BlueprintComponent, type BlueprintMaterial, type ComponentParams, type DesignBlueprint, type PrimitiveType,
} from './types';

export const material = (id: string, name: string, color: string, roughness = 0.7, metalness = 0): BlueprintMaterial => ({ id, name, color, roughness, metalness });

export function part(
  id: string,
  name: string,
  purpose: string,
  primitive: PrimitiveType,
  params: Partial<ComponentParams>,
  position: [number, number, number],
  materialId: string,
  rotation: [number, number, number] = [0, 0, 0],
): BlueprintComponent {
  return {
    id, name, purpose, primitive, materialId,
    params: { ...NO_PARAMS, ...params },
    position: { x: position[0], y: position[1], z: position[2] },
    rotation: { x: rotation[0], y: rotation[1], z: rotation[2] },
  };
}

type Draft = Omit<DesignBlueprint, 'version' | 'units' | 'dimensions' | 'interaction' | 'assumptions' | 'circuit' | 'pet' | 'customModel'>
  & Partial<Pick<DesignBlueprint, 'interaction' | 'assumptions' | 'circuit' | 'pet' | 'customModel'>>;

/** Fills the fixed fields. Dimensions are placeholders until validateBlueprint computes them from the geometry. */
export const draft = (d: Draft): DesignBlueprint => ({
  version: BLUEPRINT_VERSION,
  units: 'mm',
  dimensions: { width: 1, depth: 1, height: 1 },
  interaction: { turntable: true, explodedView: true },
  assumptions: [],
  circuit: null,
  pet: null,
  customModel: false,
  ...d,
});
