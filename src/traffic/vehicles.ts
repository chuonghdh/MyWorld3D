// Vehicle simulation: waypoint following with smoothed corners, following distance, traffic-light stops.
// Plain logic only, no Three.js. No collision avoidance beyond the following gap.
// update() and getVehicles() do not allocate in steady state: vehicles and render records are pooled.

import type { CityLayout, TrafficPath } from '../city/layout';
import type { Vec2 } from '../core/types';
import type { VehicleClass } from '../audio';
import { createRng } from '../core/rng';
import { TrafficLightController, axisForOrientation, type LightAxis } from './lights';
import { CLASS_VARIANTS } from './vehicles/variants';
import { VARIANT_FOOTPRINT, obbOverlap, type Obb } from './collision';

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

/**
 * Paths are extended this far beyond their end junctions, so vehicles enter and leave at the map edge. Long enough
 * for the longest vehicle to stand fully before the first stop line.
 */
const EDGE_EXTENSION = 28;
/** Vehicles outside the town bounds by more than this are simulated but not drawn, so they appear at the border. */
const DRAW_MARGIN = 3;
/** What a vehicle does at a junction: straight 60 %, left 20 %, right 20 %. */
const TURN_LEFT_CHANCE = 0.2;
const TURN_RIGHT_CHANCE = 0.2;
/** A vehicle picks its manoeuvre this far before the junction centre, metres. */
const DECIDE_DISTANCE = 40;
/**
 * Two vehicles jammed against each other at a junction: after this many seconds the one that entered the
 * junction later backs up a little (BACKUP_DIST, at BACK_SPEED); if the jam remains, the one that entered
 * first goes through regardless of overlap (GHOST_S seconds), so nothing stays stuck.
 */
const HELD_BACKUP_S = 3;
const BACKUP_DIST = 1.5;
const BACK_SPEED = 1.5;
const GHOST_S = 5;
/** Standing this long (seconds) for no good reason starts the same push-on. */
const STUCK_PUSH_S = 40;
/**
 * Horn events for the audio layer (see takeHorns). They use their own random generator, so the main simulation
 * sequence is untouched. A vehicle honks when a pedestrian has held it on a green light for HORN_PED_HOLD_S, when it
 * is jammed (HELD_BACKUP_S, resolveJam), or rarely after a hard brake. Per vehicle cooldown and a global rate limit.
 */
const HORN_PED_HOLD_S = 5;
/** A vehicle honks at most once per 45 s, and the whole city at most once per 6 s (horns are meant to be rare). */
const HORN_COOLDOWN_S = 45;
const HORN_GLOBAL_GAP_S = 6;
/** Only this share of the situations that could make a driver honk actually does. */
const HORN_CHANCE = 0.5;
/** Smoothed deceleration (m/s^2) below which a braking vehicle counts as braking hard. */
const HORN_HARD_BRAKE = -3;
/** Chance per second of honking while braking hard: about once per 15 min for a vehicle that brakes hard continuously. */
const HORN_HARD_BRAKE_RATE = 1 / 900;
const HORN_QUEUE_MAX = 8;
/**
 * Junction right of way: a vehicle may enter a junction only when it holds a grant, and grants go in the order
 * vehicles arrived (first come, first served) among vehicles whose ways through the junction cross or merge.
 */
const REQUEST_RANGE = 25;
/** Ways through a junction closer than this (centre lines, metres) conflict. */
const CONFLICT_DIST = 2.8;
/** A grant not used within this many steps is dropped (the vehicle was held up before the junction). */
const GRANT_EXPIRY_STEPS = 300;
/** Vehicles slow down to this speed when they approach or cross a junction, m/s. */
const JUNCTION_SPEED = 6;
/** A left turn waits while oncoming traffic moves within this distance of the junction centre, metres. */
const ONCOMING_REACH = 32;
/** Speed through a turn, m/s. */
const LEFT_TURN_SPEED = 5.5;
const RIGHT_TURN_SPEED = 4.5;
/** Fallback stop line (no crosswalk found): this far before the light centre, along the path. */
const STOP_BACK = 5;
/** A stopped vehicle's front bumper keeps this far before the crosswalk, metres. */
const STOP_MARGIN = 0.5;
/** Crosswalks further than this before the light centre are not considered its own. */
const CROSSWALK_REACH = 14;
/** A crosswalk belongs to a path only if its centre lies this close to the path laterally, metres. */
const CROSSWALK_LATERAL = 4.5;
/** Clearance kept around a vehicle's footprint when checking its way ahead, metres. */
const SIDE_MARGIN = 0.15;
const END_MARGIN = 0.25;
/** Spacing of the points checked along a vehicle's way ahead, metres. */
const SWEEP_STEP = 1;
/** Longest way ahead checked, metres. */
const SWEEP_MAX = 40;
/** Comfortable braking deceleration, m/s^2. */
const COMFORT_DECEL = 4;
/** Hardest braking used to stop at a light or behind a queue, m/s^2. Past this a vehicle goes through. */
const MAX_DECEL = 7;
/** Below this speed a vehicle can always stop at its line, so it never commits through a light. */
const COMMIT_MIN_SPEED = 1.5;
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
  /** Metres the paths extend beyond their end junctions (vehicles spawn at the far end). Default 10. */
  edgeExtension?: number;
}

