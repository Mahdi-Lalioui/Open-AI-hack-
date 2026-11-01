/** Contract between the host UI and the 3D world. OWNER: lead. */
import type { ReactNode } from 'react';
import type { PublicState } from '../../shared/types';

/** Selectable things in the scene (also selectable from keyboard buttons outside the canvas). */
export type StationId = 'source' | 'queue' | 'service' | 'sink' | 'bean';

export type CameraCommandType = 'reset' | 'zoomIn' | 'zoomOut' | 'orbitLeft' | 'orbitRight';

/** Imperative camera nudges from buttons outside the canvas; act on each new nonce once. */
export interface CameraCommand {
  type: CameraCommandType;
  nonce: number;
}

export interface WorldProps {
  /** Latest authoritative server state. state.world may be null (show an empty paper stage). */
  state: PublicState;
  selected: StationId | null;
  onSelect: (id: StationId | null) => void;
  cameraCommand: CameraCommand | null;
  /** True when the user prefers reduced motion: skip the rise reveal, no bobbing, instant moves. */
  reducedMotion: boolean;
  /** Rendered instead of the canvas if WebGL is unavailable or the scene throws. */
  fallback: ReactNode;
  /** Called once if WebGL is unavailable / the scene crashed. */
  onWebGLUnavailable?: (reason: string) => void;
}
