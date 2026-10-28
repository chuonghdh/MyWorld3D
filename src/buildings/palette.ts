// Colour palettes for house facades (see docs/DESIGN-3D.md section 1, Palette).
// Pastel stone walls, brick, slate and zinc roofs, painted shutters and shopfronts.

export const WALL_COLORS = {
  cream: '#efe3c8',
  sand: '#e3cfa5',
  ochre: '#e2b66c',
  peach: '#efc3a0',
  rose: '#e8b4a8',
  terracotta: '#c9714f',
  sage: '#c9cfae',
  sky: '#b9cfdc',
  stone: '#c8c4bb',
  white: '#f3efe7',
} as const;

export type WallColorName = keyof typeof WALL_COLORS;
export const WALL_PALETTE: readonly string[] = Object.values(WALL_COLORS);

export const BRICK_COLORS = {
  red: '#9c4a36',
  brown: '#8a4b33',
  orange: '#a85a3e',
} as const;
export const BRICK_PALETTE: readonly string[] = Object.values(BRICK_COLORS);

export const SHUTTER_COLORS = {
  sage: '#5f7d63',
  blue: '#3f6e8f',
  oxblood: '#7a2e2a',
  cream: '#e9dcc0',
  grey: '#6c7378',
} as const;

export type ShutterColorName = keyof typeof SHUTTER_COLORS;
export const SHUTTER_PALETTE: readonly string[] = Object.values(SHUTTER_COLORS);

export const ROOF_COLORS = {
  zinc: '#6f7a86',
  slate: '#4f5762',
  terracotta: '#b5593a',
  darkTile: '#7a3f30',
  copper: '#7fa69a',
} as const;

/** Light stone used for cornices, sills, surrounds and string courses. */
export const TRIM_STONE = '#f4efe3';
/** Darker stone for bases and plinths. */
export const BASE_STONE = '#cbbfa8';
export const IRONWORK = '#22262a';
export const GLASS_DAY = '#2c3a48';

/** Awning stripe colours; each awning alternates white with one of these. */
export const AWNING_COLORS: readonly string[] = ['#2f6b4f', '#b03a2e', '#24395c', '#c08a2e'];
/** Painted shopfront and fascia colours. */
export const SHOPFRONT_COLORS: readonly string[] = ['#1f3b2f', '#5a1f1d', '#1d2a44', '#262626', '#6b4a1f', '#2e5560', '#7a2e2a'];
/** Front door colours (painted wood). */
export const DOOR_COLORS: readonly string[] = ['#3b2a1e', '#1f3b2f', '#5a1f1d', '#1d2a44', '#2a2a2a', '#6b4a2f'];
/** Curtain and blind tones seen through the glass. */
export const CURTAIN_COLORS: readonly string[] = ['#d9cdb5', '#c7b08a', '#e6dfd2', '#b88e7a', '#a8b5a0', '#9fb0c2'];
