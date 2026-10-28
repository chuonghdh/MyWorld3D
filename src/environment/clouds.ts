// Clouds: low cumulus floating over the town plus their soft ground shadows, both built from one
// layout (see cloudSprites.ts). Two draw calls, no shadow-map cost, shadow darkness capped at 35%.

import * as THREE from 'three';
import { createCloudSprites, cloudDriftVelocity } from './cloudSprites';


export {
  CLOUD_BASE_DRIFT,
  CLOUD_DECAL_Y,
  CLOUD_MAX_DARKNESS,
  CLOUD_WIND_FACTOR,
  cloudShadowAlpha,
} from './cloudSprites';

export interface CloudArea {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface CloudOptions {
  area: CloudArea;
  /** Rough cloud amount; about 14 clusters means a mostly cloudy sky. Kept from the mesh version. */
  count?: number;
  /** Unused; clouds float at a fixed low band (see CLOUD_BASE_MIN / CLOUD_TOP_MAX). Kept so callers keep compiling. */
  height?: [number, number];
  seed?: number;
}

export interface CloudField {
  readonly group: THREE.Group;
  update(dt: number, windVector: { x: number; z: number }): void;
  /** Cloud cover 0 (clear) .. 1 (overcast). Drives the weather overlay. */
  setCoverage(coverage: number): void;
  /** Sun strength 0..1; shadows fade as the sun sets so they never darken a night street. */
  setSunlight(strength: number): void;
  /** Sun direction/colour, sky colour and ambient level that light the puffs and aim the shadows. */
  setLighting(
    sunDir: { x: number; y: number; z: number },
    sunColor: { r: number; g: number; b: number },
    skyColor: { r: number; g: number; b: number },
    ambient: number,
  ): void;
  dispose(): void;
}

/** Coverage the old `count` option maps to. */
export function coverageForCount(count: number): number {
  return Math.min(0.9, Math.max(0.1, count / 20));
}

export function createClouds(opts: CloudOptions): CloudField {
  const area = opts.area;
  const extent = Math.max(area.maxX - area.minX, area.maxZ - area.minZ);
  const sprites = createCloudSprites(
    { x: (area.minX + area.maxX) / 2, z: (area.minZ + area.maxZ) / 2 },
    opts.seed ?? 7,
    extent,
  );
  sprites.setCoverage(coverageForCount(opts.count ?? 10));

  const group = new THREE.Group();
  group.name = 'clouds';
  group.add(sprites.shadowMesh);
  group.add(sprites.mesh);

  // Scratch vector: the drift is computed every frame without allocating.
  const velocity = { x: 0, z: 0 };

  return {
    group,
    update(dt, wind) {
      // Lazy drift along the wind (a fraction of its speed, never still); shadows share the layout so they follow.
      sprites.update(dt, cloudDriftVelocity(wind, velocity));
    },
    setCoverage: (c) => sprites.setCoverage(c),
    setSunlight: (s) => sprites.setSunlight(s),
    setLighting: (d, c, k, a) => sprites.setLighting(d, c, k, a),
    dispose: () => sprites.dispose(),
  };
}
