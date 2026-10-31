// Vehicle simulation: waypoint following with smoothed corners, following distance, traffic-light stops.
// Plain logic only, no Three.js. No collision avoidance beyond the following gap.
// update() and getVehicles() do not allocate in steady state: vehicles and render records are pooled.
import type { CityLayout } from '../city/layout';
import type { Vec2 } from '../core/types';
import type { VehicleClass } from '../audio';
import { TrafficLightController } from './lights';
import { Obb } from './collision';
import type { VehicleRender, VehicleSystemOptions, TurnOption, PathModel, Vehicle, HornEvent, CrosswalkRect, PedestrianPoint, Pose } from './vehicles/types';
import { TURN_LEFT_CHANCE, TURN_RIGHT_CHANCE, HORN_COOLDOWN_S, HORN_GLOBAL_GAP_S, HORN_CHANCE, HORN_QUEUE_MAX, VEHICLES_PER_PATH, MAX_STEP } from './vehicles/constants';
import { setupSystem } from './vehicles/build';
import { getVehicles } from './vehicles/render';
import { create, release, trySpawns, isFree } from './vehicles/spawn';
import { updateGrants } from './vehicles/junctions';
import { transfer, advance } from './vehicles/motion';

export class VehicleSystem {

  lights!: TrafficLightController;

  models: PathModel[] = [];

  /** Number of lane-path models; connector models follow them in this.models. */
  pathCount = 0;

  stepNo = 0;

  entrySeq = 0;

  turnCounts = { straight: 0, left: 0, right: 0 };

  /** Per junction: vehicles holding a grant, and the vehicles asking for one this step. */
  grantedAt: Vehicle[][] = [];

  askingAt: Vehicle[][] = [];

  blockedAsk: Vehicle[] = [];

  movementCache = new Map<string, Vec2[]>();

  conflictCache = new Map<string, boolean>();

  /** The vehicle whose body gave the nearest limit in the last conflictLimit call, if any. */
  blocker: Vehicle | null = null;

  junctionCount = 0;

  crosswalkRects: CrosswalkRect[] = [];

  drawBounds = { minX: -Infinity, maxX: Infinity, minZ: -Infinity, maxZ: Infinity };

  junctions: { minX: number; maxX: number; minZ: number; maxZ: number }[] = [];

  /**
   * Arms per junction (bits: 1 north, 2 east, 4 south, 8 west) and their count. Without block merges every
   * junction has 4. A T junction (3) keeps its signal with turns renormalised over the allowed moves; 2 arms
   * (straight or bend) means no signal.
   */
  armMask: Uint8Array = new Uint8Array(0);

  armCount: Uint8Array = new Uint8Array(0);

  /** 1 while a pedestrian is on the crosswalk with that index. Refreshed once per update(). */
  crosswalkBusy: Uint8Array = new Uint8Array(0);

  pedestrianSource: (() => readonly PedestrianPoint[]) | null = null;

  // Scratch for the sweep along a vehicle's way ahead (no per-step allocation).
  sweep: Obb[] = [];

  sweepD: number[] = [];

  otherBox: Obb = { x: 0, z: 0, heading: 0, halfLength: 0, halfWidth: 0 };

  /** The vehicle's actual footprint where it stands (the sweep boxes carry extra clearance). */
  ownBox: Obb = { x: 0, z: 0, heading: 0, halfLength: 0, halfWidth: 0 };

  rng!: () => number;

  /** Separate generator for horn randomness: the main rng sequence (and the determinism hash) must not change. */
  hornRng!: () => number;

  hornClock = 0;

  lastHornGlobal = -Infinity;

  hornQueue: HornEvent[] = [];

  hornQueueLen = 0;

  hornOut: HornEvent[] = [];

  pool: Vehicle[] = [];

  renderPool: VehicleRender[] = [];

  renderList: VehicleRender[] = [];

  pose: Pose = { x: 0, z: 0, heading: 0 };

  total = 0;

  nextId = 1;

  multiplier!: number;

  constructor(layout: CityLayout, options: VehicleSystemOptions) {
    setupSystem(this, layout, options);
  }

  /** Number of real arms of a junction (4 without block merges). For tests and tooling. */
  junctionArms(junction: number): number {
    return this.armCount[junction] ?? 0;
  }

  /** Hard cap on active vehicles. Scales with trafficMultiplier; 0 means no traffic. */
  get capacity(): number {
    return Math.floor(this.multiplier * VEHICLES_PER_PATH * this.pathCount);
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
      release(this, best.list[bestIdx]);
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
    this.refreshCrosswalks();
    let remaining = dt;
    while (remaining > 1e-9) {
      const step = Math.min(remaining, MAX_STEP);
      this.step(step);
      remaining -= step;
    }
  }

  /**
   * Gives the system the pedestrians to watch. A vehicle does not enter a crosswalk that has a pedestrian
   * on it, even when its light is green. Pass null to stop watching.
   */
  setPedestrianSource(source: (() => readonly PedestrianPoint[]) | null): void {
    this.pedestrianSource = source;
  }

