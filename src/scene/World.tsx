/** "Paper Theatre" 3D world: a paper stage showing the current creation (pet or circuit). */
import { ContactShadows } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { PublicState } from '../../shared/types';
import { DEFAULT_PET } from '../../shared/creations';
import { PALETTE } from '../theme';
import { CameraRig } from './CameraRig';
import { CircuitBoard } from './CircuitBoard';
import { SceneCtx, type SceneCtxValue } from './context';
import { getCircuitResult, getCreation, getPetState } from './creation';
import { PAPER } from './layout';
import { PetModel } from './PetModel';
import { REVEAL_DONE } from './reveal';
import { Stage } from './Stage';
import type { StationId, WorldProps } from './types';

const BG = '#E9E0CF';

let webglCache: boolean | null = null;
export function hasWebGL(): boolean {
  if (webglCache != null) return webglCache;
  try {
    if (typeof document === 'undefined') return (webglCache = false);
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | null;
    webglCache = !!gl;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    webglCache = false;
  }
  return webglCache;
}

class SceneBoundary extends Component<{ fallback: ReactNode; onError: (r: string) => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: Error) {
    this.props.onError(`3D scene crashed: ${err?.message ?? 'unknown error'}`);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function describeScene(state: PublicState): string {
  const c = getCreation(state);
  if (!c) return '3D paper stage, empty: no creation built yet.';
  if (c.mode === 'pet' && c.pet) {
    const p = getPetState(state);
    return `3D paper stage with a pet named ${c.pet.name}${p ? `, currently ${p.action}` : ''}.`;
  }
  if (c.mode === 'circuit' && c.circuit) {
    const r = getCircuitResult(state);
    return `3D paper breadboard circuit with ${c.circuit.components.length} components${r ? `: ${r.message}` : ''}.`;
  }
  return '3D paper stage.';
}

function Contents({ props }: { props: WorldProps }) {
  const { state, reducedMotion } = props;
  const creation = getCreation(state);
  const clock = useThree((s) => s.clock);
  const gl = useThree((s) => s.gl);
  const revealStart = useRef(-REVEAL_DONE);
  const lastVersion = useRef<string | null>(null);
  const [hovered, setHovered] = useState<StationId | null>(null);

  const key = creation ? `${creation.mode}:${creation.version}` : null;
  if (key !== lastVersion.current) {
    lastVersion.current = key;
    revealStart.current = clock.elapsedTime;
  }

  useEffect(() => {
    gl.domElement.style.cursor = hovered ? 'pointer' : 'auto';
  }, [hovered, gl]);

  const ctx: SceneCtxValue = useMemo(
    () => ({ reducedMotion, revealStart, selected: props.selected, hovered, setHovered, select: props.onSelect }),
    [reducedMotion, props.selected, hovered, props.onSelect],
  );
  const pet = getPetState(state);
  const img = state.bean?.image;
  const imageUrl = img?.status === 'ready' && img.url ? img.url : null;

  return (
    <SceneCtx.Provider value={ctx}>
      <color attach="background" args={[BG]} />
      <fog attach="fog" args={[BG, 28, 60]} />
      <hemisphereLight args={['#FFF8EC', '#CDB892', 1.6]} />
      <directionalLight position={[-5, 11, 7]} intensity={1.7} color="#FFF4E2" />
      <Stage hasWorld={!!creation} />
      <ContactShadows position-y={PAPER.top + 0.004} scale={[13, 9]} resolution={512} blur={2.4} far={3} opacity={0.38} color="#4A3A28" />
      {creation?.mode === 'pet' && (
        <PetModel
          key={creation.version}
          spec={creation.pet ?? DEFAULT_PET}
          action={pet?.action ?? 'idle'}
          needs={pet ? { hunger: pet.hunger, happiness: pet.happiness, energy: pet.energy } : null}
          imageUrl={imageUrl}
          selectId="bean"
        />
      )}
      {creation?.mode === 'circuit' && creation.circuit && (
        <CircuitBoard key={creation.version} spec={creation.circuit} result={getCircuitResult(state)} />
      )}
      <CameraRig command={props.cameraCommand} reducedMotion={reducedMotion} focus={creation?.mode === 'pet' ? 0.6 : 1} />
    </SceneCtx.Provider>
  );
}

export function World(props: WorldProps) {
  const [failed, setFailed] = useState<string | null>(() => (hasWebGL() ? null : 'WebGL is not available in this browser.'));
  const reported = useRef(false);
  const cb = useRef(props.onWebGLUnavailable);
  cb.current = props.onWebGLUnavailable;

  const report = useCallback((reason: string) => {
    setFailed(reason);
    if (!reported.current) {
      reported.current = true;
      cb.current?.(reason);
    }
  }, []);

  useEffect(() => {
    if (failed) report(failed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div data-testid="world-canvas" className="world-root" style={{ position: 'relative', width: '100%', height: '100%' }}>
      {failed ? (
        props.fallback
      ) : (
        <SceneBoundary fallback={props.fallback} onError={report}>
          <div role="img" aria-label={describeScene(props.state)} style={{ position: 'absolute', inset: 0 }}>
            <Canvas
              flat
              dpr={[1, 2]}
              camera={{ fov: 35, near: 0.1, far: 200, position: [6, 10, 14] }}
              gl={{ antialias: true, powerPreference: 'high-performance' }}
              onCreated={({ gl }) => {
                gl.domElement.addEventListener('webglcontextlost', (e) => {
                  e.preventDefault();
                  report('WebGL context was lost.');
                });
              }}
              onPointerMissed={() => props.onSelect(null)}
              style={{ width: '100%', height: '100%', touchAction: 'none' }}
            >
              <Contents props={props} />
            </Canvas>
          </div>
        </SceneBoundary>
      )}
    </div>
  );
}

