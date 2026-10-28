// JSON save / load for the city layout. importLayout never throws on bad input.
import {
  BLOCK_KINDS,
  DEFAULT_SETTINGS,
  HOUSE_PRESETS,
  HOUSE_STYLES,
  MONUMENT_KINDS,
  ROOF_TYPES,
  SEASONS,
  TREE_SPECIES,
  type BlockOverride,
  type HouseOverride,
  type LayoutData,
  type TreeOverride,
  type WorldSettings,
} from './model';
import { WEATHER_KINDS } from '../weather/weatherState';
import { QUALITY_TIERS } from './quality';

export const LAYOUT_VERSION = 1;

export type ImportResult =
  | { ok: true; layout: LayoutData }
  | { ok: false; error: string };

/** Serialises the layout (or a superset of it, such as the full store state). */
export function exportLayout(state: LayoutData): string {
  const data = {
    version: LAYOUT_VERSION,
    settings: state.settings,
    blockOrder: state.blockOrder,
    baseBlockOrder: state.baseBlockOrder,
    blockOverrides: state.blockOverrides,
    houseOverrides: state.houseOverrides,
    treeOverrides: state.treeOverrides,
  };
  return JSON.stringify(data, null, 2);
}

class ValidationError extends Error {}

function fail(msg: string): never {
  throw new ValidationError(msg);
}

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function expectObj(v: unknown, name: string): Obj {
  if (!isObj(v)) fail(`${name} must be an object`);
  return v;
}

function expectNumber(v: unknown, name: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(`${name} must be a finite number`);
  return v;
}

function expectBoolean(v: unknown, name: string): boolean {
  if (typeof v !== 'boolean') fail(`${name} must be a boolean`);
  return v;
}

function expectString(v: unknown, name: string): string {
  if (typeof v !== 'string') fail(`${name} must be a string`);
  return v;
}

function expectOneOf<T extends string>(v: unknown, options: readonly T[], name: string): T {
  if (typeof v !== 'string' || !(options as readonly string[]).includes(v)) {
    fail(`${name} must be one of: ${options.join(', ')}`);
  }
  return v as T;
}

function expectStringArray(v: unknown, name: string): string[] {
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) {
    fail(`${name} must be an array of strings`);
  }
  return v as string[];
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function parseSettings(v: unknown): WorldSettings {
  const o = expectObj(v, 'settings');
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof WorldSettings)[]) {
    const raw = o[key];
    // Weather arrived later than version 1 files: old files fall back to the defaults.
    if (raw === undefined && (key === 'weather' || key === 'weatherIntensity' || key === 'quality')) {
      out[key] = DEFAULT_SETTINGS[key];
      continue;
    }
    if (raw === undefined) fail(`settings.${key} is missing`);
    switch (key) {
      case 'season':
        out[key] = expectOneOf(raw, SEASONS, 'settings.season');
        break;
      case 'weather':
        // Older saves used 'drizzle', which was replaced by 'cloudy'.
        out[key] = expectOneOf(raw === 'drizzle' ? 'cloudy' : raw, WEATHER_KINDS, 'settings.weather');
        break;
      case 'quality':
        out[key] = expectOneOf(raw, QUALITY_TIERS, 'settings.quality');
        break;
      case 'weatherIntensity':
        out[key] = Math.min(1, Math.max(0, expectNumber(raw, 'settings.weatherIntensity')));
        break;
      case 'soundEnabled':
        out[key] = expectBoolean(raw, 'settings.soundEnabled');
        break;
      default:
        out[key] = expectNumber(raw, `settings.${key}`);
    }
  }
  return out as unknown as WorldSettings;
}