interface StopLine {
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

interface Corner {
  /** Arc length at the middle of the turn. */
  s: number;
  /** Turn angle in radians (0..pi). */
  angle: number;
}

/** A way through a junction that turns onto the crossing road: a short curved path between two lane paths. */
interface ConnectorInfo {
  /** Index of the path model the vehicle continues on, and the arc length where it joins it. */
  to: number;
  exitS: number;
  maxSpeed: number;
}

interface TurnOption {
  /** Index of the connector model, the arc length on the source path where the turn starts, and which way. */
  model: number;
  entryS: number;
  turn: 'left' | 'right';
  junction: number;
}

interface PathModel {
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

interface CrosswalkRect {
  cx: number;
  cz: number;
  hx: number;
  hz: number;
}

/** Anything with a ground position, e.g. the PedestrianRender records of the pedestrian system. */
export interface PedestrianPoint {
  position: { x: number; z: number };
}

interface Pose {
  x: number;
  z: number;
  heading: number;
}

export class VehicleSystem {
  readonly lights: TrafficLightController;
  private readonly models: PathModel[] = [];
  /** Number of lane-path models; connector models follow them in this.models. */
  private pathCount = 0;
  private stepNo = 0;
  private entrySeq = 0;
  private readonly turnCounts = { straight: 0, left: 0, right: 0 };
  /** Per junction: vehicles holding a grant, and the vehicles asking for one this step. */
  private readonly grantedAt: Vehicle[][] = [];
  private readonly askingAt: Vehicle[][] = [];
  private readonly blockedAsk: Vehicle[] = [];
  private readonly movementCache = new Map<string, Vec2[]>();
  private readonly conflictCache = new Map<string, boolean>();
  /** The vehicle whose body gave the nearest limit in the last conflictLimit call, if any. */
  private blocker: Vehicle | null = null;
  private junctionCount = 0;
  private readonly crosswalkRects: CrosswalkRect[] = [];
  private drawBounds = { minX: -Infinity, maxX: Infinity, minZ: -Infinity, maxZ: Infinity };
  private readonly junctions: { minX: number; maxX: number; minZ: number; maxZ: number }[] = [];
  /**
   * Arms per junction (bits: 1 north, 2 east, 4 south, 8 west) and their count. Without block merges every
   * junction has 4. A T junction (3) keeps its signal with turns renormalised over the allowed moves; 2 arms
   * (straight or bend) means no signal.
   */
  private armMask: Uint8Array = new Uint8Array(0);
  private armCount: Uint8Array = new Uint8Array(0);
  /** 1 while a pedestrian is on the crosswalk with that index. Refreshed once per update(). */
  private crosswalkBusy: Uint8Array = new Uint8Array(0);
  private pedestrianSource: (() => readonly PedestrianPoint[]) | null = null;
  // Scratch for the sweep along a vehicle's way ahead (no per-step allocation).
  private readonly sweep: Obb[] = [];
  private readonly sweepD: number[] = [];
  private readonly otherBox: Obb = { x: 0, z: 0, heading: 0, halfLength: 0, halfWidth: 0 };
  /** The vehicle's actual footprint where it stands (the sweep boxes carry extra clearance). */
  private readonly ownBox: Obb = { x: 0, z: 0, heading: 0, halfLength: 0, halfWidth: 0 };
  private readonly rng: () => number;
  /** Separate generator for horn randomness: the main rng sequence (and the determinism hash) must not change. */
  private readonly hornRng: () => number;
  private hornClock = 0;
  private lastHornGlobal = -Infinity;
  private readonly hornQueue: HornEvent[] = [];
  private hornQueueLen = 0;
  private readonly hornOut: HornEvent[] = [];
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
    this.hornRng = createRng(((options.seed ?? 1) ^ 0x68c0ffee) >>> 0);
    this.lights = options.lights ?? new TrafficLightController(layout.trafficLights);

    for (const cw of layout.crosswalks) {
      // Pedestrians walk along the crosswalk length; the band is a little wider than painted.
      const alongX = cw.orientation === 'horizontal';
      this.crosswalkRects.push({
        cx: cw.center.x,
        cz: cw.center.z,
        hx: alongX ? cw.length / 2 + 0.3 : cw.width / 2 + 0.6,
        hz: alongX ? cw.width / 2 + 0.6 : cw.length / 2 + 0.3,
      });
    }
    this.crosswalkBusy = new Uint8Array(this.crosswalkRects.length);
    if ((options.edgeExtension ?? EDGE_EXTENSION) > 0) {
      const b = layout.townBounds;
      this.drawBounds = { minX: b.minX - DRAW_MARGIN, maxX: b.maxX + DRAW_MARGIN, minZ: b.minZ - DRAW_MARGIN, maxZ: b.maxZ + DRAW_MARGIN };
    }
    for (const it of layout.intersections) {
      this.junctions.push({
        minX: it.center.x - it.sizeX / 2 - 1,
        maxX: it.center.x + it.sizeX / 2 + 1,
        minZ: it.center.z - it.sizeZ / 2 - 1,
        maxZ: it.center.z + it.sizeZ / 2 + 1,
      });
    }

    const orientation = new Map(layout.roads.map((r) => [r.id, r.orientation] as const));
    const lightPos = new Map(layout.trafficLights.map((l) => [l.id, l.position] as const));
    const ext = options.edgeExtension ?? EDGE_EXTENSION;
    const openness = pathOpenness(layout, orientation);

    for (const path of layout.trafficPaths) {
      if (path.waypoints.length < 2) continue;
      const open = openness.get(path) ?? { start: true, end: true };
      const { points, cornerIdx } = filletPath(extendWaypoints(path.waypoints, open.start ? ext : 0, open.end ? ext : 0));
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
        // The stop line is the near edge of the crosswalk in front of this light, minus a small margin.
        let sStop = sLight - STOP_BACK;
        let bestC = -Infinity;
        let bestIdx = -1;
        for (let ci = 0; ci < layout.crosswalks.length; ci++) {
          const cw = layout.crosswalks[ci];
          const hit = projectArcDist(points, cum, cw.center);
          if (hit.s >= sLight || sLight - hit.s > CROSSWALK_REACH || hit.d > CROSSWALK_LATERAL) continue;
          if (hit.s > bestC) {
            bestC = hit.s;
            bestIdx = ci;
            sStop = hit.s - cw.width / 2 - STOP_MARGIN;
          }
        }
        if (sStop > 0 && sStop < length) stops.push({ s: sStop, passS: sStop + STOP_MARGIN, lightId, cw: bestIdx, junction: this.junctionAt(pos.x, pos.z), exitS: 2 * sLight - (sStop + STOP_MARGIN) });
      }
      stops.sort((a, b) => a.s - b.s);

      // Vehicles enter at the start of the (extended) path, i.e. at the edge of the map. A closed start (a junction
      // on a merged block's boundary) gets no spawn: vehicles only reach that lane by turning into it.
      const spawns = path.spawnPoints.length > 0 && open.start ? [{ s: 0, timer: this.rng() * SPAWN_MAX_S }] : [];

      this.models.push({
        path,
        conn: null,
        srcPath: -1,
        turn: null,
        junction: -1,
        opposite: -1,
        passes: [],
        turns: [],
        points,
        cum,
        length,
        axis: axisForOrientation(orient),
        stops,
        corners,
        spawns,
        list: [],
        startOpen: open.start,
        endOpen: open.end,
      });
    }
    this.pathCount = this.models.length;
    this.junctionCount = layout.intersections.length;
    this.buildTurns(layout);
    this.buildArms();
    for (let j = 0; j < this.junctionCount; j++) {
      this.grantedAt.push([]);
      this.askingAt.push([]);
    }
  }

