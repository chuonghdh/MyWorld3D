// Airliner schedule: a seeded, deterministic list of straight-line flights for every in-app day.
// A flight is a pure function of simulated time, so pausing freezes it, nothing spawns while time
// stands still and a time jump simply lands on whatever the schedule says for that moment.

import { createRng } from '../core/rng';
import { CLOUD_TOP_MAX } from '../environment/cloudSprites';
import { MAX_DISTANCE } from '../core/cameraLimits';
import { DAY_SECONDS } from '../store/model';

/** Highest the camera can be: the orbit looking straight down at the maximum zoom-out distance. */
export const MAX_CAMERA_HEIGHT = MAX_DISTANCE;
/** Aircraft stay at least this far below the highest possible camera. */
export const CAMERA_SAFETY_MARGIN = 100;
/** Cruise band: above the cloud tops (plus a margin), below the camera ceiling, capped at 300 m. */
export const ALTITUDE_MIN = CLOUD_TOP_MAX + 50;
export const ALTITUDE_MAX = Math.min(300, MAX_CAMERA_HEIGHT - CAMERA_SAFETY_MARGIN);
/** Scene speed range in metres per second (visible but slow). */
export const SPEED_MIN = 40;
export const SPEED_MAX = 90;
/** Entry and exit points lie on a circle of this radius around the town centre (metres). */
export const SPAWN_RADIUS_MIN = 900;
export const SPAWN_RADIUS_MAX = 1020;
/** The line passes the town centre at most this fraction of the spawn radius away. */
export const MAX_LATERAL = 0.35;
/** One flight per in-app hour, at a random moment inside that hour. */
export const FLIGHTS_PER_DAY_MIN = 24;
export const FLIGHTS_PER_DAY_MAX = 24;
/** The day is cut into this many equal windows (one per hour); exactly one flight starts in each. */
export const STRATA = 24;
/** Trail slots: a slot is reused three windows later, long after its trail has faded. */
export const SLOTS = 3;

/** Total heading change over a crossing, radians (15 to 40 degrees, left or right). */
export const TURN_MIN = (15 * Math.PI) / 180;
export const TURN_MAX = (40 * Math.PI) / 180;
/** Altitude drift over a crossing is at most this many metres (the path stays inside the band). */
export const CLIMB_MAX = 20;
/** Standard gravity, for the bank angle of a coordinated turn. */
const GRAVITY = 9.81;

export interface Flight {
  /** Unique, increasing id: day * STRATA + window. */
  id: number;
  day: number;
  slot: number;
  /** Simulated start time (s) at the entry point, and the flight duration (s). */
  start: number;
  duration: number;
  speed: number;
  /** Altitude at mid-flight (m). */
  altitude: number;
  x0: number;
  z0: number;
  /** Initial unit heading on the ground plane (kept for callers; the path curves from here). */
  dx: number;
  dz: number;
  /** Initial heading as a yaw: dx = sin(yaw0), dz = cos(yaw0). */
  yaw0: number;
  /** Path curvature in rad/m (positive turns towards +x from +z) and the arc length in metres. */
  curve: number;
  length: number;
  /** Altitude change over the whole crossing (m, signed). */
  climb: number;
}

export interface Pose {
  x: number;
  y: number;
  z: number;
  /** Heading yaw: forward = (sin yaw, cos yaw) on the ground plane. */
  yaw: number;
  /** Roll about the forward axis (rad) of a coordinated turn, ready for Quaternion.setFromAxisAngle(+Z). */
  roll: number;
  /** Velocity in m/s. */
  vx: number;
  vy: number;
  vz: number;
}

export function newPose(): Pose {
  return { x: 0, y: 0, z: 0, yaw: 0, roll: 0, vx: 0, vy: 0, vz: 0 };
}

function hashSeed(seed: number, day: number): number {
  let h = Math.imul(seed | 0, 374761393) ^ Math.imul(day | 0, 668265263);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  return (h ^ (h >>> 16)) >>> 0;
}

