/** Procedural 3D pet built from a PetSpec, animated by the server-side pet action and needs. */
import { Billboard, Outlines } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import type { BodyShape, PetActionName, PetSpec } from '../../shared/creations';
import { PALETTE } from '../theme';
import { damp, revealTime, useSceneCtx } from './context';
import { petMood, type PetMood } from './creation';
import { Tag } from './Label';
import { PAPER } from './layout';
import { hopOffset, riseScale } from './reveal';
import type { StationId } from './types';

const INK = PALETTE.ink;
const OUTLINE = 0.025;

export const BODY_RADII: Record<BodyShape, [number, number, number]> = {
  round: [0.85, 0.85, 0.85],
  oval: [1.05, 0.75, 0.85],
  bean: [0.8, 0.98, 0.7],
  blob: [1.05, 0.7, 0.95],
  tall: [0.65, 1.2, 0.65],
};

/** Part rises out of the paper during the reveal (flat ink cut-out → 3D). */
function Part({ delay, children }: { delay: number; children: ReactNode }) {
  const ctx = useSceneCtx();
  const ref = useRef<THREE.Group>(null);
  useFrame((s) => {
    if (!ref.current) return;
    const t = revealTime(ctx, s.clock.elapsedTime);
    const k = riseScale(t, delay);
    ref.current.scale.set(Math.min(1, 0.6 + k * 0.4), k, Math.min(1, 0.6 + k * 0.4));
  });
  return <group ref={ref}>{children}</group>;
}

function Ink({ t = OUTLINE }: { t?: number }) {
  return <Outlines thickness={t} color={INK} />;
}

