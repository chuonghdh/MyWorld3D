// White round stools without backrests on the discuss-table seat ring: seat disc, pole and round foot, all merged
// into one mesh (1 draw call). Seat tops sit at STOOL_SEAT_Y, where the seated robots rest.
import { useMemo } from 'react';
import * as THREE from 'three';
import { SEAT_COUNT, seatPos } from './layout';
import { mergeParts, type Part } from './geometry';
import { STOOL_SEAT_Y } from './office';

const STOOL = { r: 0.2, seatT: 0.05, poleR: 0.025, footR: 0.18, footT: 0.02 } as const;
const COLOR = '#f7f8fa';

export function Stools() {
  const geo = useMemo(() => {
    const parts: Part[] = [];
    for (let k = 0; k < SEAT_COUNT; k++) {
      const { x, z } = seatPos(k);
      const at = (g: THREE.BufferGeometry, y: number) => g.translate(x, y, z);
      parts.push({ geo: at(new THREE.CylinderGeometry(STOOL.r, STOOL.r, STOOL.seatT, 24), STOOL_SEAT_Y - STOOL.seatT / 2), color: COLOR });
      parts.push({ geo: at(new THREE.CylinderGeometry(STOOL.poleR, STOOL.poleR, STOOL_SEAT_Y - STOOL.seatT - STOOL.footT, 10), (STOOL_SEAT_Y - STOOL.seatT + STOOL.footT) / 2), color: COLOR });
      parts.push({ geo: at(new THREE.CylinderGeometry(STOOL.footR, STOOL.footR, STOOL.footT, 24), STOOL.footT / 2), color: COLOR });
    }
    return mergeParts(parts);
  }, []);
  return (
    <mesh geometry={geo} castShadow receiveShadow>
      <meshStandardMaterial vertexColors roughness={0.45} />
    </mesh>
  );
}
