// Dotted path trails (instanced discs, additive, fading with age) and a breathing ring at each walker's target.
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { AgentId } from '../model/types';
import type { Runtime } from '../runtime';
import { homeSpot } from './layout';
import { huddleSlot } from './office';
import { ALL_AGENTS } from '../engine/state';
import { AGENT_COLOR } from './palette';
import { useUi } from '../ui/uiStore';
import { agentRoom } from '../../config/tuning';

const DOT_Y = 0.006; // dots and target rings float above the floor top (y = 0), under the robot rings
const DEST_Y = 0.01;
const DOT_R = 0.05;
const ARRIVED = 0.15;
const PULSE_LINKS = 8;
const PULSE_DOTS = 7;
const PULSE_MS = 2500;
const obj = new THREE.Object3D();
const col = new THREE.Color();

export function Trails({ rt }: { rt: Runtime }) {
  const world = rt.world;
  const cap = agentRoom.trailLength;
  const dots = useRef<THREE.InstancedMesh>(null);
  const dest = useRef<THREE.InstancedMesh>(null);
  const phase = useRef(0);
  const count = ALL_AGENTS.length * cap + PULSE_LINKS * PULSE_DOTS;
  const dotGeo = useMemo(() => new THREE.CircleGeometry(DOT_R, 10).rotateX(-Math.PI / 2), []);
  const ringGeo = useMemo(() => new THREE.RingGeometry(0.3, 0.36, 32).rotateX(-Math.PI / 2), []);

  useFrame((_, dt) => {
    phase.current += dt;
    const d = dots.current;
    const r = dest.current;
    if (!d || !r) return;
    const show = useUi.getState().showTrails;
    let n = 0;
    for (let a = 0; a < ALL_AGENTS.length; a++) {
      const id = ALL_AGENTS[a] as AgentId;
      const t = world.agents[id];
      const tc = t.trail.length / 2;
      for (let j = 0; show && j < t.trailCount; j++) {
        const k = (t.trailHead - 1 - j + tc * 2) % tc;
        const age = j / Math.max(1, t.trailCount);
        obj.position.set(t.trail[k * 2]!, DOT_Y, t.trail[k * 2 + 1]!);
        obj.scale.setScalar(1 - age * 0.6);
        obj.updateMatrix();
        d.setMatrixAt(n, obj.matrix);
        d.setColorAt(n, col.set(AGENT_COLOR[id]).multiplyScalar((1 - age) * 0.9));
        n++;
      }
      const away = Math.hypot(t.target.x - t.pos.x, t.target.z - t.pos.z) > ARRIVED;
      obj.position.set(t.target.x, DEST_Y, t.target.z);
      obj.scale.setScalar(show && away ? 1 + 0.15 * Math.sin(phase.current * 4) : 0.0001);
      obj.updateMatrix();
      r.setMatrixAt(a, obj.matrix);
      r.setColorAt(a, col.set(AGENT_COLOR[id]).multiplyScalar(0.8));
    }
    // Delegation pulse: a light running along the floor from the called agent's desk to its board slot.
    let shown = 0;
    for (let i = rt.state.links.length - 1; i >= 0 && shown < PULSE_LINKS; i--) {
      const l = rt.state.links[i]!;
      const age = world.now - l.t;
      if (age < 0 || age > PULSE_MS || l.to === 'lead') continue;
      shown++;
      const a = homeSpot(l.to);
      const b = huddleSlot(l.to);
      for (let k = 0; k < PULSE_DOTS; k++) {
        const u = (age / 700 + k / PULSE_DOTS) % 1;
        obj.position.set(a.x + (b.x - a.x) * u, DOT_Y, a.z + (b.z - a.z) * u);
        obj.scale.setScalar(1.3);
        obj.updateMatrix();
        d.setMatrixAt(n, obj.matrix);
        d.setColorAt(n++, col.set(AGENT_COLOR[l.to]).multiplyScalar(1.2 * (1 - age / PULSE_MS)));
      }
    }
    d.count = n;
    d.instanceMatrix.needsUpdate = true;
    r.instanceMatrix.needsUpdate = true;
    if (d.instanceColor) d.instanceColor.needsUpdate = true;
    if (r.instanceColor) r.instanceColor.needsUpdate = true;
  });

  return (
    <group>
      <instancedMesh ref={dots} args={[dotGeo, undefined, count]} frustumCulled={false}>
        <meshBasicMaterial transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={dest} args={[ringGeo, undefined, ALL_AGENTS.length]} frustumCulled={false}>
        <meshBasicMaterial transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </instancedMesh>
    </group>
  );
}
