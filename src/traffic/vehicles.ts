// Vehicle simulation: waypoint following with smoothed corners, following distance, traffic-light stops.
// Plain logic only, no Three.js. No collision avoidance beyond the following gap.
// update() and getVehicles() do not allocate in steady state: vehicles and render records are pooled.

import type { CityLayout, TrafficPath } from '../city/layout';
import type { Vec2 } from '../core/types';
import type { VehicleClass } from '../audio';
import { createRng } from '../core/rng';
import { TrafficLightController, axisForOrientation, type LightAxis } from './lights';
import { CLASS_VARIANTS } from './vehicles/variants';

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

interface VehicleSpec {
  cruiseSpeed: number; // m/s
  length: number; // metres along the path
  accel: number; // m/s^2
  weight: number; // spawn share
  /** Bumper-to-bumper gap kept behind the vehicle ahead, metres. */
  gap: number;
  /** Per-vehicle cruise speed factor range [min, max]. */
  speedVar: [number, number];
}

export const VEHICLE_SPECS: Record<VehicleClass, VehicleSpec> = {
  car: { cruiseSpeed: 11, length: 4.5, accel: 2.5, weight: 0.55, gap: 6, speedVar: [0.85, 1.12] },
  bus: { cruiseSpeed: 8, length: 12, accel: 1.5, weight: 0.1, gap: 7, speedVar: [0.92, 1.05] },
  truck: { cruiseSpeed: 9, length: 9, accel: 1.8, weight: 0.1, gap: 7, speedVar: [0.9, 1.05] },
  motorbike: { cruiseSpeed: 13, length: 2.2, accel: 3.5, weight: 0.25, gap: 4, speedVar: [0.85, 1.15] },
};

/** Stop line sits this far before the light centre, along the path. */
const STOP_BACK = 5;
/** Comfortable braking deceleration, m/s^2. */
const COMFORT_DECEL = 4;
/** Vehicles per path at trafficMultiplier 1. The active cap is this times the path count times the multiplier. */
const VEHICLES_PER_PATH = 2;
/** Seconds between spawn attempts at one spawn point, range at trafficMultiplier 1. */
const SPAWN_MIN_S = 4;
const SPAWN_MAX_S = 10;
/** Largest simulation step; longer frames are split so vehicles cannot skip a stop line. */
const MAX_STEP = 1 / 30;
/** Corner fillet: longest cut back from a waypoint, metres, and samples per arc. */
const FILLET_MAX = 7;
const FILLET_STEPS = 8;
/** Heading follows the path tangent this far ahead (metres) and is low-passed with this gain (1/s). */
const HEADING_LOOKAHEAD = 1.2;
const HEADING_GAIN = 7;
const MAX_YAW_RATE = 2.6;

export interface VehicleSystemOptions {
  trafficMultiplier: number;
  seed?: number;
  /** Pass a shared controller, otherwise one is built from layout.trafficLights. */
  lights?: TrafficLightController;
}

interface StopLine {
  s: number;
  lightId: string;
}

interface Corner {
  /** Arc length at the middle of the turn. */
  s: number;
  /** Turn angle in radians (0..pi). */
  angle: number;
}

interface PathModel {
  path: TrafficPath;
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
}

interface Vehicle {
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
}

interface Pose {
  x: number;
  z: number;
  heading: number;
}

export class VehicleSystem {
  readonly lights: TrafficLightController;
  private readonly models: PathModel[] = [];
  private readonly rng: () => number;
  private readonly pool: Vehicle[] = [];
  private readonly renderPool: VehicleRender[] = [];
  private readonly renderList: VehicleRender[] = [];
  private readonly pose: Pose = { x: 0, z: 0, heading: 0 };
  private total = 0;
  private nextId = 1;
  private multiplier: number;

