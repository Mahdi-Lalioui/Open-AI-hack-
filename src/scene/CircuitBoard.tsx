/** Paper breadboard with 3D components, tube wires and animated current dots. */
import { Outlines } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { CircuitComponent, CircuitResult, CircuitSpec, ComponentType } from '../../shared/creations';
import { PALETTE } from '../theme';
import { damp, revealTime, useSceneCtx } from './context';
import { Tag } from './Label';
import { PAPER } from './layout';
import { riseScale } from './reveal';
import type { StationId } from './types';

const INK = PALETTE.ink;
export const BOARD = { width: 10, depth: 5.8, height: 0.12 };
const TOP = PAPER.top + BOARD.height;

/** Selection ids reused from StationId (contract): battery=source, resistor=queue, led/bulb=service, switch=sink. */
export const CIRCUIT_SELECT_ID: Record<ComponentType, StationId> = {
  battery: 'source',
  resistor: 'queue',
  led: 'service',
  bulb: 'service',
  switch: 'sink',
};

export function componentPos(c: Pick<CircuitComponent, 'x' | 'y'>): [number, number] {
  const cl = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5);
  return [(cl(c.x) - 0.5) * (BOARD.width - 2), (cl(c.y) - 0.5) * (BOARD.depth - 1.6)];
}

const BAND: string[] = ['#111111', '#7A4A2A', '#D33A2C', '#F08A24', '#F2C94C', '#3C9A4A', '#2F6FD0', '#8A4FC0', '#8A8F99', '#FFFFFF'];
export function resistorBands(ohms: number): string[] {
  const v = Math.max(10, Math.round(ohms));
  const digits = String(v);
  const a = Number(digits[0]);
  const b = Number(digits[1] ?? 0);
  const mult = Math.max(0, digits.length - 2);
  return [BAND[a], BAND[b], BAND[Math.min(9, mult)], '#C9A227'];
}

