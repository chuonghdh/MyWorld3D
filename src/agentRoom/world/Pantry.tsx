// Pantry lounge (back-right corner): rug, two sofas, coffee table, bar table with stools, counter with a coffee
// machine, plants, a warm pendant. All static furniture is one merged mesh (vertex colours); steam is instanced.
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeParts, type Part } from './geometry';
import { BAR_TABLE, COFFEE_TABLE, COUNTER_STOOL, PANTRY, SOFA_SEAT_Y, STOOL_SEAT_Y } from './office';
import { ROOM } from './layout';
import type { LiveWorld } from './liveWorld';

const SOFA = '#34465e';
const CUSHION = '#43566f';
const WOOD = '#6e5d50';
const METAL = '#2a3240';
const RUG_T = 0.012;
const RUG_LIFT = 0.002; // rug underside 2 mm above the floor top
const COUNTER = { x: ROOM.halfW - 0.45, z: -2.6, w: 0.7, d: 1.6, h: 0.95 } as const;
const MACHINE = { x: COUNTER.x, y: COUNTER.h, z: COUNTER.z - 0.35 } as const;
const STEAM = 8;
const GLASS_WALL = { h: 2.2 } as const;
const SOFA_B_X = ROOM.halfW - 2.85;
const PENDANT = { x: BAR_TABLE.x, y: 2.45, z: BAR_TABLE.z } as const; // one warm pendant over the bar

const box = (w: number, h: number, d: number, x: number, y: number, z: number, color: string): Part => ({ geo: new THREE.BoxGeometry(w, h, d).translate(x, y, z), color });
const cyl = (r: number, h: number, x: number, y: number, z: number, color: string, seg = 16): Part => ({
  geo: new THREE.CylinderGeometry(r, r, h, seg).translate(x, y, z),
  color,
});

function furniture(): THREE.BufferGeometry {
  const p: Part[] = [];
  const sx = ROOM.halfW - 0.45; // sofa A along the right wall, facing -x
  const az = -5.5;
  p.push(box(0.8, SOFA_SEAT_Y - 0.05, 2.9, sx + 0.05, (SOFA_SEAT_Y - 0.05) / 2, az, SOFA));
  p.push(box(0.7, 0.1, 2.8, sx, SOFA_SEAT_Y - 0.05 + 0.05, az, CUSHION));
  p.push(box(0.2, 0.55, 2.9, sx + 0.35, SOFA_SEAT_Y + 0.22, az, SOFA));
  for (const z of [az - 1.5, az + 1.5]) p.push(box(0.8, 0.62, 0.15, sx + 0.05, 0.31, z, SOFA));
  const sz = -ROOM.halfD + 0.45; // sofa B along the back wall, facing +z
  p.push(box(2.1, SOFA_SEAT_Y - 0.05, 0.8, SOFA_B_X, (SOFA_SEAT_Y - 0.05) / 2, sz - 0.05, SOFA));
  p.push(box(2.0, 0.1, 0.7, SOFA_B_X, SOFA_SEAT_Y, sz, CUSHION));
  p.push(box(2.1, 0.55, 0.2, SOFA_B_X, SOFA_SEAT_Y + 0.22, sz - 0.35, SOFA));  // Coffee table.
  p.push(box(1.1, 0.05, 0.7, COFFEE_TABLE.x, 0.4, COFFEE_TABLE.z, WOOD));
  p.push(cyl(0.05, 0.37, COFFEE_TABLE.x, 0.185, COFFEE_TABLE.z, METAL));
  // Bar table and stools.
  p.push(cyl(0.45, 0.04, BAR_TABLE.x, 1.02, BAR_TABLE.z, WOOD, 28));
  p.push(cyl(0.05, 1.0, BAR_TABLE.x, 0.5, BAR_TABLE.z, METAL));
  for (const [x, z] of [[BAR_TABLE.x - 0.8, BAR_TABLE.z], [BAR_TABLE.x, BAR_TABLE.z + 0.85], [BAR_TABLE.x + 0.8, BAR_TABLE.z], [BAR_TABLE.x, BAR_TABLE.z - 0.85], [COUNTER_STOOL.x, COUNTER_STOOL.z]] as const) {
    p.push(cyl(0.2, 0.05, x, STOOL_SEAT_Y - 0.025, z, CUSHION, 20));
    p.push(cyl(0.03, STOOL_SEAT_Y - 0.05, x, (STOOL_SEAT_Y - 0.05) / 2, z, METAL, 8));
  }
  // Counter and coffee machine.
  p.push(box(COUNTER.w, COUNTER.h, COUNTER.d, COUNTER.x, COUNTER.h / 2, COUNTER.z, '#e9edf2'));
  p.push(box(0.36, 0.42, 0.3, MACHINE.x, MACHINE.y + 0.21, MACHINE.z, '#1a1f27'));
  p.push(box(0.2, 0.06, 0.02, MACHINE.x - 0.17, MACHINE.y + 0.3, MACHINE.z, '#f2b46a'));
  for (let i = 0; i < 3; i++) p.push(cyl(0.04, 0.09, MACHINE.x - 0.1, MACHINE.y + 0.045, COUNTER.z + 0.1 + i * 0.16, '#f3efe6', 12));
  // Plants.
  for (const [x, z] of [[PANTRY.x0 + 0.4, PANTRY.z0 + 0.2], [ROOM.halfW - 0.5, PANTRY.z0 + 0.05]] as const) {
    p.push(cyl(0.2, 0.45, x, 0.225, z, '#d9dde3'));
    p.push({ geo: new THREE.IcosahedronGeometry(0.38, 1).translate(x, 0.75, z), color: '#2f6b45' });
  }
  // Pendant lamp shade and cord.
  p.push(cyl(0.01, ROOM.wallH - PENDANT.y, PENDANT.x, (ROOM.wallH + PENDANT.y) / 2, PENDANT.z, METAL, 6));
  return mergeParts(p);
}