  /** Finds the junctions each path runs through and builds a curved connector for every possible turn. */
  private buildTurns(layout: CityLayout): void {
    const n = this.pathCount;
    for (let a = 0; a < n; a++) {
      const A = this.models[a];
      A.opposite = this.models.findIndex(
        (m, i) => i < n && i !== a && m.path.roadId === A.path.roadId && m.path.direction === -A.path.direction,
      );
      for (let j = 0; j < layout.intersections.length; j++) {
        const hit = projectArcDist(A.points, A.cum, layout.intersections[j].center);
        if (hit.d <= 3.5) A.passes.push({ junction: j, sCentre: hit.s });
      }
      A.passes.sort((p, q) => p.sCentre - q.sCentre);
    }
    for (let a = 0; a < n; a++) {
      const A = this.models[a];
      for (const pa of A.passes) {
        for (let b = 0; b < n; b++) {
          const B = this.models[b];
          if (B.axis === A.axis) continue;
          const pb = B.passes.find((p) => p.junction === pa.junction);
          if (!pb) continue;
          const conn = this.makeConnector(layout, a, pa.sCentre, b, pb.sCentre, pa.junction);
          if (!conn) continue;
          const index = this.models.length;
          this.models.push(conn.model);
          A.turns.push({ model: index, entryS: conn.entryS, turn: conn.turn, junction: pa.junction });
        }
      }
      A.turns.sort((p, q) => p.entryS - q.entryS);
    }
  }

  /**
   * Counts the real arms of every junction from the lane paths through it. A lane that goes on beyond the centre,
   * or ends there with an open end (the map edge), adds an arm ahead; one that comes from beyond, or starts there
   * with an open start, adds an arm behind. Then junctions left with 2 arms (straight or bend, after a block
   * merge removed a street) lose their signal: their stop lines only yield to pedestrians on the crosswalk.
   */
  private buildArms(): void {
    const J = this.junctionCount;
    this.armMask = new Uint8Array(J);
    this.armCount = new Uint8Array(J);
    const pose = this.pose;
    for (let a = 0; a < this.pathCount; a++) {
      const A = this.models[a];
      for (const p of A.passes) {
        poseAt(A, p.sCentre, pose);
        const ahead = armBit(pose.heading);
        const behind = armBit(pose.heading + Math.PI);
        if (p.sCentre < A.length - 3 || A.endOpen) this.armMask[p.junction] |= ahead;
        if (p.sCentre > 3 || A.startOpen) this.armMask[p.junction] |= behind;
      }
    }
    for (let j = 0; j < J; j++) {
      const m = this.armMask[j];
      this.armCount[j] = (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1);
    }
    for (let a = 0; a < this.pathCount; a++) {
      for (const line of this.models[a].stops) {
        if (line.junction >= 0 && this.armCount[line.junction] <= 2) line.lightId = '';
      }
    }
  }

  /** Number of real arms of a junction (4 without block merges). For tests and tooling. */
  junctionArms(junction: number): number {
    return this.armCount[junction] ?? 0;
  }

  private makeConnector(
    layout: CityLayout,
    a: number,
    sA: number,
    b: number,
    sB: number,
    junction: number,
  ): { model: PathModel; entryS: number; turn: 'left' | 'right' } | null {
    const A = this.models[a];
    const B = this.models[b];
    const it = layout.intersections[junction];
    const pose = this.pose;
    poseAt(A, sA, pose);
    const posA = { x: pose.x, z: pose.z };
    const hA = pose.heading;
    poseAt(B, sB, pose);
    const posB = { x: pose.x, z: pose.z };
    const hB = pose.heading;
    const dA = { x: Math.sin(hA), z: Math.cos(hA) };
    const dB = { x: Math.sin(hB), z: Math.cos(hB) };
    const aAlongZ = Math.abs(dA.z) > 0.5;
    // Control point: where the two lane lines cross.
    const c = aAlongZ ? { x: posA.x, z: posB.z } : { x: posB.x, z: posA.z };
    // Start of the turn on the way in, and end of it on the way out: the edges of the junction box.
    const e0 = Math.max(1, aAlongZ ? it.sizeZ / 2 + dA.z * (c.z - it.center.z) : it.sizeX / 2 + dA.x * (c.x - it.center.x));
    const bAlongX = Math.abs(dB.x) > 0.5;
    const e1 = Math.max(1, bAlongX ? it.sizeX / 2 - dB.x * (c.x - it.center.x) : it.sizeZ / 2 - dB.z * (c.z - it.center.z));
    const p0 = { x: c.x - dA.x * e0, z: c.z - dA.z * e0 };
    const p1 = { x: c.x + dB.x * e1, z: c.z + dB.z * e1 };
    const entryS = projectArc(A.points, A.cum, p0);
    const exitS = projectArc(B.points, B.cum, p1);
    if (exitS > B.length - 2) return null;

    const points: Vec2[] = [];
    const steps = 16;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const u = 1 - t;
      points.push({ x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x, z: u * u * p0.z + 2 * u * t * c.z + t * t * p1.z });
    }
    const cum = [0];
    for (let i = 1; i < points.length; i++) {
      cum.push(cum[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z));
    }
    const length = cum[cum.length - 1];
    const turn: 'left' | 'right' = wrapAngle(hB - hA) > 0 ? 'left' : 'right';

    // Pedestrians on the crosswalk the turn leads onto hold the vehicle back.
    const stops: StopLine[] = [];
    let cwIdx = -1;
    let cwNear = Infinity;
    for (let ci = 0; ci < layout.crosswalks.length; ci++) {
      const cw = layout.crosswalks[ci];
      const hit = projectArcDist(B.points, B.cum, cw.center);
      const near = hit.s - cw.width / 2 - exitS;
      if (hit.d > CROSSWALK_LATERAL || near < -1 || near > 6) continue;
      if (near < cwNear) {
        cwNear = near;
        cwIdx = ci;
      }
    }
    if (cwIdx >= 0) {
      const sStop = length + Math.min(Math.max(cwNear, 0), 1) - STOP_MARGIN;
      stops.push({ s: sStop, passS: sStop + STOP_MARGIN, lightId: '', cw: cwIdx, junction: -1, exitS: -1e9 });
    }

    const model: PathModel = {
      path: A.path,
      conn: { to: b, exitS, maxSpeed: turn === 'left' ? LEFT_TURN_SPEED : RIGHT_TURN_SPEED },
      srcPath: a,
      turn,
      junction,
      opposite: -1,
      passes: [],
      turns: [],
      points,
      cum,
      length,
      axis: A.axis,
      stops,
      corners: [],
      spawns: [],
      list: [],
      startOpen: true,
      endOpen: true,
    };
    return { model, entryS, turn };
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

