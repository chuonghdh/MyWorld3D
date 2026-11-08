// Low glass partitions between neighbouring desks, and corner plants. Instanced, 4 draw calls.
import { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { DESK_COLS, DESK_ROWS, ROOM } from './layout';

const GLASS = { h: 1.1, t: 0.03, w: 1.4 } as const;
const FRAME_H = 0.04;
const tmp = new THREE.Object3D();

/** Low glass divider between the two desks of each block row (along z, so it never crosses a walking stub). */
export function partitions(): { x: number; z: number; yaw: number }[] {
  const out = [];
  for (const [a, b] of [[0, 1], [2, 3]] as const)
    for (const z of DESK_ROWS) out.push({ x: (DESK_COLS[a] + DESK_COLS[b]) / 2, z: z + 0.2, yaw: Math.PI / 2 });
  return out;
}

/** Plants: back-left corner, front-right corner, and mid left wall. */
export const PLANT_SPOTS: readonly (readonly [number, number])[] = [
  [-ROOM.halfW + 0.8, -ROOM.halfD + 0.8],
  [ROOM.halfW - 0.8, ROOM.halfD - 0.8],
  [-ROOM.halfW + 0.8, 1.6],
];
const PLANTS = PLANT_SPOTS;
export function Decor() {
  const glass = useRef<THREE.InstancedMesh>(null);
  const frame = useRef<THREE.InstancedMesh>(null);
  const pots = useRef<THREE.InstancedMesh>(null);
  const leaves = useRef<THREE.InstancedMesh>(null);
  const parts = partitions();
  useLayoutEffect(() => {
    parts.forEach((p, i) => {
      tmp.rotation.set(0, p.yaw, 0);
      tmp.scale.set(1, 1, 1);
      tmp.position.set(p.x, GLASS.h / 2, p.z);
      tmp.updateMatrix();
      glass.current?.setMatrixAt(i, tmp.matrix);
      tmp.position.set(p.x, GLASS.h + FRAME_H / 2 + 0.002, p.z); // frame rests 2 mm above the glass top
      tmp.updateMatrix();
      frame.current?.setMatrixAt(i, tmp.matrix);
    });
    PLANTS.forEach(([x, z], i) => {
      tmp.rotation.set(0, 0, 0);
      tmp.position.set(x, 0.25, z);
      tmp.updateMatrix();
      pots.current?.setMatrixAt(i, tmp.matrix);
      for (let k = 0; k < 2; k++) {
        tmp.position.set(x + (k ? 0.08 : -0.06), 0.78 + k * 0.32, z + (k ? -0.05 : 0.04));
        tmp.scale.setScalar(k ? 0.3 : 0.42);
        tmp.updateMatrix();
        leaves.current?.setMatrixAt(i * 2 + k, tmp.matrix);
        tmp.scale.setScalar(1);
      }
    });
    for (const m of [glass, frame, pots, leaves]) if (m.current) m.current.instanceMatrix.needsUpdate = true;
  }, [parts]);
  return (
    <group>
      <instancedMesh ref={glass} args={[undefined, undefined, parts.length]}>
        <boxGeometry args={[GLASS.w, GLASS.h, GLASS.t]} />
        <meshStandardMaterial color="#9ad7e6" transparent opacity={0.12} roughness={0.1} depthWrite={false} />
      </instancedMesh>
      <instancedMesh ref={frame} args={[undefined, undefined, parts.length]}>
        <boxGeometry args={[GLASS.w, FRAME_H, GLASS.t + 0.02]} />
        <meshStandardMaterial color="#1a2230" metalness={0.4} />
      </instancedMesh>
      <instancedMesh ref={pots} args={[undefined, undefined, PLANTS.length]} castShadow>
        <cylinderGeometry args={[0.22, 0.17, 0.5, 16]} />
        <meshStandardMaterial color="#d9dde3" roughness={0.6} />
      </instancedMesh>
      <instancedMesh ref={leaves} args={[undefined, undefined, PLANTS.length * 2]} castShadow>
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial color="#2f6b45" roughness={0.8} flatShading />
      </instancedMesh>
    </group>
  );
}