export function Pantry({ world }: { world: LiveWorld }) {
  const geo = useMemo(() => furniture(), []);
  const steam = useRef<THREE.InstancedMesh>(null);
  const t = useRef(0);
  const obj = useMemo(() => new THREE.Object3D(), []);
  useFrame((_, dt) => {
    t.current += dt;
    const m = steam.current;
    if (!m) return;
    // Steam only while someone is relaxing in the lounge.
    m.visible = Object.values(world.agents).some((a) => a.activity === 'relax' && a.arrived);
    if (!m.visible) return;
    for (let i = 0; i < STEAM; i++) {
      const life = (t.current * 0.5 + i / STEAM) % 1;
      obj.position.set(MACHINE.x - 0.1 + Math.sin(i * 2.3 + t.current) * 0.03, MACHINE.y + 0.45 + life * 0.5, MACHINE.z + 0.05);
      obj.scale.setScalar(0.4 + life * 0.9);
      obj.updateMatrix();
      m.setMatrixAt(i, obj.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <group>
      <mesh position={[ROOM.halfW - 2.6, RUG_LIFT + RUG_T / 2, -5.6]} receiveShadow>
        <boxGeometry args={[3.6, RUG_T, 3.4]} />
        <meshStandardMaterial color="#3a332e" roughness={0.95} />
      </mesh>
      {/* Glass partition between the pantry and the lead / board area (west side); the corridor enters from the south. */}
      <mesh position={[PANTRY.x0, GLASS_WALL.h / 2, (-ROOM.halfD + PANTRY.z1) / 2]} renderOrder={2}>
        <boxGeometry args={[0.03, GLASS_WALL.h, PANTRY.z1 + ROOM.halfD]} />
        <meshStandardMaterial color="#a8d8e8" transparent opacity={0.2} roughness={0.05} depthWrite={false} />
      </mesh>
      <mesh position={[PANTRY.x0, GLASS_WALL.h + 0.002 + 0.025, (-ROOM.halfD + PANTRY.z1) / 2]}>
        <boxGeometry args={[0.06, 0.05, PANTRY.z1 + ROOM.halfD]} />
        <meshStandardMaterial color="#1a2230" metalness={0.5} />
      </mesh>
      <mesh geometry={geo} castShadow receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.7} />
      </mesh>
      <mesh position={[PENDANT.x, PENDANT.y, PENDANT.z]}>
        <coneGeometry args={[0.3, 0.25, 24, 1, true]} />
        <meshStandardMaterial color="#ffcf9a" emissive="#ffb070" emissiveIntensity={1.4} side={THREE.DoubleSide} />
      </mesh>
      <pointLight position={[PENDANT.x, PENDANT.y - 0.2, PENDANT.z]} color="#ffc48a" intensity={12} distance={7} decay={2} />
      <instancedMesh ref={steam} args={[undefined, undefined, STEAM]} frustumCulled={false}>
        <sphereGeometry args={[0.05, 8, 6]} />
        <meshBasicMaterial color="#e8eef5" transparent opacity={0.25} depthWrite={false} />
      </instancedMesh>
    </group>
  );
}
