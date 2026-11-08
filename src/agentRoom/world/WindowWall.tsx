// Back wall: solid panel behind the command board (centre-left) with floor-to-ceiling windows either side.
// Glass sits 0.1 m behind the wall face plane, mullions stand 0.02 m in front of the glass: no shared faces.
import { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { ROOM, WALL_SCREEN } from './layout';

const PANEL_W = WALL_SCREEN.w + 1.6;
const PANEL_L = WALL_SCREEN.x - PANEL_W / 2;
const PANEL_R = WALL_SCREEN.x + PANEL_W / 2;
const MULLION = 0.06;
const GLASS_Z = -ROOM.halfD - 0.1;
const SILL_H = 0.12;
const tmp = new THREE.Object3D();

/** Window sections [x0, x1] left and right of the solid panel. */
export const SECTIONS: readonly [number, number][] = [
  [-ROOM.halfW, PANEL_L],
  [PANEL_R, ROOM.halfW],
];

/** Mullion boxes: verticals every 1.6 m in each window section, plus top and sill rails. */
export function mullions(): { x: number; y: number; w: number; h: number }[] {
  const out: { x: number; y: number; w: number; h: number }[] = [];
  for (const [x0, x1] of SECTIONS) {
    for (let x = x0 + 1.6; x < x1 - 0.2; x += 1.6) out.push({ x, y: ROOM.wallH / 2, w: MULLION, h: ROOM.wallH });
    out.push({ x: (x0 + x1) / 2, y: ROOM.wallH - MULLION / 2, w: x1 - x0, h: MULLION });
    out.push({ x: (x0 + x1) / 2, y: SILL_H + MULLION / 2, w: x1 - x0, h: MULLION });
  }
  return out;
}

export function WindowWall() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const bars = mullions();
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    bars.forEach((b, i) => {
      tmp.position.set(b.x, b.y, GLASS_Z + 0.02 + MULLION / 2);
      tmp.scale.set(b.w, b.h, MULLION);
      tmp.updateMatrix();
      m.setMatrixAt(i, tmp.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  }, [bars]);
  return (
    <group>
      <mesh position={[WALL_SCREEN.x, ROOM.wallH / 2, -ROOM.halfD - ROOM.wallT / 2]} receiveShadow>
        <boxGeometry args={[PANEL_W, ROOM.wallH, ROOM.wallT]} />
        <meshStandardMaterial color="#121823" roughness={0.8} />
      </mesh>
      {SECTIONS.map(([x0, x1]) => (
        <group key={x0}>
          <mesh position={[(x0 + x1) / 2, SILL_H / 2, -ROOM.halfD - ROOM.wallT / 2]}>
            <boxGeometry args={[x1 - x0, SILL_H, ROOM.wallT]} />
            <meshStandardMaterial color="#0e131b" />
          </mesh>
          <mesh position={[(x0 + x1) / 2, (ROOM.wallH + SILL_H) / 2, GLASS_Z]}>
            <planeGeometry args={[x1 - x0, ROOM.wallH - SILL_H]} />
            <meshStandardMaterial color="#9ad7e6" transparent opacity={0.08} roughness={0.05} metalness={0.4} depthWrite={false} />
          </mesh>
        </group>
      ))}
      <instancedMesh ref={ref} args={[undefined, undefined, bars.length]} castShadow>
        <boxGeometry />
        <meshStandardMaterial color="#1a2230" metalness={0.5} roughness={0.4} />
      </instancedMesh>
    </group>
  );
}
