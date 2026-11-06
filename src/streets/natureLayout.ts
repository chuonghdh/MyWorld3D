// Tree slots (type and yaw per street tree) and tree items for the field. Pure, seeded by the layout.
import type { CityLayout } from '../city/layout';
import { createRng } from '../core/rng';
import { cityStreets } from '../config/tuning';
import { NATURE_SALT, NATURE_TYPES, TREE_SCALE } from './natureTypes';
import type { NatureOverrides, NatureSlot } from './natureTypes';

/** One type and yaw per street, avenue, courtyard and plaza tree, in layout order: two draws per slot, always. */
/** Conifers are about a tenth of the city: only on the outer sidewalk ring, plazas and merged-block yards. */
export const PINE_SHARE = cityStreets.pineShare;
/** Outer sidewalk ring depth (m) from the town edge, where street trees count as the pedestrian border. */
export const BORDER_DEPTH = cityStreets.borderDepth;

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
  const items: NatureTreeItem[] = [];
  layout.streetTrees.forEach((t, i) => {
    const type = overrides?.types?.[t.id] ?? slots[i].type;
    // Broadleaf trees stay on the sidewalks: inside blocks (courtyards, plazas) only conifers are drawn.
    if (t.setting !== 'street' && !NATURE_TYPES[type].evergreen) return;
    items.push({
      id: t.id,
      position: { x: t.position.x, z: t.position.z },
      scale: t.scale * k,
      type,
      yaw: slots[i].yaw,
    });
  });
  return items;
}
