// Humanoid robots in zero gravity: one merged body mesh per agent (role prop + colour accents), instanced arms, floor
// rings and contact shadows. No legs: gliding robots pitch forward with their speed and hover. Reads the live world in
// useFrame; writes only transforms.
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { AgentId } from '../model/types';
import type { Runtime } from '../runtime';
import { ALL_AGENTS } from '../engine/state';
import { deskPose, homeSpot } from './layout';
import { AGENT_COLOR } from './palette';
import { RIG, ROBOT_SCALE, ROLE_SCALE, armGeometry, bodyGeometry } from './robotParts';
import { activityPose, dampAngle } from './robotPose';
import { useUi } from '../ui/uiStore';
import { pickHandlers } from '../ui/pick';
import { agentRoom } from '../../config/tuning';

const N = ALL_AGENTS.length;
const SHADOW_Y = 0.004; // contact shadow, ring and selection ring stack 4 mm apart above the floor top (y = 0)
const RING_Y = 0.008;
const SEL_Y = 0.012;
const root = new THREE.Object3D();
const limb = new THREE.Object3D();
root.add(limb);
const flat = new THREE.Object3D();
const col = new THREE.Color();
const hand = new THREE.Vector3();
/** Scale used to hide an instance (the guest before it ever appears, mugs when standing). */
const HIDDEN = 0.0001;

/** Idle facing: towards the desk for specialists, towards the camera side for lead and guest. */
function restHeading(id: AgentId): number {
  if (id === 'lead' || id === 'guest') return 0;
  const d = deskPose(id).pos;
  const h = homeSpot(id);
  return Math.atan2(d.x - h.x, d.z - h.z);
}