  constructor(layout: CityLayout, options: VehicleSystemOptions) {
    this.multiplier = Math.max(0, options.trafficMultiplier);
    this.rng = createRng(options.seed ?? 1);
    this.lights = options.lights ?? new TrafficLightController(layout.trafficLights);

    const orientation = new Map(layout.roads.map((r) => [r.id, r.orientation] as const));
    const lightPos = new Map(layout.trafficLights.map((l) => [l.id, l.position] as const));

    for (const path of layout.trafficPaths) {
      if (path.waypoints.length < 2) continue;
      const { points, cornerIdx } = filletPath(path.waypoints);
      const cum = [0];
      for (let i = 1; i < points.length; i++) {
        cum.push(cum[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z));
      }
      const length = cum[cum.length - 1];
      if (length <= 0) continue;

      const corners: Corner[] = cornerIdx.map((c) => ({ s: cum[c.index], angle: c.angle }));

      const orient = orientation.get(path.roadId) ?? 'vertical';
      const stops: StopLine[] = [];
      for (const lightId of path.trafficLightIds) {
        const pos = lightPos.get(lightId);
        if (!pos) continue;
        const sLight = projectArc(points, cum, pos);
        const sStop = sLight - STOP_BACK;
        if (sStop > 0 && sStop < length) stops.push({ s: sStop, lightId });
      }
      stops.sort((a, b) => a.s - b.s);

      const spawns = path.spawnPoints.map((p) => ({
        s: projectArc(points, cum, p),
        timer: this.rng() * SPAWN_MAX_S,
      }));

      this.models.push({ path, points, cum, length, axis: axisForOrientation(orient), stops, corners, spawns, list: [] });
    }
  }

  /** Hard cap on active vehicles. Scales with trafficMultiplier; 0 means no traffic. */
  get capacity(): number {
    return Math.floor(this.multiplier * VEHICLES_PER_PATH * this.models.length);
  }

  get trafficMultiplier(): number {
    return this.multiplier;
  }

  get count(): number {
    return this.total;
  }

  /** Changes the multiplier. Extra vehicles (newest first) are removed if the cap drops. */
  setTrafficMultiplier(m: number): void {
    this.multiplier = Math.max(0, m);
    while (this.total > this.capacity) {
      let best: PathModel | null = null;
      let bestIdx = -1;
      let bestId = -1;
      for (const pm of this.models) {
        for (let i = 0; i < pm.list.length; i++) {
          if (pm.list[i].id > bestId) {
            bestId = pm.list[i].id;
            best = pm;
            bestIdx = i;
          }
        }
      }
      if (!best) break;
      this.release(best.list[bestIdx]);
      best.list.splice(bestIdx, 1);
      this.total--;
    }
  }

  /**
   * Advances every vehicle and the signal clock by dt seconds.
   * Vehicles reaching the end of their path are removed; new ones spawn at spawn points.
   */
  update(dt: number): void {
    if (!(dt > 0)) return;
    let remaining = dt;
    while (remaining > 1e-9) {
      const step = Math.min(remaining, MAX_STEP);
      this.step(step);
      remaining -= step;
    }
  }

  /** Vehicles as render data for the mesh layer. The returned array and its records are reused every call. */
  getVehicles(): VehicleRender[] {
    let n = 0;
    for (let pi = 0; pi < this.models.length; pi++) {
      const pm = this.models[pi];
      for (let k = 0; k < pm.list.length; k++) {
        const v = pm.list[k];
        poseAt(pm, v.s, this.pose);
        let r = this.renderPool[n];
        if (!r) {
          r = {
            id: 0,
            position: { x: 0, z: 0 },
            heading: 0,
            cls: 'car',
            variant: 0,
            speed: 0,
            accel: 0,
            braking: false,
            indicator: 0,
            yawRate: 0,
            wheelPhase: 0,
            tint: 0,
          };
          this.renderPool[n] = r;
        }
        r.id = v.id;
        r.position.x = this.pose.x;
        r.position.z = this.pose.z;
        r.heading = v.heading;
        r.cls = v.cls;
        r.variant = v.variant;
        r.speed = v.speed;
        r.accel = v.accel;
        r.braking = v.braking;
        r.indicator = v.indicator;
        r.yawRate = v.yawRate;
        r.wheelPhase = v.odo;
        r.tint = v.tint;
        this.renderList[n] = r;
        n++;
      }
    }
    this.renderList.length = n;
    return this.renderList;
  }

