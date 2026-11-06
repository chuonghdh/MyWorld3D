// House parameters, presets, footprints and roof and deck colours (split from house.ts).

import type { Facades, GroundFloorUse, HousePreset, HouseStyle } from '../core/types';
import { col, shiftLightness, type Col } from './facade/mesh';
import { FALLBACK_PRESET, MAX_FLOORS, MIN_FLOORS, maxFloorsFor, computeLayout, isFlatRoof, resolvePreset } from './facade/layout';
import { HOUSE_SHUTTER_OPTIONS, ROOF_TYPES, SPECS, type FacadeKind, type RoofType } from './facade/presets';
import { pick, chance } from './facade/rng';
import type { HouseChimney } from './facade/parts';
import { ROOF_COLORS } from './palette';
import { buildings } from '../config/tuning';

/** Distance each non-facade side is pulled in from the lot line (m), so neighbouring walls never share a plane. */
export const PARTY_GAP = 0.025;

export type { RoofType, HouseChimney };
export { ROOF_TYPES, FALLBACK_PRESET, MIN_FLOORS, MAX_FLOORS, maxFloorsFor, resolvePreset };

export const HOUSE_PRESETS: readonly HousePreset[] = buildings.housePresets;

export interface HouseParams {
  preset: HousePreset;
  /** Number of storeys including the ground floor, 2 to 8. Values outside the range are clamped. */
  floors: number;
  roof: RoofType;
  style: HouseStyle;
  /** Wall colour as a hex string. */
  wallColor: string;
  /** Shutter colour as a hex string, or null for no shutters (classic style only). */
  shutterColor: string | null;
  /** Lot frontage along local x. Default: preset width. */
  width?: number;
  /** Lot depth along local z. Default: preset depth. */
  depth?: number;
  /** Which sides face a street. Default: front and back. */
  facades?: Facades;
  /** Ground floor use. Default: the preset's. */
  groundFloor?: GroundFloorUse;
  /** Detail variation. Default: 1. */
  seed?: number;
  /** Lot on an avenue: shopfronts may carry blade signs (corner lots always may). Default: false. */
  avenue?: boolean;
  /**
   * The back faces a large courtyard shared by a merged block (seen from far across the garden) instead of a
   * small private yard: the rear elevation gets near-front window rhythm, more balconies, back extensions and
   * washing lines. Default: false (unchanged output).
   */
  sharedCourtyard?: boolean;
}

/** Full, valid params for a preset: its default floors, roof, wall colour and shutters for the style. */
export function defaultHouseParams(preset: HousePreset, style: HouseStyle = 'classic'): HouseParams {
  const s = SPECS[resolvePreset(preset)];
  const modern = style === 'modern';
  return {
    preset,
    floors: s.defaultFloors,
    roof: modern ? s.modernRoof : s.defaultRoof,
    style,
    wallColor: modern ? s.modernWall : s.defaultWall,
    shutterColor: modern ? null : s.defaultShutter,
  };
}

/** Facade kinds that never carry shutters (curtain wall, ribbon windows, raw concrete). */
export const NO_SHUTTER_KINDS: readonly FacadeKind[] = ['tower', 'bauhaus', 'brutalist'];

/** True when the preset's facade can carry shutters (classic style; the modern style never has them). */
export function presetHasShutters(preset: HousePreset): boolean {
  return !NO_SHUTTER_KINDS.includes(SPECS[resolvePreset(preset)].kind);
}

/** The preset's typical shutter colour: its classic shutter, else its fill shutter, else the first house shutter option. */
export function presetDefaultShutter(preset: HousePreset): string {
  const s = SPECS[resolvePreset(preset)];
  return s.defaultShutter ?? s.fillShutter ?? HOUSE_SHUTTER_OPTIONS[0]!;
}

/** Default footprint in metres (x = width, z = depth) for a preset. */
export function houseFootprint(preset: HousePreset): { width: number; depth: number } {
  const s = SPECS[resolvePreset(preset)];
  return { width: s.width, depth: s.depth };
}

/** Total height of the house including its roof (ridge, mansard top or parapet; chimneys and rooftop clutter excluded). */
export function houseHeight(params: HouseParams): number {
  const lay = computeLayout(params);
  return lay.wallTop + lay.roofH;
}

export function roofColors(ctx: { roof: RoofType; spec: (typeof SPECS)[keyof typeof SPECS] }, rng: () => number): [Col, Col] {
  const j = (rng() - 0.5) * 0.06;
  switch (ctx.roof) {
    case 'mansard':
      return [shiftLightness(pick(rng, [ROOF_COLORS.slate, '#56606c', '#5b6470']), j), shiftLightness(ROOF_COLORS.zinc, 0.06 + j)];
    case 'low-tiled':
      return [shiftLightness(pick(rng, [ROOF_COLORS.terracotta, '#b8643f', '#a9553a']), j), col(ROOF_COLORS.terracotta)];
    case 'hip':
      return [
        shiftLightness(ctx.spec.kind === 'mediterranean' ? ROOF_COLORS.terracotta : ctx.spec.kind === 'haussmann' ? ROOF_COLORS.zinc : ctx.spec.roofColor, j),
        col(ROOF_COLORS.zinc),
      ];
    case 'gable':
    case 'step-gable': {
      const base = ctx.spec.kind === 'haussmann' ? ROOF_COLORS.slate : ctx.spec.roofColor;
      return [shiftLightness(chance(rng, 0.08) ? ROOF_COLORS.copper : base, j), col(ROOF_COLORS.zinc)];
    }
    default:
      return [shiftLightness(ctx.spec.roofColor, j), col(ROOF_COLORS.zinc)];
  }
}

/**
 * Deck colour (top of the walls and of flat roofs). Flat roofs get a small seeded lightness shift per house, from
 * a separate stream (so no other house changes). Other roofs keep the old colour.
 */
export function deckColor(roof: RoofType, kind: FacadeKind, rngTone: () => number): Col {
  const base = roof === 'terrace' ? (kind === 'mediterranean' ? '#c9a184' : '#a58a68') : '#8d8a84';
  if (!isFlatRoof(roof)) return col(base);
  return shiftLightness(base, (rngTone() * 2 - 1) * 0.04);
}