/** The flights of one in-app day, sorted by start time. Deterministic in (seed, day, centre). */
export function flightsForDay(seed: number, day: number, cx = 0, cz = 0): Flight[] {
  const rng = createRng(hashSeed(seed, day));
  const chosen: number[] = [];
  for (let i = 0; i < STRATA; i++) chosen.push(i);
  const width = DAY_SECONDS / STRATA;
  const out: Flight[] = [];
  for (const w of chosen) {
    const start = day * DAY_SECONDS + (w + rng()) * width;
    const radius = SPAWN_RADIUS_MIN + rng() * (SPAWN_RADIUS_MAX - SPAWN_RADIUS_MIN);
    const theta = rng() * Math.PI * 2;
    const lateral = (rng() * 2 - 1) * MAX_LATERAL * radius;
    const speed = SPEED_MIN + rng() * (SPEED_MAX - SPEED_MIN);
    const altitude = ALTITUDE_MIN + CLIMB_MAX / 2 + rng() * (ALTITUDE_MAX - ALTITUDE_MIN - CLIMB_MAX);
    // Entry point on the circle; the line passes the centre at distance `lateral`.
    const ex = Math.cos(theta) * radius;
    const ez = Math.sin(theta) * radius;
    // Chord heading: inward along the radius, turned sideways so the chord misses the centre by `lateral`.
    const sl = lateral / radius;
    const c = Math.sqrt(1 - sl * sl);
    const hx = -c * Math.cos(theta) - sl * Math.sin(theta);
    const hz = -c * Math.sin(theta) + sl * Math.cos(theta);
    const chord = 2 * radius * c;
    // A gentle symmetric arc over the same chord: same entry and exit points, heading turns by `turn`.
    const turn = (TURN_MIN + rng() * (TURN_MAX - TURN_MIN)) * (rng() < 0.5 ? -1 : 1);
    const length = chord * (turn / 2 / Math.sin(turn / 2));
    const climb = (rng() * 2 - 1) * CLIMB_MAX;
    out.push({
      id: day * STRATA + w,
      day,
      slot: w % SLOTS,
      start,
      duration: length / speed,
      speed,
      altitude,
      x0: cx + ex,
      z0: cz + ez,
      dx: Math.sin(Math.atan2(hx, hz) - turn / 2),
      dz: Math.cos(Math.atan2(hx, hz) - turn / 2),
      yaw0: Math.atan2(hx, hz) - turn / 2,
      curve: turn / length,
      length,
      climb,
    });
  }
  return out;
}

/** Pose of a flight at simulated time `t` (clamped to the flight). Writes into `out`. */
export function flightPose(f: Flight, t: number, out: Pose): Pose {
  const clamped = Math.min(f.duration, Math.max(0, t - f.start));
  const d = clamped * f.speed;
  const u = f.length > 0 ? d / f.length : 0;
  const yaw = f.yaw0 + f.curve * d;
  if (Math.abs(f.curve) < 1e-9) {
    out.x = f.x0 + Math.sin(f.yaw0) * d;
    out.z = f.z0 + Math.cos(f.yaw0) * d;
  } else {
    out.x = f.x0 + (Math.cos(f.yaw0) - Math.cos(yaw)) / f.curve;
    out.z = f.z0 + (Math.sin(yaw) - Math.sin(f.yaw0)) / f.curve;
  }
  out.y = f.altitude + f.climb * (u - 0.5);
  out.yaw = yaw;
  out.vx = Math.sin(yaw) * f.speed;
  out.vz = Math.cos(yaw) * f.speed;
  out.vy = (f.climb / f.length) * f.speed;
  // Coordinated turn: tan(bank) = v * turn rate / g, eased in and out so the wings level at both ends.
  const ease = Math.min(1, u / 0.1, (1 - u) / 0.1);
  const bank = Math.atan((f.speed * f.speed * f.curve) / GRAVITY) * Math.max(0, ease);
  // Positive curve turns towards +x, which is the model's +x (left) wing side: that wing drops.
  out.roll = -bank;
  return out;
}

/** True while the flight is in the air at time `t`. */
export function flightActive(f: Flight, t: number): boolean {
  return t >= f.start && t <= f.start + f.duration;
}
