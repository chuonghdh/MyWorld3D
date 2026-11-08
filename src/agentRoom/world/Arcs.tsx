// Communication arcs: curved glowing lines from sender to receiver (head height, lifted mid-span), fading with age,
// with two travelling packets per arc. One line buffer + one instanced packet mesh.
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Runtime } from '../runtime';
import { AGENT_COLOR } from './palette';
import { agentRoom } from '../../config/tuning';

const SEGS = 24;
const MAX_ARCS = 16;
const LIFT = 1.6;
const Y0 = 1.5;
const PACKETS = 2;
const c = new THREE.Color();
const obj = new THREE.Object3D();

/** Point on the arc at k in [0, 1] (quadratic lift). */
export function arcPoint(ax: number, az: number, bx: number, bz: number, k: number): [number, number, number] {
  const dist = Math.hypot(bx - ax, bz - az);
  return [ax + (bx - ax) * k, Y0 + Math.sin(Math.PI * k) * Math.min(LIFT, 0.25 + dist * 0.25), az + (bz - az) * k];
}

export function Arcs({ rt }: { rt: Runtime }) {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_ARCS * SEGS * 6), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX_ARCS * SEGS * 6), 3));
    g.setDrawRange(0, 0);
    return g;
  }, []);
  const packets = useRef<THREE.InstancedMesh>(null);

  useFrame(() => {
    const now = rt.world.now;
    const life = agentRoom.arcLifeSec * 1000;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colr = geo.attributes.color as THREE.BufferAttribute;
    const pk = packets.current;
    let v = 0;
    let p = 0;
    const links = rt.state.links;
    for (let i = links.length - 1, n = 0; i >= 0 && n < MAX_ARCS; i--) {
      const l = links[i]!;
      const age = now - l.t;
      if (age > life || age < 0) continue;
      n++;
      const a = rt.world.agents[l.from].pos;
      const b = rt.world.agents[l.to].pos;
      const fade = 1 - age / life;
      for (let s = 0; s < SEGS; s++) {
        for (const k of [s / SEGS, (s + 1) / SEGS]) {
          const q = arcPoint(a.x, a.z, b.x, b.z, k);
          pos.setXYZ(v, q[0], q[1], q[2]);
          c.set(AGENT_COLOR[l.to]).multiplyScalar(fade * (0.5 + 0.5 * Math.sin(Math.PI * k)));
          colr.setXYZ(v++, c.r, c.g, c.b);
        }
      }
      for (let j = 0; pk && j < PACKETS; j++) {
        const k = ((age / 900 + j / PACKETS) % 1 + 1) % 1;
        const q = arcPoint(a.x, a.z, b.x, b.z, k);
        obj.position.set(q[0], q[1], q[2]);
        obj.scale.setScalar(0.6 + fade * 0.6);
        obj.updateMatrix();
        pk.setMatrixAt(p, obj.matrix);
        pk.setColorAt(p++, c.set(AGENT_COLOR[l.to]).multiplyScalar(1.4 * fade));
      }
    }
    geo.setDrawRange(0, v);
    pos.needsUpdate = true;
    colr.needsUpdate = true;
    if (pk) {
      pk.count = p;
      pk.instanceMatrix.needsUpdate = true;
      if (pk.instanceColor) pk.instanceColor.needsUpdate = true;
    }
  });

  return (
    <group>
      <lineSegments geometry={geo} frustumCulled={false}>
        <lineBasicMaterial vertexColors transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </lineSegments>
      <instancedMesh ref={packets} args={[undefined, undefined, MAX_ARCS * PACKETS]} frustumCulled={false}>
        <sphereGeometry args={[0.06, 10, 8]} />
        <meshBasicMaterial blending={THREE.AdditiveBlending} transparent depthWrite={false} toneMapped={false} />
      </instancedMesh>
    </group>
  );
}
