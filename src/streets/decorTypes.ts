// Street decor tunables and plan types (no Three.js, no logic). Knob-like values are exported for the planners.

// ---- Tunables ------------------------------------------------------------------------------------

/** Pedestrians walk along the sidewalk centre; solid furniture keeps this far from that line. */
export const WALK_CLEARANCE = 0.55;
/** Gap kept between a solid item and any obstacle (lamp, tree, bench, bin, other item). */
export const OBSTACLE_GAP = 0.15;
/** Extra distance past the crossing roads' sidewalks before solids start. */
export const SOLID_EDGE = 1.0;
/** Road decals stay this far (beyond the crossing roads' sidewalk) from junctions and crossings. */
export const DECAL_EDGE = 1.4;
export const ROAD_CELL = 20;
export const TACTILE_BARS = 3;
/** Clear space the fountain plaza keeps beyond its paved radius, from courtyard greenery. */
export const GREENERY_CLEARANCE = 0.3;

/** Chance per side-segment of each family at seed-independent settings. */
export const DECOR_RATES = { busStop: 0.5, kiosk: 0.42, rackAvenue: 0.65, rackStreet: 0.3 } as const;

// Footprints (half extents in the item's local frame: x along the road, z toward the road).
export const BUS_STOP_HALF = { hx: 1.7, hz: 0.75 };
export const KIOSK_HALF = { hx: 0.85, hz: 0.65 };
export const BIKE_RACK_HALF = { hx: 1.3, hz: 0.35 };
export const BUS_SIGN_HALF = { hx: 0.2, hz: 0.2 };

// ---- Types ---------------------------------------------------------------------------------------

export type SolidKind = 'busStop' | 'busSign' | 'kiosk' | 'bikeRack';

/** An oriented rectangle on the ground. Local +z faces the road; yaw uses the layout convention. */
export interface DecorSolid {
  id: string;
  kind: SolidKind;
  x: number;
  z: number;
  yaw: number;
  hx: number;
  hz: number;
  roadId: string;
  side: 1 | -1;
}

export interface Manhole { x: number; z: number; roadId: string }

export type PatchKind = 'dark' | 'light' | 'wear' | 'crack';
/** Axis-aligned road decal. */
export interface RoadPatch { kind: PatchKind; minX: number; maxX: number; minZ: number; maxZ: number; roadId: string }

/**
 * Rounded kerb corner of an intersection: (x, z) is the carriageway corner; (sx, sz) point into the sidewalk.
 * The geometry itself is built into the sidewalk surfaces (surfaces.ts); the plan keeps the list so the tactile
 * bars can be kept off the open corner.
 */
export interface KerbCorner { x: number; z: number; sx: 1 | -1; sz: 1 | -1; r: number }

/** One ground-level triangle of the courtyard greenery (hedges, beds, bushes), as XZ corners. */
export interface GreeneryTriangle { x: readonly [number, number, number]; z: readonly [number, number, number] }

/** One tactile bar: an axis-aligned rectangle at a crosswalk end. */
export interface TactileBar { minX: number; maxX: number; minZ: number; maxZ: number }

export interface Pigeon { x: number; z: number; yaw: number; tint: number }

export interface FountainPlan {
  x: number;
  z: number;
  /** Basin outer radius. */
  basinRadius: number;
  /** Paved plaza radius around it. */
  plazaRadius: number;
  benches: { x: number; z: number; facing: number }[];
  pigeons: Pigeon[];
}

export interface DecorPlan {
  solids: DecorSolid[];
  manholes: Manhole[];
  patches: RoadPatch[];
  kerbCorners: KerbCorner[];
  tactile: TactileBar[];
  fountain: FountainPlan | null;
}
