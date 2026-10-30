// Plain-data city layout types. No React, no Three.js.
// Coordinates: the town is centred on the origin. X runs east-west, Z runs north-south.
// Angles (facing) are radians in the XZ plane: facing = atan2(dirX, dirZ), so 0 faces +Z.

import type { BlockKind, Facades, GroundFloorUse, StreetClass, TreeSpecies, Vec2 } from '../core/types';

// v2 (graphics upgrade, see docs/DESIGN-3D.md): fields marked v2 were added for the
// perimeter-block city, the streetscape and the facade builder.

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** A rectangular area holding either houses or one monument. */
export interface Block {
  id: string;
  kind: BlockKind;
  bounds: Rect;
  /** v2: open interior of a perimeter block, or null when the block has none (monuments, small blocks). */
  courtyard: Rect | null;
}

/** A building plot inside a block. Its front faces the street. */
export interface Lot {
  id: string;
  blockId: string;
  position: Vec2;
  facing: number;
  width: number;
  depth: number;
  /** v2: sides facing a street. Corner lots have front plus left or right. */
  facades: Facades;
  /** v2: true for the lot on a block corner. */
  corner: boolean;
  /** v2: ground floor use, shops on avenues and corners. */
  groundFloor: GroundFloorUse;
  /** v2: suggested storeys (2-8) from the street hierarchy. */
  floors: number;
  /** v2: deterministic per-lot seed for facade variation. */
  seed: number;
}

/** A straight road running along X ('horizontal') or Z ('vertical'). */
export interface RoadSegment {
  id: string;
  orientation: 'horizontal' | 'vertical';
  start: Vec2;
  end: Vec2;
  width: number;
  /** Total lanes; one per direction in phase 1. */
  lanes: number;
  /** v2: avenue or side street. width is curb to curb. */
  streetClass: StreetClass;
  /** v2: sidewalk width on each side, in metres. */
  sidewalkWidth: number;
}

export interface StreetTree {
  id: string;
  position: Vec2;
  species: TreeSpecies;
  /** Multiplier around 1.0 applied to the tree model. */
  scale: number;
  /** v2: where the tree stands. */
  setting: 'street' | 'courtyard' | 'plaza';
}

/** v2: a street lamp on a sidewalk. facing points from the pole toward the road. */
export interface StreetLamp {
  id: string;
  position: Vec2;
  facing: number;
}

/** v2: a bench on a sidewalk or plaza. facing is the direction a sitter looks. */
export interface Bench {
  id: string;
  position: Vec2;
  facing: number;
}

/** v2: zebra crossing. orientation is the direction pedestrians walk across the road. */
export interface Crosswalk {
  id: string;
  center: Vec2;
  orientation: 'horizontal' | 'vertical';
  /** Distance across the road, curb to curb. */
  length: number;
  /** Width of the striped band. */
  width: number;
}

/** v2: square junction area where two roads cross; drawn without lane markings. */
export interface Intersection {
  id: string;
  center: Vec2;
  /** Extent along x and z, curb to curb. */
  sizeX: number;
  sizeZ: number;
}

export interface TrafficLightTiming {
  cycleSeconds: number;
  /** Green time for the north-south axis (vertical roads). */
  nsGreenSeconds: number;
  /** Green time for the east-west axis (horizontal roads). */
  ewGreenSeconds: number;
  yellowSeconds: number;
  /**
   * All-red gap after each yellow, before the other axis turns green, so vehicles that entered on yellow can
   * clear the intersection. Optional: absent means none. cycleSeconds = 2 * (green + yellow + allRed) then.
   */
  allRedSeconds?: number;
}

/** Fixed-timing signal at a road intersection. */
export interface TrafficLight {
  id: string;
  position: Vec2;
  timing: TrafficLightTiming;
}

/** One directed lane path along a road, from one end to the other. */
export interface TrafficPath {
  id: string;
  roadId: string;
  /** +1 travels toward increasing coordinate (+Z for vertical, +X for horizontal), -1 the opposite. */
  direction: 1 | -1;
  /** Lane index on the road; phase 1 uses one lane per direction, so 0 or 1. */
  lane: number;
  /** Polyline the vehicle follows, all inside town bounds. */
  waypoints: Vec2[];
  /** Points along the path where vehicles can be spawned. */
  spawnPoints: Vec2[];
  /** Ids of traffic lights this path passes through, in order. */
  trafficLightIds: string[];
}

/** A merged house block: its member block ids (see city/merge.ts) and the union of their bounds. Phase 1. */
export interface BlockMerge {
  id: string;
  members: string[];
  bounds: Rect;
}

export interface CityLayout {
  seed: number;
  /** Town extent, centred on origin. */
  townBounds: Rect;
  blocks: Block[];
  lots: Lot[];
  roads: RoadSegment[];
  streetTrees: StreetTree[];
  trafficLights: TrafficLight[];
  trafficPaths: TrafficPath[];
  /** v2 street furniture and markings. */
  lamps: StreetLamp[];
  benches: Bench[];
  crosswalks: Crosswalk[];
  intersections: Intersection[];
  /** Block merges in force, only present when there is at least one. */
  merges?: BlockMerge[];
}
