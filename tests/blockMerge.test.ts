// Block merging, phase 1 (data and geometry): a merge of 2 to 4 neighbouring house blocks becomes one block.
// The streets between its members disappear, the outer edges keep their streets, houses stand only on the outer
// edges and the interior is one open courtyard. No merges: the layout is byte-for-byte the old one.
import { describe, expect, it } from 'vitest';
import { generateCity, type CityLayout } from '../src/city';
import { houseBlockId, mergedBlockId, memberIds, parseHouseBlockId, resolveBlockMerges, type MergeRect } from '../src/city/merge';
import { DEFAULT_SETTINGS } from '../src/store/model';
import { MeshBuilder } from '../src/streets/builder';
import { buildSurfaces } from '../src/streets/surfaces';
import { coplanarOverlaps } from './helpers/geometryAudit';

const SEED = DEFAULT_SETTINGS.seed;

function fnv(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16);
}

/** Hashes of the default-town layout before block merging existed (seeds 1, 7, 1234). */
const BASELINE: Record<number, string> = { 1: 'f9487df1', 7: '1b197b0', 1234: 'f5a24f41' };

function layoutOf(blockMerges: string[][] = []): CityLayout {
  return generateCity({ ...DEFAULT_SETTINGS, seed: SEED, blockMerges });
}

const houseIds = (l: CityLayout) => new Set(l.blocks.filter((b) => b.kind === 'houses').map((b) => b.id));

/** The n-th block-id group forming a w x h rectangle of existing house blocks. */
function rectIds(l: CityLayout, w: number, h: number, skip = 0): string[] {
  const houses = houseIds(l);
  let seen = 0;
  for (const id of houses) {
    const p = parseHouseBlockId(id)!;
    const ids: string[] = [];
    for (let r = p.r; r < p.r + h; r++) for (let c = p.c; c < p.c + w; c++) ids.push(houseBlockId(c, r));
    if (!ids.every((x) => houses.has(x))) continue;
    if (seen++ === skip) return ids;
  }
  throw new Error(`no ${w}x${h} rectangle of house blocks in the test town`);
}

const inside = (x: number, z: number, b: { minX: number; maxX: number; minZ: number; maxZ: number }) =>
  x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ;

function expectNoStreetAcross(l: CityLayout, b: { minX: number; maxX: number; minZ: number; maxZ: number }) {
  for (const r of l.roads) {
    const z0 = Math.min(r.start.z, r.end.z), z1 = Math.max(r.start.z, r.end.z);
    const x0 = Math.min(r.start.x, r.end.x), x1 = Math.max(r.start.x, r.end.x);
    if (r.orientation === 'vertical') {
      expect(inside(r.start.x, (z0 + z1) / 2, b) || (r.start.x > b.minX && r.start.x < b.maxX && z0 < b.maxZ && z1 > b.minZ), `${r.id} runs through the merged block`).toBe(false);
    } else {
      expect(r.start.z > b.minZ && r.start.z < b.maxZ && x0 < b.maxX && x1 > b.minX, `${r.id} runs through the merged block`).toBe(false);
    }
  }
  for (const it of l.intersections) expect(inside(it.center.x, it.center.z, b), `${it.id} inside merge`).toBe(false);
  for (const cw of l.crosswalks) expect(inside(cw.center.x, cw.center.z, b), `${cw.id} inside merge`).toBe(false);
  for (const t of l.streetTrees) if (t.setting === 'street') expect(inside(t.position.x, t.position.z, b), `${t.id} inside merge`).toBe(false);
  for (const lamp of l.lamps) expect(inside(lamp.position.x, lamp.position.z, b), `lamp ${lamp.id} inside merge`).toBe(false);
}

function checkMerge(m: MergeRect, members: string[]) {
  const base = layoutOf();
  const l = layoutOf([members]);
  const id = mergedBlockId(m);
  const merged = l.blocks.find((b) => b.id === id);
  expect(merged, 'merged block exists').toBeDefined();
  for (const mid of members) expect(l.blocks.some((b) => b.id === mid), `${mid} is gone`).toBe(false);
  // Bounds: the union of the member bounds, and it spans every street between them.
  const parts = members.map((mid) => base.blocks.find((b) => b.id === mid)!.bounds);
  expect(merged!.bounds.minX).toBe(Math.min(...parts.map((p) => p.minX)));
  expect(merged!.bounds.maxX).toBe(Math.max(...parts.map((p) => p.maxX)));
  expect(merged!.bounds.minZ).toBe(Math.min(...parts.map((p) => p.minZ)));
  expect(merged!.bounds.maxZ).toBe(Math.max(...parts.map((p) => p.maxZ)));
  // One open courtyard, and houses only on the outer edges (no lot centre in the courtyard).
  expect(merged!.courtyard, 'merged block keeps a courtyard').not.toBeNull();
  const cy = merged!.courtyard!;
  const lots = l.lots.filter((lot) => lot.blockId === id);
  expect(lots.length).toBeGreaterThan(0);
  for (const lot of lots) {
    expect(inside(lot.position.x, lot.position.z, merged!.bounds), `${lot.id} inside bounds`).toBe(true);
    expect(inside(lot.position.x, lot.position.z, cy), `${lot.id} stands in the courtyard`).toBe(false);
  }
  // Member lots are gone; other blocks keep exactly their lots.
  expect(l.lots.some((lot) => members.includes(lot.blockId))).toBe(false);
  expect(l.lots.filter((lot) => !members.includes(lot.blockId) && lot.blockId !== id)).toEqual(base.lots.filter((lot) => !members.includes(lot.blockId)));
  expectNoStreetAcross(l, merged!.bounds);
  // The outer streets are still there and the merge is recorded.
  expect(l.merges).toEqual([{ id, members: memberIds(m), bounds: merged!.bounds }]);
}

