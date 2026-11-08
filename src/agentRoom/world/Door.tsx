// Guest entrance on the left wall: a dark door opening with a leaf that slides open while a guest subagent comes in
// or leaves, plus a bench beside it. Frame 1 cm off the wall face, leaf 3 cm further in: no shared faces.
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { LiveWorld } from './liveWorld';
import { DOOR, GUEST_BENCH, SOFA_SEAT_Y } from './office';
import { ROOM } from './layout';
import { dampK } from './cameraPresets';

const WALL_X = -ROOM.halfW;
const NEAR = 2.2;

export function Door({ world }: { world: LiveWorld }) {
  const leaf = useRef<THREE.Mesh>(null);
  const open = useRef(0);
  useFrame((_, dt) => {
    const g = world.agents.guest;
    const near = Math.hypot(g.pos.x - WALL_X, g.pos.z - DOOR.z) < NEAR;
    const want = g.activity !== 'hidden' && near && !(g.arrived && g.activity === 'relax') ? 1 : 0;
    open.current += (want - open.current) * dampK(4, dt);
    if (leaf.current) leaf.current.position.z = DOOR.z - open.current * DOOR.w * 0.95;
  });
  return (
    <group>
      <mesh position={[WALL_X + 0.02, DOOR.h / 2, DOOR.z]}>
        <boxGeometry args={[0.02, DOOR.h + 0.1, DOOR.w + 0.1]} />
        <meshStandardMaterial color="#05070a" roughness={0.9} />
      </mesh>
      <mesh ref={leaf} position={[WALL_X + 0.06, DOOR.h / 2, DOOR.z]} castShadow>
        <boxGeometry args={[0.04, DOOR.h, DOOR.w]} />
        <meshStandardMaterial color="#6b7a90" metalness={0.5} roughness={0.35} />
      </mesh>
      <mesh position={[WALL_X + 0.1, 2.0, DOOR.z + DOOR.w / 2 + 0.25]}>
        <boxGeometry args={[0.03, 0.12, 0.3]} />
        <meshBasicMaterial color="#6fe3a4" toneMapped={false} />
      </mesh>
      <mesh position={[GUEST_BENCH.x, SOFA_SEAT_Y / 2, GUEST_BENCH.z]} castShadow receiveShadow>
        <boxGeometry args={[0.5, SOFA_SEAT_Y, 1.2]} />
        <meshStandardMaterial color="#b98a5e" roughness={0.6} />
      </mesh>
    </group>
  );
}
