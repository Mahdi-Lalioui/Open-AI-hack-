/** TEMPORARY STUB — the 3D agent replaces this. Keep: export function World(props: WorldProps). */
import type { WorldProps } from './types';

export function World(props: WorldProps) {
  return <div data-testid="world-canvas">{props.fallback}</div>;
}
