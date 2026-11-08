// Personalised desks: a small prop per specialist on the free front corner of its desk (one merged mesh), a status
// lamp per desk (green working, amber waiting, red error, dim otherwise), and three animated bits: Audio EQ bars,
// Sky & Environment globe, Traffic & Life car on its track. 5 draw calls.
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { AgentId } from '../model/types';
import type { Runtime } from '../runtime';
import { DESK, SPECIALISTS, deskPose } from './layout';
import { AGENT_COLOR } from './palette';
import { mergeParts, type Part } from './geometry';

const TOP = DESK.h; // desk top surface; props start 1 mm above it
const LIFT = 0.001;
const PROP = { x: 0.55, z: 0.22 } as const; // desk-local corner (+z toward the hub)
const LAMP = { x: -0.68, z: -0.3, y: 0.036 } as const; // sphere r 0.035 rests 1 mm above the top
const EQ = 5;

/** Desk-local -> world matrix (desk yaw; +z faces the hub). */
export function deskMatrix(id: AgentId, x: number, y: number, z: number, side = 1): THREE.Matrix4 {
  const { pos, yaw } = deskPose(id);
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const lx = x * side;
  return new THREE.Matrix4().compose(
    new THREE.Vector3(pos.x + lx * c + z * s, y, pos.z - lx * s + z * c),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)),
    new THREE.Vector3(1, 1, 1),
  );
}

const B = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
const C = (r: number, h: number, x: number, y: number, z: number, seg = 12) => new THREE.CylinderGeometry(r, r, h, seg).translate(x, y + h / 2, z);

/** Prop parts in prop-local space (origin on the desk top). */
function propParts(id: AgentId): Part[] {
  const c = AGENT_COLOR[id];
  switch (id) {
    case 'buildings':
      return [
        { geo: B(0.12, 0.16, 0.12, 0, 0, 0), color: '#d9dde3' },
        { geo: B(0.09, 0.14, 0.09, 0, 0.16, 0), color: c },
        { geo: B(0.06, 0.1, 0.06, 0, 0.3, 0), color: '#d9dde3' },
      ];
    case 'city-streets':
      return [
        { geo: B(0.28, 0.015, 0.2, 0, 0, 0), color: '#3f6b4a' },
        { geo: B(0.28, 0.004, 0.03, 0, 0.015, 0), color: '#c9c9c9' },
        { geo: B(0.04, 0.06, 0.04, -0.08, 0.015, 0.05), color: c },
        { geo: B(0.05, 0.09, 0.05, 0.07, 0.015, -0.05), color: '#d9dde3' },
      ];
    case 'traffic-life':
      return [{ geo: new THREE.TorusGeometry(0.11, 0.012, 6, 32).rotateX(Math.PI / 2).translate(0, 0.012, 0), color: '#30343c' }];
    case 'sky-environment':
      return [
        { geo: C(0.05, 0.02, 0, 0, 0), color: '#30343c' },
        { geo: C(0.008, 0.12, 0, 0.02, 0, 6), color: '#30343c' },
      ];
    case 'audio':
      return [
        { geo: B(0.08, 0.16, 0.08, -0.1, 0, 0), color: '#1a1f27' },
        { geo: B(0.08, 0.16, 0.08, 0.1, 0, 0), color: '#1a1f27' },
        { geo: C(0.025, 0.004, -0.1, 0.1, 0.04, 16).rotateX(Math.PI / 2), color: c },
      ];
    case 'ui-camera':
      return [
        ...[-1, 0, 1].map((k) => ({ geo: C(0.006, 0.22, 0.05 * Math.cos(k * 2.1), 0, 0.05 * Math.sin(k * 2.1), 6), color: '#30343c' })),
        { geo: B(0.12, 0.08, 0.07, 0, 0.22, 0), color: '#1a1f27' },
        { geo: C(0.03, 0.05, 0, 0.235, 0.05, 16).rotateX(Math.PI / 2).translate(0, 0.0, 0.0), color: c },
      ];
    case 'scene-qa':
      return [
        { geo: C(0.06, 0.14, 0, 0, 0, 16), color: '#a8d8c8' },
        { geo: C(0.065, 0.02, 0, 0.14, 0, 16), color: '#30343c' },
        { geo: B(0.16, 0.005, 0.2, 0.15, 0, 0), color: '#f3efe6' },
        { geo: B(0.12, 0.004, 0.012, 0.15, 0.006, -0.04), color: c },
      ];
    case 'architect':
      return [
        { geo: B(0.32, 0.006, 0.22, 0, 0.0, 0).rotateX(-0.25).translate(0, 0.04, 0), color: '#2d5f9a' },
        { geo: B(0.3, 0.004, 0.02, 0, 0.0, 0).rotateX(-0.25).translate(0, 0.05, 0.05), color: '#eef2f7' },
        { geo: B(0.02, 0.04, 0.2, -0.14, 0, 0), color: '#30343c' },
      ];
    default:
      return [];
  }
}

