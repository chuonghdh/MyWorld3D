// Tuning constants and vehicle specs of the vehicle simulation.

import type { VehicleClass } from '../../audio';
import { VARIANT_FOOTPRINT } from '../collision';
import type { VehicleSpec } from './types';

export const VEHICLE_SPECS: Record<VehicleClass, VehicleSpec> = {
  car: { cruiseSpeed: 11, length: 4.5, accel: 2.5, weight: 0.55, gap: 6, speedVar: [0.85, 1.12] },
  bus: { cruiseSpeed: 8, length: 12, accel: 1.5, weight: 0.1, gap: 7, speedVar: [0.92, 1.05] },
  truck: { cruiseSpeed: 9, length: 9, accel: 1.8, weight: 0.1, gap: 7, speedVar: [0.9, 1.05] },
  motorbike: { cruiseSpeed: 13, length: 2.2, accel: 3.5, weight: 0.25, gap: 4, speedVar: [0.85, 1.15] },
};

/**
 * Paths are extended this far beyond their end junctions, so vehicles enter and leave at the map edge. Long enough
 * for the longest vehicle to stand fully before the first stop line.
 */
export const EDGE_EXTENSION = 28;

/** Vehicles outside the town bounds by more than this are simulated but not drawn, so they appear at the border. */
export const DRAW_MARGIN = 3;

/** What a vehicle does at a junction: straight 60 %, left 20 %, right 20 %. */
export const TURN_LEFT_CHANCE = 0.2;

export const TURN_RIGHT_CHANCE = 0.2;

/** A vehicle picks its manoeuvre this far before the junction centre, metres. */
export const DECIDE_DISTANCE = 40;

/**
 * Two vehicles jammed against each other at a junction: after this many seconds the one that entered the
 * junction later backs up a little (BACKUP_DIST, at BACK_SPEED); if the jam remains, the one that entered
 * first goes through regardless of overlap (GHOST_S seconds), so nothing stays stuck.
 */
export const HELD_BACKUP_S = 3;

export const BACKUP_DIST = 1.5;

export const BACK_SPEED = 1.5;

export const GHOST_S = 5;

/** Standing this long (seconds) for no good reason starts the same push-on. */
export const STUCK_PUSH_S = 40;

/**
 * Horn events for the audio layer (see takeHorns). They use their own random generator, so the main simulation
 * sequence is untouched. A vehicle honks when a pedestrian has held it on a green light for HORN_PED_HOLD_S, when it
 * is jammed (HELD_BACKUP_S, resolveJam), or rarely after a hard brake. Per vehicle cooldown and a global rate limit.
 */
export const HORN_PED_HOLD_S = 5;

/** A vehicle honks at most once per 45 s, and the whole city at most once per 6 s (horns are meant to be rare). */
export const HORN_COOLDOWN_S = 45;

export const HORN_GLOBAL_GAP_S = 6;

/** Only this share of the situations that could make a driver honk actually does. */
export const HORN_CHANCE = 0.5;

/** Smoothed deceleration (m/s^2) below which a braking vehicle counts as braking hard. */
export const HORN_HARD_BRAKE = -3;

/** Chance per second of honking while braking hard: about once per 15 min for a vehicle that brakes hard continuously. */
export const HORN_HARD_BRAKE_RATE = 1 / 900;

export const HORN_QUEUE_MAX = 8;

/**
 * Junction right of way: a vehicle may enter a junction only when it holds a grant, and grants go in the order
 * vehicles arrived (first come, first served) among vehicles whose ways through the junction cross or merge.
 */
export const REQUEST_RANGE = 25;

/** Ways through a junction closer than this (centre lines, metres) conflict. */
export const CONFLICT_DIST = 2.8;

/** A grant not used within this many steps is dropped (the vehicle was held up before the junction). */
export const GRANT_EXPIRY_STEPS = 300;

/** Vehicles slow down to this speed when they approach or cross a junction, m/s. */
export const JUNCTION_SPEED = 6;

/** A left turn waits while oncoming traffic moves within this distance of the junction centre, metres. */
export const ONCOMING_REACH = 32;

/** Speed through a turn, m/s. */
export const LEFT_TURN_SPEED = 5.5;

export const RIGHT_TURN_SPEED = 4.5;

/** Fallback stop line (no crosswalk found): this far before the light centre, along the path. */
export const STOP_BACK = 5;

/** A stopped vehicle's front bumper keeps this far before the crosswalk, metres. */
export const STOP_MARGIN = 0.5;

/** Crosswalks further than this before the light centre are not considered its own. */
export const CROSSWALK_REACH = 14;

/** A crosswalk belongs to a path only if its centre lies this close to the path laterally, metres. */
export const CROSSWALK_LATERAL = 4.5;

/** Clearance kept around a vehicle's footprint when checking its way ahead, metres. */
export const SIDE_MARGIN = 0.15;

export const END_MARGIN = 0.25;

/** Spacing of the points checked along a vehicle's way ahead, metres. */
export const SWEEP_STEP = 1;

/** Longest way ahead checked, metres. */
export const SWEEP_MAX = 40;

/** Comfortable braking deceleration, m/s^2. */
export const COMFORT_DECEL = 4;

/** Hardest braking used to stop at a light or behind a queue, m/s^2. Past this a vehicle goes through. */
export const MAX_DECEL = 7;

/** Below this speed a vehicle can always stop at its line, so it never commits through a light. */
export const COMMIT_MIN_SPEED = 1.5;

/** Vehicles per path at trafficMultiplier 1. The active cap is this times the path count times the multiplier. */
export const VEHICLES_PER_PATH = 2;

/** Seconds between spawn attempts at one spawn point, range at trafficMultiplier 1. */
export const SPAWN_MIN_S = 4;

export const SPAWN_MAX_S = 10;

/** Largest simulation step; longer frames are split so vehicles cannot skip a stop line. */
export const MAX_STEP = 1 / 30;

/** Corner fillet: longest cut back from a waypoint, metres, and samples per arc. */
export const FILLET_MAX = 7;

export const FILLET_STEPS = 8;

/** Heading follows the path tangent this far ahead (metres) and is low-passed with this gain (1/s). */
export const HEADING_LOOKAHEAD = 1.2;

export const HEADING_GAIN = 7;

export const MAX_YAW_RATE = 2.6;

export const CLASS_ORDER: VehicleClass[] = ['car', 'bus', 'truck', 'motorbike'];

/** Largest footprint of each class, for checking a spawn point before the variant is chosen. */
export const CLASS_FOOTPRINT: Record<VehicleClass, { length: number; width: number }> = {
  car: VARIANT_FOOTPRINT[5],
  bus: VARIANT_FOOTPRINT[6],
  truck: VARIANT_FOOTPRINT[7],
  motorbike: VARIANT_FOOTPRINT[8],
};
