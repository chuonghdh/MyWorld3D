// Shutters for every house type that can carry them: preset helpers (buildings) and the fill rule in houseParamsFor.
import { describe, expect, it } from 'vitest';
import { HOUSE_PRESETS, SHUTTER_COLORS, HOUSE_SHUTTER_OPTIONS, defaultHouseParams, presetDefaultShutter, presetHasShutters } from '../src/buildings';
import { generateCity } from '../src/city';
import { DEFAULT_SETTINGS } from '../src/store/model';
import { houseParamsFor } from '../src/scene/townBlocks';
import type { HousePreset } from '../src/core/types';

const NO_SHUTTERS: HousePreset[] = ['glass-tower', 'bauhaus', 'brutalist-concrete'];

describe('preset shutter helpers', () => {
  it('only glass tower, bauhaus and brutalist have no shutters', () => {
    for (const p of HOUSE_PRESETS) expect(presetHasShutters(p)).toBe(!NO_SHUTTERS.includes(p));
  });

  it('default shutter is the classic preset shutter, else a house shutter option', () => {
    for (const p of HOUSE_PRESETS) {
      const c = presetDefaultShutter(p);
      expect(HOUSE_SHUTTER_OPTIONS).toContain(c);
      const spec = defaultHouseParams(p, 'classic').shutterColor;
      if (spec) expect(c).toBe(spec);
    }
  });
  it('canal, brownstone and nordic fill from their own palette, not the generic first option', () => {
    expect(presetDefaultShutter('canal-amsterdam')).toBe(SHUTTER_COLORS.sage);
    expect(presetDefaultShutter('brownstone-ny')).toBe(SHUTTER_COLORS.grey);
    expect(presetDefaultShutter('nordic-timber')).toBe(SHUTTER_COLORS.cream);
    for (const p of ['canal-amsterdam', 'brownstone-ny', 'nordic-timber'] as const) {
      expect(defaultHouseParams(p, 'classic').shutterColor).toBeNull();
    }
  });
});

describe('shutter palette', () => {
  it('keeps the original five first and in order, then the appended colours', () => {
    expect(HOUSE_SHUTTER_OPTIONS.slice(0, 5)).toEqual(['#5f7d63', '#3f6e8f', '#7a2e2a', '#e9dcc0', '#6c7378']);
    expect(HOUSE_SHUTTER_OPTIONS.length).toBe(14);
    expect(new Set(HOUSE_SHUTTER_OPTIONS).size).toBe(HOUSE_SHUTTER_OPTIONS.length);
    for (const c of HOUSE_SHUTTER_OPTIONS) expect(c).toMatch(/^#[0-9a-f]{6}$/);
    expect(HOUSE_SHUTTER_OPTIONS[0]).toBe(SHUTTER_COLORS.sage);
  });
});

describe('houseParamsFor shutter fill', () => {
  const lots = generateCity({ ...DEFAULT_SETTINGS, blockMerges: [] }).lots;
  const bare = lots.filter((l) => houseParamsFor(l, l.blockId, {}).shutterColor === null);
  const withShutter = lots.find((l) => houseParamsFor(l, l.blockId, {}).shutterColor !== null)!;

  it('the default town has lots without shutters (the case being fixed)', () => {
    expect(bare.length).toBeGreaterThan(0);
  });

  it('untouched houses keep the lot look', () => {
    for (const l of bare) expect(houseParamsFor(l, l.blockId, { floors: 4 }).shutterColor).toBeNull();
  });

  it('a picked type that can carry shutters gets its default shutter on a bare lot', () => {
    const l = bare[0]!;
    for (const p of HOUSE_PRESETS) {
      if (p === 'as-block') continue;
      const got = houseParamsFor(l, l.blockId, { preset: p }).shutterColor;
      expect(got).toBe(presetHasShutters(p) ? presetDefaultShutter(p) : null);
    }
    expect(houseParamsFor(l, l.blockId, { preset: 'as-block' }).shutterColor).toBeNull();
  });

  it('the lot shutter and the user shutter win over the preset default', () => {
    const lotColor = houseParamsFor(withShutter, withShutter.blockId, {}).shutterColor;
    expect(houseParamsFor(withShutter, withShutter.blockId, { preset: 'mediterranean' }).shutterColor).toBe(lotColor);
    const l = bare[0]!;
    expect(houseParamsFor(l, l.blockId, { preset: 'mediterranean', shutterColor: '#123456' }).shutterColor).toBe('#123456');
  });
});
