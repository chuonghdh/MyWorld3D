// Guest desk in the empty upper-left of the room, for unmatched agents: the member desk design (rounded slab, side
// panels, chair, two monitors with one shared code texture, one keyboard), facing the same way as a member desk.
// Merged into one mesh per part (5 draw calls). The screens glow with the guest's activity.
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three-stdlib';
import type { Runtime } from '../runtime';
import { DESK, GUEST_DESK } from './layout';
import { AGENT_COLOR } from './palette';
import { codeTexture } from './textures';
import { mergeParts } from './geometry';
import { MON, SCREEN_GAP, chairGeometry, keyboardGeometry } from './deskParts';
import { agentRoom } from '../../config/tuning';

const SLAB_T = 0.05;
const PANEL = { w: 0.04, h: DESK.h - SLAB_T - 0.01, d: DESK.d - 0.1 } as const;
const MON_Y = DESK.h + MON.lift + MON.h / 2;
const SCROLL = 0.04;
const SIDES = [-1, 1] as const;
const dim = new THREE.Color('#1b2230');
const col = new THREE.Color();

export function GuestDesk({ rt }: { rt: Runtime }) {
  const code = useMemo(() => codeTexture(agentRoom.roomSeed), []);
  const screen = useRef<THREE.MeshBasicMaterial>(null);
  const slabGeo = useMemo(() => new RoundedBoxGeometry(DESK.w, SLAB_T, DESK.d, 2, 0.02), []);
  const panelGeo = useMemo(
    () => mergeParts(SIDES.map((sx) => ({ geo: new THREE.BoxGeometry(PANEL.w, PANEL.h, PANEL.d).translate(sx * (DESK.w / 2 - 0.08), PANEL.h / 2, 0) }))),
    [],
  );
  const chair = useMemo(() => chairGeometry().translate(0, 0, DESK.d / 2 + 0.45), []);
  const keyGeo = useMemo(() => keyboardGeometry(), []);
  // Monitor parts: the same yaw and placement as the member desks (Desks.tsx), merged per part.
  const bezelGeo = useMemo(
    () => mergeParts(SIDES.map((sx) => ({ geo: new THREE.BoxGeometry(MON.w, MON.h, MON.t).rotateY(-sx * MON.yaw).translate(sx * MON.x, MON_Y, MON.z) }))),
    [],
  );
  const screenGeo = useMemo(
    () =>
      mergeParts(
        SIDES.map((sx) => ({
          geo: new THREE.PlaneGeometry(MON.w - 0.04, MON.h - 0.04).translate(0, 0, MON.t / 2 + SCREEN_GAP).rotateY(-sx * MON.yaw).translate(sx * MON.x, MON_Y, MON.z),
        })),
      ),
    [],
  );

  useFrame((_, dt) => {
    code.offset.y = (code.offset.y + dt * SCROLL) % 1;
    col.set(AGENT_COLOR.guest).lerp(dim, 1 - (0.25 + rt.world.agents.guest.glow * 0.75));
    if (screen.current) screen.current.color.copy(col);
  });

  return (
    <group position={[GUEST_DESK.x, 0, GUEST_DESK.z]} rotation={[0, GUEST_DESK.yaw, 0]}>
      <mesh geometry={slabGeo} position={[0, DESK.h - SLAB_T / 2, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#e9edf2" roughness={0.45} />
      </mesh>
      <mesh geometry={panelGeo} castShadow>
        <meshStandardMaterial color="#1a2230" metalness={0.3} />
      </mesh>
      <mesh geometry={chair} castShadow>
        <meshStandardMaterial color="#1a2230" roughness={0.7} />
      </mesh>
      <mesh geometry={bezelGeo} castShadow>
        <meshStandardMaterial color="#0b0f15" roughness={0.4} />
      </mesh>
      <mesh geometry={screenGeo}>
        <meshBasicMaterial ref={screen} map={code} toneMapped={false} />
      </mesh>
      <mesh geometry={keyGeo} position={[0, DESK.h, 0]} castShadow>
        <meshStandardMaterial color="#2a3140" roughness={0.6} />
      </mesh>
    </group>
  );
}
