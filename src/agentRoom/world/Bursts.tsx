// Celebration bursts: when an agent finishes (status done), a short ring of sparks rises around it. One instanced
// mesh; spark paths are a pure function of (agent index, spark index, age), no randomness.
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { AgentId } from '../model/types';
import type { Runtime } from '../runtime';
import { ALL_AGENTS } from '../engine/state';
import { AGENT_COLOR } from './palette';
import { agentRoom } from '../../config/tuning';

const SPARKS = 14;
const obj = new THREE.Object3D();
const col = new THREE.Color();

/** Spark offset at age01 in [0, 1]: out and up, then falling. */
export function sparkOffset(j: number, age01: number): [number, number, number] {
  const a = (j / SPARKS) * Math.PI * 2;
  const r = 0.2 + age01 * 0.9;
  const y = 1.6 + age01 * 1.2 - age01 * age01 * 1.4;
  return [Math.cos(a) * r, y, Math.sin(a) * r];
}

export function Bursts({ rt }: { rt: Runtime }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    const life = agentRoom.celebrateSec * 1000;
    let n = 0;
    for (const id of ALL_AGENTS) {
      const a = rt.state.agents[id as AgentId];
      const age = rt.world.now - a.lastEventT;
      if (a.status !== 'done' || age < 0 || age > life) continue;
      const p = rt.world.agents[id as AgentId].pos;
      const k = age / life;
      col.set(AGENT_COLOR[id as AgentId]).multiplyScalar(1.5 * (1 - k));
      for (let j = 0; j < SPARKS; j++) {
        const o = sparkOffset(j, k);
        obj.position.set(p.x + o[0], o[1], p.z + o[2]);
        obj.scale.setScalar(1 - k * 0.6);
        obj.updateMatrix();
        m.setMatrixAt(n, obj.matrix);
        m.setColorAt(n++, col);
      }
    }
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, ALL_AGENTS.length * SPARKS]} frustumCulled={false}>
      <octahedronGeometry args={[0.05, 0]} />
      <meshBasicMaterial transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
    </instancedMesh>
  );
}
