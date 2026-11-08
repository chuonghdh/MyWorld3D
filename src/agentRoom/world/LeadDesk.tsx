// Lead's desk beside the board: larger than a subagent desk, yawed off the walls (LEAD_DESK.yaw), one monitor, one
// keyboard, an office chair. The monitor scrolls the shared code texture and glows with the lead's activity. 6 draw calls.
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three-stdlib';
import type { Runtime } from '../runtime';
import { DESK, LEAD_DESK } from './layout';
import { AGENT_COLOR } from './palette';
import { codeTexture } from './textures';
import { mergeParts } from './geometry';
import { MON, SCREEN_GAP, chairGeometry, keyboardGeometry } from './deskParts';
import { agentRoom } from '../../config/tuning';

const SLAB_T = 0.05;
const PANEL = { w: 0.04, h: DESK.h - SLAB_T - 0.01, d: LEAD_DESK.d - 0.1 } as const;
const SCROLL = 0.04;
const dim = new THREE.Color('#1b2230');
const col = new THREE.Color();
const MON_Y = DESK.h + MON.lift + MON.h / 2;

export function LeadDesk({ rt }: { rt: Runtime }) {
  const code = useMemo(() => codeTexture(agentRoom.roomSeed), []);
  const slabGeo = useMemo(() => new RoundedBoxGeometry(LEAD_DESK.w, SLAB_T, LEAD_DESK.d, 2, 0.02), []);
  const panelGeo = useMemo(
    () => mergeParts([-1, 1].map((sx) => ({ geo: new THREE.BoxGeometry(PANEL.w, PANEL.h, PANEL.d).translate(sx * (LEAD_DESK.w / 2 - 0.08), PANEL.h / 2, 0) }))),
    [],
  );
  const chair = useMemo(() => chairGeometry(), []);
  const keyGeo = useMemo(() => keyboardGeometry(), []);
  const screenGeo = useMemo(() => new THREE.PlaneGeometry(MON.w - 0.04, MON.h - 0.04).translate(0, 0, MON.t / 2 + SCREEN_GAP), []);
  const screen = useRef<THREE.MeshBasicMaterial>(null);

  useFrame((_, dt) => {
    code.offset.y = (code.offset.y + dt * SCROLL) % 1;
    const a = rt.state.agents.lead;
    const flash = a.status === 'done' && rt.world.now - a.lastEventT < agentRoom.celebrateSec * 1000;
    if (flash) col.set('#6fe3a4');
    else col.set(AGENT_COLOR.lead).lerp(dim, 1 - (0.25 + rt.world.agents.lead.glow * 0.75));
    if (screen.current) screen.current.color.copy(col);
  });

  // Desk-local group: origin on the floor under the desk centre, +z toward the front (where the lead stands).
  return (
    <group position={[LEAD_DESK.x, 0, LEAD_DESK.z]} rotation={[0, LEAD_DESK.yaw, 0]}>
      <mesh geometry={slabGeo} position={[0, DESK.h - SLAB_T / 2, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#e9edf2" roughness={0.45} />
      </mesh>
      <mesh geometry={panelGeo} castShadow>
        <meshStandardMaterial color="#1a2230" metalness={0.3} />
      </mesh>
      <mesh geometry={chair} position={[0, 0, LEAD_DESK.d / 2 + 0.45]} castShadow>
        <meshStandardMaterial color="#1a2230" roughness={0.7} />
      </mesh>
      <mesh position={[0, MON_Y, MON.z]} castShadow>
        <boxGeometry args={[MON.w, MON.h, MON.t]} />
        <meshStandardMaterial color="#0b0f15" roughness={0.4} />
      </mesh>
      <mesh geometry={screenGeo} position={[0, MON_Y, MON.z]}>
        <meshBasicMaterial ref={screen} map={code} toneMapped={false} />
      </mesh>
      <mesh geometry={keyGeo} position={[0, DESK.h, 0]} castShadow>
        <meshStandardMaterial color="#2a3140" roughness={0.6} />
      </mesh>
    </group>
  );
}
