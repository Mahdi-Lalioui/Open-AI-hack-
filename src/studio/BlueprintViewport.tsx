/** Interactive 3D view of a Blueprint. Geometry comes from shared/blueprint/geometry, the same as the exports. */
import { ContactShadows, Grid, OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Component, useEffect, useMemo, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import { clipPhase, clipPose, designBounds, primitiveMesh, rotationQuaternion, toRenderMesh, worldMesh, meshBounds } from '../../shared/blueprint/geometry';
import type { AnimationClip, BlueprintComponent, BlueprintMaterial, DesignBlueprint } from '../../shared/blueprint/types';
import { hasWebGL } from '../scene/World';

const REVEAL_SECONDS = 0.9;
const STAGGER_SECONDS = 0.05;
const HOME_POSITION: [number, number, number] = [3, 2.9, 4.8];
const HOME_TARGET: [number, number, number] = [0, 1, 0];

class Boundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

interface PartProps {
  component: BlueprintComponent;
  material: BlueprintMaterial | undefined;
  index: number;
  center: THREE.Vector3;
  clip: AnimationClip | null;
  explode: number;
  selected: boolean;
  reveal: boolean;
  reducedMotion: boolean;
  onSelect: (id: string) => void;
}

function Part({ component: c, material, index, center, clip, explode, selected, reveal, reducedMotion, onSelect }: PartProps) {
  const group = useRef<THREE.Group>(null);
  const started = useRef<number | null>(reveal && !reducedMotion ? null : -100);
  const shownExplode = useRef(0);
  const geometry = useMemo(() => {
    const render = toRenderMesh(primitiveMesh(c));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(render.positions, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(render.normals, 3));
    return g;
  }, [c]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const rest = useMemo(() => {
    const [x, y, z, w] = rotationQuaternion(c.rotation);
    return new THREE.Quaternion(x, y, z, w);
  }, [c.rotation]);
  const away = useMemo(() => {
    const b = meshBounds(worldMesh(c));
    return new THREE.Vector3((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2).sub(center);
  }, [c, center]);

  const scratch = useMemo(() => new THREE.Quaternion(), []);
  useFrame((state, dt) => {
    const g = group.current;
    if (!g) return;
    const now = state.clock.elapsedTime;
    if (started.current === null) started.current = now;
    const u = Math.max(0, Math.min(1, (now - started.current - index * STAGGER_SECONDS) / REVEAL_SECONDS));
    const eased = 1 - (1 - u) ** 3;
    shownExplode.current += (explode - shownExplode.current) * Math.min(1, dt * 7);
    const phase = clip ? clipPhase(clip, now) : 0;
    const pose = clip ? clipPose(clip, c.id, phase) : null;
    g.position.set(
      c.position.x + (pose?.translate.x ?? 0) + away.x * shownExplode.current * 0.6,
      c.position.y + (pose?.translate.y ?? 0) + away.y * shownExplode.current * 0.6,
      c.position.z + (pose?.translate.z ?? 0) + away.z * shownExplode.current * 0.6,
    );
    g.quaternion.copy(rest);
    if (pose) {
      const [x, y, z, w] = rotationQuaternion(pose.rotate);
      g.quaternion.premultiply(scratch.set(x, y, z, w));
    }
    const k = Math.max(0.001, eased);
    g.scale.set(k, k, k);
  });

  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > 5) return;
    onSelect(c.id);
  };

  return (
    <group ref={group}>
      <mesh geometry={geometry} castShadow onClick={click}>
        <meshStandardMaterial
          color={material?.color ?? '#999999'}
          roughness={material?.roughness ?? 0.7}
          metalness={material?.metalness ?? 0}
          emissive={selected ? '#1F8A84' : '#000000'}
          emissiveIntensity={selected ? 0.45 : 0}
        />
      </mesh>
    </group>
  );
}

interface ViewportProps {
  blueprint: DesignBlueprint;
  /** Changes when the design is new (not on small edits), which replays the build-up. */
  revealKey: string;
  selected: string | null;
  onSelect: (id: string | null) => void;
  clip: AnimationClip | null;
  explode: number;
  spin: boolean;
  resetNonce: number;
  reducedMotion: boolean;
}

function Scene({ blueprint, revealKey, selected, onSelect, clip, explode, spin, resetNonce, reducedMotion }: ViewportProps) {
  const bounds = useMemo(() => designBounds(blueprint.components), [blueprint.components]);
  const center = useMemo(() => new THREE.Vector3((bounds.min.x + bounds.max.x) / 2, (bounds.min.y + bounds.max.y) / 2, (bounds.min.z + bounds.max.z) / 2), [bounds]);
  const size = Math.max(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y, bounds.max.z - bounds.min.z, 1);
  const scale = 2.4 / size; // mm -> scene units, so lights and controls suit any object
  const materials = useMemo(() => new Map(blueprint.materials.map((m) => [m.id, m])), [blueprint.materials]);
  const controls = useRef<{ target: THREE.Vector3; update: () => void } | null>(null);
  const camera = useThree((s) => s.camera);
  const seen = useRef<string | null>(null);
  const isNew = seen.current !== revealKey;
  seen.current = revealKey;

  useEffect(() => {
    camera.position.set(...HOME_POSITION);
    controls.current?.target.set(...HOME_TARGET);
    controls.current?.update();
  }, [resetNonce, revealKey, camera]);

  return (
    <>
      <hemisphereLight args={['#ffffff', '#c9c0ad', 1.1]} />
      <directionalLight position={[3, 5, 4]} intensity={1.8} />
      <directionalLight position={[-4, 2, -3]} intensity={0.45} />
      <group position={[0, 1.0 - ((center.z - bounds.min.z) * scale), 0]}>
        {/* Blueprint space is Z up; three.js is Y up */}
        <group rotation={[-Math.PI / 2, 0, 0]} scale={scale} position={[-center.x * scale, -bounds.min.z * scale, center.y * scale]}>
          {blueprint.components.map((c, i) => (
            <Part
              key={`${revealKey}:${c.id}`}
              component={c}
              material={materials.get(c.materialId)}
              index={i}
              center={center}
              clip={clip}
              explode={explode}
              selected={selected === c.id}
              reveal={isNew}
              reducedMotion={reducedMotion}
              onSelect={onSelect}
            />
          ))}
        </group>
        <ContactShadows position={[0, -0.002, 0]} scale={7} blur={2.4} far={3} opacity={0.35} />
        <Grid
          position={[0, -0.006, 0]}
          args={[10, 10]}
          cellSize={0.25}
          sectionSize={1}
          cellColor="#d9d2c3"
          sectionColor="#bdb4a0"
          fadeDistance={9}
          fadeStrength={1.5}
          infiniteGrid
        />
      </group>
      <OrbitControls
        ref={controls as never}
        makeDefault
        target={HOME_TARGET}
        enablePan={false}
        minDistance={1.6}
        maxDistance={12}
        maxPolarAngle={Math.PI * 0.72}
        autoRotate={spin && !reducedMotion}
        autoRotateSpeed={1.2}
      />
    </>
  );
}

export function BlueprintViewport(props: ViewportProps & { fallback: ReactNode }) {
  if (!hasWebGL()) return <>{props.fallback}</>;
  return (
    <Boundary fallback={props.fallback}>
      <Canvas
        camera={{ position: HOME_POSITION, fov: 40, near: 0.05, far: 60 }}
        dpr={[1, 2]}
        gl={{ preserveDrawingBuffer: true }}
        onPointerMissed={() => props.onSelect(null)}
        data-testid="blueprint-canvas"
        aria-label={`3D model of ${props.blueprint.name}`}
      >
        <color attach="background" args={['#FBF9F4']} />
        <Scene {...props} />
      </Canvas>
    </Boundary>
  );
}
