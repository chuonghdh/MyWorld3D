// Extra room plants from plants.ts: pots and crowns as two instanced meshes (2 draw calls for all plants). Tall and
// short plants differ in pot height, crown size and total height (agentRoom knobs).
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { agentRoom } from '../../config/tuning';
import { plantSpots } from './plants';

const POT = { h: 0.5, rTop: 0.22, rBot: 0.17 } as const; // unit pot, scaled per plant
const POT_H = { tall: 0.45, short: 0.3 } as const;
const CROWN_R = { tall: 0.5, short: 0.22 } as const;
const tmp = new THREE.Object3D();

export function PlantRows() {
  const plants = useMemo(() => plantSpots(), []);
  const pots = useRef<THREE.InstancedMesh>(null);
  const crowns = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    plants.forEach((p, i) => {
      const kind = p.tall ? 'tall' : 'short';
      const total = p.tall ? agentRoom.plantTallHeightM : agentRoom.plantShortHeightM;
      const potH = POT_H[kind];
      tmp.rotation.set(0, 0, 0);
      tmp.scale.set(1, potH / POT.h, 1);
      tmp.position.set(p.x, potH / 2, p.z);
      tmp.updateMatrix();
      pots.current?.setMatrixAt(i, tmp.matrix);
      const r = CROWN_R[kind];
      tmp.scale.setScalar(r);
      tmp.position.set(p.x, total - r, p.z); // crown top at the plant's total height
      tmp.updateMatrix();
      crowns.current?.setMatrixAt(i, tmp.matrix);
    });
    for (const m of [pots, crowns]) if (m.current) m.current.instanceMatrix.needsUpdate = true;
  }, [plants]);
  return (
    <group>
      <instancedMesh ref={pots} args={[undefined, undefined, plants.length]} castShadow>
        <cylinderGeometry args={[POT.rTop, POT.rBot, POT.h, 16]} />
        <meshStandardMaterial color="#d9dde3" roughness={0.6} />
      </instancedMesh>
      <instancedMesh ref={crowns} args={[undefined, undefined, plants.length]} castShadow>
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial color="#2f6b45" roughness={0.8} flatShading />
      </instancedMesh>
    </group>
  );
}