  /**
   * Places a vehicle on a path at arc length s (metres from the path start).
   * Returns the new id, or null if the path is unknown, the cap is reached, or the spot is occupied.
   */
  addVehicle(pathId: string, s: number, cls: VehicleClass = 'car'): number | null {
    const pathIndex = this.models.findIndex((m) => m.path.id === pathId);
    if (pathIndex < 0 || this.total >= this.capacity) return null;
    const pm = this.models[pathIndex];
    if (s < 0 || s >= pm.length) return null;
    if (!this.isFree(pm, s, cls)) return null;
    const v = this.create(pathIndex, s, cls, 1);
    return v.id;
  }

  /** Vehicle state by id, for tests and debugging. */
  getVehicleState(id: number): { s: number; speed: number; pathId: string; braking: boolean; heading: number } | null {
    for (const pm of this.models) {
      for (const v of pm.list) {
        if (v.id === id) return { s: v.s, speed: v.speed, pathId: pm.path.id, braking: v.braking, heading: v.heading };
      }
    }
    return null;
  }

  /** Arc length of the stop line for a light on a path, or null if that path does not stop there. */
  stopLineFor(pathId: string, lightId: string): number | null {
    const pm = this.models.find((m) => m.path.id === pathId);
    const line = pm?.stops.find((st) => st.lightId === lightId);
    return line ? line.s : null;
  }

  // ---- internals -----------------------------------------------------------

  private create(pathIndex: number, s: number, cls: VehicleClass, speedFrac: number): Vehicle {
    const spec = VEHICLE_SPECS[cls];
    const pm = this.models[pathIndex];
    const v = this.pool.pop() ?? ({} as Vehicle);
    v.id = this.nextId++;
    v.pathIndex = pathIndex;
    v.s = s;
    v.cls = cls;
    v.variant = this.pickVariant(cls);
    v.tint = this.rng();
    v.speedFactor = spec.speedVar[0] + this.rng() * (spec.speedVar[1] - spec.speedVar[0]);
    v.speed = spec.cruiseSpeed * v.speedFactor * speedFrac;
    v.odo = 0;
    poseAt(pm, Math.min(s + HEADING_LOOKAHEAD, pm.length), this.pose);
    v.heading = this.pose.heading;
    v.yawRate = 0;
    v.accel = 0;
    v.holding = false;
    v.braking = false;
    v.indicator = 0;
    // Insert keeping the list sorted by s, largest first.
    let i = 0;
    while (i < pm.list.length && pm.list[i].s > s) i++;
    pm.list.push(v);
    for (let j = pm.list.length - 1; j > i; j--) pm.list[j] = pm.list[j - 1];
    pm.list[i] = v;
    this.total++;
    return v;
  }

  private release(v: Vehicle): void {
    this.pool.push(v);
  }

  private step(dt: number): void {
    this.lights.update(dt);

    for (let pi = 0; pi < this.models.length; pi++) {
      const pm = this.models[pi];
      const list = pm.list;
      let leader: Vehicle | null = null;
      for (let k = 0; k < list.length; k++) {
        const v = list[k];
        this.advance(pm, v, leader, dt);
        leader = v;
      }
      // Leaders that finished their path leave (they are at the front of the list).
      while (list.length > 0 && list[0].s >= pm.length) {
        this.release(list[0]);
        list.shift();
        this.total--;
      }
    }

    this.trySpawns(dt);
  }

