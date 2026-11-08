// Desks: white rounded slab, dark side panels, chair, two monitors with a shared scrolling code texture and one
// keyboard. Screens are tinted per desk with the owner colour and brighten with the owner's glow. 7 instanced draw calls.
import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three-stdlib';
import type { AgentId } from '../model/types';
import type { Runtime } from '../runtime';
import { DESK, SPECIALISTS, deskPose } from './layout';
import { AGENT_COLOR } from './palette';
import { codeTexture } from './textures';
import { pickHandlers } from '../ui/pick';
import { agentRoom } from '../../config/tuning';
import { MON, SCREEN_GAP, chairGeometry, keyboardGeometry, poseMatrix } from './deskParts';

const deskPick = pickHandlers((e) => (e.instanceId === undefined ? null : (SPECIALISTS[e.instanceId] ?? null)));

const SLAB_T = 0.05;
const PANEL = { w: 0.04, h: DESK.h - SLAB_T - 0.01, d: DESK.d - 0.1 } as const; // 1 cm below the slab
const SCROLL = 0.04;
const N = SPECIALISTS.length;
const col = new THREE.Color();
const dim = new THREE.Color('#1b2230');
const FLASH = new THREE.Color('#6fe3a4');
const MON_Y = DESK.h + MON.lift + MON.h / 2;
const MON_XS = [[0, -1], [1, 1]] as const;

/** Desk-local point (x, y, z; +z faces the hub) to world. */
function place(id: AgentId, x: number, y: number, z: number, extraYaw = 0): THREE.Matrix4 {
  const { pos, yaw } = deskPose(id);
  return poseMatrix(pos, yaw, x, y, z, extraYaw);
}

export function Desks({ rt }: { rt: Runtime }) {
  const world = rt.world;
  const slab = useRef<THREE.InstancedMesh>(null);
  const panels = useRef<THREE.InstancedMesh>(null);
  const chairs = useRef<THREE.InstancedMesh>(null);
  const bezels = useRef<THREE.InstancedMesh>(null);
  const screens = useRef<THREE.InstancedMesh>(null);
  const keys = useRef<THREE.InstancedMesh>(null);
  const code = useMemo(() => codeTexture(agentRoom.roomSeed), []);
  const slabGeo = useMemo(() => new RoundedBoxGeometry(DESK.w, SLAB_T, DESK.d, 2, 0.02), []);
  const screenGeo = useMemo(() => new THREE.PlaneGeometry(MON.w - 0.04, MON.h - 0.04).translate(0, 0, MON.t / 2 + SCREEN_GAP), []);
  const chairGeo = useMemo(() => chairGeometry(), []);
  const keyGeo = useMemo(() => keyboardGeometry(), []);

  useLayoutEffect(() => {
    SPECIALISTS.forEach((id, i) => {
      slab.current?.setMatrixAt(i, place(id, 0, DESK.h - SLAB_T / 2, 0));
      for (const [k, sx] of MON_XS) panels.current?.setMatrixAt(i * 2 + k, place(id, sx * (DESK.w / 2 - 0.08), PANEL.h / 2, 0));
      chairs.current?.setMatrixAt(i, place(id, 0, 0, DESK.d / 2 + 0.45));
      keys.current?.setMatrixAt(i, place(id, 0, DESK.h, 0));
      for (const [k, sx] of MON_XS) {
        bezels.current?.setMatrixAt(i * 2 + k, place(id, sx * MON.x, MON_Y, MON.z, -sx * MON.yaw));
        screens.current?.setMatrixAt(i * 2 + k, place(id, sx * MON.x, MON_Y, MON.z, -sx * MON.yaw));
        screens.current?.setColorAt(i * 2 + k, dim);
      }
    });
    for (const m of [slab, panels, chairs, bezels, screens, keys]) if (m.current) m.current.instanceMatrix.needsUpdate = true;
  }, []);

  useFrame((_, dt) => {
    code.offset.y = (code.offset.y + dt * SCROLL) % 1;
    const s = screens.current;
    if (!s) return;
    for (let i = 0; i < N; i++) {
      const id = SPECIALISTS[i] as AgentId;
      const a = rt.state.agents[id];
      const flash = a.status === 'done' && world.now - a.lastEventT < agentRoom.celebrateSec * 1000;
      // Finished: screens flash green for the celebration time; otherwise owner colour by glow.
      if (flash) col.set(FLASH);
      else col.set(AGENT_COLOR[id]).lerp(dim, 1 - (0.25 + world.agents[id].glow * 0.75));
      s.setColorAt(i * 2, col);
      s.setColorAt(i * 2 + 1, col);
    }
    if (s.instanceColor) s.instanceColor.needsUpdate = true;
  });

  return (
    <group>
      <instancedMesh ref={slab} args={[slabGeo, undefined, N]} castShadow receiveShadow {...deskPick}>
        <meshStandardMaterial color="#e9edf2" roughness={0.45} />
      </instancedMesh>
      <instancedMesh ref={panels} args={[undefined, undefined, N * 2]} castShadow>
        <boxGeometry args={[PANEL.w, PANEL.h, PANEL.d]} />
        <meshStandardMaterial color="#1a2230" metalness={0.3} />
      </instancedMesh>
      <instancedMesh ref={chairs} args={[chairGeo, undefined, N]} castShadow>
        <meshStandardMaterial color="#1a2230" roughness={0.7} />
      </instancedMesh>
      <instancedMesh ref={keys} args={[keyGeo, undefined, N]} castShadow>
        <meshStandardMaterial color="#2a3140" roughness={0.6} />
      </instancedMesh>
      <instancedMesh ref={bezels} args={[undefined, undefined, N * 2]} castShadow>
        <boxGeometry args={[MON.w, MON.h, MON.t]} />
        <meshStandardMaterial color="#0b0f15" roughness={0.4} />
      </instancedMesh>
      <instancedMesh ref={screens} args={[screenGeo, undefined, N * 2]}>
        <meshBasicMaterial map={code} toneMapped={false} />
      </instancedMesh>
    </group>
  );
}
