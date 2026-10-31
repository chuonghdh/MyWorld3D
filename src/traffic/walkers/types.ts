// Public render and option types of the pedestrian simulation, and the walking graph types.

import type { Vec2 } from '../../core/types';
import type { TrafficLightController } from '../lights';

export interface DogRender {
  /** Ground position (x, z) of the dog. */
  position: Vec2;
  /** Radians, atan2(dirX, dirZ) convention. */
  heading: number;
  /** Trot phase offset in radians (shader adds time). */
  phase: number;
  /** Ground speed in m/s; 0 when the dog stands still (legs stop, tail keeps wagging). */
  speed: number;
  /** Coat colour index (the mesh takes it modulo its coat palette size). */
  coat: number;
  /** World position (x, z) of the hand that holds the leash. The mesh adds the heights. */
  leashHand: Vec2;
}

export interface PedestrianRender {
  /** Stable id of the walker slot. */
  id: number;
  /** Ground position (x, z) in metres. */
  position: Vec2;
  /** Ground height in metres: 0.15 on a sidewalk, 0 on asphalt (ramps at the curb). */
  y: number;
  /** Radians, atan2(dirX, dirZ) convention (0 faces +Z). */
  heading: number;
  /** Present when this walker is walking a dog. */
  dog: DogRender | null;
  /** BODY_ADULT, BODY_CHILD, BODY_ELDER or BODY_TEEN. */
  body: number;
  /** 1 for a woman or girl, 0 for a man or boy (sets the body shape and hair choice). */
  female: number;
  /** Hair style 0..HAIR_STYLE_COUNT-1. */
  hairStyle: number;
  /** Clothing and skin palette indices; the mesh takes them modulo its palette sizes. */
  top: number;
  pants: number;
  hair: number;
  skin: number;
  accent: number;
  /** TRAIT_* bit flags. */
  traits: number;
  /** POSE_WALK, POSE_STAND, POSE_CHAT or POSE_SIT. */
  pose: number;
  /** Ground speed in m/s (0 when not moving); drives the walk-cycle frequency. */
  speed: number;
  /** Walk-cycle phase offset in radians, so the crowd does not step in unison. */
  phase: number;
  /** Stable value in 0..1. The mesh opens an umbrella when ctx.rain is above a threshold built from it. */
  umbrellaRank: number;
  /** Body size jitter around 1 (0.94 to 1.06). */
  scale: number;
}

export interface PedestriansOptions {
  trafficMultiplier: number;
  seed?: number;
  /** Signal clock to obey. Pass VehicleSystem.lights so walkers and cars agree. Falls back to an internal clock. */
  lights?: TrafficLightController;
  /** Initial time of day in hours (default 12), sets the initial crowd density. */
  timeOfDay?: number;
}

/** Optional per-frame environment for update(). */
export interface PedestrianEnv {
  /** Hours 0..24. */
  timeOfDay: number;
  /** 0..1 rain intensity: walkers hurry, stop sitting, duck into doors more often. */
  rain?: number;
}

export interface PedestrianStats {
  /** Completed crossings, chats started, bench visits, window looks, door entries, curb waits started. */
  crossings: number;
  chats: number;
  sits: number;
  looks: number;
  doors: number;
  waits: number;
}

// --- Constants -----------------------------------------------------------------------------------------

export interface Graph {
  nodeCount: number;
  nodeStart: Int32Array;
  nodeEdges: Int32Array;
  edgeCount: number;
  ax: Float32Array;
  az: Float32Array;
  bx: Float32Array;
  bz: Float32Array;
  len: Float32Array;
  dx: Float32Array;
  dz: Float32Array;
  inx: Float32Array;
  inz: Float32Array;
  nodeA: Int32Array;
  nodeB: Int32Array;
  cross: Uint8Array;
  build: Uint8Array;
  weight: Float32Array;
  curb: Float32Array;
  ctl: Uint8Array;
  axis: Uint8Array;
  cycle: Float32Array;
  nsG: Float32Array;
  ewG: Float32Array;
  allR: Float32Array;
  yel: Float32Array;
  spawnCum: Float32Array;
  spawnTotal: number;
}

export interface RoadRects {
  minX: Float32Array;
  maxX: Float32Array;
  minZ: Float32Array;
  maxZ: Float32Array;
  count: number;
}
