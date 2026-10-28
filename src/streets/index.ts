// Streetscape: roads, markings, sidewalks, courtyards, plazas, lamps, furniture and signals.
// Everything is merged or instanced into six draw calls:
//   surfaces (opaque ground), overlay (paint/decals), furniture (iron/wood/stone),
//   lamp glass, light pools (night only, additive), signal lamps (InstancedMesh).

import * as THREE from 'three';
import type { CityLayout, TrafficLight } from '../city/layout';
import type { LightAxis, LightPhase } from '../traffic/lights';
import { MeshBuilder } from './builder';
import { addPoolUVs, buildFurniture, type SignalHead } from './furniture';
import { buildSurfaces } from './surfaces';

export { SIDEWALK_TOP, ASPHALT_TOP, PAINT_Y, COLORS as STREET_COLORS } from './surfaces';
export { LAMP_HEIGHT } from './furniture';

export interface Streetscape {
  group: THREE.Group;
  /** Lamp glass emissive and ground light pools on/off. */
  setNight(on: boolean): void;
  /** Call once per frame; only heads whose phase changed are rewritten. */
  updateSignals(phaseOf: (light: TrafficLight, axis: LightAxis) => LightPhase): void;
  dispose(): void;
}

export const LAMP_GLASS_NIGHT_INTENSITY = 2.4;

const SIGNAL_BASE: Record<LightPhase, THREE.Color> = {
  red: new THREE.Color('#ff2a1a'),
  yellow: new THREE.Color('#ffb21a'),
  green: new THREE.Color('#2bff6a'),
};
const PHASE_ORDER: readonly LightPhase[] = ['red', 'yellow', 'green'];
const SIGNAL_ON_GAIN = 2.2;
const SIGNAL_OFF_GAIN = 0.1;

export const MESH_NAMES = {
  surfaces: 'streets-surfaces',
  overlay: 'streets-overlay',
  furniture: 'streets-furniture',
  lampGlass: 'streets-lamp-glass',
  pools: 'streets-light-pools',
  signals: 'streets-signal-lamps',
} as const;

/** Radial gradient texture for the light pools, or null outside a browser. */
function makePoolTexture(): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  try {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.15)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  } catch {
    return null;
  }
}

function setPhaseColors(colors: THREE.InstancedBufferAttribute, index: number, phase: LightPhase): void {
  for (let k = 0; k < 3; k++) {
    const lampPhase = PHASE_ORDER[k];
    const base = SIGNAL_BASE[lampPhase];
    const gain = lampPhase === phase ? SIGNAL_ON_GAIN : SIGNAL_OFF_GAIN;
    colors.setXYZ(index + k, base.r * gain, base.g * gain, base.b * gain);
  }
}

export function createStreetscape(layout: CityLayout): Streetscape {
  const group = new THREE.Group();
  group.name = 'streetscape';

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];

  const addMesh = (
    name: string,
    builder: MeshBuilder,
    material: THREE.Material,
    opts: { cast?: boolean; receive?: boolean; uv?: boolean } = {},
  ): THREE.Mesh | null => {
    const geo = builder.build();
    if (!geo) return null;
    if (opts.uv) addPoolUVs(geo);
    geometries.push(geo);
    const mesh = new THREE.Mesh(geo, material);
    mesh.name = name;
    mesh.castShadow = opts.cast ?? false;
    mesh.receiveShadow = opts.receive ?? true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    group.add(mesh);
    return mesh;
  };

  // --- Materials (owned by this streetscape) ---
  const surfaceMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  const overlayMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.85,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -4,
  });
  const furnitureMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.2 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: '#e9e2c8',
    roughness: 0.2,
    metalness: 0.1,
    emissive: new THREE.Color('#ffcf7a'),
    emissiveIntensity: 0,
  });
  const poolTexture = makePoolTexture();
  if (poolTexture) textures.push(poolTexture);
  const poolMat = new THREE.MeshBasicMaterial({
    color: poolTexture ? new THREE.Color('#ffcf7a') : new THREE.Color('#ffffff'),
    map: poolTexture,
    vertexColors: !poolTexture,
    transparent: true,
    opacity: poolTexture ? 0.5 : 1,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -8,
  });
  const signalMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  materials.push(surfaceMat, overlayMat, furnitureMat, glassMat, poolMat, signalMat);

  // --- Ground surfaces and paint ---
  const surf = new MeshBuilder();
  const overlay = new MeshBuilder();
  buildSurfaces(layout, surf, overlay);
  addMesh(MESH_NAMES.surfaces, surf, surfaceMat, { receive: true });
  addMesh(MESH_NAMES.overlay, overlay, overlayMat, { receive: true });

  // --- Furniture ---
  const furn = buildFurniture(layout, poolTexture !== null);
  addMesh(MESH_NAMES.furniture, furn.iron, furnitureMat, { cast: true, receive: true });
  addMesh(MESH_NAMES.lampGlass, furn.glass, glassMat, { cast: false, receive: false });
  const pools = addMesh(MESH_NAMES.pools, furn.pools, poolMat, { cast: false, receive: false, uv: poolTexture !== null });
  if (pools) {
    pools.visible = false;
    pools.renderOrder = 2;
  }

  // --- Signal lamps (one InstancedMesh, colour per instance) ---
  const heads: SignalHead[] = furn.signals.heads;
  let signalColors: THREE.InstancedBufferAttribute | null = null;
  let signalMesh: THREE.InstancedMesh | null = null;
  const lastPhase: (LightPhase | null)[] = heads.map(() => null);
  if (furn.signals.lampMatrices.length > 0) {
    const lampGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.04, 10);
    geometries.push(lampGeo);
    const count = furn.signals.lampMatrices.length;
    signalMesh = new THREE.InstancedMesh(lampGeo, signalMat, count);
    signalMesh.name = MESH_NAMES.signals;
    furn.signals.lampMatrices.forEach((m, i) => signalMesh!.setMatrixAt(i, m));
    signalMesh.instanceMatrix.needsUpdate = true;
    signalColors = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
    signalMesh.instanceColor = signalColors;
    for (const h of heads) setPhaseColors(signalColors, h.index, 'red');
    signalColors.needsUpdate = true;
    signalMesh.computeBoundingSphere();
    signalMesh.castShadow = false;
    signalMesh.receiveShadow = false;
    group.add(signalMesh);
  }

  let disposed = false;

  return {
    group,
    setNight(on: boolean) {
      glassMat.emissiveIntensity = on ? LAMP_GLASS_NIGHT_INTENSITY : 0;
      if (pools) pools.visible = on;
    },
    updateSignals(phaseOf) {
      if (!signalColors) return;
      let changed = false;
      for (let i = 0; i < heads.length; i++) {
        const h = heads[i];
        const phase = phaseOf(h.light, h.axis);
        if (phase === lastPhase[i]) continue;
        lastPhase[i] = phase;
        setPhaseColors(signalColors, h.index, phase);
        changed = true;
      }
      if (changed) signalColors.needsUpdate = true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      signalMesh?.dispose();
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      for (const t of textures) t.dispose();
      group.clear();
    },
  };
}
