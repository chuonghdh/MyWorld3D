import { describe, expect, it } from 'vitest';
import { MIXER_DEFAULTS, MIXER_STORAGE_KEY, loadMixer, parseMixer, saveMixer, serializeMixer } from '../src/ui/SoundMixer';

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
};

describe('sound mixer persistence', () => {
  it('falls back to defaults for missing or corrupt data and clamps values', () => {
    expect(parseMixer(null)).toEqual(MIXER_DEFAULTS);
    expect(parseMixer('{nope')).toEqual(MIXER_DEFAULTS);
    expect(parseMixer('{"master":150,"effects":-4,"nature":"x","music":33.4}')).toEqual({
      master: 100, effects: 0, nature: MIXER_DEFAULTS.nature, music: 33,
    });
  });

  it('round-trips through storage and survives a throwing storage', () => {
    const s = memory();
    saveMixer({ master: 55, effects: 40, nature: 70, music: 10 }, s);
    expect(JSON.parse(s.m.get(MIXER_STORAGE_KEY) as string)).toEqual({ master: 55, effects: 40, nature: 70, music: 10 });
    expect(loadMixer(s)).toEqual({ master: 55, effects: 40, nature: 70, music: 10 });
    const bad = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
    expect(loadMixer(bad)).toEqual(MIXER_DEFAULTS);
    expect(() => saveMixer(MIXER_DEFAULTS, bad)).not.toThrow();
    expect(loadMixer(null)).toEqual(MIXER_DEFAULTS);
    expect(parseMixer(serializeMixer(MIXER_DEFAULTS))).toEqual(MIXER_DEFAULTS);
  });
});

describe('per-sound levels', () => {
  it('lists every sound type that has a slider and round-trips through storage', async () => {
    const m = await import('../src/ui/SoundMixer');
    expect(m.SOUND_ROWS.length).toBeGreaterThanOrEqual(14);
    expect(new Set(m.SOUND_ROWS.map((r) => r.category)).size).toBe(m.SOUND_ROWS.length);
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    m.saveCategoryLevels({ engine: 40, bird: 0, wind: 150 }, storage);
    const back = m.loadCategoryLevels(storage);
    expect(back.engine).toBe(40);
    expect(back.bird).toBe(0);
    expect(back.wind).toBe(100); // clamped
    expect(back.horn).toBeUndefined(); // untouched sounds stay at the default
  });

  it('drops garbage and unknown sounds', async () => {
    const m = await import('../src/ui/SoundMixer');
    expect(m.parseCategoryLevels('not json')).toEqual({});
    expect(m.parseCategoryLevels(JSON.stringify({ engine: 'loud', nonsense: 5, dog: 20 }))).toEqual({ dog: 20 });
    expect(m.parseCategoryLevels(null)).toEqual({});
  });
});