export function Robots({ rt }: { rt: Runtime }) {
  const bodies = useRef<(THREE.Mesh | null)[]>([]);
  const arms = useRef<THREE.InstancedMesh>(null);
  const rings = useRef<THREE.InstancedMesh>(null);
  const shadows = useRef<THREE.InstancedMesh>(null);
  const mugs = useRef<THREE.InstancedMesh>(null);
  const geos = useMemo(() => ALL_AGENTS.map((id) => bodyGeometry(id)), []);
  const armGeo = useMemo(() => armGeometry(), []);
  const heading = useRef(ALL_AGENTS.map(restHeading));
  const last = useRef(ALL_AGENTS.map(() => ({ x: 0, z: 0, init: false })));
  const phase = useRef(0);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1);
    phase.current += dt;
    const ui = useUi.getState();
    for (let i = 0; i < N; i++) {
      const id = ALL_AGENTS[i] as AgentId;
      const v = rt.world.agents[id];
      const prev = last.current[i]!;
      const dx = prev.init ? v.pos.x - prev.x : 0;
      const dz = prev.init ? v.pos.z - prev.z : 0;
      Object.assign(prev, { x: v.pos.x, z: v.pos.z, init: true });
      const speed = dt > 0 ? Math.hypot(dx, dz) / dt : 0;
      const s01 = speed / agentRoom.avatarWalkSpeed;
      const lounging = v.activity === 'relax' && v.arrived;
      // Seeded micro-idle while lounging: a slow look around (phase offset by roster index, no randomness).
      const glance = lounging ? Math.sin(phase.current * 0.25 + i * 1.9) * 0.35 : 0;
      const goal = s01 > 0.05 ? Math.atan2(dx, dz) : Math.atan2(v.look.x - v.pos.x, v.look.z - v.pos.z) + glance;
      heading.current[i] = dampAngle(heading.current[i]!, goal, 9, dt);
      // Ring stools: a huddling or reporting agent with a seat sits (seated pose), a standing one does not.
      const onStool = (v.activity === 'huddle' || v.activity === 'report') && v.seatY > 0;
      const p = activityPose(onStool ? 'relax' : v.activity, rt.state.agents[id].status, phase.current + i * 0.7, s01, v.arrived);
      const k = v.activity === 'hidden' && v.arrived ? HIDDEN : ROBOT_SCALE * (ROLE_SCALE[id] ?? 1);
      const seated = (v.activity === 'relax' || v.activity === 'work' || v.activity === 'wait' || onStool) && v.arrived && s01 <= 0.05;
      // Seated: lower the body so the hip rests 4 cm above the seat top.
      const drop = seated ? v.seatY + 0.04 - RIG.hipY * k : 0;
      // Gliding: pitch forward with speed. Floating: a slow hover bob (seeded by roster index, no randomness).
      const pitch = s01 > 0.05 ? agentRoom.flyLeanRad * Math.min(1, s01) : p.lean;
      const hover = seated || !v.arrived ? 0 : agentRoom.hoverAmpM * Math.sin(phase.current * 1.3 + i * 0.9);

      root.position.set(v.pos.x, p.bob * k + drop + hover, v.pos.z);
      root.rotation.set(pitch, heading.current[i]!, 0, 'YXZ');
      root.scale.setScalar(k);
      const body = bodies.current[i];
      if (body) {
        body.position.copy(root.position);
        body.rotation.set(pitch, heading.current[i]!, 0, 'YXZ');
        body.scale.setScalar(k);
      }
      for (const [j, side] of [[0, -1], [1, 1]] as const) {
        limb.position.set(side * RIG.shoulderX, RIG.shoulderY, 0);
        limb.rotation.set(-(side < 0 ? p.armL : p.armR), 0, side > 0 ? p.wave : 0);
        root.updateMatrixWorld(true);
        arms.current?.setMatrixAt(i * 2 + j, limb.matrixWorld);
      }
      // Mug in the right hand while seated.
      limb.position.set(RIG.shoulderX, RIG.shoulderY, 0);
      limb.rotation.set(-p.armR, 0, p.wave);
      root.updateMatrixWorld(true);
      hand.set(0, -0.47, 0.04).applyMatrix4(limb.matrixWorld);
      flat.rotation.set(0, 0, 0);
      flat.position.copy(hand);
      flat.scale.setScalar(seated && v.activity === 'relax' ? k : HIDDEN);
      flat.updateMatrix();
      mugs.current?.setMatrixAt(i, flat.matrix);
      flat.rotation.set(-Math.PI / 2, 0, 0);
      flat.position.set(v.pos.x, SHADOW_Y, v.pos.z);
      flat.scale.setScalar(k * (1 - p.bob));
      flat.updateMatrix();
      shadows.current?.setMatrixAt(i, flat.matrix);
      flat.position.y = RING_Y;
      flat.scale.setScalar(k);
      flat.updateMatrix();
      rings.current?.setMatrixAt(i, flat.matrix);
      const st = rt.state.agents[id].status;
      const lit = st === 'idle' ? 0.25 : st === 'done' ? 0.5 : 1;
      rings.current?.setColorAt(i, col.set(st === 'waiting' ? '#f2b46a' : st === 'error' ? '#ff8a7a' : AGENT_COLOR[id]).multiplyScalar(lit));
      const sel = ui.selected === id ? 1 : ui.hovered === id ? 0.5 : 0;
      flat.position.y = SEL_Y;
      flat.scale.setScalar(sel ? k * 1.25 : 0.0001);
      flat.updateMatrix();
      rings.current?.setMatrixAt(N + i, flat.matrix);
      rings.current?.setColorAt(N + i, col.setScalar(sel));
    }
    for (const m of [arms, rings, shadows, mugs]) if (m.current) m.current.instanceMatrix.needsUpdate = true;
    if (rings.current?.instanceColor) rings.current.instanceColor.needsUpdate = true;
  });

  return (
    <group>
      {ALL_AGENTS.map((id, i) => (
        <mesh key={id} ref={(m) => void (bodies.current[i] = m)} geometry={geos[i]} castShadow {...pickHandlers(() => id)}>
          <meshStandardMaterial vertexColors roughness={0.38} metalness={0.15} />
        </mesh>
      ))}
      <instancedMesh ref={arms} args={[armGeo, undefined, N * 2]} castShadow frustumCulled={false}>
        <meshStandardMaterial color="#d5dae1" roughness={0.4} metalness={0.15} />
      </instancedMesh>
      <instancedMesh ref={mugs} args={[undefined, undefined, N]} frustumCulled={false}>
        <cylinderGeometry args={[0.04, 0.035, 0.09, 12]} />
        <meshStandardMaterial color="#f3efe6" roughness={0.4} />
      </instancedMesh>
      <instancedMesh ref={shadows} args={[undefined, undefined, N]} frustumCulled={false}>
        <circleGeometry args={[0.38, 24]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.45} depthWrite={false} />
      </instancedMesh>
      <instancedMesh ref={rings} args={[undefined, undefined, N * 2]} frustumCulled={false}>
        <ringGeometry args={[0.36, 0.44, 40]} />
        <meshBasicMaterial transparent opacity={0.9} depthWrite={false} toneMapped={false} />
      </instancedMesh>
    </group>
  );
}