function boardTexture(): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 1000;
  c.height = 580;
  const g = c.getContext('2d')!;
  g.fillStyle = PALETTE.card;
  g.fillRect(0, 0, 1000, 580);
  g.fillStyle = 'rgba(31,36,48,0.22)';
  for (let x = 30; x < 1000; x += 24) for (let y = 30; y < 580; y += 24) g.fillRect(x, y, 5, 5);
  g.fillStyle = 'rgba(232,115,90,0.55)';
  g.fillRect(20, 12, 960, 4);
  g.fillStyle = 'rgba(31,138,132,0.55)';
  g.fillRect(20, 564, 960, 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function Rise({ delay, children }: { delay: number; children: React.ReactNode }) {
  const ctx = useSceneCtx();
  const ref = useRef<THREE.Group>(null);
  useFrame((s) => {
    if (ref.current) ref.current.scale.y = riseScale(revealTime(ctx, s.clock.elapsedTime), delay);
  });
  return <group ref={ref}>{children}</group>;
}

function Battery({ c }: { c: CircuitComponent }) {
  return (
    <group rotation-z={Math.PI / 2} position-y={0.32}>
      <mesh>
        <cylinderGeometry args={[0.3, 0.3, 1.2, 24]} />
        <meshLambertMaterial color={INK} />
        <Outlines thickness={0.02} color={INK} />
      </mesh>
      <mesh position-y={0.35}>
        <cylinderGeometry args={[0.305, 0.305, 0.5, 24]} />
        <meshLambertMaterial color={PALETTE.butter} />
      </mesh>
      <mesh position-y={0.66}>
        <cylinderGeometry args={[0.1, 0.1, 0.12, 12]} />
        <meshLambertMaterial color="#C8CCD2" />
      </mesh>
      <Tag position={[0.75, 0, 0]} size="sm" tone="ink">{`${c.value ?? 9} V`}</Tag>
    </group>
  );
}

function Resistor({ c }: { c: CircuitComponent }) {
  const bands = resistorBands(c.value ?? 220);
  return (
    <group position-y={0.2} rotation-z={Math.PI / 2}>
      <mesh>
        <cylinderGeometry args={[0.035, 0.035, 1.4, 6]} />
        <meshLambertMaterial color="#B8BDC4" />
      </mesh>
      <mesh scale={[1, 1, 1]}>
        <capsuleGeometry args={[0.16, 0.5, 6, 14]} />
        <meshLambertMaterial color="#E9D3A8" />
        <Outlines thickness={0.015} color={INK} />
      </mesh>
      {bands.map((col, i) => (
        <mesh key={i} position-y={-0.24 + i * 0.13 + (i === 3 ? 0.06 : 0)}>
          <cylinderGeometry args={[0.165, 0.165, 0.06, 16]} />
          <meshLambertMaterial color={col} />
        </mesh>
      ))}
    </group>
  );
}

function Led({ c, brightness }: { c: CircuitComponent; brightness: number }) {
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const light = useRef<THREE.PointLight>(null);
  const red = c.type === 'led';
  useFrame((_, dt) => {
    if (mat.current) mat.current.emissiveIntensity = damp(mat.current.emissiveIntensity, brightness * 4, 6, dt);
    if (light.current) light.current.intensity = damp(light.current.intensity, brightness * 8, 6, dt);
  });
  const glowColor = red ? '#FF4B3A' : '#FFD45A';
  return (
    <group>
      {[-0.12, 0.12].map((x) => (
        <mesh key={x} position={[x, 0.2, 0]}>
          <cylinderGeometry args={[0.02, 0.02, 0.4, 6]} />
          <meshLambertMaterial color="#B8BDC4" />
        </mesh>
      ))}
      <mesh position-y={red ? 0.55 : 0.75}>
        {red ? <capsuleGeometry args={[0.2, 0.3, 6, 16]} /> : <sphereGeometry args={[0.45, 24, 18]} />}
        <meshStandardMaterial
          ref={mat}
          color={red ? '#F3A193' : '#FFF5D6'}
          emissive={glowColor}
          emissiveIntensity={0}
          transparent
          opacity={0.92}
          roughness={0.3}
        />
        <Outlines thickness={0.015} color={INK} />
      </mesh>
      {!red && (
        <mesh position-y={0.3}>
          <cylinderGeometry args={[0.2, 0.22, 0.2, 16]} />
          <meshLambertMaterial color="#9BA1A9" />
        </mesh>
      )}
      <pointLight ref={light} position-y={0.9} color={glowColor} intensity={0} distance={3.5} />
    </group>
  );
}

function Switch({ closed }: { closed: boolean }) {
  const lever = useRef<THREE.Group>(null);
  const ctx = useSceneCtx();
  useFrame((_, dt) => {
    if (!lever.current) return;
    const target = closed ? -0.05 : -0.7;
    lever.current.rotation.z = ctx.reducedMotion ? target : damp(lever.current.rotation.z, target, 8, dt);
  });
  return (
    <group>
      <mesh position-y={0.06}>
        <boxGeometry args={[1.1, 0.12, 0.45]} />
        <meshLambertMaterial color={PALETTE.wood} />
        <Outlines thickness={0.015} color={INK} />
      </mesh>
      {[-0.4, 0.4].map((x) => (
        <mesh key={x} position={[x, 0.2, 0]}>
          <boxGeometry args={[0.1, 0.18, 0.18]} />
          <meshLambertMaterial color="#B8BDC4" />
        </mesh>
      ))}
      <group ref={lever} position={[-0.4, 0.28, 0]}>
        <mesh position-x={0.42}>
          <boxGeometry args={[0.84, 0.05, 0.12]} />
          <meshLambertMaterial color="#C8CCD2" />
          <Outlines thickness={0.012} color={INK} />
        </mesh>
        <mesh position-x={0.86}>
          <sphereGeometry args={[0.08, 10, 8]} />
          <meshLambertMaterial color={PALETTE.coral} />
        </mesh>
      </group>
      <Tag position={[0, 0.75, 0]} size="sm" tone={closed ? 'teal' : 'coral'}>{closed ? 'ON' : 'OFF'}</Tag>
    </group>
  );
}

const DOT_GEOM = new THREE.SphereGeometry(0.07, 8, 6);

function wirePoints(a: [number, number], b: [number, number]): THREE.Vector3[] {
  const y = TOP + 0.05;
  const midX = (a[0] + b[0]) / 2;
  return [
    new THREE.Vector3(a[0], y, a[1]),
    new THREE.Vector3(midX, y + 0.25, a[1]),
    new THREE.Vector3(midX, y + 0.25, b[1]),
    new THREE.Vector3(b[0], y, b[1]),
  ];
}

function CurrentDots({ curves, currentMa }: { curves: THREE.Curve<THREE.Vector3>[]; currentMa: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const ctx = useSceneCtx();
  const per = 6;
  const count = curves.length * per;
  const tmp = useMemo(() => new THREE.Object3D(), []);
  useLayoutEffect(() => {
    if (ref.current) ref.current.count = currentMa > 0 ? count : 0;
  }, [count, currentMa]);
  useFrame((s) => {
    const m = ref.current;
    if (!m || currentMa <= 0) return;
    const speed = ctx.reducedMotion ? 0 : Math.min(0.6, 0.08 + currentMa / 60);
    const t = s.clock.elapsedTime * speed;
    curves.forEach((curve, ci) => {
      for (let k = 0; k < per; k++) {
        const u = (t + k / per) % 1;
        tmp.position.copy(curve.getPointAt(u));
        tmp.position.y += 0.02;
        tmp.updateMatrix();
        m.setMatrixAt(ci * per + k, tmp.matrix);
      }
    });
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[DOT_GEOM, undefined, Math.max(1, count)]} raycast={() => null}>
      <meshBasicMaterial color={PALETTE.butter} toneMapped={false} />
    </instancedMesh>
  );
}

export function CircuitBoard({ spec, result }: { spec: CircuitSpec; result: CircuitResult | null }) {
  const ctx = useSceneCtx();
  const tex = useMemo(boardTexture, []);
  const byId = useMemo(() => new Map(spec.components.map((c) => [c.id, c])), [spec]);
  const curves = useMemo(
    () =>
      spec.wires
        .map((w) => {
          const a = byId.get(w.from);
          const b = byId.get(w.to);
          if (!a || !b) return null;
          return new THREE.CatmullRomCurve3(wirePoints(componentPos(a), componentPos(b)), false, 'catmullrom', 0.1);
        })
        .filter((c): c is THREE.CatmullRomCurve3 => !!c),
    [spec, byId],
  );
  const brightness = result?.brightness ?? 0;
  const closed = result?.switchClosed ?? false;
  const currentMa = result?.closedLoop ? result.currentMa : 0;

  const click = (id: StationId) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > 5) return;
    ctx.select(id);
  };

  return (
    <group>
      <Rise delay={0.1}>
        <mesh position-y={PAPER.top + BOARD.height / 2}>
          <boxGeometry args={[BOARD.width, BOARD.height, BOARD.depth]} />
          <meshLambertMaterial attach="material-0" color={PALETTE.paperDeep} />
          <meshLambertMaterial attach="material-1" color={PALETTE.paperDeep} />
          <meshLambertMaterial attach="material-2" map={tex ?? undefined} color={tex ? '#FFFFFF' : PALETTE.card} />
          <meshLambertMaterial attach="material-3" color={PALETTE.paperDeep} />
          <meshLambertMaterial attach="material-4" color={PALETTE.paperDeep} />
          <meshLambertMaterial attach="material-5" color={PALETTE.paperDeep} />
          <Outlines thickness={0.02} color={INK} />
        </mesh>
      </Rise>
      <Rise delay={0.45}>
        {curves.map((c, i) => (
          <mesh key={i} raycast={() => null}>
            <tubeGeometry args={[c, 40, 0.045, 8, false]} />
            <meshLambertMaterial color={i % 2 ? PALETTE.ink : PALETTE.coral} />
          </mesh>
        ))}
      </Rise>
      <CurrentDots curves={curves} currentMa={currentMa} />
      {spec.components.map((c, i) => {
        const [x, z] = componentPos(c);
        const id = CIRCUIT_SELECT_ID[c.type];
        const selected = ctx.selected === id;
        return (
          <group
            key={c.id}
            position={[x, TOP + (selected ? 0.12 : 0), z]}
            onClick={click(id)}
            onPointerOver={(e) => {
              e.stopPropagation();
              ctx.setHovered(id);
            }}
            onPointerOut={() => ctx.setHovered(null)}
          >
            {(selected || ctx.hovered === id) && (
              <mesh rotation-x={-Math.PI / 2} position-y={0.005} raycast={() => null}>
                <ringGeometry args={[0.75, 0.88, 40]} />
                <meshBasicMaterial color={PALETTE.teal} transparent opacity={selected ? 0.9 : 0.35} depthWrite={false} />
              </mesh>
            )}
            <Rise delay={0.35 + i * 0.18}>
              {c.type === 'battery' && <Battery c={c} />}
              {c.type === 'resistor' && <Resistor c={c} />}
              {(c.type === 'led' || c.type === 'bulb') && <Led c={c} brightness={brightness} />}
              {c.type === 'switch' && <Switch closed={closed} />}
            </Rise>
            <Tag position={[0, -0.05, 0.75]} size="sm" selected={selected}>
              {c.label || c.type}
            </Tag>
          </group>
        );
      })}
      {result && (
        <Tag position={[0, TOP + 0.05, BOARD.depth / 2 + 0.55]} tone={result.ledOn || brightness > 0 ? 'teal' : 'paper'} testId="circuit-message">
          {result.message}
        </Tag>
      )}
    </group>
  );
}
