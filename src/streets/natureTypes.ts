// Nature tree types and shared constants: type table, slot and asset shapes, pine snow, tree scale.
import * as THREE from 'three';
import type { TreeSpecies } from '../core/types';
import { cityStreets } from '../config/tuning';

/** Pine snow: upward threshold of the snow cover (smoothstep lo..hi on the normal y) and the cover ceiling for pines. */
export const PINE_SNOW_UP: readonly [number, number] = cityStreets.pineSnowUp;
export const PINE_SNOW_COVER = cityStreets.pineSnowCover;

export interface NatureType {
  file: string;
  barkTex: string;
  leafTex: string;
  species: TreeSpecies;
  /** Conifers keep their needles all year: green in autumn, snow-capped in winter. */
  evergreen?: boolean;
}

/** The six tree types used in the city, in slot order. */
export const NATURE_TYPES: readonly NatureType[] = [
  { file: 'Tree_5', barkTex: 'Tree_Bark.jpg', leafTex: 'Tree_Leaves.png', species: 'oak' },
  { file: 'Tree_6', barkTex: 'Tree_Bark.jpg', leafTex: 'Tree_Leaves.png', species: 'oak' },
  { file: 'Pine_5', barkTex: 'Tree_Bark.jpg', leafTex: 'Pine_Leaves.png', species: 'ginkgo', evergreen: true },
  { file: 'Pine_2', barkTex: 'Tree_Bark.jpg', leafTex: 'Pine_Leaves.png', species: 'ginkgo', evergreen: true },
  { file: 'Birch_6', barkTex: 'Birch_Bark.png', leafTex: 'Birch_Leaves_Green.png', species: 'birch' },
  { file: 'Birch_10', barkTex: 'Birch_Bark.png', leafTex: 'Birch_Leaves_Green.png', species: 'birch' },
];

/** Seed salt for the type and yaw stream. Separate from every other city stream. */
export const NATURE_SALT = 0x5a17c3e1;

/** Baked geometry and materials for one tree type. */
export interface NatureAsset {
  type: NatureType;
  bark: THREE.BufferGeometry;
  leaves: THREE.BufferGeometry;
  /** Triangle indices of each leaf island (shared vertex index). */
  islands: number[][];
  barkMat: THREE.Material;
  leafMat: THREE.Material;
  /** Snow cap on upward-facing bark, winter only. Null when none. Leaf crowns get no snow geometry. */
  snowBark: THREE.BufferGeometry | null;
  snowMat: THREE.Material;
}

/** City tree scale on top of the layout scale. Same value as useTownGreenery.ts TREE_SCALE. */
export const TREE_SCALE = cityStreets.treeScale;

/** Optional overrides for natureItems. Default (undefined) keeps the layout scale and slot types. */
export interface NatureOverrides {
  /** Multiplies the layout scale; replaces TREE_SCALE when set. */
  treeScale?: number;
  /** Tree id to type index (NATURE_TYPES); other trees keep their slot type. */
  types?: Record<string, number>;
}

export interface NatureSlot {
  type: number;
  yaw: number;
}

/** Layer used by Town.tsx for the sun's shadow camera. No tree mesh sits on it since the full-leaf shadows. */
export const SHADOW_LAYER = 1;
