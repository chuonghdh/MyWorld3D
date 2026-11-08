// Room shell: floor slabs (work area L-shape in dark tiles, pantry in warm planks; all tops at y = 0, side by side,
// never overlapping) and glass side walls (~80% transparent) with thin frames, so the office stays visible while
// orbiting. Glass sits 0.07 m outside the wall line, frames between the wall line and the glass: no shared faces.
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { ROOM } from './layout';
import { PANTRY } from './office';
import { floorTexture, plankTexture } from './textures';
import { agentRoom } from '../../config/tuning';

const SLAB = 0.1;
const FRAME = 0.05;
const GLASS_T = 0.02;
const GLASS_OUT = 0.07;
const MULLION_STEP = 2;
const tmp = new THREE.Object3D();

/** Floor rectangles [x0, x1, z0, z1]: work area left of the pantry, work strip in front of it, and the pantry. */
export function floorRects(): { work: [number, number, number, number][]; pantry: [number, number, number, number] } {
  const { halfW: w, halfD: d } = ROOM;
  return {
    work: [
      [-w, PANTRY.x0, -d, d],
      [PANTRY.x0, w, PANTRY.z1, d],
    ],
    pantry: [PANTRY.x0, w, -d, PANTRY.z1],
  };
}

/** Frame boxes along both side walls: verticals every 2 m plus top and bottom rails. */
export function sideFrames(): { x: number; y: number; z: number; h: number; d: number }[] {
  const out: { x: number; y: number; z: number; h: number; d: number }[] = [];
  for (const s of [-1, 1]) {
    const x = s * (ROOM.halfW + FRAME / 2);
    for (let z = -ROOM.halfD + MULLION_STEP; z < ROOM.halfD - 0.1; z += MULLION_STEP) out.push({ x, y: ROOM.wallH / 2, z, h: ROOM.wallH, d: FRAME });
    out.push({ x, y: ROOM.wallH - FRAME / 2, z: 0, h: FRAME, d: ROOM.halfD * 2 });
    out.push({ x, y: FRAME / 2, z: 0, h: FRAME, d: ROOM.halfD * 2 });
  }
  return out;
}

export function RoomShell() {
  const rects = useMemo(() => floorRects(), []);
  const tiles = useMemo(() => rects.work.map(([x0, x1, z0, z1]) => floorTexture(agentRoom.roomSeed, x1 - x0, z1 - z0)), [rects.work]);
  const planks = useMemo(() => {
    const [x0, x1, z0, z1] = rects.pantry;
    return plankTexture(agentRoom.roomSeed, x1 - x0, z1 - z0);
  }, [rects.pantry]);
  const frames = useRef<THREE.InstancedMesh>(null);
  const bars = useMemo(() => sideFrames(), []);
  useLayoutEffect(() => {
    const m = frames.current;
    if (!m) return;
    bars.forEach((b, i) => {
      tmp.position.set(b.x, b.y, b.z);
      tmp.scale.set(FRAME, b.h, b.d);
      tmp.updateMatrix();
      m.setMatrixAt(i, tmp.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  }, [bars]);
  const slab = (r: [number, number, number, number], key: string, mat: JSX.Element) => (
    <mesh key={key} position={[(r[0] + r[1]) / 2, -SLAB / 2, (r[2] + r[3]) / 2]} receiveShadow>
      <boxGeometry args={[r[1] - r[0], SLAB, r[3] - r[2]]} />
      {mat}
    </mesh>
  );
  return (
    <group>
      {rects.work.map((r, i) => slab(r, `w${i}`, <meshStandardMaterial map={tiles[i]} roughness={0.85} metalness={0.1} />))}
      {slab(rects.pantry, 'p', <meshStandardMaterial map={planks} roughness={0.7} />)}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (ROOM.halfW + GLASS_OUT), ROOM.wallH / 2, 0]} renderOrder={2}>
          <boxGeometry args={[GLASS_T, ROOM.wallH, ROOM.halfD * 2]} />
          <meshStandardMaterial color="#a8d8e8" transparent opacity={0.2} roughness={0.05} metalness={0.3} depthWrite={false} />
        </mesh>
      ))}
      <instancedMesh ref={frames} args={[undefined, undefined, bars.length]} castShadow>
        <boxGeometry />
        <meshStandardMaterial color="#1a2230" metalness={0.5} roughness={0.4} />
      </instancedMesh>
    </group>
  );
}
