import { describe, expect, it, vi } from 'vitest';
import { generateCity } from '../src/city';
import { cityLayoutKey, createLayoutProvider, retargetTraffic } from '../src/city/layoutKey';
import { QUALITY_PRESETS, suggestQuality } from '../src/store/quality';
import { createDefaultSettings } from '../src/store/model';
import { exportLayout, importLayout } from '../src/store/io';
import { createEmptyLayout } from '../src/store/model';
import { useWorldStore } from '../src/store';
import { shadowHalfExtent } from '../src/scene/Town';

describe('layout once, traffic out of layout', () => {
  it('the key ignores traffic, quality and weather but not seed, size or street trees', () => {
    const a = createDefaultSettings(1);
    const t = { ...a, trafficMultiplier: 0.2 };
    const q = { ...a, quality: 'low' as const, weatherIntensity: 0.1 };
    expect(cityLayoutKey(t)).toBe(cityLayoutKey(a));
    expect(cityLayoutKey(q)).toBe(cityLayoutKey(a));
    expect(cityLayoutKey({ ...a, seed: 2 })).not.toBe(cityLayoutKey(a));
    expect(cityLayoutKey({ ...a, townWidth: 300 })).not.toBe(cityLayoutKey(a));
    expect(cityLayoutKey({ ...a, streetTreeMultiplier: 2 })).not.toBe(cityLayoutKey(a));
  });

  it('the provider does not regenerate when only traffic changes', () => {
    const gen = vi.fn(generateCity);
    const get = createLayoutProvider(gen);
    const s = createDefaultSettings(1);
    const first = get(s);
    for (const t of [0, 0.5, 1, 3]) expect(get({ ...s, trafficMultiplier: t })).toBe(first);
    expect(gen).toHaveBeenCalledTimes(1);
    get({ ...s, seed: 9 });
    expect(gen).toHaveBeenCalledTimes(2);
  });

  it('retargetTraffic matches generateCity at that density and shares the rest', () => {
    const s = createDefaultSettings(3);
    const base = createLayoutProvider()(s);
    for (const t of [0, 0.5, 1.75, 3]) {
      const re = retargetTraffic(base, t);
      const full = generateCity({ ...s, trafficMultiplier: t });
      expect(re.trafficPaths).toEqual(full.trafficPaths);
      expect(re.lots).toBe(base.lots);
      expect(re.streetTrees).toBe(base.streetTrees);
      expect(re.blocks).toBe(base.blocks);
    }
  });
});

describe('quality tiers', () => {
  it('high keeps the reference look, lower tiers only reduce', () => {
    const h = QUALITY_PRESETS.high;
    expect(h).toMatchObject({ dprMax: 2, shadowMap: 4096, bloom: 1, traffic: 1 });
    expect(QUALITY_PRESETS.low).toMatchObject({ dprMax: 1, shadowMap: 1024, bloom: 0, traffic: 0.5 });
    const m = QUALITY_PRESETS.medium;
    expect(m.dprMax).toBeLessThan(h.dprMax);
    expect(m.bloom).toBeGreaterThan(0);
    expect(m.bloom).toBeLessThan(1);
  });

  it('defaults to high, round-trips through JSON, old files fall back to high', () => {
    expect(createDefaultSettings().quality).toBe('high');
    const layout = createEmptyLayout(1);
    layout.settings.quality = 'low';
    const res = importLayout(exportLayout(layout));
    expect(res.ok && res.layout.settings.quality).toBe('low');
    const old = JSON.parse(exportLayout(createEmptyLayout(1)));
    delete old.settings.quality;
    const res2 = importLayout(JSON.stringify(old));
    expect(res2.ok && res2.layout.settings.quality).toBe('high');
    old.settings.quality = 'ultra';
    expect(importLayout(JSON.stringify(old)).ok).toBe(false);
  });

  it('quality is not undoable and survives undo', () => {
    const st = useWorldStore.getState();
    st.setSetting('windSpeed', 9);
    st.setQuality('low');
    useWorldStore.getState().undo();
    expect(useWorldStore.getState().settings.quality).toBe('low');
    expect(useWorldStore.getState().settings.windSpeed).not.toBe(9);
    useWorldStore.getState().setQuality('high');
  });

  it('suggests but is a pure function', () => {
    expect(suggestQuality({ coarsePointer: true }).tier).toBe('low');
    expect(suggestQuality({ renderer: 'ANGLE (Intel, Intel(R) UHD Graphics)' }).tier).toBe('medium');
    expect(suggestQuality({ renderer: 'NVIDIA GeForce RTX 3060', cores: 12, deviceMemory: 8 }).tier).toBe('high');
  });
});

describe('shadow frustum', () => {
  it('uses the whole-town fit when zoomed out and tightens when zoomed in', () => {
    const full = 128.5;
    expect(shadowHalfExtent(Infinity, full)).toBe(full);
    expect(shadowHalfExtent(400, full)).toBe(full);
    expect(shadowHalfExtent(40, full)).toBe(50);
    expect(shadowHalfExtent(100, full)).toBe(80);
    expect(shadowHalfExtent(100.5, full)).toBe(90);
  });
});