function propsGeometry(): THREE.BufferGeometry {
  const parts: Part[] = [];
  SPECIALISTS.forEach((id, i) => {
    const m = deskMatrix(id, PROP.x, TOP + LIFT, PROP.z, i % 2 ? -1 : 1);
    for (const p of propParts(id)) parts.push({ geo: p.geo.applyMatrix4(m), color: p.color });
  });
  return mergeParts(parts);
}

const ANIM = {
  audio: SPECIALISTS.indexOf('audio'),
  sky: SPECIALISTS.indexOf('sky-environment'),
  traffic: SPECIALISTS.indexOf('traffic-life'),
};
const side = (i: number) => (i % 2 ? -1 : 1);
const obj = new THREE.Object3D();
const m4 = new THREE.Matrix4();
const col = new THREE.Color();

export function DeskProps({ rt }: { rt: Runtime }) {
  const geo = useMemo(() => propsGeometry(), []);
  const lamps = useRef<THREE.InstancedMesh>(null);
  const eq = useRef<THREE.InstancedMesh>(null);
  const globe = useRef<THREE.Mesh>(null);
  const car = useRef<THREE.Mesh>(null);
  const t = useRef(0);
  const lampMats = useMemo(() => SPECIALISTS.map((id) => deskMatrix(id, LAMP.x, TOP + LAMP.y, LAMP.z)), []);
  const base = useMemo(
    () => ({
      audio: deskMatrix('audio', PROP.x, TOP + LIFT, PROP.z, side(ANIM.audio)),
      sky: deskMatrix('sky-environment', PROP.x, TOP + LIFT, PROP.z, side(ANIM.sky)),
      traffic: deskMatrix('traffic-life', PROP.x, TOP + LIFT + 0.02, PROP.z, side(ANIM.traffic)),
    }),
    [],
  );

  useFrame((_, dt) => {
    t.current += dt;
    const s = rt.state;
    SPECIALISTS.forEach((id, i) => {
      const st = s.agents[id].status;
      const on = rt.world.agents[id].glow;
      col.set(st === 'error' ? '#ff4a3a' : st === 'waiting' ? '#ffb347' : '#3dff8f').multiplyScalar(st === 'error' || st === 'waiting' ? 1.6 : 0.15 + on * 1.5);
      lamps.current?.setColorAt(i, col);
      lamps.current?.setMatrixAt(i, lampMats[i]!);
    });
    if (lamps.current) {
      lamps.current.instanceMatrix.needsUpdate = true;
      if (lamps.current.instanceColor) lamps.current.instanceColor.needsUpdate = true;
    }
    const audioOn = rt.world.agents.audio.glow;
    for (let k = 0; k < EQ; k++) {
      const h = 0.02 + (0.03 + 0.09 * audioOn) * (0.5 + 0.5 * Math.sin(t.current * (6 + k * 1.7) + k));
      obj.position.set(-0.05 + k * 0.025, h / 2 + 0.001, 0.06);
      obj.scale.set(1, h / 0.1, 1);
      obj.updateMatrix();
      eq.current?.setMatrixAt(k, m4.multiplyMatrices(base.audio, obj.matrix));
    }
    if (eq.current) eq.current.instanceMatrix.needsUpdate = true;
    if (globe.current) {
      obj.position.set(0, 0.21, 0); // globe rests on the 0.14 m stand
      obj.rotation.set(0.4, t.current * (0.3 + rt.world.agents['sky-environment'].glow), 0);
      obj.scale.setScalar(1);
      obj.updateMatrix();
      globe.current.matrix.multiplyMatrices(base.sky, obj.matrix);
      obj.rotation.set(0, 0, 0);
    }
    if (car.current) {
      const a = t.current * (0.8 + 2 * rt.world.agents['traffic-life'].glow);
      obj.position.set(Math.cos(a) * 0.11, 0.012, Math.sin(a) * 0.11);
      obj.rotation.set(0, -a, 0);
      obj.updateMatrix();
      car.current.matrix.multiplyMatrices(base.traffic, obj.matrix);
      obj.rotation.set(0, 0, 0);
    }
  });

  return (
    <group>
      <mesh geometry={geo} castShadow>
        <meshStandardMaterial vertexColors roughness={0.5} />
      </mesh>
      <instancedMesh ref={lamps} args={[undefined, undefined, SPECIALISTS.length]}>
        <sphereGeometry args={[0.035, 12, 8]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={eq} args={[undefined, undefined, EQ]} frustumCulled={false}>
        <boxGeometry args={[0.018, 0.1, 0.01]} />
        <meshBasicMaterial color={AGENT_COLOR.audio} toneMapped={false} />
      </instancedMesh>
      <mesh ref={globe} matrixAutoUpdate={false} frustumCulled={false}>
        <sphereGeometry args={[0.07, 20, 14]} />
        <meshStandardMaterial color="#2e7bd6" emissive="#6cb8ff" emissiveIntensity={0.6} roughness={0.3} />
      </mesh>
      <mesh ref={car} matrixAutoUpdate={false} frustumCulled={false}>
        <boxGeometry args={[0.05, 0.025, 0.025]} />
        <meshStandardMaterial color="#ff5a4a" />
      </mesh>
    </group>
  );
}
