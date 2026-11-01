/** The table, the paper sheet (pencil grid, curled edges) and ink paths drawn on it. */
import { Line } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { PALETTE } from '../theme';
import { revealTime, useSceneCtx } from './context';
import { dashesAlong, layoutStations, PAPER, STATION_HALF, type StationLayout, type Vec2 } from './layout';
import { phase, REVEAL } from './reveal';

export const TABLE_COLOR = '#DCC9AA';

function makePaperTexture(): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const w = 1536;
  const h = 960;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (!g) return null;
  g.fillStyle = PALETTE.paper;
  g.fillRect(0, 0, w, h);
  // Fibres / speckles (deterministic pseudo-random).
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 3500; i++) {
    g.fillStyle = rnd() > 0.5 ? 'rgba(160,140,110,0.07)' : 'rgba(255,255,255,0.35)';
    g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2);
  }
  // Faint pencil grid.
  const step = 48;
  g.strokeStyle = 'rgba(110,125,150,0.16)';
  g.lineWidth = 1.5;
  for (let x = step; x < w; x += step) {
    g.beginPath();
    g.moveTo(x + 0.5, 0);
    g.lineTo(x + 0.5, h);
    g.stroke();
  }
  for (let y = step; y < h; y += step) {
    g.beginPath();
    g.moveTo(0, y + 0.5);
    g.lineTo(w, y + 0.5);
    g.stroke();
  }
  // Notebook margin line (restrained coral).
  g.strokeStyle = 'rgba(232,115,90,0.32)';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(96, 0);
  g.lineTo(96, h);
  g.stroke();
  // Slightly aged edges.
  const band = 26;
  const edge = (x0: number, y0: number, x1: number, y1: number) => {
    const grad = g.createLinearGradient(x0, y0, x1, y1);
    grad.addColorStop(0, 'rgba(210,195,170,0.45)');
    grad.addColorStop(1, 'rgba(210,195,170,0)');
    return grad;
  };
  g.fillStyle = edge(0, 0, 0, band);
  g.fillRect(0, 0, w, band);
  g.fillStyle = edge(0, h, 0, h - band);
  g.fillRect(0, h - band, w, band);
  g.fillStyle = edge(0, 0, band, 0);
  g.fillRect(0, 0, band, h);
  g.fillStyle = edge(w, 0, w - band, 0);
  g.fillRect(w - band, 0, band, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function makeSoftShadowTexture(): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 160;
  const g = c.getContext('2d');
  if (!g) return null;
  g.filter = 'blur(10px)';
  g.fillStyle = 'rgba(60,40,20,0.55)';
  g.fillRect(28, 26, 200, 108);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

/** Height of the curled paper at (x, z) relative to PAPER.top. */
export function paperCurl(x: number, z: number): number {
  const hw = PAPER.width / 2;
  const hd = PAPER.depth / 2;
  const ex = Math.max(0, Math.abs(x) - (hw - 0.9)) / 0.9;
  const ez = Math.max(0, z - (hd - 0.7)) / 0.7;
  const eb = Math.max(0, -z - (hd - 0.5)) / 0.5;
  return 0.2 * ex * ex * (x > 0 ? 1.15 : 0.85) + 0.07 * ez * ez + 0.05 * eb * eb;
}

function PaperSheet() {
  const { select, setHovered } = useSceneCtx();
  const tex = useMemo(makePaperTexture, []);
  const shadowTex = useMemo(makeSoftShadowTexture, []);
  const geom = useMemo(() => {
    const g = new THREE.PlaneGeometry(PAPER.width, PAPER.depth, 40, 24);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, paperCurl(pos.getX(i), pos.getZ(i)));
    }
    g.computeVertexNormals();
    return g;
  }, []);
  const outline = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    const hw = PAPER.width / 2;
    const hd = PAPER.depth / 2;
    const n = 30;
    const push = (x: number, z: number) => pts.push(new THREE.Vector3(x, paperCurl(x, z) + 0.004, z));
    for (let i = 0; i <= n; i++) push(-hw + (2 * hw * i) / n, -hd);
    for (let i = 1; i <= n; i++) push(hw, -hd + (2 * hd * i) / n);
    for (let i = 1; i <= n; i++) push(hw - (2 * hw * i) / n, hd);
    for (let i = 1; i <= n; i++) push(-hw, hd - (2 * hd * i) / n);
    return pts;
  }, []);

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > 5) return;
    select(null);
  };

  return (
    <group>
      {/* Soft drop shadow of the sheet on the table */}
      {shadowTex && (
        <mesh rotation-x={-Math.PI / 2} position={[0.25, 0.004, 0.3]} renderOrder={1}>
          <planeGeometry args={[PAPER.width * 1.28, PAPER.depth * 1.33]} />
          <meshBasicMaterial map={shadowTex} transparent depthWrite={false} opacity={0.55} />
        </mesh>
      )}
      <mesh
        geometry={geom}
        position-y={PAPER.top}
        onClick={onClick}
        onPointerOver={() => setHovered(null)}
        name="paper"
      >
        <meshLambertMaterial map={tex ?? undefined} color={tex ? '#FFFFFF' : PALETTE.paper} side={THREE.DoubleSide} />
      </mesh>
      <group position-y={PAPER.top}>
        <Line points={outline} color={PALETTE.inkSoft} lineWidth={1.6} transparent opacity={0.55} />
      </group>
    </group>
  );
}

