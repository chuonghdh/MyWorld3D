// Lab tree types, slot assignment and tree items (split from labNatureTrees.ts). Lab copy of the city's natureTrees.ts.
import * as THREE from 'three';
import type { TreeSpecies } from '../../core/types';
import { createRng } from '../../core/rng';
import type { CityLayout } from '../../city/layout';
import { LAB_TUNING } from './labTuning';

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
export const TREE_SCALE = LAB_TUNING.treeScale;

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

/** One type and yaw per street, avenue, courtyard and plaza tree, in layout order: two draws per slot, always. */
/** Conifers are about a tenth of the city: only on the outer sidewalk ring, plazas and merged-block yards. */
export const PINE_SHARE = LAB_TUNING.pineShare;
/** Outer sidewalk ring depth (m) from the town edge, where street trees count as the pedestrian border. */
export const BORDER_DEPTH = LAB_TUNING.borderDepth;

const BROADLEAF_TYPES = NATURE_TYPES.flatMap((t, i) => (t.evergreen ? [] : [i]));
const CONIFER_TYPES = NATURE_TYPES.flatMap((t, i) => (t.evergreen ? [i] : []));

/** One tree type and yaw per street tree, in layout order. Each slot draws the same numbers whatever its setting. */
export function natureSlots(layout: CityLayout, seed: number): NatureSlot[] {
  const rng = createRng((seed ^ NATURE_SALT) >>> 0);
  const b = layout.townBounds;
  const mergedYards = layout.blocks.flatMap((blk) => (blk.courtyard?.merged ? [blk.courtyard] : []));
  const inYard = (x: number, z: number) =>
    mergedYards.some((c) => x >= c.minX && x <= c.maxX && z >= c.minZ && z <= c.maxZ);
  return layout.streetTrees.map((t) => {
    const x = t.position.x;
    const z = t.position.z;
    const edge = Math.min(x - b.minX, b.maxX - x, z - b.minZ, b.maxZ - z);
    const coniferSpot =
      t.setting === 'plaza' || (t.setting === 'street' && edge < BORDER_DEPTH) || (t.setting === 'courtyard' && inYard(x, z));
    const broadleaf = BROADLEAF_TYPES[Math.floor(rng() * BROADLEAF_TYPES.length)];
    const conifer = CONIFER_TYPES[Math.floor(rng() * CONIFER_TYPES.length)];
    const takeConifer = coniferSpot && rng() < PINE_SHARE;
    const yaw = rng() * Math.PI * 2;
    return { type: takeConifer ? conifer : broadleaf, yaw };
  });
}

export interface NatureTreeItem {
  id: string;
  position: { x: number; z: number };
  scale: number;
  type: number;
  yaw: number;
}

/**
 * Tree items for the field: the layout's positions and scales (times TREE_SCALE), with the slot's type and yaw.
 * `overrides` is optional; without it the output is the default city.
 */
export function natureItems(layout: CityLayout, seed: number, overrides?: NatureOverrides): NatureTreeItem[] {
  const slots = natureSlots(layout, seed);
  const k = overrides?.treeScale ?? TREE_SCALE;
  return layout.streetTrees.map((t, i) => ({
    id: t.id,
    position: { x: t.position.x, z: t.position.z },
    scale: t.scale * k,
    type: overrides?.types?.[t.id] ?? slots[i].type,
    yaw: slots[i].yaw,
  }));
}
