// Lighting and atmosphere: ACES tone mapping, blue-hour fill, one shadow sun (High only), warm desk pools, fog
// that starts beyond the window wall so the room interior keeps its colour.
import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useUi } from '../ui/uiStore';
import { currentDaylight } from './daylight';
import { DESK_COLS, DISCUSS } from './layout';
import { agentRoom } from '../../config/tuning';

/** Warm pools over the two desk blocks and the discuss table. */
const WARM = [
  [(DESK_COLS[0] + DESK_COLS[1]) / 2, 2.9, 2.5],
  [(DESK_COLS[2] + DESK_COLS[3]) / 2, 2.9, 2.5],
  [DISCUSS.x, 2.9, DISCUSS.z],
] as const;

export function Lighting() {
  const quality = useUi((s) => s.quality);
  const { gl, scene } = useThree();
  const high = quality === 'high';
  const spot = useRef<THREE.SpotLight>(null);
  // The spot's target must live in the scene to have a world matrix: aim it at the discuss table.
  useEffect(() => {
    const s = spot.current;
    if (!s) return;
    s.target.position.set(DISCUSS.x, 0, DISCUSS.z);
    scene.add(s.target);
    return () => void scene.remove(s.target);
  }, [scene]);
  useEffect(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.15;
    gl.shadowMap.enabled = high;
    gl.shadowMap.type = THREE.PCFSoftShadowMap;
    scene.fog = new THREE.Fog('#0a0e15', 65, 190);
    scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m) m.needsUpdate = true;
    });
  }, [gl, scene, high]);
  return (
    <group>
      <color attach="background" args={['#080b10']} />
      <hemisphereLight args={['#9fb4d9', '#3a3226', currentDaylight().fill]} />
      <ambientLight intensity={0.12} />
      <directionalLight
        position={[-8, 14, 10]}
        intensity={1.6}
        color="#dfe7ff"
        castShadow={high}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
        shadow-camera-near={1}
        shadow-camera-far={40}
        shadow-bias={-0.0004}
      />
      <spotLight position={[DISCUSS.x, 6, DISCUSS.z]} ref={spot} angle={0.55} penumbra={0.6} intensity={40} distance={14} decay={2} color="#ffd2a0" />
      {/* Warm yellow light at the centre of the discuss table, just above the top. */}
      <pointLight position={[DISCUSS.x, DISCUSS.h + 0.35, DISCUSS.z]} color={agentRoom.tableLightColor} intensity={agentRoom.tableLightIntensity} distance={7} decay={2} />
      {WARM.map((p, i) => (
        <pointLight key={i} position={p as unknown as [number, number, number]} color="#ffcf9a" intensity={22} distance={12} decay={2} />
      ))}
    </group>
  );
}