  private advance(pm: PathModel, v: Vehicle, leader: Vehicle | null, dt: number): void {
    const spec = VEHICLE_SPECS[v.cls];
    const oldSpeed = v.speed;

    // Nearest stop line ahead that the vehicle must respect now.
    let stopAt = -1;
    for (let i = 0; i < pm.stops.length; i++) {
      const line = pm.stops[i];
      if (line.s < v.s) continue; // already past it
      const phase = this.lights.phaseOf(line.lightId, pm.axis);
      if (phase === 'green') continue;
      const dist = line.s - v.s;
      const canStop = v.speed * v.speed <= 2 * COMFORT_DECEL * dist;
      if (phase === 'red' || canStop) {
        stopAt = line.s;
        break;
      }
      // Yellow and too fast to stop comfortably: go through.
    }

    // Target speed: cruise, limited by braking distance to a stop line and by corners.
    let target = spec.cruiseSpeed * v.speedFactor;
    if (stopAt >= 0) {
      target = Math.min(target, Math.sqrt(2 * COMFORT_DECEL * Math.max(0, stopAt - v.s)));
    }
    for (let i = 0; i < pm.corners.length; i++) {
      const c = pm.corners[i];
      const ds = c.s - v.s;
      if (ds < -FILLET_MAX || ds > 60) continue;
      const cornerSpeed = 3 + 7 * (1 - Math.min(1, c.angle / Math.PI));
      target = Math.min(target, ds > 0 ? Math.sqrt(cornerSpeed * cornerSpeed + 2 * COMFORT_DECEL * ds) : cornerSpeed);
    }
    if (v.speed < target) {
      v.speed = Math.min(target, v.speed + spec.accel * dt);
    } else {
      v.speed = Math.max(target, v.speed - COMFORT_DECEL * dt);
    }

    let newS = v.s + v.speed * dt;
    let blocked = false;

    // Never pass a stop line we must respect.
    if (stopAt >= 0 && newS > stopAt) {
      newS = stopAt;
      v.speed = 0;
      blocked = true;
    }

    // Following distance behind the leader.
    if (leader) {
      const required = (VEHICLE_SPECS[leader.cls].length + spec.length) / 2 + spec.gap;
      const maxS = leader.s - required;
      if (newS > maxS) {
        newS = Math.max(v.s, maxS);
        v.speed = Math.min(v.speed, leader.speed);
        blocked = true;
      }
    }

    v.odo += newS - v.s;
    v.s = newS;

    // Smoothed acceleration, brake lamp state (decelerating, or held at a stop line / behind a leader).
    const a = (v.speed - oldSpeed) / dt;
    v.accel += (a - v.accel) * Math.min(1, dt * 6);
    v.holding = v.speed < 0.4 && (blocked || stopAt >= 0);
    v.braking = v.accel < -0.9 || v.holding;

    // Heading follows the path tangent a little ahead, low-passed so corners turn smoothly.
    poseAt(pm, Math.min(v.s + HEADING_LOOKAHEAD, pm.length), this.pose);
    const diff = wrapAngle(this.pose.heading - v.heading);
    let rate = diff * HEADING_GAIN;
    if (rate > MAX_YAW_RATE) rate = MAX_YAW_RATE;
    else if (rate < -MAX_YAW_RATE) rate = -MAX_YAW_RATE;
    let dh = rate * dt;
    if (Math.abs(dh) > Math.abs(diff)) dh = diff;
    v.heading = wrapAngle(v.heading + dh);
    const yaw = dh / dt;
    v.yawRate += (yaw - v.yawRate) * Math.min(1, dt * 8);
    v.indicator = v.yawRate > 0.12 ? 1 : v.yawRate < -0.12 ? -1 : 0;
  }

  private trySpawns(dt: number): void {
    for (let pi = 0; pi < this.models.length; pi++) {
      const pm = this.models[pi];
      for (let k = 0; k < pm.spawns.length; k++) {
        const sp = pm.spawns[k];
        sp.timer -= dt;
        if (sp.timer > 0) continue;
        sp.timer = SPAWN_MIN_S + this.rng() * (SPAWN_MAX_S - SPAWN_MIN_S);
        if (this.total >= this.capacity) continue;
        const cls = this.pickClass();
        if (!this.isFree(pm, sp.s, cls)) continue;
        this.create(pi, sp.s, cls, 0.6);
      }
    }
  }

  /** True if no vehicle on the path is too close to arc length s for a vehicle of class cls. */
  private isFree(pm: PathModel, s: number, cls: VehicleClass): boolean {
    const spec = VEHICLE_SPECS[cls];
    for (let i = 0; i < pm.list.length; i++) {
      const v = pm.list[i];
      const required = (VEHICLE_SPECS[v.cls].length + spec.length) / 2 + Math.max(spec.gap, VEHICLE_SPECS[v.cls].gap);
      if (Math.abs(v.s - s) < required) return false;
    }
    return true;
  }

