// Shared leaf-system types and particle states: the leaf and leaf-devil records, and the public option types.

import type { Season } from '../core/types';

export const GROUND_Y = 0.05;

export interface LeafBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface LeafSettings {
  /** Fraction of MAX_LEAVES that may be live at once, 0-1 (UI slider value). */
  leafAmount: number;
  /** Size multiplier of each leaf, 1 = default. */
  leafSize: number;
  season: Season;
}

export interface LeafSystemOptions {
  bounds: LeafBounds;
  seed?: number;
}

export interface Point2 {
  x: number;
  z: number;
}

export type State = 0 | 1 | 2 | 3;
export const INACTIVE: State = 0;
export const FALLING: State = 1;
export const GROUND: State = 2;
export const CAPTURED: State = 3;

export interface Devil {
  x: number;
  z: number;
  vx: number;
  vz: number;
  age: number;
  life: number;
}

export interface Leaf {
  state: State;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rot: number;
  phase: number;
  /** Ground lifetime, or time left inside a devil. */
  timer: number;
  orbitAngle: number;
  orbitR: number;
  captor: Devil | null;
}
