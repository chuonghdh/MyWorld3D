// Style runs of merged blocks: plain blocks keep one style key, merged blocks change it every 5 lots.
import { describe, expect, it } from 'vitest';
import { generateCity } from '../src/city';
import { houseBlockId, parseHouseBlockId } from '../src/city/merge';
import { DEFAULT_SETTINGS } from '../src/store/model';
import { houseParamsFor, styleKeyFor } from '../src/scene/townBlocks';

function first2x2(): string[] {
  const l = generateCity({ ...DEFAULT_SETTINGS, blockMerges: [] });
  const houses = new Set(l.blocks.filter((b) => b.kind === 'houses').map((b) => b.id));
  for (const id of houses) {
    const p = parseHouseBlockId(id)!;
    const ids = [houseBlockId(p.c, p.r), houseBlockId(p.c + 1, p.r), houseBlockId(p.c, p.r + 1), houseBlockId(p.c + 1, p.r + 1)];
    if (ids.every((x) => houses.has(x))) return ids;
  }
  throw new Error('no 2x2 house rectangle');
}

describe('styleKeyFor', () => {
  it('leaves unmerged blocks unchanged', () => {
    const l = generateCity({ ...DEFAULT_SETTINGS, blockMerges: [] });
    for (const lot of l.lots) {
      expect(styleKeyFor(lot, lot.blockId)).toBe(lot.blockId);
      expect(houseParamsFor(lot, lot.blockId, {}).sharedCourtyard).toBeUndefined();
    }
  });

  it('changes the key of a merged block every 5 lots along the ring', () => {
    const l = generateCity({ ...DEFAULT_SETTINGS, blockMerges: [first2x2()] });
    const merged = l.blocks.find((b) => b.id.startsWith('merged-'));
    expect(merged).toBeDefined();
    const lots = l.lots.filter((x) => x.blockId === merged!.id);
    expect(lots.length).toBeGreaterThan(5);
    for (const lot of lots) {
      const k = Number(/-lot-(\d+)$/.exec(lot.id)![1]);
      expect(styleKeyFor(lot, merged!.id)).toBe(`${merged!.id}:run-${Math.floor(k / 5)}`);
      expect(houseParamsFor(lot, merged!.id, {}).sharedCourtyard).toBe(true);
    }
    expect(new Set(lots.map((x) => styleKeyFor(x, merged!.id))).size).toBe(Math.ceil(lots.length / 5));
  });
});