function parseBlockOverrides(v: unknown): Record<string, BlockOverride> {
  const out: Record<string, BlockOverride> = {};
  for (const [id, raw] of Object.entries(expectObj(v, 'blockOverrides'))) {
    const o = expectObj(raw, `blockOverrides.${id}`);
    const res: BlockOverride = {};
    if (o.kind !== undefined) res.kind = expectOneOf(o.kind, BLOCK_KINDS, `blockOverrides.${id}.kind`);
    if (o.monument !== undefined) {
      res.monument = expectOneOf(o.monument, MONUMENT_KINDS, `blockOverrides.${id}.monument`);
    }
    out[id] = res;
  }
  return out;
}

function parseHouseOverrides(v: unknown): Record<string, HouseOverride> {
  const out: Record<string, HouseOverride> = {};
  for (const [id, raw] of Object.entries(expectObj(v, 'houseOverrides'))) {
    const o = expectObj(raw, `houseOverrides.${id}`);
    const res: HouseOverride = {};
    const p = `houseOverrides.${id}`;
    if (o.preset !== undefined) res.preset = expectOneOf(o.preset, HOUSE_PRESETS, `${p}.preset`);
    if (o.floors !== undefined) {
      const f = expectNumber(o.floors, `${p}.floors`);
      if (!Number.isInteger(f) || f < 2 || f > 8) fail(`${p}.floors must be an integer 2-8`);
      res.floors = f;
    }
    if (o.roof !== undefined) res.roof = expectOneOf(o.roof, ROOF_TYPES, `${p}.roof`);
    if (o.style !== undefined) res.style = expectOneOf(o.style, HOUSE_STYLES, `${p}.style`);
    if (o.wallColor !== undefined) {
      const c = expectString(o.wallColor, `${p}.wallColor`);
      if (!HEX_COLOR.test(c)) fail(`${p}.wallColor must be a #rrggbb color`);
      res.wallColor = c;
    }
    if (o.shutterColor !== undefined) {
      const c = expectString(o.shutterColor, `${p}.shutterColor`);
      if (!HEX_COLOR.test(c)) fail(`${p}.shutterColor must be a #rrggbb color`);
      res.shutterColor = c;
    }
    out[id] = res;
  }
  return out;
}

function parseTreeOverrides(v: unknown): Record<string, TreeOverride> {
  const out: Record<string, TreeOverride> = {};
  for (const [id, raw] of Object.entries(expectObj(v, 'treeOverrides'))) {
    const o = expectObj(raw, `treeOverrides.${id}`);
    const res: TreeOverride = {};
    if (o.species !== undefined) {
      res.species = expectOneOf(o.species, TREE_SPECIES, `treeOverrides.${id}.species`);
    }
    out[id] = res;
  }
  return out;
}

/**
 * Parses and validates a layout JSON string.
 * Returns { ok: false, error } for invalid JSON, wrong shape, or an unknown version.
 */
export function importLayout(json: string): ImportResult {
  if (typeof json !== 'string') return { ok: false, error: 'Input must be a JSON string' };
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, error: 'Invalid JSON' };
  }
  try {
    const o = expectObj(raw, 'layout');
    if (o.version !== LAYOUT_VERSION) {
      return {
        ok: false,
        error: `Unsupported layout version: ${String(o.version)} (expected ${LAYOUT_VERSION})`,
      };
    }
    const blockOrder = expectStringArray(o.blockOrder, 'blockOrder');
    const baseBlockOrder =
      o.baseBlockOrder === undefined ? [...blockOrder] : expectStringArray(o.baseBlockOrder, 'baseBlockOrder');
    const layout: LayoutData = {
      settings: parseSettings(o.settings),
      blockOrder,
      baseBlockOrder,
      blockOverrides: parseBlockOverrides(o.blockOverrides ?? {}),
      houseOverrides: parseHouseOverrides(o.houseOverrides ?? {}),
      treeOverrides: parseTreeOverrides(o.treeOverrides ?? {}),
    };
    return { ok: true, layout };
  } catch (err) {
    if (err instanceof ValidationError) return { ok: false, error: err.message };
    return { ok: false, error: 'Unexpected error while reading layout' };
  }
}