function Eyes({ spec, mood, action, ry, rz }: { spec: PetSpec; mood: PetMood; action: PetActionName; ry: number; rz: number }) {
  const ref = useRef<THREE.Group>(null);
  const n = spec.eyeCount;
  const size = spec.eyeStyle === 'big' ? 0.17 : 0.12;
  const closed = action === 'sleep';
  const baseOpen = spec.eyeStyle === 'sleepy' || mood === 'sleepy' ? 0.45 : mood === 'sad' ? 0.7 : 1;
  const xs = n === 1 ? [0] : n === 2 ? [-0.26, 0.26] : [-0.32, 0, 0.32];
  useFrame((s, dt) => {
    if (!ref.current) return;
    const blink = s.clock.elapsedTime % 3.7 < 0.13;
    const target = closed || blink ? 0.08 : baseOpen;
    ref.current.scale.y = target === 0.08 ? 0.08 : damp(ref.current.scale.y, target, 20, dt);
  });
  return (
    <group ref={ref} position={[0, ry * 0.25, rz * 0.88]}>
      {xs.map((x, i) => (
        <group key={i} position={[x, n === 3 && i === 1 ? 0.14 : 0, 0]}>
          <mesh>
            <sphereGeometry args={[size, 16, 12]} />
            <meshLambertMaterial color="#FFFFFF" />
            <Ink t={0.018} />
          </mesh>
          <mesh position={[0, 0, size * 0.75]}>
            <sphereGeometry args={[size * 0.5, 12, 10]} />
            <meshBasicMaterial color={INK} />
          </mesh>
          <mesh position={[size * 0.2, size * 0.2, size * 1.05]}>
            <sphereGeometry args={[size * 0.14, 8, 6]} />
            <meshBasicMaterial color="#FFFFFF" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Ears({ spec, ry }: { spec: PetSpec; ry: number }) {
  const c = spec.bodyColor;
  const a = spec.accentColor;
  const y = ry * 0.85;
  if (spec.ears === 'none') return null;
  return (
    <group>
      {[-1, 1].map((sx) => (
        <group key={sx} position={[sx * 0.42, y, 0]} rotation-z={-sx * 0.35}>
          {spec.ears === 'pointy' && (
            <mesh position-y={0.2}>
              <coneGeometry args={[0.2, 0.45, 4]} />
              <meshLambertMaterial color={c} />
              <Ink />
            </mesh>
          )}
          {spec.ears === 'round' && (
            <mesh position-y={0.12} scale={[1, 1, 0.45]}>
              <sphereGeometry args={[0.2, 16, 12]} />
              <meshLambertMaterial color={a} />
              <Ink />
            </mesh>
          )}
          {spec.ears === 'floppy' && (
            <mesh position={[sx * 0.18, -0.15, 0]} rotation-z={sx * 1.2} scale={[0.5, 1, 0.25]}>
              <sphereGeometry args={[0.3, 16, 12]} />
              <meshLambertMaterial color={a} />
              <Ink />
            </mesh>
          )}
          {spec.ears === 'antenna' && (
            <group>
              <mesh position-y={0.25}>
                <cylinderGeometry args={[0.025, 0.025, 0.5, 6]} />
                <meshBasicMaterial color={INK} />
              </mesh>
              <mesh position-y={0.53}>
                <sphereGeometry args={[0.09, 12, 10]} />
                <meshLambertMaterial color={a} />
                <Ink t={0.015} />
              </mesh>
            </group>
          )}
        </group>
      ))}
    </group>
  );
}

function Tail({ spec, ry, rz }: { spec: PetSpec; ry: number; rz: number }) {
  const ref = useRef<THREE.Group>(null);
  const ctx = useSceneCtx();
  const geom = useMemo(() => {
    if (spec.tail === 'none') return null;
    const pts: THREE.Vector3[] = [];
    const len = spec.tail === 'short' ? 0.35 : 0.8;
    for (let i = 0; i <= 16; i++) {
      const u = i / 16;
      if (spec.tail === 'curly') {
        const a = u * Math.PI * 2.2;
        pts.push(new THREE.Vector3(0, 0.1 + Math.sin(a) * 0.22 * u + u * 0.3, -u * 0.25 - (1 - Math.cos(a)) * 0.12 * u));
      } else {
        pts.push(new THREE.Vector3(0, u * len * 0.6, -u * len));
      }
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.07, 8, false);
  }, [spec.tail]);
  useFrame((s) => {
    if (ref.current && !ctx.reducedMotion) ref.current.rotation.y = Math.sin(s.clock.elapsedTime * 4) * 0.35;
  });
  if (!geom) return null;
  return (
    <group ref={ref} position={[0, -ry * 0.2, -rz * 0.9]}>
      <mesh geometry={geom}>
        <meshLambertMaterial color={spec.accentColor} />
        <Ink t={0.015} />
      </mesh>
    </group>
  );
}

function Extras({ spec, rx, ry, rz }: { spec: PetSpec; rx: number; ry: number; rz: number }) {
  const ctx = useSceneCtx();
  const wings = useRef<THREE.Group>(null);
  useFrame((s) => {
    if (wings.current && !ctx.reducedMotion) {
      const f = Math.sin(s.clock.elapsedTime * 9) * 0.4;
      wings.current.children.forEach((c, i) => (c.rotation.y = (i ? -1 : 1) * (0.4 + f)));
    }
  });
  const spots = useMemo(() => {
    const out: [number, number, number][] = [];
    for (let i = 0; i < 6; i++) {
      const th = 0.8 + i * 0.9;
      const ph = 0.9 + (i % 3) * 0.35;
      out.push([Math.sin(ph) * Math.cos(th) * rx, Math.cos(ph) * ry, Math.sin(ph) * Math.sin(th) * rz]);
    }
    return out.filter((p) => p[2] < rz * 0.5);
  }, [rx, ry, rz]);
  return (
    <group>
      {spec.extras.includes('spots') &&
        spots.map((p, i) => (
          <mesh key={i} position={p} scale={1.02}>
            <sphereGeometry args={[0.1 + (i % 2) * 0.04, 10, 8]} />
            <meshLambertMaterial color={spec.accentColor} />
          </mesh>
        ))}
      {spec.extras.includes('horn') && (
        <mesh position={[0, ry * 0.98 + 0.18, rz * 0.2]}>
          <coneGeometry args={[0.1, 0.4, 12]} />
          <meshLambertMaterial color={PALETTE.butter} />
          <Ink t={0.015} />
        </mesh>
      )}
      {spec.extras.includes('hat') && (
        <group position={[0, ry * 0.95, 0]} rotation-z={0.15}>
          <mesh position-y={0.04}>
            <cylinderGeometry args={[0.42, 0.42, 0.04, 20]} />
            <meshLambertMaterial color={INK} />
          </mesh>
          <mesh position-y={0.24}>
            <cylinderGeometry args={[0.24, 0.26, 0.38, 20]} />
            <meshLambertMaterial color={INK} />
          </mesh>
          <mesh position-y={0.1}>
            <cylinderGeometry args={[0.265, 0.265, 0.07, 20]} />
            <meshLambertMaterial color={spec.accentColor} />
          </mesh>
        </group>
      )}
      {spec.extras.includes('wings') && (
        <group ref={wings} position={[0, ry * 0.2, -rz * 0.3]}>
          {[-1, 1].map((sx) => (
            <group key={sx} position={[sx * rx * 0.85, 0, 0]}>
              <mesh position={[sx * 0.35, 0.15, 0]} scale={[1, 0.6, 0.08]}>
                <sphereGeometry args={[0.4, 16, 10]} />
                <meshLambertMaterial color={PALETTE.card} />
                <Ink t={0.015} />
              </mesh>
            </group>
          ))}
        </group>
      )}
      {spec.extras.includes('whiskers') &&
        [-1, 1].flatMap((sx) =>
          [-0.05, 0.05].map((dy) => (
            <mesh key={`${sx}${dy}`} position={[sx * 0.42, -ry * 0.05 + dy, rz * 0.82]} rotation-z={sx * (Math.PI / 2 + dy * 4)}>
              <cylinderGeometry args={[0.008, 0.008, 0.4, 4]} />
              <meshBasicMaterial color={INK} />
            </mesh>
          )),
        )}
    </group>
  );
}

function Mouth({ spec, mood, action, ry, rz }: { spec: PetSpec; mood: PetMood; action: PetActionName; ry: number; rz: number }) {
  if (spec.mouth === 'none') return null;
  const open = spec.mouth === 'open' || action === 'eat' || mood === 'hungry';
  const sad = mood === 'sad';
  return (
    <group position={[0, -ry * 0.12, rz * 0.97]}>
      {open ? (
        <mesh scale={[1, action === 'eat' ? 1.3 : 0.8, 0.4]}>
          <sphereGeometry args={[0.1, 12, 10]} />
          <meshBasicMaterial color="#5B2230" />
        </mesh>
      ) : (
        <mesh rotation-z={sad ? 0 : Math.PI}>
          <torusGeometry args={[0.12, 0.022, 6, 16, Math.PI]} />
          <meshBasicMaterial color={INK} />
        </mesh>
      )}
    </group>
  );
}

function PortraitStand({ url }: { url: string }) {
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    let alive = true;
    new THREE.TextureLoader().load(
      url,
      (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        if (alive) setTex(t);
      },
      undefined,
      () => alive && setTex(null),
    );
    return () => {
      alive = false;
    };
  }, [url]);
  if (!tex) return null;
  return (
    <group position={[2.1, PAPER.top, 0.2]}>
      <mesh position-y={0.6}>
        <cylinderGeometry args={[0.03, 0.03, 1.2, 6]} />
        <meshLambertMaterial color={PALETTE.wood} />
      </mesh>
      <mesh position-y={0.03}>
        <cylinderGeometry args={[0.3, 0.34, 0.06, 20]} />
        <meshLambertMaterial color={PALETTE.wood} />
        <Ink t={0.012} />
      </mesh>
      <Billboard position-y={1.55} lockX lockZ>
        <mesh position-z={-0.01}>
          <planeGeometry args={[1.25, 1.25]} />
          <meshBasicMaterial color={PALETTE.ink} />
        </mesh>
        <mesh position-z={-0.005}>
          <planeGeometry args={[1.19, 1.19]} />
          <meshBasicMaterial color={PALETTE.card} />
        </mesh>
        <mesh>
          <planeGeometry args={[1.05, 1.05]} />
          <meshBasicMaterial map={tex} toneMapped={false} />
        </mesh>
      </Billboard>
    </group>
  );
}

export interface PetModelProps {
  spec: PetSpec;
  action: PetActionName;
  needs: { hunger: number; happiness: number; energy: number } | null;
  imageUrl: string | null;
  selectId: StationId;
}

export function PetModel({ spec, action, needs, imageUrl, selectId }: PetModelProps) {
  const ctx = useSceneCtx();
  const mood = petMood(needs ? ({ ...needs } as never) : null);
  const [rx, ry, rz] = BODY_RADII[spec.bodyShape] ?? BODY_RADII.round;
  const legH = spec.legs ? 0.35 : 0;
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const paw = useRef<THREE.Group>(null);
  const lift = useRef(0);
  const selected = ctx.selected === selectId;
  const hovered = ctx.hovered === selectId;

  useFrame((s, dt) => {
    const t = s.clock.elapsedTime;
    const rt = revealTime(ctx, t);
    lift.current = damp(lift.current, selected ? 0.15 : 0, 10, dt);
    if (root.current) root.current.position.y = PAPER.top + lift.current + hopOffset(rt, 1.3, 0.5) * (rt < 1.8 ? 0.4 : 0);
    const b = body.current;
    if (!b) return;
    if (ctx.reducedMotion) {
      b.position.set(0, 0, 0);
      b.rotation.set(0, 0, 0);
      b.scale.setScalar(1);
      return;
    }
    let y = 0;
    let rotZ = 0;
    let rotY = 0;
    let rotX = 0;
    let sy = 1;
    switch (action) {
      case 'sleep':
        sy = 1 + Math.sin(t * 1.6) * 0.035;
        rotZ = 0.12;
        break;
      case 'eat':
        rotX = 0.25 + Math.abs(Math.sin(t * 8)) * 0.15;
        break;
      case 'play':
        y = Math.abs(Math.sin(t * 5)) * 0.45;
        rotY = t * 4;
        break;
      case 'dance':
        y = Math.abs(Math.sin(t * 6)) * 0.2;
        rotZ = Math.sin(t * 6) * 0.25;
        rotY = Math.sin(t * 3) * 0.5;
        break;
      case 'wave':
        rotZ = Math.sin(t * 3) * 0.08;
        break;
      default: {
        const speed = mood === 'happy' ? 3 : mood === 'sleepy' || mood === 'sad' ? 1.2 : 2;
        y = Math.abs(Math.sin(t * speed)) * (mood === 'happy' ? 0.12 : 0.04);
        sy = 1 + Math.sin(t * speed * 2) * 0.02;
      }
    }
    b.position.y = damp(b.position.y, y, 14, dt);
    b.rotation.z = damp(b.rotation.z, rotZ, 8, dt);
    b.rotation.x = damp(b.rotation.x, rotX, 8, dt);
    b.rotation.y = action === 'play' ? rotY % (Math.PI * 2) : damp(b.rotation.y, rotY, 6, dt);
    b.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));
    if (paw.current) paw.current.rotation.z = action === 'wave' ? 2.2 + Math.sin(t * 10) * 0.5 : 0;
  });

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > 5) return;
    ctx.select(selectId);
  };

  const centerY = legH + ry;
  const legXs = spec.legs === 4 ? [-0.4, 0.4] : spec.legs === 2 ? [-0.3, 0.3] : [];
  const legZs = spec.legs === 4 ? [0.3, -0.3] : [0];

  return (
    <group>
      {/* Selection ring on the paper */}
      {(selected || hovered) && (
        <mesh rotation-x={-Math.PI / 2} position-y={PAPER.top + 0.006} raycast={() => null}>
          <ringGeometry args={[Math.max(rx, rz) + 0.35, Math.max(rx, rz) + 0.5, 48]} />
          <meshBasicMaterial color={PALETTE.teal} transparent opacity={selected ? 0.9 : 0.35} depthWrite={false} />
        </mesh>
      )}
      <group
        ref={root}
        onClick={onClick}
        onPointerOver={(e) => {
          e.stopPropagation();
          ctx.setHovered(selectId);
        }}
        onPointerOut={() => ctx.setHovered(null)}
      >
        <group ref={body}>
          {/* legs */}
          <Part delay={0.2}>
            {legXs.flatMap((x) =>
              legZs.map((z) => (
                <group key={`${x}${z}`} ref={spec.legs && x > 0 && z === legZs[0] ? paw : undefined} position={[x, legH, z]}>
                  <mesh position-y={-legH / 2}>
                    <cylinderGeometry args={[0.1, 0.12, legH + 0.05, 10]} />
                    <meshLambertMaterial color={spec.bodyColor} />
                    <Ink t={0.018} />
                  </mesh>
                  <mesh position={[0, -legH + 0.03, 0.05]} scale={[1, 0.5, 1.3]}>
                    <sphereGeometry args={[0.12, 10, 8]} />
                    <meshLambertMaterial color={spec.accentColor} />
                  </mesh>
                </group>
              )),
            )}
          </Part>
          <Part delay={0.35}>
            <group position-y={centerY}>
              <mesh scale={[rx, ry, rz]}>
                <sphereGeometry args={[1, 32, 24]} />
                <meshLambertMaterial color={spec.bodyColor} />
                <Ink t={0.03} />
              </mesh>
              {/* belly patch */}
              <mesh position={[0, -ry * 0.3, rz * 0.55]} scale={[rx * 0.55, ry * 0.45, rz * 0.45]}>
                <sphereGeometry args={[1, 20, 14]} />
                <meshLambertMaterial color={PALETTE.card} />
              </mesh>
            </group>
          </Part>
          <Part delay={0.55}>
            <group position-y={centerY}>
              <Ears spec={spec} ry={ry} />
              <Tail spec={spec} ry={ry} rz={rz} />
            </group>
          </Part>
          <Part delay={0.75}>
            <group position-y={centerY}>
              <Eyes spec={spec} mood={mood} action={action} ry={ry} rz={rz} />
              <Mouth spec={spec} mood={mood} action={action} ry={ry} rz={rz} />
              {[-1, 1].map((sx) => (
                <mesh key={sx} position={[sx * rx * 0.55, -ry * 0.05, rz * 0.8]} scale={[1, 0.6, 0.3]}>
                  <sphereGeometry args={[0.09, 10, 8]} />
                  <meshBasicMaterial color={PALETTE.coralSoft} />
                </mesh>
              ))}
            </group>
          </Part>
          <Part delay={0.95}>
            <group position-y={centerY}>
              <Extras spec={spec} rx={rx} ry={ry} rz={rz} />
            </group>
          </Part>
        </group>
        <Tag position={[0, centerY + ry + 0.9, 0]} size="lg" selected={selected} testId="pet-name">
          {spec.name || 'Pet'}
        </Tag>
        {action === 'sleep' && (
          <Tag position={[rx + 0.3, centerY + ry + 0.3, 0]} tone="ink" size="sm" tilt={6}>
            z z z
          </Tag>
        )}
        {action === 'eat' && (
          <mesh position={[0, PAPER.top + 0.08, rz + 0.45]}>
            <cylinderGeometry args={[0.3, 0.22, 0.16, 20]} />
            <meshLambertMaterial color={PALETTE.coral} />
            <Ink t={0.012} />
          </mesh>
        )}
      </group>
      {imageUrl && <PortraitStand url={imageUrl} />}
    </group>
  );
}