const DASH_GEOM = new THREE.BoxGeometry(1, 0.004, 0.055);

/** Dashed ink path. `progress` (0..1) controls how much is drawn; if `animated`, it follows the reveal. */
export function InkPath({
  legs,
  animated = true,
  opacity = 0.75,
  arrows = true,
  width = 0.055,
}: {
  legs: Vec2[][];
  animated?: boolean;
  opacity?: number;
  arrows?: boolean;
  width?: number;
}) {
  const ctx = useSceneCtx();
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const arrowRefs = useRef<(THREE.Group | null)[]>([]);
  const dashes = useMemo(() => legs.flatMap((leg) => dashesAlong(leg)), [legs]);
  const arrowData = useMemo(
    () =>
      legs
        .filter((l) => l.length >= 2)
        .map((leg) => {
          const a = leg[leg.length - 2];
          const b = leg[leg.length - 1];
          const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
          return { x: b.x, z: b.z, angle: Math.atan2(-(b.z - a.z) / len, (b.x - a.x) / len) };
        }),
    [legs],
  );
  const arrowGeom = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(0.2, 0);
    s.lineTo(-0.12, 0.15);
    s.lineTo(-0.05, 0);
    s.lineTo(-0.12, -0.15);
    s.closePath();
    const g = new THREE.ShapeGeometry(s);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    dashes.forEach((d, i) => {
      q.setFromAxisAngle(up, d.angle);
      m.compose(new THREE.Vector3(d.x, 0, d.z), q, new THREE.Vector3(d.length, 1, width / 0.055));
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.count = animated ? 0 : dashes.length;
  }, [dashes, animated, width]);

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh || !animated) return;
    const p = phase(revealTime(ctx, state.clock.elapsedTime), REVEAL.inkStart, REVEAL.inkEnd);
    mesh.count = Math.round(p * dashes.length);
    arrowRefs.current.forEach((g) => {
      if (g) g.visible = p >= 0.98;
    });
  });

  return (
    <group position-y={PAPER.top + 0.003}>
      <instancedMesh ref={meshRef} args={[DASH_GEOM, undefined, Math.max(1, dashes.length)]} raycast={() => null}>
        <meshBasicMaterial color={PALETTE.ink} transparent opacity={opacity} depthWrite={false} />
      </instancedMesh>
      {arrows &&
        arrowData.map((a, i) => (
          <group
            key={i}
            ref={(g) => {
              arrowRefs.current[i] = g;
            }}
            position={[a.x, 0.001, a.z]}
            rotation-y={a.angle}
            visible={!animated}
          >
            <mesh geometry={arrowGeom} raycast={() => null}>
              <meshBasicMaterial color={PALETTE.ink} transparent opacity={opacity} depthWrite={false} />
            </mesh>
          </group>
        ))}
    </group>
  );
}

function rectLoop(c: Vec2, h: Vec2): Vec2[] {
  return [
    { x: c.x - h.x, z: c.z - h.z },
    { x: c.x + h.x, z: c.z - h.z },
    { x: c.x + h.x, z: c.z + h.z },
    { x: c.x - h.x, z: c.z + h.z },
    { x: c.x - h.x, z: c.z - h.z },
  ];
}

/** Shown before any world exists: three dashed boxes and arrows, so the stage never looks broken. */
function Placeholders() {
  const st: StationLayout = useMemo(() => layoutStations(null), []);
  const legs = useMemo(() => {
    const pad = { x: 0.15, z: 0.25 };
    const box = (c: Vec2, h: Vec2) => rectLoop(c, { x: h.x + pad.x, z: h.z + pad.z });
    return [
      box(st.source, STATION_HALF.source),
      box(st.service, STATION_HALF.service),
      box(st.sink, STATION_HALF.sink),
    ];
  }, [st]);
  const arrows = useMemo(
    () => [
      [
        { x: st.source.x + STATION_HALF.source.x + 0.4, z: st.source.z },
        { x: st.service.x - STATION_HALF.service.x - 0.4, z: st.service.z },
      ],
      [
        { x: st.service.x + STATION_HALF.service.x + 0.4, z: st.service.z },
        { x: st.sink.x - STATION_HALF.sink.x - 0.4, z: st.sink.z },
      ],
    ],
    [st],
  );
  return (
    <group>
      <InkPath legs={legs} animated={false} opacity={0.32} arrows={false} />
      <InkPath legs={arrows} animated={false} opacity={0.32} />
    </group>
  );
}

export function Stage({ hasWorld }: { hasWorld: boolean }) {
  return (
    <group>
      {/* Table top */}
      <mesh rotation-x={-Math.PI / 2} position-y={0} raycast={() => null}>
        <planeGeometry args={[120, 120]} />
        <meshLambertMaterial color={TABLE_COLOR} />
      </mesh>
      <PaperSheet />
      {!hasWorld && <Placeholders />}
    </group>
  );
}
