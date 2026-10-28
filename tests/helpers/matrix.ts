// The single-house configuration matrix shared by the geometry tests and the debug probe.
import type { Facades } from '../../src/core/types';
import { HOUSE_PRESETS, ROOF_TYPES, defaultHouseParams, type HouseParams } from '../../src/buildings';

export const FACADE_SETS: Record<string, Facades> = {
  front: { front: true, back: false, left: false, right: false },
  'front+back': { front: true, back: true, left: false, right: false },
  'front+left': { front: true, back: false, left: true, right: false },
  'corner front+left+right': { front: true, back: false, left: true, right: true },
  all: { front: true, back: true, left: true, right: true },
};

export interface MatrixCase {
  label: string;
  params: HouseParams;
}

/**
 * Every preset x roof x style with all five facade sets, floors 2/4/8 and seeds rotating through the
 * combinations so each (preset, roof, style) sees every facade set, every floor count and several seeds.
 */
export function matrixCases(): MatrixCase[] {
  const out: MatrixCase[] = [];
  const sets = Object.entries(FACADE_SETS);
  const floorsList = [2, 4, 8];
  let k = 0;
  for (const preset of HOUSE_PRESETS) {
    if (preset === 'as-block') continue;
    for (const style of ['classic', 'modern'] as const) {
      for (const roof of ROOF_TYPES) {
        sets.forEach(([name, facades], si) => {
          const floors = floorsList[(k + si) % 3];
          const seed = 1 + ((k * 7 + si * 3) % 11);
          const base = defaultHouseParams(preset, style);
          out.push({
            label: `${preset}/${style}/${roof}/${name}/f${floors}/s${seed}`,
            params: { ...base, roof, floors, facades, seed, width: [7, 9, 12, 14][(k + si) % 4], depth: [8, 12, 14, 18][(k * 2 + si) % 4] },
          });
        });
        k++;
      }
    }
  }
  return out;
}