  private pickClass(): VehicleClass {
    const r = this.rng();
    let acc = 0;
    for (const cls of CLASS_ORDER) {
      acc += VEHICLE_SPECS[cls].weight;
      if (r < acc) return cls;
    }
    return 'car';
  }

  private pickVariant(cls: VehicleClass): number {
    const options = CLASS_VARIANTS[cls];
    const r = this.rng();
    let acc = 0;
    for (const o of options) {
      acc += o.weight;
      if (r < acc) return o.variant;
    }
    return options[options.length - 1].variant;
  }
}

const CLASS_ORDER: VehicleClass[] = ['car', 'bus', 'truck', 'motorbike'];

/**
 * Rounds the corners of a waypoint polyline with quadratic arcs so vehicles can turn smoothly.
 * Straight runs are returned unchanged. cornerIdx lists the middle sample of each arc.
 */
function filletPath(wp: readonly Vec2[]): { points: Vec2[]; cornerIdx: { index: number; angle: number }[] } {
  const points: Vec2[] = [{ x: wp[0].x, z: wp[0].z }];
  const cornerIdx: { index: number; angle: number }[] = [];
  for (let i = 1; i < wp.length - 1; i++) {
    const a = wp[i - 1];
    const p = wp[i];
    const b = wp[i + 1];
    const d1 = Math.hypot(p.x - a.x, p.z - a.z);
    const d2 = Math.hypot(b.x - p.x, b.z - p.z);
    if (d1 < 1e-6 || d2 < 1e-6) continue;
    const u1x = (p.x - a.x) / d1, u1z = (p.z - a.z) / d1;
    const u2x = (b.x - p.x) / d2, u2z = (b.z - p.z) / d2;
    const cosA = Math.min(1, Math.max(-1, u1x * u2x + u1z * u2z));
    const angle = Math.acos(cosA);
    if (angle < 0.12) {
      points.push({ x: p.x, z: p.z });
      continue;
    }
    const t = Math.min(FILLET_MAX, Math.min(d1, d2) * 0.45);
    const q0x = p.x - u1x * t, q0z = p.z - u1z * t;
    const q1x = p.x + u2x * t, q1z = p.z + u2z * t;
    for (let k = 0; k <= FILLET_STEPS; k++) {
      const f = k / FILLET_STEPS;
      const w0 = (1 - f) * (1 - f), w1 = 2 * f * (1 - f), w2 = f * f;
      if (k === FILLET_STEPS / 2) cornerIdx.push({ index: points.length, angle });
      points.push({ x: w0 * q0x + w1 * p.x + w2 * q1x, z: w0 * q0z + w1 * p.z + w2 * q1z });
    }
  }
  const last = wp[wp.length - 1];
  points.push({ x: last.x, z: last.z });
  return { points, cornerIdx };
}

/** Arc length along the polyline of the point closest to p. */
function projectArc(points: readonly Vec2[], cum: readonly number[], p: Vec2): number {
  let best = Infinity;
  let bestS = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const len2 = abx * abx + abz * abz;
    const t = len2 > 0 ? clamp01(((p.x - a.x) * abx + (p.z - a.z) * abz) / len2) : 0;
    const qx = a.x + abx * t;
    const qz = a.z + abz * t;
    const d2 = (p.x - qx) * (p.x - qx) + (p.z - qz) * (p.z - qz);
    if (d2 < best) {
      best = d2;
      bestS = cum[i - 1] + Math.sqrt(len2) * t;
    }
  }
  return bestS;
}

function poseAt(pm: PathModel, s: number, out: Pose): void {
  const x = Math.min(Math.max(s, 0), pm.length);
  let i = 1;
  while (i < pm.cum.length - 1 && pm.cum[i] < x) i++;
  const a = pm.points[i - 1];
  const b = pm.points[i];
  const segLen = pm.cum[i] - pm.cum[i - 1];
  const t = segLen > 0 ? (x - pm.cum[i - 1]) / segLen : 0;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  out.x = a.x + dx * t;
  out.z = a.z + dz * t;
  out.heading = Math.atan2(dx, dz);
}

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
