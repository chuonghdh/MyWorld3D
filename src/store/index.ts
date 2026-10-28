import { create } from 'zustand';
import {
  DEFAULT_TOGGLES,
  HISTORY_LIMIT,
  createDefaultSettings,
  type BlockOverride,
  type HouseOverride,
  type LayoutData,
  type TreeOverride,
  type UiToggles,
  type WorldSettings,
} from './model';

export * from './model';
export * from './quality';
import type { QualitySuggestion, QualityTier } from './quality';

export type OverrideTarget =
  | { type: 'block'; id: string }
  | { type: 'house'; id: string }
  | { type: 'tree'; id: string };

export type OverridePatch = Partial<BlockOverride & HouseOverride & TreeOverride>;

export interface WorldState extends LayoutData {
  /** Undo stack, oldest first. Bounded by HISTORY_LIMIT. */
  past: LayoutData[];
  /** Redo stack, most recent undone step last. */
  future: LayoutData[];
  toggles: UiToggles;
  /** Device-based tier suggestion. Transient: never applied automatically, not saved. */
  suggestedQuality: QualitySuggestion | null;

  setSuggestedQuality: (s: QualitySuggestion | null) => void;
  /** Changes the quality tier. Not undoable: undo/redo keep the current tier. */
  setQuality: (tier: QualityTier) => void;
  setSetting: <K extends keyof WorldSettings>(key: K, value: WorldSettings[K]) => void;
  setOverride: (target: OverrideTarget, patch: OverridePatch) => void;
  clearOverride: (target: OverrideTarget) => void;
  setBlockOrder: (ids: string[]) => void;
  swapBlocks: (a: string, b: string) => void;
  loadLayout: (layout: LayoutData) => void;
  setToggle: (key: keyof UiToggles, value: boolean) => void;
  /** Moves the time of day forward (wraps at 24). Not undoable: it is clock ticking, not an edit. */
  advanceTime: (hours: number) => void;
  /** Sets the time of day (hours, wraps at 24). Not undoable, like advanceTime: used by camera presets. */
  setTimeOfDay: (hours: number) => void;
  undo: () => void;
  redo: () => void;
  resetBlocks: () => void;
  resetHouses: () => void;
  resetAll: () => void;
}

const LAYOUT_KEYS = [
  'settings',
  'blockOrder',
  'baseBlockOrder',
  'blockOverrides',
  'houseOverrides',
  'treeOverrides',
] as const;

function snapshot(s: LayoutData): LayoutData {
  return {
    settings: s.settings,
    blockOrder: s.blockOrder,
    baseBlockOrder: s.baseBlockOrder,
    blockOverrides: s.blockOverrides,
    houseOverrides: s.houseOverrides,
    treeOverrides: s.treeOverrides,
  };
}

/** Undo/redo restore layout data but never the quality tier, which is a device preference. */
function keepQuality(layout: LayoutData, quality: QualityTier): LayoutData {
  const snap = snapshot(layout);
  return { ...snap, settings: { ...snap.settings, quality } };
}

function sameLayout(a: LayoutData, b: LayoutData): boolean {
  return LAYOUT_KEYS.every((k) => JSON.stringify(a[k]) === JSON.stringify(b[k]));
}

function overrideKey(target: OverrideTarget): 'blockOverrides' | 'houseOverrides' | 'treeOverrides' {
  if (target.type === 'block') return 'blockOverrides';
  if (target.type === 'house') return 'houseOverrides';
  return 'treeOverrides';
}

const initialLayout: LayoutData = {
  settings: createDefaultSettings(),
  blockOrder: [],
  baseBlockOrder: [],
  blockOverrides: {},
  houseOverrides: {},
  treeOverrides: {},
};

export const useWorldStore = create<WorldState>()((set, get) => {
  /** Push the current layout onto the undo stack and apply `next`. No-op if nothing changed. */
  const commit = (next: LayoutData) => {
    const state = get();
    const cur = snapshot(state);
    if (sameLayout(cur, next)) return;
    set({
      ...next,
      past: [...state.past, cur].slice(-HISTORY_LIMIT),
      future: [],
    });
  };

  return {
    ...initialLayout,
    past: [],
    future: [],
    toggles: { ...DEFAULT_TOGGLES },
    suggestedQuality: null,

    setSuggestedQuality: (suggestion) => set({ suggestedQuality: suggestion }),
    setQuality: (tier) => set((s) => (s.settings.quality === tier ? s : { settings: { ...s.settings, quality: tier } })),

    setSetting: (key, value) => {
      const s = get();
      if (s.settings[key] === value) return;
      commit({ ...snapshot(s), settings: { ...s.settings, [key]: value } });
    },

    setOverride: (target, patch) => {
      const s = get();
      const key = overrideKey(target);
      const prev = s[key][target.id] ?? {};
      const merged: Record<string, unknown> = { ...prev };
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) delete merged[k];
        else merged[k] = v;
      }
      commit({ ...snapshot(s), [key]: { ...s[key], [target.id]: merged } });
    },

    clearOverride: (target) => {
      const s = get();
      const key = overrideKey(target);
      if (!(target.id in s[key])) return;
      const next = { ...s[key] };
      delete next[target.id];
      commit({ ...snapshot(s), [key]: next });
    },

    setBlockOrder: (ids) => {
      const s = get();
      commit({ ...snapshot(s), blockOrder: [...ids], baseBlockOrder: [...ids] });
    },

    swapBlocks: (a, b) => {
      const s = get();
      const i = s.blockOrder.indexOf(a);
      const j = s.blockOrder.indexOf(b);
      if (i < 0 || j < 0 || i === j) return;
      const order = [...s.blockOrder];
      order[i] = b;
      order[j] = a;
      commit({ ...snapshot(s), blockOrder: order });
    },

    loadLayout: (layout) => {
      commit(snapshot(layout));
    },

    advanceTime: (hours) => {
      set((s) => ({ settings: { ...s.settings, timeOfDay: (((s.settings.timeOfDay + hours) % 24) + 24) % 24 } }));
    },

    setTimeOfDay: (hours) => {
      set((s) => ({ settings: { ...s.settings, timeOfDay: ((hours % 24) + 24) % 24 } }));
    },

    setToggle: (key, value) => {
      set((s) => ({ toggles: { ...s.toggles, [key]: value } }));
    },

    undo: () => {
      const s = get();
      if (s.past.length === 0) return;
      const prev = s.past[s.past.length - 1];
      set({
        ...keepQuality(prev, s.settings.quality),
        past: s.past.slice(0, -1),
        future: [snapshot(s), ...s.future].slice(0, HISTORY_LIMIT),
      });
    },

    redo: () => {
      const s = get();
      if (s.future.length === 0) return;
      const [next, ...rest] = s.future;
      set({
        ...keepQuality(next, s.settings.quality),
        past: [...s.past, snapshot(s)].slice(-HISTORY_LIMIT),
        future: rest,
      });
    },

    resetBlocks: () => {
      const s = get();
      commit({
        ...snapshot(s),
        blockOrder: [...s.baseBlockOrder],
        blockOverrides: {},
      });
    },

    resetHouses: () => {
      const s = get();
      commit({ ...snapshot(s), houseOverrides: {} });
    },

    resetAll: () => {
      const s = get();
      commit({
        settings: { ...createDefaultSettings(s.settings.seed), quality: s.settings.quality },
        blockOrder: [...s.baseBlockOrder],
        baseBlockOrder: [...s.baseBlockOrder],
        blockOverrides: {},
        houseOverrides: {},
        treeOverrides: {},
      });
    },
  };
});
