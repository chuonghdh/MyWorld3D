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
  /** Running-bond brick, 0.215 x 0.065 m with 10 mm joints; a few bricks lighter, darker or slightly off-line. */
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
} as const;

export type SurfaceId = (typeof SURFACE)[keyof typeof SURFACE];

/** Name of the per-vertex attribute carrying the surface id. */
export const SURFACE_ATTRIBUTE = 'aSurface';
