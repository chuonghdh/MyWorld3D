// Monument layout: the seeded 1-in-5 public-building rule and the standard cathedral and City Hall (city/generate.ts).
import { describe, expect, it } from 'vitest';
import { generateCity } from '../src/city';
import { chooseMonuments, MONUMENT_SHARE } from '../src/city/generate';
import { createRng } from '../src/core/rng';
import { buildings } from '../src/config/tuning';
import { DEFAULT_SETTINGS } from '../src/store/model';

const SEEDS = [1, 7, 1234, 42, 99];

const townOf = (seed: number) => generateCity({ ...DEFAULT_SETTINGS, seed, blockMerges: [] });

describe('monument layout (seeded 1-in-5 rule)', () => {
  it('uses a 0.2 share and makes exactly round(blocks x share) monument blocks', () => {
    expect(MONUMENT_SHARE).toBe(0.2);
    for (const seed of SEEDS) {
      const layout = townOf(seed);
      const monuments = layout.blocks.filter((b) => b.kind === 'monument');
      expect(monuments.length, `seed ${seed}`).toBe(Math.round(layout.blocks.length * 0.2));
    }
  });

  it('gives every monument block a kind and no house block one', () => {
    for (const seed of SEEDS) {
      const layout = townOf(seed);
      for (const b of layout.blocks) {
        if (b.kind === 'monument') expect(b.monument, `${b.id} seed ${seed}`).toBeDefined();
        else expect(b.monument, `${b.id} seed ${seed}`).toBeUndefined();
      }
    }
  });

  it('places exactly one Gothic cathedral and exactly one City Hall on different blocks', () => {
    for (const seed of SEEDS) {
      const layout = townOf(seed);
      const kinds = layout.blocks.filter((b) => b.kind === 'monument').map((b) => b.monument);
      expect(kinds.filter((k) => k === 'gothic-cathedral').length, `cathedral seed ${seed}`).toBe(1);
      expect(kinds.filter((k) => k === 'city-hall').length, `city hall seed ${seed}`).toBe(1);
    }
  });

  it('fills the other monument blocks only with the remaining kinds', () => {
    const others = buildings.monumentKinds.filter((k) => k !== 'gothic-cathedral' && k !== 'city-hall');
    for (const seed of SEEDS) {
      for (const b of townOf(seed).blocks) {
        if (b.kind !== 'monument' || b.monument === 'gothic-cathedral' || b.monument === 'city-hall') continue;
        expect(others, `seed ${seed}`).toContain(b.monument);
      }
    }
  });

  it('is deterministic per seed and differs between seeds', () => {
    expect(JSON.stringify(townOf(7).blocks)).toBe(JSON.stringify(townOf(7).blocks));
    const ids = (seed: number) => townOf(seed).blocks.filter((b) => b.kind === 'monument').map((b) => b.id).join(',');
    expect(ids(1)).toBe(ids(1));
    expect(ids(1)).not.toBe(ids(7));
  });

  it('chooses small towns by the rule with the two standard monuments as a floor', () => {
    expect(chooseMonuments(0, createRng(1))).toEqual([]);
    const one = chooseMonuments(1, createRng(1));
    expect(one.map((p) => p.kind)).toEqual(['gothic-cathedral']);
    const three = chooseMonuments(3, createRng(1));
    expect(three.map((p) => p.kind).slice(0, 2)).toEqual(['gothic-cathedral', 'city-hall']);
    expect(new Set(three.map((p) => p.index)).size).toBe(three.length);
  });
});
