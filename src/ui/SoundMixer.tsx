import { useState } from 'react';
import * as audio from '../audio';
import type { Category } from '../audio/bus';
import { Slider } from './controls';
import { audio as audioTuning } from '../config/tuning';

/** Mixer levels as whole percent, 0..100. */
export interface MixerSettings {
  master: number;
  effects: number;
  nature: number;
  music: number;
}

export type MixerKey = keyof MixerSettings;

export const MIXER_KEYS: readonly MixerKey[] = ['master', 'effects', 'nature', 'music'];
export const MIXER_STORAGE_KEY = 'myworld3d.mixer.v1';
/** Starting levels (config audio.mixerDefaults); master matches the audio bus default (audio.masterVolumeDefault). */
export const MIXER_DEFAULTS: MixerSettings = audioTuning.mixerDefaults;
export const MIXER_LABEL: Record<MixerKey, string> = {
  master: 'Master',
  effects: 'Effects',
  nature: 'Nature',
  music: 'Music',
};

/** One level per individual sound type, whole percent (100 = unchanged). They sit under the group sliders. */
export type CategoryLevels = Partial<Record<Category, number>>;

/** Per-sound sliders in display order, with the group each belongs to (music is covered by its group slider). */
export const SOUND_ROWS: readonly { group: 'Effects' | 'Nature'; category: Category; label: string }[] = [
  { group: 'Effects', category: 'engine', label: 'Engines' },
  { group: 'Effects', category: 'horn', label: 'Horns' },
  { group: 'Effects', category: 'indicator', label: 'Turn signals' },
  { group: 'Effects', category: 'voice', label: 'Voices' },
  { group: 'Effects', category: 'footstep', label: 'Footsteps' },
  { group: 'Effects', category: 'dog', label: 'Dogs' },
  { group: 'Effects', category: 'cat', label: 'Cats' },
  { group: 'Effects', category: 'aircraft', label: 'Aircraft' },
  { group: 'Nature', category: 'bird', label: 'Birdsong' },
  { group: 'Nature', category: 'wing', label: 'Wing flaps' },
  { group: 'Nature', category: 'leaves', label: 'Leaves' },
  { group: 'Nature', category: 'wind', label: 'Wind' },
  { group: 'Nature', category: 'rain', label: 'Rain' },
  { group: 'Nature', category: 'thunder', label: 'Thunder' },
  { group: 'Nature', category: 'ambience', label: 'Church bells & crickets' },
];
export const CATEGORY_STORAGE_KEY = 'myworld3d.mixer.sounds.v1';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

const clampPct = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(100, Math.max(0, Math.round(v))) : fallback;

/** Parses stored JSON; anything missing, malformed or out of range falls back to the defaults. Pure. */
export function parseMixer(raw: string | null | undefined): MixerSettings {
  const out: MixerSettings = { ...MIXER_DEFAULTS };
  if (!raw) return out;
  try {
    const o = JSON.parse(raw) as Record<string, unknown> | null;
    if (o && typeof o === 'object') for (const k of MIXER_KEYS) out[k] = clampPct(o[k], out[k]);
  } catch {
    /* corrupt storage: defaults */
  }
  return out;
}

