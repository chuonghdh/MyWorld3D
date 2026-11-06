import { create } from 'zustand';
import { parseMergedBlockId } from '../core/blockIds';
import { remapBlockOrder, withMergeGroup, withoutMergeGroup } from './merges';
import {
  DEFAULT_TOGGLES,
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
  toggles: UiToggles;
  /** Device-based tier suggestion. Transient: never applied automatically, not saved. */
  suggestedQuality: QualitySuggestion | null;

  setSuggestedQuality: (s: QualitySuggestion | null) => void;
  setQuality: (tier: QualityTier) => void;
  setSetting: <K extends keyof WorldSettings>(key: K, value: WorldSettings[K]) => void;
  setOverride: (target: OverrideTarget, patch: OverridePatch) => void;
  clearOverride: (target: OverrideTarget) => void;
  setBlockOrder: (ids: string[]) => void;
  swapBlocks: (a: string, b: string) => void;
  /** Merges the house blocks of `group` (all member ids, absorbing any merge it grows from). */
  mergeBlockGroup: (group: string[], idsFor: BlockIdsFor) => void;
  /** Splits a merged block back into its member blocks. */
  splitMergedBlock: (mergedId: string, idsFor: BlockIdsFor) => void;
  /** Tap mode from the camera height (see BLOCK_EDIT_HEIGHT_M). Transient, not saved. */
  editMode: EditMode;
  setEditMode: (mode: EditMode) => void;
  /** The selected house, block or tree (camera orbit pivot follows it). Transient, not saved. */
  selected: OverrideTarget | null;
  setSelected: (target: OverrideTarget | null) => void;
  loadLayout: (layout: LayoutData) => void;
  setToggle: (key: keyof UiToggles, value: boolean) => void;
  /** Moves the time of day forward (wraps at 24). */
  advanceTime: (hours: number) => void;
  /** Sets the time of day (hours, wraps at 24). Used by camera presets. */
  setTimeOfDay: (hours: number) => void;
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

function sameLayout(a: LayoutData, b: LayoutData): boolean {
  return LAYOUT_KEYS.every((k) => JSON.stringify(a[k]) === JSON.stringify(b[k]));
}

/** 'house': a tap selects a house (camera low). 'block': a tap selects a whole block (camera high). */
export type EditMode = 'house' | 'block';

function mergeShape(id: string): string {
  const m = parseMergedBlockId(id);
  return m ? `${m.c1 - m.c0}x${m.r1 - m.r0}` : '';
}

function sameMergeShape(a: string, b: string): boolean {
  return mergeShape(a) === mergeShape(b);
}

/**
 * Block ids of the city generated for a list of merges. The city generator lives above the store, so the caller
 * (UI) supplies it; the store only uses the result to keep the block order in step with the new layout.
 */
export type BlockIdsFor = (blockMerges: string[][]) => string[];

/** Layout data with new settings whose block ids changed: the block order follows the regenerated layout. */
function withLayoutIds(s: LayoutData, settings: WorldSettings, idsFor: BlockIdsFor): LayoutData {
  const fresh = idsFor(settings.blockMerges ?? []);
  const order = s.baseBlockOrder.length > 0 ? remapBlockOrder(s.blockOrder, s.baseBlockOrder, fresh) : [...fresh];
  return { ...snapshot(s), settings, blockOrder: order, baseBlockOrder: [...fresh] };
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
  /** Apply `next` to the layout. No-op if nothing changed. */
  const commit = (next: LayoutData) => {
    if (sameLayout(snapshot(get()), next)) return;
    set(next);
  };

  return {
    ...initialLayout,
    toggles: { ...DEFAULT_TOGGLES },
    suggestedQuality: null,
    editMode: 'block',
    selected: null,

    setEditMode: (mode) => set((s) => (s.editMode === mode ? s : { editMode: mode })),
    setSelected: (target) => set({ selected: target }),
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

    mergeBlockGroup: (group, idsFor) => {
      const s = get();
      const blockMerges = withMergeGroup(s.settings.blockMerges ?? [], group);
      commit(withLayoutIds(s, { ...s.settings, blockMerges }, idsFor));
    },

    splitMergedBlock: (mergedId, idsFor) => {
      const s = get();
      const before = s.settings.blockMerges ?? [];
      const blockMerges = withoutMergeGroup(before, mergedId);
      if (blockMerges.length === before.length) return;
      commit(withLayoutIds(s, { ...s.settings, blockMerges }, idsFor));
    },

    swapBlocks: (a, b) => {
      const s = get();
      // A merged block only swaps with a merged block of the same cell size (other sizes would not fit the slot).
      if (!sameMergeShape(a, b)) return;
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
