// Outside the window wall: sky backdrop and an instanced lit skyline (seeded by roomSeed). Two draw calls.
import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { currentDaylight } from './daylight';
import * as THREE from 'three';
import { mulberry32 } from '../engine/sim';
import { skyTexture, windowsTexture } from './textures';
import { agentRoom } from '../../config/tuning';

const COUNT = 300;
const BAND = { x: [-95, 95], z: [-75, -28], h: [8, 46] } as const;
const SKY = { z: -110, w: 320, h: 120, y: 40 } as const;
const tmp = new THREE.Object3D();

export function skylineLayout(seed: number, count: number): { x: number; z: number; w: number; d: number; h: number }[] {
  const rnd = mulberry32(seed);
  const out = [];
  for (let i = 0; i < count; i++) {
    const z = BAND.z[0] + rnd() * (BAND.z[1] - BAND.z[0]);
    const near = (z - BAND.z[0]) / (BAND.z[1] - BAND.z[0]);
    out.push({
      x: BAND.x[0] + rnd() * (BAND.x[1] - BAND.x[0]),
      z,
      w: 4 + rnd() * 8,
      d: 4 + rnd() * 8,
      h: BAND.h[0] + rnd() * (BAND.h[1] - BAND.h[0]) * (1 - near * 0.6),
    });
  }
  return out;
}

export function Outside() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const skyMat = useRef<THREE.MeshBasicMaterial>(null);
  const cityMat = useRef<THREE.MeshStandardMaterial>(null);
  const clock = useRef(Infinity);
  // Day/night: re-read the local clock every 30 s (view only).
  useFrame((_, dt) => {
    clock.current += dt;
    if (clock.current < 30) return;
    clock.current = 0;
    const d = currentDaylight();
    skyMat.current?.color.setScalar(d.sky);
    if (cityMat.current) cityMat.current.emissiveIntensity = d.windows;
  });
  const sky = useMemo(() => skyTexture(), []);
  const win = useMemo(() => windowsTexture(agentRoom.roomSeed), []);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    skylineLayout(agentRoom.roomSeed, COUNT).forEach((b, i) => {
      tmp.position.set(b.x, b.h / 2 - 6, b.z); // street level sits 6 m below the office floor
      tmp.scale.set(b.w, b.h, b.d);
      tmp.updateMatrix();
      m.setMatrixAt(i, tmp.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  }, []);
  return (
    <group>
      <mesh position={[0, SKY.y, SKY.z]}>
        <planeGeometry args={[SKY.w, SKY.h]} />
        <meshBasicMaterial ref={skyMat} map={sky} fog={false} toneMapped={false} />
      </mesh>
      <instancedMesh ref={ref} args={[undefined, undefined, COUNT]}>
        <boxGeometry />
        <meshStandardMaterial ref={cityMat} color="#141b29" roughness={0.9} emissive="#ffffff" emissiveMap={win} emissiveIntensity={0.9} />
      </instancedMesh>
    </group>
  );
}
