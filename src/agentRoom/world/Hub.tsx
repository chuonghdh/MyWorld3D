// Round discuss table in front of the board: a round top on a tapered pedestal, a glowing ring 2 cm above the top, a
// floating orb hologram, and a floor halo around the stool ring. Pulses while the lead is busy.
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Runtime } from '../runtime';
import { agentRoom } from '../../config/tuning';
import { DISCUSS, SEAT_R } from './layout';

const TOP_T = 0.06;
const STRIP_T = 0.012; // tube radius of the glowing edge ring
const ORB_Y = DISCUSS.h + 0.7;
const HALO = { r: SEAT_R + 0.3, tube: 0.025 } as const; // floor ring round the stools

export function Hub({ rt }: { rt: Runtime }) {
  const strip = useRef<THREE.MeshStandardMaterial>(null);
  const halo = useRef<THREE.MeshStandardMaterial>(null);
  const orb = useRef<THREE.Mesh>(null);
  const phase = useRef(0);
  useFrame((_, dt) => {
    const busy = rt.state.agents.lead.status !== 'idle' && rt.state.agents.lead.status !== 'done';
    phase.current += dt * (busy ? 3 : 1);
    const p = 0.5 + 0.5 * Math.sin(phase.current);
    if (strip.current) strip.current.emissiveIntensity = busy ? 1.6 + p * 1.4 : 0.6 + p * 0.3;
    if (halo.current) halo.current.emissiveIntensity = busy ? 1.0 + p * 1.4 : 0.4 + p * 0.3;
    if (orb.current) orb.current.position.y = ORB_Y + Math.sin(phase.current * 0.7) * 0.06;
  });
  return (
    <group position={[DISCUSS.x, 0, DISCUSS.z]}>
      <mesh position={[0, DISCUSS.h - TOP_T / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[DISCUSS.r, DISCUSS.r, TOP_T, 56]} />
        <meshStandardMaterial color={agentRoom.discussTableColor} roughness={0.4} />
      </mesh>
      <mesh position={[0, (DISCUSS.h - TOP_T) / 2, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.3, DISCUSS.h - TOP_T - 0.001, 28]} />
        <meshStandardMaterial color="#1a2230" metalness={0.5} roughness={0.35} />
      </mesh>
      {/* Glowing edge ring, lying flat 2 mm above the top (its underside clears the top surface). */}
      <mesh position={[0, DISCUSS.h + 0.002 + STRIP_T, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[DISCUSS.r - 0.03, STRIP_T, 8, 96]} />
        <meshStandardMaterial ref={strip} color="#0b0f15" emissive="#7cc4d6" emissiveIntensity={1} />
      </mesh>
      <mesh ref={orb} position={[0, ORB_Y, 0]}>
        <sphereGeometry args={[0.2, 24, 16]} />
        <meshStandardMaterial color="#9ad7e6" emissive="#7cc4d6" emissiveIntensity={2.2} />
      </mesh>
      {/* Floor halo: a flat torus whose underside sits 1 cm above the floor top (y = 0). */}
      <mesh position={[0, HALO.tube + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[HALO.r, HALO.tube, 8, 128]} />
        <meshStandardMaterial ref={halo} color="#0b0f15" emissive="#7cc4d6" emissiveIntensity={1} />
      </mesh>
    </group>
  );
}
