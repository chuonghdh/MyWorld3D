// Public API for the buildings module.

export {
  buildHouse,
  defaultHouseParams,
  houseFootprint,
  houseHeight,
  resolvePreset,
  FALLBACK_PRESET,
  HOUSE_PRESETS,
  ROOF_TYPES,
  MIN_FLOORS,
  MAX_FLOORS,
} from './house';
export type { HouseParams, RoofType, HouseChimney } from './house';

export { buildMonument, MONUMENT_KINDS } from './monument';

export {
  WALL_COLORS,
  WALL_PALETTE,
  SHUTTER_COLORS,
  SHUTTER_PALETTE,
  BRICK_COLORS,
  BRICK_PALETTE,
  ROOF_COLORS,
  AWNING_COLORS,
  SHOPFRONT_COLORS,
} from './palette';
export type { WallColorName, ShutterColorName } from './palette';