export function serializeMixer(m: MixerSettings): string {
  const o = {} as MixerSettings;
  for (const k of MIXER_KEYS) o[k] = clampPct(m[k], MIXER_DEFAULTS[k]);
  return JSON.stringify(o);
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadMixer(storage: StorageLike | null = defaultStorage()): MixerSettings {
  try {
    return parseMixer(storage?.getItem(MIXER_STORAGE_KEY));
  } catch {
    return { ...MIXER_DEFAULTS };
  }
}

export function saveMixer(m: MixerSettings, storage: StorageLike | null = defaultStorage()): void {
  try {
    storage?.setItem(MIXER_STORAGE_KEY, serializeMixer(m));
  } catch {
    /* private mode or quota: the level still applies for this session */
  }
}

/** Sends one level (percent) to the audio facade. */
export function applyMixerLevel(key: MixerKey, percent: number): void {
  const v = clampPct(percent, MIXER_DEFAULTS[key]) / 100;
  if (key === 'master') audio.setMasterVolume(v);
  else audio.setGroupVolume(key, v);
}

export function applyMixer(m: MixerSettings): void {
  for (const k of MIXER_KEYS) applyMixerLevel(k, m[k]);
}

/** Parses the stored per-sound levels; unknown sounds and bad values are dropped. Pure. */
export function parseCategoryLevels(raw: string | null | undefined): CategoryLevels {
  const out: CategoryLevels = {};
  if (!raw) return out;
  try {
    const o = JSON.parse(raw) as Record<string, unknown> | null;
    if (o && typeof o === 'object') {
      for (const row of SOUND_ROWS) {
        const v = o[row.category];
        if (typeof v === 'number' && Number.isFinite(v)) out[row.category] = clampPct(v, 100);
      }
    }
  } catch {
    /* corrupt storage: all sounds at 100 % */
  }
  return out;
}

export function loadCategoryLevels(storage: StorageLike | null = defaultStorage()): CategoryLevels {
  try {
    return parseCategoryLevels(storage?.getItem(CATEGORY_STORAGE_KEY));
  } catch {
    return {};
  }
}

export function saveCategoryLevels(levels: CategoryLevels, storage: StorageLike | null = defaultStorage()): void {
  try {
    storage?.setItem(CATEGORY_STORAGE_KEY, JSON.stringify(levels));
  } catch {
    /* private mode or quota */
  }
}

export function applyCategoryLevel(category: Category, percent: number): void {
  audio.setCategoryVolume(category, clampPct(percent, 100) / 100);
}

export function applyCategoryLevels(levels: CategoryLevels): void {
  for (const row of SOUND_ROWS) applyCategoryLevel(row.category, levels[row.category] ?? 100);
}

/** Loads the stored levels and applies them. Safe before audio.init() (the facade keeps the values). */
export function applyStoredMixer(storage?: StorageLike | null): MixerSettings {
  const m = storage === undefined ? loadMixer() : loadMixer(storage);
  applyMixer(m);
  return m;
}

// Apply at startup (module load, i.e. when the UI bundle is first imported), long before the panel opens.
if (typeof window !== 'undefined') {
  applyStoredMixer();
  applyCategoryLevels(loadCategoryLevels());
}

export function SoundMixer() {
  const [levels, setLevels] = useState<MixerSettings>(() => loadMixer());

  const set = (key: MixerKey, v: number) => {
    const next = { ...levels, [key]: clampPct(v, levels[key]) };
    setLevels(next);
    applyMixerLevel(key, next[key]);
    saveMixer(next);
  };

  const slider = (key: MixerKey) => (
    <Slider
      id={`mixer-${key}`}
      label={MIXER_LABEL[key]}
      value={levels[key]}
      min={0}
      max={100}
      step={1}
      format={(v) => `${Math.round(v)}%`}
      onChange={(v) => set(key, v)}
    />
  );

  const [sounds, setSounds] = useState<CategoryLevels>(() => loadCategoryLevels());
  const setSound = (category: Category, v: number) => {
    const next = { ...sounds, [category]: clampPct(v, 100) };
    setSounds(next);
    applyCategoryLevel(category, next[category] as number);
    saveCategoryLevels(next);
  };

  const soundRows = (group: 'Effects' | 'Nature') =>
    SOUND_ROWS.filter((row) => row.group === group).map((row) => (
      <Slider
        key={row.category}
        id={`sound-${row.category}`}
        label={row.label}
        value={sounds[row.category] ?? 100}
        min={0}
        max={100}
        step={1}
        format={(v) => `${Math.round(v)}%`}
        onChange={(v) => setSound(row.category, v)}
      />
    ));

  return (
    <div className="mw-mixer">
      {slider('master')}
      <div className="mw-grid-2">
        {slider('effects')}
        {slider('nature')}
      </div>
      {slider('music')}
      <details className="mw-mixer-details">
        <summary>Each sound</summary>
        <div className="mw-mixer-sub">Effects</div>
        {soundRows('Effects')}
        <div className="mw-mixer-sub">Nature</div>
        {soundRows('Nature')}
      </details>
    </div>
  );
}