  refreshCrosswalks(): void {
    const busy = this.crosswalkBusy;
    busy.fill(0);
    const src = this.pedestrianSource;
    if (!src || busy.length === 0) return;
    const peds = src();
    const rects = this.crosswalkRects;
    for (let i = 0; i < peds.length; i++) {
      const px = peds[i].position.x;
      const pz = peds[i].position.z;
      for (let c = 0; c < rects.length; c++) {
        const rc = rects[c];
        if (Math.abs(px - rc.cx) <= rc.hx && Math.abs(pz - rc.cz) <= rc.hz) busy[c] = 1;
      }
    }
  }

  /** Vehicles as render data for the mesh layer. The returned array and its records are reused every call. */
  getVehicles(): VehicleRender[] {
    return getVehicles(this);
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
    if (!isFree(this, pm, s, cls)) return null;
    const v = create(this, pathIndex, s, cls, 1);
    return v.id;
  }

  /** How many junction manoeuvres were chosen so far, for tests: straight, left and right. */
  get turnStats(): Readonly<{ straight: number; left: number; right: number }> {
    return this.turnCounts;
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

  /**
   * Horn requests raised since the last call. The returned array and its records are reused: read them now and do
   * not keep references. Reading clears the queue.
   */
  takeHorns(): readonly HornEvent[] {
    const out = this.hornOut;
    out.length = 0;
    for (let i = 0; i < this.hornQueueLen; i++) out.push(this.hornQueue[i]);
    this.hornQueueLen = 0;
    return out;
  }

  /** Queues a horn for v, subject to the per-vehicle cooldown, the city-wide gap and a coin flip (see HORN_*). */
  tryHorn(v: Vehicle): void {
    const now = this.hornClock;
    if (now - v.lastHornAt < HORN_COOLDOWN_S) return;
    if (now - this.lastHornGlobal < HORN_GLOBAL_GAP_S) return;
    if (this.hornQueueLen >= HORN_QUEUE_MAX) return;
    if (this.hornRng() >= HORN_CHANCE) {
      v.lastHornAt = now - HORN_COOLDOWN_S + 10; // reconsiders in 10 s rather than on the very next frame
      return;
    }
    v.lastHornAt = now;
    this.lastHornGlobal = now;
    let e = this.hornQueue[this.hornQueueLen];
    if (!e) {
      e = { x: 0, z: 0, cls: 'car' };
      this.hornQueue[this.hornQueueLen] = e;
    }
    e.x = v.x;
    e.z = v.z;
    e.cls = v.cls;
    this.hornQueueLen++;
  }

  step(dt: number): void {
    this.hornClock += dt;
    this.lights.update(dt);
    this.stepNo++;
    updateGrants(this);

    for (let pi = 0; pi < this.models.length; pi++) {
      const pm = this.models[pi];
      const list = pm.list;
      let leader: Vehicle | null = null;
      for (let k = 0; k < list.length; k++) {
        const v = list[k];
        if (v.stamp !== this.stepNo) advance(this, pm, v, leader, dt);
        leader = v;
      }
      // Leaders that finished their path leave (they are at the front of the list); at the end of a
      // connector they continue on the road they turned onto.
      while (list.length > 0 && list[0].s >= pm.length) {
        const v = list[0];
        if (pm.conn) {
          transfer(this, v, list, 0, pm.conn.to, pm.conn.exitS + (v.s - pm.length));
        } else {
          release(this, v);
          list.shift();
          this.total--;
        }
      }
      // Vehicles that reached the start of their turn move onto the connector.
      if (pm.turns.length > 0) {
        for (let k = list.length - 1; k >= 0; k--) {
          const v = list[k];
          if (v.plan >= 0 && v.s >= v.planEntryS) transfer(this, v, list, k, v.plan, v.s - v.planEntryS);
        }
      }
    }

    trySpawns(this, dt);
  }

  /** Weighted pick among straight (if allowed) and the turns that exist at this junction. */
  decideAmongAllowed(pm: PathModel, v: Vehicle, junction: number, roll: number, straightOk: boolean): void {
    let left: TurnOption | null = null;
    let right: TurnOption | null = null;
    for (let i = 0; i < pm.turns.length; i++) {
      const t = pm.turns[i];
      if (t.junction !== junction) continue;
      if (t.turn === 'left') left = t;
      else right = t;
    }
    const wS = straightOk ? 1 - TURN_LEFT_CHANCE - TURN_RIGHT_CHANCE : 0;
    const wL = left ? TURN_LEFT_CHANCE : 0;
    const wR = right ? TURN_RIGHT_CHANCE : 0;
    const total = wS + wL + wR;
    const r = roll * total;
    const pick = total <= 0 || r < wS ? null : r < wS + wL ? left : right;
    if (!pick) {
      this.turnCounts.straight++;
      return;
    }
    v.plan = pick.model;
    v.planEntryS = pick.entryS;
    this.turnCounts[pick.turn]++;
  }

}

export type { VehicleRender } from './vehicles/types';
export type { VehicleSystemOptions } from './vehicles/types';
export type { HornEvent } from './vehicles/types';
export type { PedestrianPoint } from './vehicles/types';
export { VEHICLE_SPECS } from './vehicles/constants';
