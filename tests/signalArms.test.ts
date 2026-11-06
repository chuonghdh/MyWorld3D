// Signal heads follow the real arms of each junction (block merges remove arms).
import { describe, expect, it } from 'vitest';
import { generateCity, type CityLayout } from '../src/city';
import { armCount, junctionArms } from '../src/city/junctionArms';
import { houseBlockId, parseHouseBlockId } from '../src/city/merge';
import { DEFAULT_SETTINGS } from '../src/store/model';
import { buildFurniture } from '../src/streets/furniture';

const layoutOf = (blockMerges: string[][] = []): CityLayout => generateCity({ ...DEFAULT_SETTINGS, blockMerges });

/**
 * Top-left cell of the first 2 x 2 square of house blocks in the default town whose two junctions on the cut street
 * are inner T junctions (three arms). A square on the town edge leaves a two-arm corner, which has no light.
 * Row 0 and the last rows are edge rows, so the square must sit at row 1 or higher and end before the last row.
 */
function square(l: CityLayout): { c: number; r: number } {
  const houses = new Set(l.blocks.filter((b) => b.kind === 'houses').map((b) => b.id));
  const rows = Math.max(...[...houses].map((id) => parseHouseBlockId(id)!.r));
  for (const id of houses) {
    const p = parseHouseBlockId(id)!;
    if (p.r < 1 || p.r > rows - 2) continue;
    const ids = [houseBlockId(p.c, p.r), houseBlockId(p.c + 1, p.r), houseBlockId(p.c, p.r + 1), houseBlockId(p.c + 1, p.r + 1)];
    if (ids.every((x) => houses.has(x))) return p;
  }
  throw new Error('no 2 x 2 square of house blocks');
}

function signalsByLight(l: CityLayout): { heads: Map<string, number>; poles: Map<string, number> } {
  const f = buildFurniture(l, false);
  const heads = new Map<string, number>();
  const poles = new Map<string, number>();
  for (const h of f.signals.heads) heads.set(h.light.id, (heads.get(h.light.id) ?? 0) + 1);
  for (const p of f.signals.poles) poles.set(p.lightId, (poles.get(p.lightId) ?? 0) + 1);
  return { heads, poles };
}

describe('signal heads follow junction arms', () => {
  it('draws four poles and eight heads at every light without merges', () => {
    const l = layoutOf();
    const arms = junctionArms(l);
    const { heads, poles } = signalsByLight(l);
    for (const light of l.trafficLights) {
      expect(arms(light.position.x, light.position.z), light.id).toBe(15);
      expect(heads.get(light.id), light.id).toBe(8);
      expect(poles.get(light.id), light.id).toBe(4);
    }
  });

  it('draws six heads at a T junction left by a two-block merge', () => {
    const base = layoutOf();
    const { c, r } = square(base);
    const l = layoutOf([[houseBlockId(c, r), houseBlockId(c + 1, r)]]);
    const arms = junctionArms(l);
    const { heads, poles } = signalsByLight(l);
    for (const id of [`light-${c + 1}-${r}`, `light-${c + 1}-${r + 1}`]) {
      const light = l.trafficLights.find((x) => x.id === id)!;
      expect(light, id).toBeDefined();
      expect(armCount(arms(light.position.x, light.position.z)), id).toBe(3);
      expect(heads.get(id), id).toBe(6);
      expect(poles.get(id), id).toBe(4);
    }
  });

  it('drops the light and draws no signal at a two-arm junction between two stacked merges', () => {
    const base = layoutOf();
    const { c, r } = square(base);
    const l = layoutOf([
      [houseBlockId(c, r), houseBlockId(c + 1, r)],
      [houseBlockId(c, r + 1), houseBlockId(c + 1, r + 1)],
    ]);
    const id = `light-${c + 1}-${r + 1}`;
    const it = l.intersections.find((x) => x.id === `intersection-${c + 1}-${r + 1}`)!;
    expect(it, 'the junction itself remains').toBeDefined();
    expect(armCount(junctionArms(l)(it.center.x, it.center.z))).toBe(2);
    expect(l.trafficLights.some((x) => x.id === id), 'no light at a 2-arm junction').toBe(false);
    // Every remaining light has at least three arms.
    const arms = junctionArms(l);
    for (const light of l.trafficLights) expect(armCount(arms(light.position.x, light.position.z)), light.id).toBeGreaterThanOrEqual(3);
    const { heads, poles } = signalsByLight(l);
    expect(heads.get(id) ?? 0).toBe(0);
    expect(poles.get(id) ?? 0).toBe(0);
  });

});