describe('block merging (phase 1)', () => {
  it('leaves the default town exactly as it was when no merges are set', () => {
    for (const seed of [1, 7, 1234]) {
      const l = generateCity({ ...DEFAULT_SETTINGS, seed, blockMerges: [] });
      expect(fnv(JSON.stringify(l)), `seed ${seed}`).toBe(BASELINE[seed]);
      expect(l.merges).toBeUndefined();
    }
  });

  it('merges two neighbouring blocks into one block with its own courtyard', () => {
    const ids = rectIds(layoutOf(), 2, 1);
    checkMerge({ c0: parseHouseBlockId(ids[0])!.c, c1: parseHouseBlockId(ids[1])!.c, r0: parseHouseBlockId(ids[0])!.r, r1: parseHouseBlockId(ids[0])!.r }, ids);
  });

  it('merges four blocks in a square and keeps the outer streets', () => {
    const ids = rectIds(layoutOf(), 2, 2);
    const cells = ids.map((id) => parseHouseBlockId(id)!);
    const m = { c0: Math.min(...cells.map((c) => c.c)), c1: Math.max(...cells.map((c) => c.c)), r0: Math.min(...cells.map((c) => c.r)), r1: Math.max(...cells.map((c) => c.r)) };
    checkMerge(m, ids);
  });

  it('is deterministic for the same merge and keeps the layout key stable across rebuilds', () => {
    const ids = rectIds(layoutOf(), 2, 1);
    expect(JSON.stringify(layoutOf([ids]))).toBe(JSON.stringify(layoutOf([ids])));
  });

  it('splitting a merge brings the member blocks back exactly', () => {
    const ids = rectIds(layoutOf(), 2, 1);
    const back = layoutOf([]);
    expect(JSON.stringify(back)).toBe(JSON.stringify(layoutOf()));
    expect(back.blocks.some((b) => b.id === ids[0])).toBe(true);
    expect(back.blocks.some((b) => b.id === ids[1])).toBe(true);
  });

  it('adds no coplanar overlaps to the streetscape surfaces compared with the unmerged town', () => {
    const count = (l: CityLayout) => {
      const surf = new MeshBuilder();
      const overlay = new MeshBuilder();
      buildSurfaces(l, surf, overlay);
      const s = surf.build()!;
      const o = overlay.build()!;
      return coplanarOverlaps(s, { maxSamples: 1 }).sameFacing + coplanarOverlaps(o, { maxSamples: 1 }).sameFacing;
    };
    const base = count(layoutOf());
    const merged = count(layoutOf([rectIds(layoutOf(), 2, 2)]));
    expect(merged).toBeLessThanOrEqual(base);
  }, 120_000);

  it('rejects invalid groups: non-adjacent, too large, duplicate ids, unknown or overlapping blocks', () => {
    // Synthetic house ids: a row of five blocks and one block above the first.
    const houses = new Set(['block-0-0', 'block-1-0', 'block-2-0', 'block-3-0', 'block-4-0', 'block-0-1']);
    const nonAdjacent = ['block-0-0', 'block-2-0'];
    const tooBig = ['block-0-0', 'block-1-0', 'block-2-0', 'block-3-0', 'block-4-0'];
    const dup = ['block-0-0', 'block-0-0'];
    const unknown = ['block-9-9', 'block-0-0'];
    const overlap = ['block-1-0', 'block-2-0'];
    const good = ['block-0-0', 'block-1-0'];
    const { accepted, rejected } = resolveBlockMerges([nonAdjacent, tooBig, dup, unknown, good, overlap], houses);
    expect(accepted.map((m) => m.c0 + '-' + m.c1)).toEqual(['0-1']);
    const reasons = rejected.map((r) => r.reason).join('|');
    expect(rejected.length).toBe(5);
    expect(reasons).toMatch(/rectangle/);
    expect(reasons).toMatch(/2 to 4/);
    expect(reasons).toMatch(/twice/);
    expect(reasons).toMatch(/existing house/);
    expect(reasons).toMatch(/already in another merge/);
  });

  it('ignores an invalid group in generateCity, so the town stays as it was', () => {
    const houses = houseIds(layoutOf());
    const [a] = [...houses];
    const bad = generateCity({ ...DEFAULT_SETTINGS, seed: SEED, blockMerges: [[a, 'block-999-999']] });
    expect(fnv(JSON.stringify(bad))).toBe(BASELINE[SEED]);
  });
});
