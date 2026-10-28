// Shared data types for MyWorld3D.
// Owned by the scaffold agent. Other agents may add fields but must not rename existing ones.

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export type TreeSpecies = 'maple' | 'oak' | 'birch' | 'ginkgo';

export type HouseStyle = 'classic' | 'modern';

export type HousePreset =
  | 'as-block'
  | 'original-feuilles'
  | 'canal-amsterdam'
  | 'glass-tower'
  | 'brutalist-concrete'
  | 'bauhaus'
  | 'mediterranean'
  | 'brownstone-ny'
  | 'nordic-timber'
  | 'shophouse-asia';

export type MonumentKind =
  | 'hospital'
  | 'stadium'
  | 'funfair'
  | 'swimming-pool'
  | 'dinosaur-park'
  | 'supermarket'
  | 'open-air-theatre'
  | 'circus'
  | 'fire-station'
  | 'gothic-cathedral';

export type BlockKind = 'houses' | 'monument';

/** Which sides of a building face a street and get a full facade. Front is local +z. */
export interface Facades {
  front: boolean;
  back: boolean;
  /** Local -x. */
  left: boolean;
  /** Local +x. */
  right: boolean;
}

export type GroundFloorUse = 'shop' | 'cafe' | 'residential';

export type StreetClass = 'avenue' | 'street';

export interface Vec2 {
  x: number;
  z: number;
}

export interface WorldSettings {
  seed: number;
  /** Time of day in hours, 0-24. */
  timeOfDay: number;
  season: Season;
  /** Wind speed in m/s. */
  windSpeed: number;
  /** Wind direction in degrees, 0 = north, clockwise. */
  windDirection: number;
  townWidth: number;
  townDepth: number;
  trafficMultiplier: number;
  streetTreeMultiplier: number;
  leafAmount: number;
  leafSize: number;
  soundEnabled: boolean;
}
