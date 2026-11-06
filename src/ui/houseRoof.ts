// Roof shown and set by the house panel, resolved exactly like the scene (scene/townBlocks.ts houseParamsFor):
// an explicit roof override wins; otherwise a preset or style override renders the preset default roof for
// override.style ?? 'classic'; with neither the block's own roof (base) shows.
import { defaultHouseParams, presetDefaultShutter, presetHasShutters } from '../buildings';
import type { HouseOverride, RoofType } from '../store/model';
import type { HousePreset } from '../core/types';

/** Default roof of a preset as the scene renders it for this override's style. */
export function presetDefaultRoof(preset: HousePreset, override: HouseOverride | undefined): RoofType {
  return defaultHouseParams(preset, override?.style ?? 'classic').roof as RoofType;
}

/** Roof the panel shows: the same value the scene renders. */
export function shownHouseRoof(override: HouseOverride | undefined, base: { preset: HousePreset; roof: RoofType }): RoofType {
  if (override?.roof) return override.roof;
  const preset = override?.preset && override.preset !== 'as-block' ? override.preset : base.preset;
  if (override?.preset !== undefined || override?.style !== undefined) return presetDefaultRoof(preset, override);
  return base.roof;
}

/** Override patch for picking a house type: the type's default roof replaces the current roof. Floors untouched. */
export function typePickPatch(preset: HousePreset, override: HouseOverride | undefined): HouseOverride {
  return { preset, roof: presetDefaultRoof(preset, override) };
}

/**
 * Shutter row of the panel, mirroring scene houseParamsFor: hidden when the type cannot carry shutters;
 * otherwise the rendered colour (override, then the block's own, then the type default for a picked type),
 * or null when the house renders without shutters (untouched house on a block without them: no swatch selected).
 */
export function shownShutter(
  override: HouseOverride | undefined,
  baseShutter: string | null | undefined,
  preset: HousePreset,
): { show: boolean; value: string | null } {
  if (!presetHasShutters(preset)) return { show: false, value: null };
  const picked = override?.preset !== undefined && override.preset !== 'as-block';
  const value = override?.shutterColor ?? baseShutter ?? (picked ? presetDefaultShutter(preset) : null);
  return { show: true, value };
}
