// Seasonal recolouring of merged vertex-coloured plant meshes (hedges, bushes, flower beds).
// Each triangle carries a tag; the summer colours are kept and every season is derived from them,
// so a season change costs a colour-buffer rewrite and no new geometry or draw calls.

import * as THREE from 'three';
import type { Season } from '../core/types';
import { bloomOpenness, foliageShift } from './seasons';

/** Vertex tags: what a triangle is made of decides how the seasons recolour it. */
export const TAG_FIXED = 0; // stone, soil, bark: never changes
export const TAG_FOLIAGE = 1; // hedge and bush leaves
export const TAG_BLOOM = 2; // flowers
export const TAG_EVERGREEN = 3; // conifer needles: keep their colour, only take snow on top

const DRY = new THREE.Color('#8a6a45');
const WITHERED = new THREE.Color('#d9d3c6');
const SNOW = new THREE.Color('#eef2f5');
const SPRING_FLECK = new THREE.Color('#f7eef2');

/** Deterministic 0-1 value per triangle. */
export function faceRand(face: number): number {
  const s = Math.sin(face * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

export interface PaintState {
  /** Summer colours, copied from the geometry when the state is created. */
  base: Float32Array;
  tags: Float32Array;
}

export function createPaintState(geometry: THREE.BufferGeometry, tags: Float32Array): PaintState {
  const color = geometry.getAttribute('color') as THREE.BufferAttribute;
  return { base: new Float32Array(color.array as Float32Array), tags };
}

/** Rewrites the geometry's colour attribute for a season from the stored summer colours. */
export function applySeasonPaint(geometry: THREE.BufferGeometry, state: PaintState, season: Season): void {
  const color = geometry.getAttribute('color') as THREE.BufferAttribute;
  const normal = geometry.getAttribute('normal') as THREE.BufferAttribute | undefined;
  const out = color.array as Float32Array;
  const open = bloomOpenness(season);
  const shift = foliageShift(season);
  const target = new THREE.Color(shift.target);
  const c = new THREE.Color();
  for (let v = 0; v < color.count; v++) {
    c.setRGB(state.base[v * 3], state.base[v * 3 + 1], state.base[v * 3 + 2]);
    const tag = state.tags[v];
    const r = faceRand(Math.floor(v / 3));
    const up = normal ? normal.getY(v) : 0;
    if (tag === TAG_FOLIAGE) {
      if (shift.amount > 0) c.lerp(target, shift.amount);
      if (season === 'spring' && r > 0.9) c.lerp(SPRING_FLECK, 0.7); // a few white blossom flecks
      if (shift.snow > 0 && up > 0.5) c.lerp(SNOW, shift.snow);
    } else if (tag === TAG_EVERGREEN) {
      if (shift.snow > 0 && up > 0.3) c.lerp(SNOW, shift.snow);
    } else if (tag === TAG_BLOOM) {
      if (open <= 0) c.lerp(up > 0.3 ? SNOW : WITHERED, 0.8);
      else if (r > open) c.lerp(DRY, 0.7); // closed or withered bloom
      else if (season === 'autumn') c.lerp(DRY, 0.25);
    }
    out[v * 3] = c.r;
    out[v * 3 + 1] = c.g;
    out[v * 3 + 2] = c.b;
  }
  color.needsUpdate = true;
}
