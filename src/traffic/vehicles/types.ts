// Shared types of the vehicle simulation (path models, vehicles, render records).

import type { TrafficPath } from '../../city/layout';
import type { Vec2 } from '../../core/types';
import type { VehicleClass } from '../../audio';
import { TrafficLightController, LightAxis } from '../lights';

/**
 * One vehicle as the mesh layer needs it. The array returned by getVehicles() and the objects in it are
 * reused between calls: read them in the same frame, do not keep references.
 */
export interface VehicleRender {
  id: number;
  position: Vec2;
  /** Radians, same convention as the layout: atan2(dirX, dirZ), 0 faces +Z. Smoothed along corners. */
  heading: number;
  cls: VehicleClass;
  /** Model index 0-8 (see vehicles/variants.ts): hatchback, sedan, suv, microvan, taxi, delivery van, bus, truck, scooter. */
  variant: number;
  /** Current speed in m/s. */
  speed: number;
  /** Smoothed longitudinal acceleration in m/s^2 (negative when slowing); drives body pitch. */
  accel: number;
  /** True while braking or held at a stop line or behind a leader: lights the brake lamps. */
  braking: boolean;
  /** Turn indicator: +1 turning left (heading increasing), -1 right, 0 none. */
  indicator: -1 | 0 | 1;
  /** Heading change rate in rad/s (smoothed); drives body roll. */
  yawRate: number;
  /** Distance driven in metres since spawn; the wheels spin by this divided by their radius. */
  wheelPhase: number;
  /** Random 0..1 per vehicle; the mesh layer picks the paint colour from it. */
  tint: number;
}

export interface VehicleSpec {
  cruiseSpeed: number; // m/s
  length: number; // metres along the path
  accel: number; // m/s^2
  weight: number; // spawn share
  /** Bumper-to-bumper gap kept behind the vehicle ahead, metres. */
  gap: number;
  /** Per-vehicle cruise speed factor range [min, max]. */
  speedVar: [number, number];
}

export interface VehicleSystemOptions {
  trafficMultiplier: number;
  seed?: number;
  /** Pass a shared controller, otherwise one is built from layout.trafficLights. */
  lights?: TrafficLightController;
  /** Metres the paths extend beyond their end junctions (vehicles spawn at the far end). Default 10. */
  edgeExtension?: number;
}

export interface StopLine {
  /** Arc length where the FRONT bumper of a waiting vehicle stops: just before the crosswalk. */
  s: number;
  /** Once a vehicle's front is beyond this arc length it has reached the crosswalk and no longer stops. */
  passS: number;
  lightId: string;
  /** Index into the crosswalk rectangles whose pedestrians hold vehicles back, or -1. */
  cw: number;
  /** Index of the junction this line guards, or -1. */
  junction: number;
  /** Arc length where the junction's far crosswalk ends: a vehicle entering must have room up to here. */
  exitS: number;
}

export interface Corner {
  /** Arc length at the middle of the turn. */
  s: number;
  /** Turn angle in radians (0..pi). */
  angle: number;
}

/** A way through a junction that turns onto the crossing road: a short curved path between two lane paths. */
export interface ConnectorInfo {
  /** Index of the path model the vehicle continues on, and the arc length where it joins it. */
  to: number;
  exitS: number;
  maxSpeed: number;
}

export interface TurnOption {
  /** Index of the connector model, the arc length on the source path where the turn starts, and which way. */
  model: number;
  entryS: number;
  turn: 'left' | 'right';
  junction: number;
}

export interface PathModel {
  path: TrafficPath;
  /** Set on connector models (the curved turn between two lane paths). */
  conn: ConnectorInfo | null;
  /** Connector only: which lane path it starts from, which way it turns and in which junction. */
  srcPath: number;
  turn: 'left' | 'right' | null;
  junction: number;
  /** Lane path model running the other way along the same road, or -1. */
  opposite: number;
  /** Junctions this path runs through, with the arc length of their centre, ascending. */
  passes: { junction: number; sCentre: number }[];
  /** Turns available from this path, ascending by entryS. */
  turns: TurnOption[];
  points: Vec2[];
  /** cum[i] = arc length from points[0] to points[i]. */
  cum: number[];
  length: number;
  axis: LightAxis;
  /** Stop lines sorted by s ascending. */
  stops: StopLine[];
  corners: Corner[];
  spawns: { s: number; timer: number }[];
  /** Active vehicles, leader (largest s) first. */
  list: Vehicle[];
  /**
   * False when the lane path starts or ends at a junction whose street was removed by a block merge (a closed
   * end): no edge extension there, no spawn at a closed start, and a vehicle must turn at a closed end.
   */
  startOpen: boolean;
  endOpen: boolean;
}

export interface Vehicle {
  id: number;
  pathIndex: number;
  s: number;
  speed: number;
  cls: VehicleClass;
  variant: number;
  tint: number;
  speedFactor: number;
  odo: number;
  heading: number;
  yawRate: number;
  accel: number;
  holding: boolean;
  braking: boolean;
  indicator: -1 | 0 | 1;
  /** World position of the centre and whether it lies inside an intersection (kept up to date by advance). */
  x: number;
  z: number;
  inJunction: boolean;
  /** Index of the junction the centre is in, or -1. */
  junctionIdx: number;
  /** Turn chosen for the next junction: connector model index (or -1 for straight), where it starts. */
  plan: number;
  planEntryS: number;
  /** Junction the choice above was made for, or -1. */
  decided: number;
  /** Step number of the last transfer between models, so a moved vehicle is not advanced twice. */
  stamp: number;
  /** Seconds the vehicle has stood still held by another vehicle's body. */
  heldFor: number;
  /** Order in which vehicles entered a junction (earlier goes first); valid while inside one. */
  entryOrder: number;
  /** Seconds left in which the vehicle ignores other vehicles' bodies to break a jam. */
  ghost: number;
  /** Metres still to reverse, and whether it has already backed up in this jam. */
  backupLeft: number;
  backedUp: boolean;
  /** Junction this vehicle holds a grant for (-1 none), when it was granted, and whether it has entered it. */
  granted: number;
  grantAt: number;
  enteredJ: number;
  /** Junction it is queueing for and since which step (first come, first served). */
  waitJ: number;
  waitSince: number;
  /** Stop line it is requesting a grant at this step. */
  reqLine: StopLine | null;
  /** True while it stands at a green light only because it has no grant yet. */
  grantWait: boolean;
  /** Seconds it has stood still, and whether its wait is legitimate (a red light or pedestrians on the crosswalk). */
  standT: number;
  legitWait: boolean;
  /** Held at a green light by a pedestrian on the crosswalk ahead, and for how long (seconds). */
  pedHold: boolean;
  pedHeldT: number;
  /** Simulation clock time of its last horn (-Infinity when never). */
  lastHornAt: number;
}

/** A horn request for the audio layer. */
export interface HornEvent {
  x: number;
  z: number;
  cls: VehicleClass;
}

export interface CrosswalkRect {
  cx: number;
  cz: number;
  hx: number;
  hz: number;
}

/** Anything with a ground position, e.g. the PedestrianRender records of the pedestrian system. */
export interface PedestrianPoint {
  position: { x: number; z: number };
}

export interface Pose {
  x: number;
  z: number;
  heading: number;
}
