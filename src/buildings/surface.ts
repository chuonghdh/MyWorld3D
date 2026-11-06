// Surface kinds for procedural wall and roof patterns (see docs/DESIGN-3D.md section 8).
//
// House geometry carries a per-vertex float attribute named `aSurface` holding one of these ids.
// The shared body material (materials.ts) turns the id into a pattern in the fragment shader:
// the vertex colour stays the base colour, the pattern adds mortar lines, tile rows, plank grain
// and per-element tone variation. Pieces with surface PLAIN (0), and geometry that has no
// `aSurface` attribute at all (monuments), render exactly as before.

export const SURFACE = {
  /** Flat colour, no pattern. Also the default for geometry without the attribute. */
  PLAIN: 0,
  /** Running-bond brick, 0.48375 x 0.14625 m (2.25x the original size) with 4 mm joints; a few bricks lighter, darker or slightly off-line. */
  BRICK: 1,
  /** Curved clay roof tiles in overlapping rows (~0.30 x 0.40 m), per-tile tone variation. */
  TILE_TERRACOTTA: 2,
  /** Rectangular slate or dark concrete roof tiles in staggered rows, thin dark gaps. */
  TILE_SLATE: 3,
  /** Horizontal timber boards (~0.14 m) with grain streaks and board-to-board shade changes. */
  TIMBER: 4,
  /** Rendered plaster: very fine noise and subtle stains. */
  STUCCO: 5,
  /** Cut stone: ashlar courses (~0.6 m high, blocks 0.5-1.2 m long) with fine joints. */
  STONE: 6,
  /** Raw concrete: shuttering-board marks, tie holes, faint weathering streaks. */
  CONCRETE: 7,
  /** Zinc roofing: vertical standing seams every 0.6 m with a soft sheen. */
  ZINC: 8,
  /** Ashlar stone, weathered: grime at the foot, faint rain streaks, lighter patches (cathedral walls). */
  STONE_AGED: 9,
  /** Slate roof, weathered: moss and lichen at the eaves and north side, streaks, faded upper slope (cathedral). */
  SLATE_AGED: 10,
  /** Zinc roof, weathered: same ageing as SLATE_AGED over the standing seams (cathedral). */
  ZINC_AGED: 11,
  /** Flat roof membrane: fine gravel, tar and bitumen patches, membrane seams every 3 m, faint drainage scuffs. */
  ROOF_FLAT: 12,
  /** Window trims, sills and lintels: patchy mould and stains, darker top faces where rain pools. */
  TRIM_AGED: 13,
} as const;

export type SurfaceId = (typeof SURFACE)[keyof typeof SURFACE];

/** Roof surfaces that take the house moss and lichen layer (shaders/surface.ts patRoofMoss). Cathedral ids are excluded. */
export const ROOF_MOSS_SURFACES: readonly number[] = [SURFACE.TILE_TERRACOTTA, SURFACE.TILE_SLATE, SURFACE.ZINC, SURFACE.ROOF_FLAT];

/** Wall surfaces that take the house weathering layer (shaders/surface.ts patWallWeather). Cathedral ids are excluded. */
export const WALL_WEATHER_SURFACES: readonly number[] = [
  SURFACE.BRICK,
  SURFACE.TIMBER,
  SURFACE.STUCCO,
  SURFACE.STONE,
  SURFACE.CONCRETE,
];

/**
 * Moss-eligible roof id with the house wall-head height packed into the fraction (wallTop / 100 m, at most 0.45),
 * so the shader knows where this house's eaves are. Other ids pass through unchanged. The shader floors the id,
 * so the integer surface is unaffected.
 */
export function roofSurfaceId(id: number, wallTop: number): number {
  if (!ROOF_MOSS_SURFACES.includes(id)) return id;
  return id + Math.min(0.45, Math.max(0, wallTop / 100));
}

/** Name of the per-vertex attribute carrying the surface id. */
export const SURFACE_ATTRIBUTE = 'aSurface';
