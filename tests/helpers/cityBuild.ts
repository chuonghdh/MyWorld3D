// Builds the houses of a generated city exactly the way src/scene/Town.tsx does (houseParamsFor,
// lotMatrix, one mergeByMaterial per block), for the geometry audits.
import * as THREE from 'three';
import { generateCity, type Lot } from '../../src/city';
import { buildHouse, defaultHouseParams, type HouseParams } from '../../src/buildings';
import { mergeByMaterial, type PlacedObject } from '../../src/scene/mergeBlock';
import { blockPresetFor, lotStyle } from '../../src/scene/cityStyle';
import { DEFAULT_SETTINGS } from '../../src/store/model';

/** Mirror of lotMatrix in Town.tsx (no block offset: blocks stay in their own slot). */
export function lotMatrix(lot: Lot): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(lot.position.x, 0, lot.position.z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), lot.facing),
    new THREE.Vector3(1, 1, 1),
  );
}

/** Mirror of houseParamsFor in Town.tsx without overrides. */
export function houseParamsFor(lot: Lot, blockId: string): HouseParams {
  const style = lotStyle(lot, blockPresetFor(blockId));
  const preset = style.preset;
  const defaults = defaultHouseParams(preset, 'classic');
  const floors = preset === 'glass-tower' ? Math.max(lot.floors, 7) : lot.floors;
  return {
    ...defaults,
    preset,
    floors,
    roof: defaults.roof,
    style: defaults.style,
    wallColor: style.wallColor,
    shutterColor: style.shutterColor,
    width: lot.width,
    depth: lot.depth,
    facades: lot.facades,
    groundFloor: lot.groundFloor,
    seed: lot.seed,
  };
}

export interface BuiltBlock {
  id: string;
  lots: Lot[];
  group: THREE.Group;
}

export function buildCityBlocks(seed: number, overrides: Partial<typeof DEFAULT_SETTINGS> = {}): BuiltBlock[] {
  const layout = generateCity({ ...DEFAULT_SETTINGS, seed, ...overrides });
  const out: BuiltBlock[] = [];
  for (const block of layout.blocks) {
    if (block.kind !== 'houses') continue;
    const lots = layout.lots.filter((l) => l.blockId === block.id);
    if (lots.length === 0) continue;
    const placed: PlacedObject[] = lots.map((lot) => ({ object: buildHouse(houseParamsFor(lot, block.id)), matrix: lotMatrix(lot) }));
    out.push({ id: block.id, lots, group: mergeByMaterial(placed, 'block-' + block.id) });
  }
  return out;
}