  private refreshCrosswalks(): void {
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
    let n = 0;
    for (let pi = 0; pi < this.models.length; pi++) {
      const pm = this.models[pi];
      for (let k = 0; k < pm.list.length; k++) {
        const v = pm.list[k];
        if (v.x < this.drawBounds.minX || v.x > this.drawBounds.maxX || v.z < this.drawBounds.minZ || v.z > this.drawBounds.maxZ) continue;
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
    poseAt(pm, s, this.pose);
    v.x = this.pose.x;
    v.z = this.pose.z;
    v.junctionIdx = this.junctionAt(v.x, v.z);
    v.inJunction = v.junctionIdx >= 0;
    v.plan = -1;
    v.planEntryS = 0;
    v.decided = -1;
    v.stamp = -1;
    v.heldFor = 0;
    v.ghost = 0;
    v.backupLeft = 0;
    v.backedUp = false;
    v.granted = -1;
    v.grantAt = 0;
    v.enteredJ = -1;
    v.waitJ = -1;
    v.waitSince = 0;
    v.reqLine = null;
    v.grantWait = false;
    v.standT = 0;
    v.legitWait = false;
    v.pedHold = false;
    v.pedHeldT = 0;
    v.lastHornAt = -Infinity;
    v.entryOrder = v.junctionIdx >= 0 ? ++this.entrySeq : 0;
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
  private tryHorn(v: Vehicle): void {
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

  private step(dt: number): void {
    this.hornClock += dt;
    this.lights.update(dt);
    this.stepNo++;
    this.updateGrants();

    for (let pi = 0; pi < this.models.length; pi++) {
      const pm = this.models[pi];
      const list = pm.list;
      let leader: Vehicle | null = null;
      for (let k = 0; k < list.length; k++) {
        const v = list[k];
        if (v.stamp !== this.stepNo) this.advance(pm, v, leader, dt);
        leader = v;
      }
      // Leaders that finished their path leave (they are at the front of the list); at the end of a
      // connector they continue on the road they turned onto.
      while (list.length > 0 && list[0].s >= pm.length) {
        const v = list[0];
        if (pm.conn) {
          this.transfer(v, list, 0, pm.conn.to, pm.conn.exitS + (v.s - pm.length));
        } else {
          this.release(v);
          list.shift();
          this.total--;
        }
      }
      // Vehicles that reached the start of their turn move onto the connector.
      if (pm.turns.length > 0) {
        for (let k = list.length - 1; k >= 0; k--) {
          const v = list[k];
          if (v.plan >= 0 && v.s >= v.planEntryS) this.transfer(v, list, k, v.plan, v.s - v.planEntryS);
        }
      }
    }

    this.trySpawns(dt);
  }

  /**
   * Hands out the right to enter each junction. Vehicles inside a junction always hold it. Vehicles about to
   * enter ask in order of arrival and get it when their way through the junction crosses no granted way and no
   * way of an earlier waiting vehicle.
   */
  private updateGrants(): void {
    const J = this.junctionCount;
    for (let j = 0; j < J; j++) {
      const list = this.grantedAt[j];
      let w = 0;
      for (let i = 0; i < list.length; i++) {
        const v = list[i];
        if (this.grantDone(v, j)) {
          v.granted = -1;
          v.enteredJ = -1;
        } else {
          list[w++] = v;
        }
      }
      list.length = w;
      this.askingAt[j].length = 0;
    }
    for (let pi = 0; pi < this.models.length; pi++) {
      const pm = this.models[pi];
      for (let k = 0; k < pm.list.length; k++) {
        const v = pm.list[k];
        v.reqLine = null;
        const inside = v.junctionIdx;
        if (inside >= 0) {
          if (v.granted !== inside) {
            if (v.granted >= 0) this.dropGrant(v);
            v.granted = inside;
            v.grantAt = this.stepNo;
            this.grantedAt[inside].push(v);
          }
          v.enteredJ = inside;
          continue;
        }
        if (pm.conn || v.granted >= 0) continue;
        const front = v.s + VEHICLE_SPECS[v.cls].length / 2;
        for (let i = 0; i < pm.stops.length; i++) {
          const line = pm.stops[i];
          if (front > line.passS) continue;
          if (line.junction >= 0 && line.s - front <= REQUEST_RANGE) {
            if (v.plan < 0 || v.decided !== line.junction) this.decideTurn(pm, v);
            if (v.waitJ !== line.junction) {
              v.waitJ = line.junction;
              v.waitSince = this.stepNo;
            }
            v.reqLine = line;
            this.askingAt[line.junction].push(v);
          }
          break; // only the nearest line ahead counts
        }
      }
    }
    for (let j = 0; j < J; j++) {
      const asking = this.askingAt[j];
      if (asking.length === 0) continue;
      // Order of arrival (insertion sort: the lists are short).
      for (let a = 1; a < asking.length; a++) {
        const v = asking[a];
        let b = a - 1;
        while (b >= 0 && asking[b].waitSince > v.waitSince) {
          asking[b + 1] = asking[b];
          b--;
        }
        asking[b + 1] = v;
      }
      this.blockedAsk.length = 0;
      for (let a = 0; a < asking.length; a++) {
        const v = asking[a];
        const line = v.reqLine as StopLine;
        const pm = this.models[v.pathIndex];
        if (this.lights.phaseOf(line.lightId, pm.axis) !== 'green') continue; // waits at the light, claims nothing
        let free = !(v.plan >= 0 && !this.gateOpen(this.models[v.plan], v));
        for (let g = 0; free && g < this.grantedAt[j].length; g++) {
          if (this.movesConflict(j, v, this.grantedAt[j][g])) free = false;
        }
        for (let g = 0; free && g < this.blockedAsk.length; g++) {
          if (this.movesConflict(j, v, this.blockedAsk[g])) free = false;
        }
        if (free) {
          v.granted = j;
          v.grantAt = this.stepNo;
          this.grantedAt[j].push(v);
        } else {
          this.blockedAsk.push(v);
        }
      }
    }
  }

  private dropGrant(v: Vehicle): void {
    const list = this.grantedAt[v.granted];
    const i = list.indexOf(v);
    if (i >= 0) list.splice(i, 1);
    v.granted = -1;
  }

  /** A grant ends when the vehicle has left the junction (centre and rear), or was never used for too long. */
  private grantDone(v: Vehicle, j: number): boolean {
    if (v.enteredJ === j) {
      if (v.standT > 10) return true; // stuck with its tail in the junction: stop holding everyone else up
      if (this.junctionAt(v.x, v.z) === j) return false;
      const half = VEHICLE_SPECS[v.cls].length / 2;
      return this.junctionAt(v.x - Math.sin(v.heading) * half, v.z - Math.cos(v.heading) * half) !== j;
    }
    return this.stepNo - v.grantAt > GRANT_EXPIRY_STEPS;
  }

  /** The way a vehicle takes through junction j: its source lane path, and the connector if it will turn. */
  private movesConflict(j: number, a: Vehicle, b: Vehicle): boolean {
    const pa = this.models[a.pathIndex];
    const pb = this.models[b.pathIndex];
    const srcA = pa.conn ? pa.srcPath : a.pathIndex;
    const srcB = pb.conn ? pb.srcPath : b.pathIndex;
    if (srcA === srcB) return false; // same lane: they queue, they do not cross
    const planA = pa.conn ? a.pathIndex : a.plan;
    const planB = pb.conn ? b.pathIndex : b.plan;
    const key = j + ':' + srcA + ':' + planA + '|' + srcB + ':' + planB;
    const cached = this.conflictCache.get(key);
    if (cached !== undefined) return cached;
    const ptsA = this.movementPoints(j, srcA, planA);
    const ptsB = this.movementPoints(j, srcB, planB);
    let hit = false;
    const lim = CONFLICT_DIST * CONFLICT_DIST;
    for (let i = 0; i < ptsA.length && !hit; i++) {
      for (let k = 0; k < ptsB.length; k++) {
        const dx = ptsA[i].x - ptsB[k].x;
        const dz = ptsA[i].z - ptsB[k].z;
        if (dx * dx + dz * dz < lim) {
          hit = true;
          break;
        }
      }
    }
    this.conflictCache.set(key, hit);
    return hit;
  }

  /** Centre-line points of the way through junction j: straight along a lane path, or via a connector. */
  private movementPoints(j: number, src: number, plan: number): Vec2[] {
    const key = j + ':' + src + ':' + plan;
    const cached = this.movementCache.get(key);
    if (cached) return cached;
    const out: Vec2[] = [];
    const A = this.models[src];
    const pass = A.passes.find((q) => q.junction === j);
    const pose = this.pose;
    if (pass) {
      if (plan < 0) {
        for (let d = -9; d <= 9; d += 1.5) {
          poseAt(A, pass.sCentre + d, pose);
          out.push({ x: pose.x, z: pose.z });
        }
      } else {
        const conn = this.models[plan];
        const ci = conn.conn as ConnectorInfo;
        const turn = A.turns.find((t) => t.model === plan);
        const entryS = turn ? turn.entryS : pass.sCentre - 5;
        for (let d = -3; d <= 0; d += 1.5) {
          poseAt(A, entryS + d, pose);
          out.push({ x: pose.x, z: pose.z });
        }
        for (const pt of conn.points) out.push({ x: pt.x, z: pt.z });
        const B = this.models[ci.to];
        for (let d = 0; d <= 9; d += 1.5) {
          poseAt(B, ci.exitS + d, pose);
          out.push({ x: pose.x, z: pose.z });
        }
      }
    }
    this.movementCache.set(key, out);
    return out;
  }

  /** Moves a vehicle from one model's list to another's at arc length s, keeping the target sorted. */
  private transfer(v: Vehicle, from: Vehicle[], index: number, toModel: number, s: number): void {
    from.splice(index, 1);
    const to = this.models[toModel];
    v.pathIndex = toModel;
    v.s = s;
    v.plan = -1;
    v.decided = -1;
    v.stamp = this.stepNo;
    let i = 0;
    while (i < to.list.length && to.list[i].s > s) i++;
    to.list.push(v);
    for (let j = to.list.length - 1; j > i; j--) to.list[j] = to.list[j - 1];
    to.list[i] = v;
  }

  /** Rolls the manoeuvre for the next junction once the vehicle is close enough to it. */
  private decideTurn(pm: PathModel, v: Vehicle): void {
    let pass: { junction: number; sCentre: number } | null = null;
    for (let i = 0; i < pm.passes.length; i++) {
      if (pm.passes[i].sCentre - 3 > v.s) {
        pass = pm.passes[i];
        break;
      }
    }
    if (!pass || v.decided === pass.junction || pass.sCentre - v.s > DECIDE_DISTANCE) return;
    v.decided = pass.junction;
    v.plan = -1;
    const roll = this.rng();
    // A junction a block merge left with fewer arms, or the closed end of this lane: choose only among the
    // moves that exist, with the 60/20/20 split renormalised over them (straight is impossible at a closed end).
    const closedEnd = !pm.endOpen && pass.sCentre >= pm.length - 3;
    if (closedEnd || this.armCount[pass.junction] < 4) {
      this.decideAmongAllowed(pm, v, pass.junction, roll, !closedEnd);
      return;
    }
    if (roll < 1 - TURN_LEFT_CHANCE - TURN_RIGHT_CHANCE) {
      this.turnCounts.straight++;
      return; // straight on
    }
    const want = roll < 1 - TURN_RIGHT_CHANCE ? 'left' : 'right';
    for (let i = 0; i < pm.turns.length; i++) {
      const t = pm.turns[i];
      if (t.junction === pass.junction && t.turn === want) {
        v.plan = t.model;
        v.planEntryS = t.entryS;
        this.turnCounts[want]++;
        return;
      }
    }
    this.turnCounts.straight++; // wanted a turn that does not exist here
  }

  /** Weighted pick among straight (if allowed) and the turns that exist at this junction. */
  private decideAmongAllowed(pm: PathModel, v: Vehicle, junction: number, roll: number, straightOk: boolean): void {
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

  /**
   * True when a vehicle may start this turn: room to start and to merge, and no oncoming traffic for a left
   * turn. (Pedestrians on the crosswalk it leads onto are waited for at the end of the turn, off the lane.)
   */
  private gateOpen(conn: PathModel, v: Vehicle): boolean {
    const ci = conn.conn as ConnectorInfo;
    const own = VEHICLE_SPECS[v.cls].length;
    for (let i = 0; i < conn.list.length; i++) {
      const w = conn.list[i];
      if (w.s - VEHICLE_SPECS[w.cls].length / 2 < own + 2) return false;
    }
    const target = this.models[ci.to];
    for (let i = 0; i < target.list.length; i++) {
      const w = target.list[i];
      const half = VEHICLE_SPECS[w.cls].length / 2;
      if (w.s + half > ci.exitS - 2 && w.s - half < ci.exitS + own + 2) return false;
    }
    if (conn.turn === 'left') {
      const oncoming = this.models[this.models[conn.srcPath].opposite];
      const pass = oncoming ? oncoming.passes.find((p) => p.junction === conn.junction) : undefined;
      if (oncoming && pass) {
        for (let i = 0; i < oncoming.list.length; i++) {
          const w = oncoming.list[i];
          const ahead = pass.sCentre - w.s; // distance of the oncoming vehicle to the junction centre
          if (ahead > -6 && ahead < ONCOMING_REACH && w.speed > 1) return false;
        }
      }
    }
    return true;
  }

  /** Two vehicles have been jammed for a while: the later one backs up once; if that is not enough, the earlier one pushes on. */
  private resolveJam(v: Vehicle, w: Vehicle): void {
    const vOrder = v.inJunction ? v.entryOrder : Infinity;
    const wOrder = w.inJunction ? w.entryOrder : Infinity;
    const later = vOrder !== wOrder ? (vOrder > wOrder ? v : w) : v.id > w.id ? v : w;
    v.heldFor = 0;
    this.tryHorn(v);
    if (!later.backedUp) {
      later.backedUp = true;
      later.backupLeft = BACKUP_DIST;
    } else {
      v.ghost = GHOST_S;
    }
  }

  /** True when no vehicle on the same path stands within `need` metres behind v. */
  private roomBehind(pm: PathModel, v: Vehicle, need: number): boolean {
    for (let i = 0; i < pm.list.length; i++) {
      const w = pm.list[i];
      if (w === v || w.s >= v.s) continue;
      if (v.s - w.s - (VEHICLE_SPECS[v.cls].length + VEHICLE_SPECS[w.cls].length) / 2 < need) return false;
    }
    return true;
  }

  private advance(pm: PathModel, v: Vehicle, leader: Vehicle | null, dt: number): void {
    const spec = VEHICLE_SPECS[v.cls];
    const oldSpeed = v.speed;

    // Backing up out of a jam: a short crawl in reverse, if nothing is right behind.
    if (v.backupLeft > 0) {
      const d = Math.min(v.backupLeft, BACK_SPEED * dt, v.s);
      if (d <= 0 || !this.roomBehind(pm, v, 0.5)) {
        v.backupLeft = 0;
      } else {
        v.s -= d;
        v.odo -= d;
        v.backupLeft -= d;
      }
      v.speed = 0;
      v.accel = 0;
      v.holding = true;
      v.braking = true;
      this.syncPose(pm, v);
      return;
    }

    // Nearest stop line ahead that the vehicle must respect now. The rule is about the front bumper:
    //  - any part already over the crosswalk line: keep going, whatever the light shows;
    //  - fully behind it on yellow or red: stop at the line (queueing behind a leader, see below),
    //    unless even the hardest braking cannot stop in time, then go through.
    const halfLen = spec.length / 2;
    const front = v.s + halfLen;
    let stopAt = -1; // limit for the vehicle centre
    v.grantWait = false;
    v.legitWait = false;
    v.pedHold = false;
    for (let i = 0; i < pm.stops.length; i++) {
      const line = pm.stops[i];
      if (front > line.passS) continue; // part of the vehicle is past the crosswalk line
      const phase = this.lights.phaseOf(line.lightId, pm.axis);
      // Green means go only while nobody is on the crosswalk ahead and no cross traffic is still clearing
      // the junction.
      if (phase === 'green') {
        const walkersBusy = line.cw >= 0 && this.crosswalkBusy[line.cw] !== 0;
        // First come, first served through the junction: without a grant the vehicle waits at the line.
        const noGrant = line.junction >= 0 && v.granted !== line.junction && v.ghost <= 0;
        // Do not enter the junction when the queue ahead leaves no room to clear it (no blocking the box).
        const noRoom =
          v.ghost <= 0 &&
          leader !== null &&
          leader.speed < 0.5 &&
          leader.s - VEHICLE_SPECS[leader.cls].length / 2 < line.exitS + spec.length + 1;
        if (!walkersBusy && !noRoom && !noGrant) continue;
      }
      v.grantWait = phase === 'green' && line.junction >= 0 && v.granted !== line.junction;
      v.legitWait = phase !== 'green' || (line.cw >= 0 && this.crosswalkBusy[line.cw] !== 0);
      v.pedHold = phase === 'green' && line.cw >= 0 && this.crosswalkBusy[line.cw] !== 0;
      const dist = Math.max(0, line.s - front);
      // Cannot stop any more: commit. A crawling vehicle can always stop within the clamp below.
      if (v.speed > COMMIT_MIN_SPEED && v.speed * v.speed > 2 * MAX_DECEL * dist) continue;
      stopAt = line.s - halfLen;
      break;
    }

    // Which way at the next junction, and may it start the turn yet?
    let turnConn: PathModel | null = null;
    if (!pm.conn && pm.turns.length > 0) {
      this.decideTurn(pm, v);
      if (v.plan >= 0) {
        turnConn = this.models[v.plan];
        if (v.s < v.planEntryS && v.ghost <= 0 && !this.gateOpen(turnConn, v)) {
          const hold = v.planEntryS - 0.1;
          if (stopAt < 0 || hold < stopAt) stopAt = hold;
        }
      }
    }

    // Another vehicle in the way (crossing traffic, a vehicle standing in the junction): stop short of it.
    // Standing a long time for no good reason (not a red light, not pedestrians): push on regardless of the
    // junction rules, as a last resort against gridlock.
    if (v.standT > STUCK_PUSH_S && !v.legitWait && v.ghost <= 0) v.ghost = GHOST_S;
    let blockS = -1;
    if (v.ghost > 0) {
      v.ghost -= dt; // breaking a jam: drives on regardless of other bodies
    } else {
      blockS = this.conflictLimit(pm, v);
      if (blockS >= 0 && v.speed < 0.2) {
        v.heldFor += dt;
        // A jam needs both vehicles stuck on each other (or the other waiting for the very right of way this
        // one holds). One that merely waits for a vehicle standing for another reason (a red light, a
        // crosswalk) just waits too.
        const b = this.blocker;
        if (v.heldFor >= HELD_BACKUP_S && b && (b.heldFor > 0 || b.backupLeft > 0 || b.grantWait)) this.resolveJam(v, b);
      } else {
        v.heldFor = 0;
        if (v.speed > 1) v.backedUp = false;
      }
    }
    if (blockS >= 0 && (stopAt < 0 || blockS < stopAt)) stopAt = blockS;

    // Target speed: cruise, limited by braking distance to a stop line and by corners.
    let target = spec.cruiseSpeed * v.speedFactor;
    if (stopAt >= 0) {
      target = Math.min(target, Math.sqrt(2 * COMFORT_DECEL * Math.max(0, stopAt - v.s)));
    }
    if (pm.conn) target = Math.min(target, pm.conn.maxSpeed);
    for (let i = 0; i < pm.passes.length; i++) {
      const toCentre = pm.passes[i].sCentre - v.s;
      if (toCentre < 14 && toCentre > -6) target = Math.min(target, JUNCTION_SPEED);
    }
    if (turnConn && v.s < v.planEntryS) {
      const turnSpeed = (turnConn.conn as ConnectorInfo).maxSpeed;
      target = Math.min(target, Math.sqrt(turnSpeed * turnSpeed + 2 * COMFORT_DECEL * (v.planEntryS - v.s)));
    }
    for (let i = 0; i < pm.corners.length; i++) {
      const c = pm.corners[i];
      const ds = c.s - v.s;
      if (ds < -FILLET_MAX || ds > 60) continue;
      const cornerSpeed = 3 + 7 * (1 - Math.min(1, c.angle / Math.PI));
      target = Math.min(target, ds > 0 ? Math.sqrt(cornerSpeed * cornerSpeed + 2 * COMFORT_DECEL * ds) : cornerSpeed);
    }
    // Approach a leader smoothly: the safe speed shrinks with the free gap, so queues form without jolts.
    if (leader) {
      const required = (VEHICLE_SPECS[leader.cls].length + spec.length) / 2 + spec.gap;
      const free = Math.max(0, leader.s - required - v.s);
      target = Math.min(target, leader.speed + Math.sqrt(2 * COMFORT_DECEL * free));
    }
    // Stopping at a light or behind a queue may need more than comfortable braking.
    const brakeLimit = stopAt >= 0 || leader ? MAX_DECEL : COMFORT_DECEL;
    if (v.speed < target) {
      v.speed = Math.min(target, v.speed + spec.accel * dt);
    } else {
      v.speed = Math.max(target, v.speed - brakeLimit * dt);
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

    v.standT = v.speed < 0.2 ? v.standT + dt : 0;
    this.syncPose(pm, v);

    // Horn triggers (own rng; see HORN_*). A pedestrian holding the vehicle at a green light for a while.
    if (v.pedHold && v.speed < 0.5) {
      v.pedHeldT += dt;
      if (v.pedHeldT >= HORN_PED_HOLD_S) {
        v.pedHeldT = 0;
        this.tryHorn(v);
      }
    } else {
      v.pedHeldT = 0;
    }
    if (v.accel < HORN_HARD_BRAKE && v.speed > 2 && this.hornRng() < HORN_HARD_BRAKE_RATE * dt) this.tryHorn(v);
  }

  /** Updates the cached world position and junction of a vehicle; notes when it enters a junction. */
  private syncPose(pm: PathModel, v: Vehicle): void {
    poseAt(pm, v.s, this.pose);
    v.x = this.pose.x;
    v.z = this.pose.z;
    const j = this.junctionAt(v.x, v.z);
    if (j >= 0 && v.junctionIdx < 0) v.entryOrder = ++this.entrySeq;
    v.junctionIdx = j;
    v.inJunction = j >= 0;
  }

  /** Index of the junction containing the point, or -1. */
  private junctionAt(x: number, z: number): number {
    for (let i = 0; i < this.junctions.length; i++) {
      const j = this.junctions[i];
      if (x >= j.minX && x <= j.maxX && z >= j.minZ && z <= j.maxZ) return i;
    }
    return -1;
  }

  /**
   * Looks along the vehicle's own path for a vehicle of another path whose body its footprint would hit,
   * and returns the arc length (of the centre) it must stop at, or -1 when the way is clear.
   * This is the last line of defence behind the signals and the junction rule: every vehicle stops for any
   * body in its way. A vehicle already touching another is not stopped by it, so overlaps can separate
   * instead of locking up.
   */
  private conflictLimit(pm: PathModel, v: Vehicle): number {
    const foot = VARIANT_FOOTPRINT[v.variant] ?? VARIANT_FOOTPRINT[0];
    const reach = Math.min(SWEEP_MAX, (v.speed * v.speed) / (2 * COMFORT_DECEL) + v.speed * 0.3 + 4);
    const near = reach + foot.length / 2 + 12;
    const near2 = near * near;
    let result = -1;
    this.blocker = null;
    let sweepCount = -1; // built lazily, only when some other vehicle is near

    for (let mi = 0; mi < this.models.length; mi++) {
      const other = this.models[mi];
      if (other === pm) continue;
      for (let k = 0; k < other.list.length; k++) {
        const w = other.list[k];
        const dx = w.x - v.x;
        const dz = w.z - v.z;
        if (dx * dx + dz * dz > near2) continue;

        // Who goes first: whoever entered a junction first; one inside goes before one outside; else lower id.
        const vOrder = v.inJunction ? v.entryOrder : Infinity;
        const wOrder = w.inJunction ? w.entryOrder : Infinity;
        const vFirst = vOrder !== wOrder ? vOrder < wOrder : v.id < w.id;
        if (sweepCount < 0) sweepCount = this.buildSweep(pm, v, foot, reach);
        const wf = VARIANT_FOOTPRINT[w.variant] ?? VARIANT_FOOTPRINT[0];
        const b = this.otherBox;
        b.x = w.x;
        b.z = w.z;
        b.heading = w.heading;
        b.halfLength = wf.length / 2;
        b.halfWidth = wf.width / 2;
        for (let i = 0; i < sweepCount; i++) {
          if (!obbOverlap(this.sweep[i], b)) continue;
          // The vehicle that goes first does not wait for one that must give way to it, unless that one
          // stands right in its way (nobody drives through a body).
          if (vFirst && (w.speed >= 0.2 || i > 3)) break;
          // i == 0 means w is within the clearance margin right now. If the bodies really touch, let them
          // separate; otherwise hold still until w has gone.
          if (i === 0 && obbOverlap(this.ownBox, b)) break;
          const limit = i === 0 ? v.s : this.limitAlong(pm, v, this.sweepD[i - 1]);
          if (result < 0 || limit < result) {
            result = limit;
            this.blocker = w;
          }
          break;
        }
      }
    }
    return result;
  }

  /** Pose d metres ahead of the vehicle along its route: its path, then the planned turn, then the road it joins. */
  private routePose(pm: PathModel, v: Vehicle, d: number): void {
    if (pm.conn) {
      const rem = pm.length - v.s;
      if (d <= rem) poseAt(pm, v.s + d, this.pose);
      else poseAt(this.models[pm.conn.to], pm.conn.exitS + (d - rem), this.pose);
      return;
    }
    if (v.plan >= 0) {
      const conn = this.models[v.plan];
      const ci = conn.conn as ConnectorInfo;
      const toEntry = v.planEntryS - v.s;
      if (d <= toEntry) {
        poseAt(pm, v.s + d, this.pose);
      } else {
        const d2 = d - toEntry;
        if (d2 <= conn.length) poseAt(conn, d2, this.pose);
        else poseAt(this.models[ci.to], ci.exitS + (d2 - conn.length), this.pose);
      }
      return;
    }
    poseAt(pm, Math.min(v.s + d, pm.length), this.pose);
  }

  /** Arc length on the vehicle's own model that matches a point d metres ahead on its route (the stop limit). */
  private limitAlong(pm: PathModel, v: Vehicle, d: number): number {
    if (pm.conn) return v.s + Math.min(d, Math.max(0, pm.length - v.s - 0.01));
    if (v.plan >= 0 && d > v.planEntryS - v.s) return Math.max(v.s, v.planEntryS - 0.1);
    return v.s + d;
  }

  /** Fills this.sweep with the vehicle's footprint at points along its path ahead. Returns how many. */
  private buildSweep(pm: PathModel, v: Vehicle, foot: { length: number; width: number }, reach: number): number {
    let n = 0;
    const own = this.ownBox;
    own.x = v.x;
    own.z = v.z;
    own.heading = v.heading;
    own.halfLength = foot.length / 2;
    own.halfWidth = foot.width / 2;
    for (let d = 0; d <= reach; d += SWEEP_STEP) {
      this.routePose(pm, v, d);
      let box = this.sweep[n];
      if (!box) {
        box = { x: 0, z: 0, heading: 0, halfLength: 0, halfWidth: 0 };
        this.sweep[n] = box;
      }
      box.x = this.pose.x;
      box.z = this.pose.z;
      // The vehicle's own (smoothed) heading is used where it stands; the path tangent further ahead.
      box.heading = d === 0 ? v.heading : this.pose.heading;
      box.halfLength = foot.length / 2 + END_MARGIN;
      box.halfWidth = foot.width / 2 + SIDE_MARGIN;
      this.sweepD[n] = d;
      n++;
    }
    return n;
  }

  private trySpawns(dt: number): void {
    for (let pi = 0; pi < this.models.length; pi++) {
      const pm = this.models[pi];
      for (let k = 0; k < pm.spawns.length; k++) {
        const sp = pm.spawns[k];
        sp.timer -= dt;
        if (sp.timer > 0) continue;
        sp.timer = (SPAWN_MIN_S + this.rng() * (SPAWN_MAX_S - SPAWN_MIN_S)) / Math.max(0.25, this.multiplier);
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
    // Spawn points can lie inside a junction: never appear there, on top of the crossing traffic.
    const foot = CLASS_FOOTPRINT[cls];
    poseAt(pm, s, this.pose);
    if (this.junctionAt(this.pose.x, this.pose.z) >= 0) return false;
    const box = this.ownBox;
    box.x = this.pose.x;
    box.z = this.pose.z;
    box.heading = this.pose.heading;
    box.halfLength = foot.length / 2 + END_MARGIN + 1;
    box.halfWidth = foot.width / 2 + SIDE_MARGIN;
    const b = this.otherBox;
    for (let mi = 0; mi < this.models.length; mi++) {
      const other = this.models[mi];
      if (other === pm) continue;
      for (let k = 0; k < other.list.length; k++) {
        const w = other.list[k];
        if (Math.abs(w.x - box.x) > 30 || Math.abs(w.z - box.z) > 30) continue;
        const wf = VARIANT_FOOTPRINT[w.variant] ?? VARIANT_FOOTPRINT[0];
        b.x = w.x;
        b.z = w.z;
        b.heading = w.heading;
        b.halfLength = wf.length / 2;
        b.halfWidth = wf.width / 2;
        if (obbOverlap(box, b)) return false;
      }
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

/** Largest footprint of each class, for checking a spawn point before the variant is chosen. */
const CLASS_FOOTPRINT: Record<VehicleClass, { length: number; width: number }> = {
  car: VARIANT_FOOTPRINT[5],
  bus: VARIANT_FOOTPRINT[6],
  truck: VARIANT_FOOTPRINT[7],
  motorbike: VARIANT_FOOTPRINT[8],
};

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
/** Adds a point `ext` metres beyond each end of the polyline, in the direction the path is heading. */
/** Extends a polyline by extStart before its first point and extEnd after its last (0 leaves that end as is). */
function extendWaypoints(w: readonly Vec2[], extStart: number, extEnd: number): Vec2[] {
  if (w.length < 2 || (!(extStart > 0) && !(extEnd > 0))) return w.slice();
  const first = w[0];
  const second = w[1];
  const last = w[w.length - 1];
  const before = w[w.length - 2];
  const l0 = Math.hypot(first.x - second.x, first.z - second.z) || 1;
  const l1 = Math.hypot(last.x - before.x, last.z - before.z) || 1;
  const out: Vec2[] = [];
  if (extStart > 0) out.push({ x: first.x + ((first.x - second.x) / l0) * extStart, z: first.z + ((first.z - second.z) / l0) * extStart });
  out.push(...w);
  if (extEnd > 0) out.push({ x: last.x + ((last.x - before.x) / l1) * extEnd, z: last.z + ((last.z - before.z) / l1) * extEnd });
  return out;
}

/**
 * Which ends of each lane path are open. An end is open when it lies on the outermost junction of its line (the
 * town grid's first or last cross street), so the road goes on to the map edge. A block merge cuts a street at an
 * inner junction: that end is closed. Without merges every end is open.
 */
function pathOpenness(layout: CityLayout, orientation: ReadonlyMap<string, 'horizontal' | 'vertical'>): Map<TrafficPath, { start: boolean; end: boolean }> {
  const ext = { vertical: { min: Infinity, max: -Infinity }, horizontal: { min: Infinity, max: -Infinity } };
  const along = (p: Vec2, o: 'horizontal' | 'vertical'): number => (o === 'vertical' ? p.z : p.x);
  for (const path of layout.trafficPaths) {
    if (path.waypoints.length < 2) continue;
    const o = orientation.get(path.roadId) ?? 'vertical';
    for (const p of [path.waypoints[0], path.waypoints[path.waypoints.length - 1]]) {
      ext[o].min = Math.min(ext[o].min, along(p, o));
      ext[o].max = Math.max(ext[o].max, along(p, o));
    }
  }
  const out = new Map<TrafficPath, { start: boolean; end: boolean }>();
  for (const path of layout.trafficPaths) {
    if (path.waypoints.length < 2) continue;
    const o = orientation.get(path.roadId) ?? 'vertical';
    const atEdge = (p: Vec2): boolean => Math.abs(along(p, o) - ext[o].min) < 1e-6 || Math.abs(along(p, o) - ext[o].max) < 1e-6;
    out.set(path, { start: atEdge(path.waypoints[0]), end: atEdge(path.waypoints[path.waypoints.length - 1]) });
  }
  return out;
}

/** Arm bit for a heading (atan2(dirX, dirZ), 0 = +Z): 1 north (+Z), 2 east (+X), 4 south, 8 west. */
function armBit(heading: number): number {
  const h = wrapAngle(heading);
  if (Math.abs(h) <= Math.PI / 4) return 1;
  if (h > Math.PI / 4 && h < (3 * Math.PI) / 4) return 2;
  if (h < -Math.PI / 4 && h > (-3 * Math.PI) / 4) return 8;
  return 4;
}

function projectArc(points: readonly Vec2[], cum: readonly number[], p: Vec2): number {
  return projectArcDist(points, cum, p).s;
}

/** Arc length of the point on the polyline nearest to p, and the distance from p to that point. */
function projectArcDist(points: readonly Vec2[], cum: readonly number[], p: Vec2): { s: number; d: number } {
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
  return { s: bestS, d: Math.sqrt(best) };
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
