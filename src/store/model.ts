// Store-side data model. Shared types come from src/core/types.ts.
// Local types below are minimal and may need reconciling with the city and
// building agents (RoofType, block ids, house/tree override shapes).
import type {
  BlockKind,
  HousePreset,
  HouseStyle,
  MonumentKind,
  Season,
  TreeSpecies,
  WorldSettings as CoreWorldSettings,
} from '../core/types';
import type { WeatherKind } from '../core/weatherKinds';
import type { QualityTier } from './quality';
import { buildings, uiCamera } from '../config/tuning';

/** Core settings plus the weather fields (saved to JSON, old files fall back to clear). */
export interface WorldSettings extends CoreWorldSettings {
  weather: WeatherKind;
  /** 0..1 strength of the chosen weather. */
  weatherIntensity: number;
  /** Rendering quality tier (saved to JSON; old files fall back to high). */
  quality: QualityTier;
}

/** LOCAL TYPE: roof shapes listed in BRD 2.4. Reconcile with buildings agent. */
export const ROOF_TYPES = [
  'mansard',
  'flat',
  'gable',
  'hip',
  'cornice',
  'parapet',
  'terrace',
  'low-tiled',
  'step-gable',
] as const;
export type RoofType = (typeof ROOF_TYPES)[number];

export const HOUSE_PRESETS: readonly HousePreset[] = buildings.housePresets;

export const MONUMENT_KINDS: readonly MonumentKind[] = buildings.monumentKinds;

export const TREE_SPECIES: readonly TreeSpecies[] = ['maple', 'oak', 'birch', 'ginkgo'];
export const SEASONS: readonly Season[] = ['spring', 'summer', 'autumn', 'winter'];
export const HOUSE_STYLES: readonly HouseStyle[] = ['classic', 'modern'];
export const BLOCK_KINDS: readonly BlockKind[] = ['houses', 'monument'];

/** Per-block override. Keyed by block id. */
export interface BlockOverride {
  kind?: BlockKind;
  monument?: MonumentKind;
}

/** Per-house override. Keyed by house id. Absent fields mean "as the block has it". */
export interface HouseOverride {
  preset?: HousePreset;
  floors?: number;
  roof?: RoofType;
  style?: HouseStyle;
  wallColor?: string;
  shutterColor?: string;
}

/** Per-tree override. Keyed by tree id. */
export interface TreeOverride {
  species?: TreeSpecies;
}

/** Everything that is saved to JSON. */
export interface LayoutData {
  settings: WorldSettings;
  /** Current order of block ids; drag-swap exchanges two entries. */
  blockOrder: string[];
  /** Order as last set by setBlockOrder; resetBlocks restores it. */
  baseBlockOrder: string[];
  blockOverrides: Record<string, BlockOverride>;
  houseOverrides: Record<string, HouseOverride>;
  treeOverrides: Record<string, TreeOverride>;
}

/** Transient UI toggles. Not saved. */
export interface UiToggles {
  tiltShift: boolean;
  moveBlocks: boolean;
  music: boolean;
  /** Freezes every simulation clock; the camera still moves. */
  paused: boolean;
  /** Time of day advances by itself: one in-app day lasts DAY_SECONDS real seconds. */
  autoTime: boolean;
}

/** Real seconds one in-app day lasts in auto time (24 minutes: one in-app hour per real minute). */
export const DAY_SECONDS = uiCamera.dayLengthS;

export const DEFAULT_SETTINGS: WorldSettings = {
  seed: uiCamera.defaultSeed,
  timeOfDay: uiCamera.defaultTimeOfDay,
  season: 'autumn',
  windSpeed: uiCamera.defaultWindSpeed,
  windDirection: uiCamera.defaultWindDirection,
  townWidth: uiCamera.defaultTownWidth,
  townDepth: uiCamera.defaultTownDepth,
  trafficMultiplier: uiCamera.defaultTrafficMultiplier,
  streetTreeMultiplier: uiCamera.defaultStreetTreeMultiplier,
  leafAmount: uiCamera.defaultLeafAmount,
  leafSize: uiCamera.defaultLeafSize,
  soundEnabled: true,
  blockMerges: [],
  weather: 'clear',
  weatherIntensity: uiCamera.defaultWeatherIntensity,
  quality: uiCamera.defaultQuality,
};

export function createDefaultSettings(seed: number = DEFAULT_SETTINGS.seed): WorldSettings {
  return { ...DEFAULT_SETTINGS, seed };
}

export function createEmptyLayout(seed: number = DEFAULT_SETTINGS.seed): LayoutData {
  return {
    settings: createDefaultSettings(seed),
    blockOrder: [],
    baseBlockOrder: [],
    blockOverrides: {},
    houseOverrides: {},
    treeOverrides: {},
  };
}

export const DEFAULT_TOGGLES: UiToggles = { tiltShift: false, moveBlocks: false, music: false, paused: false, autoTime: false };
