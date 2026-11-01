import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { CameraCommand } from './types';


const POLAR = 0.98;
const AZIMUTH = 0.35;
const MIN_D = 5;
const MAX_D = 30;

export function defaultDistance(aspect: number): number {
  const vHalf = Math.tan(THREE.MathUtils.degToRad(35 / 2));
  const fitW = 6.9 / (vHalf * Math.max(aspect, 0.2)) + 1.5;
  const fitH = 4.2 / vHalf + 1.5;
  return Math.min(26, Math.max(11, fitW, fitH));
}

interface Anim {
  from: THREE.Spherical;
  to: THREE.Spherical;
  t0: number;
  dur: number;
}

export function CameraRig({ command, reducedMotion, focus = 1, targetY = 0.5 }: { command: CameraCommand | null; reducedMotion: boolean; focus?: number; targetY?: number }) {
  const TARGET = useMemo(() => new THREE.Vector3(0, targetY, 0.2), [targetY]);
  const controls = useRef<OrbitControlsImpl>(null);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const clock = useThree((s) => s.clock);
  const anim = useRef<Anim | null>(null);
  const touched = useRef(false);
  const lastNonce = useRef<number | null>(command?.nonce ?? null);

  const current = () => new THREE.Spherical().setFromVector3(camera.position.clone().sub(TARGET));
  const home = () => new THREE.Spherical(Math.max(MIN_D + 1, defaultDistance(size.width / Math.max(1, size.height)) * focus), POLAR, AZIMUTH);
  const go = (to: THREE.Spherical) => {
    to.radius = THREE.MathUtils.clamp(to.radius, MIN_D, MAX_D);
    to.phi = THREE.MathUtils.clamp(to.phi, 0.25, 1.25);
    if (reducedMotion) {
      camera.position.setFromSpherical(to).add(TARGET);
      controls.current?.update();
      return;
    }
    anim.current = { from: current(), to, t0: clock.elapsedTime, dur: 0.7 };
  };

  // Initial placement + follow the canvas aspect until the user moves the camera.
  useEffect(() => {
    if (touched.current) return;
    camera.position.setFromSpherical(home()).add(TARGET);
    camera.lookAt(TARGET);
    controls.current?.update();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.width, size.height, focus, targetY]);

  useEffect(() => {
    if (!command || command.nonce === lastNonce.current) return;
    lastNonce.current = command.nonce;
    const s = current();
    switch (command.type) {
      case 'reset':
        touched.current = false;
        go(home());
        break;
      case 'zoomIn':
        go(new THREE.Spherical(s.radius * 0.8, s.phi, s.theta));
        break;
      case 'zoomOut':
        go(new THREE.Spherical(s.radius * 1.25, s.phi, s.theta));
        break;
      case 'orbitLeft':
        go(new THREE.Spherical(s.radius, s.phi, s.theta - THREE.MathUtils.degToRad(25)));
        break;
      case 'orbitRight':
        go(new THREE.Spherical(s.radius, s.phi, s.theta + THREE.MathUtils.degToRad(25)));
        break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [command?.nonce]);

  useFrame(() => {
    const a = anim.current;
    if (!a) return;
    const k = Math.min(1, (clock.elapsedTime - a.t0) / a.dur);
    const e = 1 - Math.pow(1 - k, 3);
    let dTheta = a.to.theta - a.from.theta;
    dTheta = Math.atan2(Math.sin(dTheta), Math.cos(dTheta));
    const s = new THREE.Spherical(
      a.from.radius + (a.to.radius - a.from.radius) * e,
      a.from.phi + (a.to.phi - a.from.phi) * e,
      a.from.theta + dTheta * e,
    );
    camera.position.setFromSpherical(s).add(TARGET);
    controls.current?.update();
    if (k >= 1) anim.current = null;
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      target={TARGET}
      enableDamping={!reducedMotion}
      dampingFactor={0.08}
      enablePan={false}
      minDistance={MIN_D}
      maxDistance={MAX_D}
      minPolarAngle={0.25}
      maxPolarAngle={1.25}
      onStart={() => {
        touched.current = true;
        anim.current = null;
      }}
    />
  );
}
