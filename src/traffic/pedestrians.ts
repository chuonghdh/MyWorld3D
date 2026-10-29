// Pedestrian simulation: a graph walk over the sidewalks with signal-aware crossings and idle behaviours.
// Plain logic only, no Three.js. All per-walker state lives in typed arrays and the render structs are
// pooled, so update() and getPedestrians() allocate nothing per frame.
//
// Graph: every crosswalk contributes a crossing edge between its two sidewalk-side end nodes (the corner
// nodes). Sidewalk edges join consecutive corner nodes along each road side (the stretch that would run
// through a perpendicular road is replaced by the crossing edge). At each node a walker continues, turns
// or crosses. Crossing rules: walkers wait 1 m before the curb while the car phase of the road they want
// to cross is not red, and start only when the remaining red time covers the whole crossing plus a margin.
//
// Behaviours: walk, wait at the curb, look at a shop window, chat (pairs), sit on a bench, enter a door
// and vanish for a while, couples and parent+child pairs, dogs on a leash. Density follows the street
// hierarchy (avenues busier), the time of day (rush hours, quiet nights) and trafficMultiplier.

import type { CityLayout } from '../city/layout';
import type { Vec2 } from '../core/types';
import { createRng } from '../core/rng';
import type { TrafficLightController } from './lights';

// --- Public render types -------------------------------------------------------------------------------

/** Pose ids written to PedestrianRender.pose. */
export const POSE_WALK = 0;
export const POSE_STAND = 1;
export const POSE_CHAT = 2;
export const POSE_SIT = 3;

/** Bit flags for PedestrianRender.traits (what the person owns; the mesh decides what is worn per season). */
export const TRAIT_HAT = 1;
export const TRAIT_SCARF = 2;
export const TRAIT_BAG = 4;
export const TRAIT_SHORTS = 8;
export const TRAIT_SHORT_SLEEVES = 16;
export const TRAIT_BEARD = 128;
export const TRAIT_MOUSTACHE = 256;
/** Patterned top (one of the four patterns; see outfit.ts). */
export const TRAIT_DOTS = 512;
export const TRAIT_HEARTS = 1024;
export const TRAIT_HSTRIPES = 2048;
export const TRAIT_VSTRIPES = 4096;
export const TRAIT_CHECKS = 8192;
export const TRAIT_DIAGONAL = 16384;
/** The six pattern traits, for picking one at random. */
const PATTERN_TRAITS = [TRAIT_DOTS, TRAIT_HEARTS, TRAIT_HSTRIPES, TRAIT_VSTRIPES, TRAIT_CHECKS, TRAIT_DIAGONAL];
/** Hair styles that count as long for women: to the shoulders, to the waist, long bob, pigtails. */
const LONG_FEMALE_STYLES = [4, 8, 7, 9];
/** Hair styles that count as short for women (crop, side parting, curly, ponytail, bun). */
const SHORT_FEMALE_STYLES = [0, 1, 2, 5, 6];

/** Age groups written to PedestrianRender.body (the mesh index). */
export const BODY_ADULT = 0;
export const BODY_CHILD = 1;
export const BODY_ELDER = 2;
export const BODY_TEEN = 3;
/** Number of hair styles written to PedestrianRender.hairStyle (see personGeometry.ts). */
export const HAIR_STYLE_COUNT = 10;

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

/** Hard caps: walkers plus dogs never exceed 600 rendered instances. */
export const MAX_WALKERS = 480;
export const MAX_DOGS = 120;
/** Walkers per road segment at trafficMultiplier 1 at full density. */
const WALKERS_PER_ROAD = 22;

const SIDEWALK_Y = 0.15;
const WAIT_DIST = 0.45; // metres from the corner node where walkers wait (1 m before the curb on a 3 m sidewalk)
const CROSS_MARGIN = 2.0; // seconds of red that must remain after a crossing is finished
const GIVE_UP_WAIT = 150; // seconds after which a waiting walker turns back
const DOG_CHANCE = 0.22;
const PAIR_CHANCE = 0.2;
const TURN_RATE = 7; // rad/s

const S_WALK = 0;
const S_WAIT = 1;
const S_LOOK = 2;
const S_CHAT = 3;
const S_SIT = 4;
const S_MOVE = 5;
const S_HIDDEN = 6;

const N_WALK = 0;
const N_LOOK = 1;
const N_SIT = 2;
const N_HIDE = 3;

/** Piecewise-linear crowd density over the day: [hour, density 0..1]. */
const DENSITY_CURVE: readonly (readonly [number, number])[] = [
  [0, 0.08],
  [5, 0.08],
  [6, 0.22],
  [7, 0.45],
  [8.5, 1],
  [9.5, 0.7],
  [12, 0.82],
  [13.5, 0.74],
  [16.5, 0.8],
  [17.5, 1],
  [19, 0.95],
  [21, 0.85],
  [22, 0.7],
  [23, 0.1],
  [24, 0.08],
];

/** Crowd density 0..1 for an hour of the day (rush hours around 8:30 and 17:30, quiet at night). */
export function crowdDensityAt(hour: number): number {
  let h = hour % 24;
  if (h < 0) h += 24;
  for (let i = 1; i < DENSITY_CURVE.length; i++) {
    const [h1, d1] = DENSITY_CURVE[i];
    if (h <= h1) {
      const [h0, d0] = DENSITY_CURVE[i - 1];
      return d0 + ((d1 - d0) * (h - h0)) / (h1 - h0);
    }
  }
  return DENSITY_CURVE[DENSITY_CURVE.length - 1][1];
}

/** Seconds of red left for cars of one axis (0 = ns, 1 = ew) before their green starts, or -1 when not red. */
export function redRemaining(cycle: number, nsGreen: number, ewGreen: number, yellow: number, axis: number, t: number, allRed = 0): number {
  if (!(cycle > 0)) return -1;
  let u = t % cycle;
  if (u < 0) u += cycle;
  const start = axis === 0 ? 0 : nsGreen + yellow + allRed;
  const yellowEnd = start + (axis === 0 ? nsGreen : ewGreen) + yellow;
  if (u >= yellowEnd) return cycle - u + start;
  if (u < start) return start - u;
  return -1;
}

// --- Graph ---------------------------------------------------------------------------------------------

interface Graph {
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

interface RoadRects {
  minX: Float32Array;
  maxX: Float32Array;
  minZ: Float32Array;
  maxZ: Float32Array;
  count: number;
}

function buildRoadRects(layout: CityLayout): RoadRects {
  const n = layout.roads.length;
  const r: RoadRects = { minX: new Float32Array(n), maxX: new Float32Array(n), minZ: new Float32Array(n), maxZ: new Float32Array(n), count: n };
  layout.roads.forEach((road, i) => {
    const hw = road.width / 2;
    if (road.orientation === 'vertical') {
      r.minX[i] = road.start.x - hw;
      r.maxX[i] = road.start.x + hw;
      r.minZ[i] = Math.min(road.start.z, road.end.z);
      r.maxZ[i] = Math.max(road.start.z, road.end.z);
    } else {
      r.minX[i] = Math.min(road.start.x, road.end.x);
      r.maxX[i] = Math.max(road.start.x, road.end.x);
      r.minZ[i] = road.start.z - hw;
      r.maxZ[i] = road.start.z + hw;
    }
  });
  return r;
}

function inRoad(r: RoadRects, x: number, z: number, tol: number): boolean {
  for (let i = 0; i < r.count; i++) {
    if (x > r.minX[i] + tol && x < r.maxX[i] - tol && z > r.minZ[i] + tol && z < r.maxZ[i] - tol) return true;
  }
  return false;
}

function buildGraph(layout: CityLayout, rects: RoadRects): Graph {
  const nodeIndex = new Map<string, number>();
  const nodeX: number[] = [];
  const nodeZ: number[] = [];
  const nodeOf = (x: number, z: number): number => {
    const key = Math.round(x * 20) + ',' + Math.round(z * 20);
    let id = nodeIndex.get(key);
    if (id === undefined) {
      id = nodeX.length;
      nodeIndex.set(key, id);
      nodeX.push(x);
      nodeZ.push(z);
    }
    return id;
  };

  interface E {
    a: number;
    b: number;
    cross: boolean;
    weight: number;
    curb: number;
    inx: number;
    inz: number;
    light: number;
    axis: number;
  }
  const edges: E[] = [];
  const edgeKeys = new Set<string>();
  const addEdge = (e: E): void => {
    if (e.a === e.b) return;
    const key = Math.min(e.a, e.b) + '-' + Math.max(e.a, e.b);
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push(e);
  };

  const lights = layout.trafficLights;
  const nearestLight = (x: number, z: number): number => {
    let best = -1;
    let bestD = 15;
    for (let i = 0; i < lights.length; i++) {
      const d = Math.hypot(lights[i].position.x - x, lights[i].position.z - z);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  };

  // 1. Crossing edges from the crosswalks.
  const crossNodes = new Set<number>();
  for (const c of layout.crosswalks) {
    const alongX = c.orientation === 'horizontal'; // walkers walk along X, so they cross a vertical road
    let sw = 3;
    let streetClass = 'street';
    for (const road of layout.roads) {
      const matches =
        alongX
          ? road.orientation === 'vertical' &&
            Math.abs(road.start.x - c.center.x) < 0.5 &&
            c.center.z >= Math.min(road.start.z, road.end.z) - 0.5 &&
            c.center.z <= Math.max(road.start.z, road.end.z) + 0.5
          : road.orientation === 'horizontal' &&
            Math.abs(road.start.z - c.center.z) < 0.5 &&
            c.center.x >= Math.min(road.start.x, road.end.x) - 0.5 &&
            c.center.x <= Math.max(road.start.x, road.end.x) + 0.5;
      if (matches) {
        sw = road.sidewalkWidth || 3;
        streetClass = road.streetClass;
        break;
      }
    }
    const h = c.length / 2 + sw / 2;
    const ax = alongX ? c.center.x - h : c.center.x;
    const az = alongX ? c.center.z : c.center.z - h;
    const bx = alongX ? c.center.x + h : c.center.x;
    const bz = alongX ? c.center.z : c.center.z + h;
    const a = nodeOf(ax, az);
    const b = nodeOf(bx, bz);
    crossNodes.add(a);
    crossNodes.add(b);
    addEdge({
      a,
      b,
      cross: true,
      weight: streetClass === 'avenue' ? 1.3 : 1,
      curb: sw / 2,
      inx: 0,
      inz: 0,
      light: nearestLight(c.center.x, c.center.z),
      axis: alongX ? 0 : 1,
    });
  }

  // 2. Sidewalk edges along each road side, between the crossing end nodes lying on that line.
  const nodeList = [...crossNodes];
  for (const road of layout.roads) {
    const vertical = road.orientation === 'vertical';
    const sw = road.sidewalkWidth || 3;
    const off = road.width / 2 + sw / 2;
    const lo = vertical ? Math.min(road.start.z, road.end.z) : Math.min(road.start.x, road.end.x);
    const hi = vertical ? Math.max(road.start.z, road.end.z) : Math.max(road.start.x, road.end.x);
    for (const side of [1, -1]) {
      const line = (vertical ? road.start.x : road.start.z) + side * off;
      const on: number[] = [];
      for (const n of nodeList) {
        const perp = vertical ? nodeX[n] : nodeZ[n];
        const along = vertical ? nodeZ[n] : nodeX[n];
        if (Math.abs(perp - line) < 0.05 && along >= lo - 0.05 && along <= hi + 0.05) on.push(n);
      }
      on.sort((p, q) => (vertical ? nodeZ[p] - nodeZ[q] : nodeX[p] - nodeX[q]));
      // Extend to the road ends when they are well beyond the last crossing (short corner stubs are left out).
      const alongOf = (n: number): number => (vertical ? nodeZ[n] : nodeX[n]);
      if (on.length === 0 || alongOf(on[0]) - lo > 6) on.unshift(nodeOf(vertical ? line : lo, vertical ? lo : line));
      if (on.length === 1 || hi - alongOf(on[on.length - 1]) > 6) on.push(nodeOf(vertical ? line : hi, vertical ? hi : line));
      const inx = vertical ? side : 0;
      const inz = vertical ? 0 : side;
      for (let i = 0; i + 1 < on.length; i++) {
        const p = on[i];
        const q = on[i + 1];
        const mx = (nodeX[p] + nodeX[q]) / 2;
        const mz = (nodeZ[p] + nodeZ[q]) / 2;
        if (Math.hypot(nodeX[q] - nodeX[p], nodeZ[q] - nodeZ[p]) < 0.5) continue;
        if (inRoad(rects, mx, mz, 0.3)) continue; // this stretch is a crossing
        addEdge({
          a: p,
          b: q,
          cross: false,
          weight: road.streetClass === 'avenue' ? 2.2 : 1,
          curb: sw / 2,
          inx,
          inz,
          light: -1,
          axis: 0,
        });
      }
    }
  }

  // 3. Pack into typed arrays.
  const E = edges.length;
  const N = nodeX.length;
  const g: Graph = {
    nodeCount: N,
    nodeStart: new Int32Array(N + 1),
    nodeEdges: new Int32Array(E * 2),
    edgeCount: E,
    ax: new Float32Array(E),
    az: new Float32Array(E),
    bx: new Float32Array(E),
    bz: new Float32Array(E),
    len: new Float32Array(E),
    dx: new Float32Array(E),
    dz: new Float32Array(E),
    inx: new Float32Array(E),
    inz: new Float32Array(E),
    nodeA: new Int32Array(E),
    nodeB: new Int32Array(E),
    cross: new Uint8Array(E),
    build: new Uint8Array(E),
    weight: new Float32Array(E),
    curb: new Float32Array(E),
    ctl: new Uint8Array(E),
    axis: new Uint8Array(E),
    cycle: new Float32Array(E),
    nsG: new Float32Array(E),
    ewG: new Float32Array(E),
    allR: new Float32Array(E),
    yel: new Float32Array(E),
    spawnCum: new Float32Array(E),
    spawnTotal: 0,
  };
  const tb = layout.townBounds;
  const degree = new Int32Array(N);
  let cum = 0;
  for (let i = 0; i < E; i++) {
    const e = edges[i];
    g.nodeA[i] = e.a;
    g.nodeB[i] = e.b;
    g.ax[i] = nodeX[e.a];
    g.az[i] = nodeZ[e.a];
    g.bx[i] = nodeX[e.b];
    g.bz[i] = nodeZ[e.b];
    const ddx = g.bx[i] - g.ax[i];
    const ddz = g.bz[i] - g.az[i];
    const L = Math.hypot(ddx, ddz);
    g.len[i] = L;
    g.dx[i] = ddx / L;
    g.dz[i] = ddz / L;
    g.inx[i] = e.inx;
    g.inz[i] = e.inz;
    g.cross[i] = e.cross ? 1 : 0;
    g.weight[i] = e.weight;
    g.curb[i] = e.curb;
    if (!e.cross) {
      const mx = (g.ax[i] + g.bx[i]) / 2 + e.inx * 3.5;
      const mz = (g.az[i] + g.bz[i]) / 2 + e.inz * 3.5;
      g.build[i] = mx > tb.minX + 7 && mx < tb.maxX - 7 && mz > tb.minZ + 7 && mz < tb.maxZ - 7 ? 1 : 0;
      cum += L * e.weight;
    }
    g.spawnCum[i] = cum;
    if (e.cross && e.light >= 0) {
      const t = lights[e.light].timing;
      if (t.cycleSeconds > 0) {
        g.ctl[i] = 1;
        g.axis[i] = e.axis;
        g.cycle[i] = t.cycleSeconds;
        g.nsG[i] = t.nsGreenSeconds;
        g.ewG[i] = t.ewGreenSeconds;
        g.yel[i] = t.yellowSeconds;
        g.allR[i] = t.allRedSeconds ?? 0;
      }
    }
    degree[e.a]++;
    degree[e.b]++;
  }
  g.spawnTotal = cum;
  for (let n = 0; n < N; n++) g.nodeStart[n + 1] = g.nodeStart[n] + degree[n];
  const fill = new Int32Array(N);
  for (let i = 0; i < E; i++) {
    const a = g.nodeA[i];
    const b = g.nodeB[i];
    g.nodeEdges[g.nodeStart[a] + fill[a]++] = i;
    g.nodeEdges[g.nodeStart[b] + fill[b]++] = i;
  }
  return g;
}

// --- Simulation ----------------------------------------------------------------------------------------

export class Pedestrians {
  private readonly layout: CityLayout;
  private readonly g: Graph;
  private readonly rects: RoadRects;
  private readonly rng: () => number;
  private readonly lights: TrafficLightController | null;
  private multiplier: number;
  private cap = 0;
  private time = 0;
  private density: number;
  private rain = 0;
  private speedMul = 1;

  // Per-slot state (struct of arrays).
  private readonly state = new Uint8Array(MAX_WALKERS);
  private readonly next = new Uint8Array(MAX_WALKERS);
  private readonly edge = new Int32Array(MAX_WALKERS);
  private readonly dirv = new Int8Array(MAX_WALKERS);
  private readonly S = new Float32Array(MAX_WALKERS);
  private readonly speed = new Float32Array(MAX_WALKERS);
  private readonly lat = new Float32Array(MAX_WALKERS);
  private readonly px = new Float32Array(MAX_WALKERS);
  private readonly pz = new Float32Array(MAX_WALKERS);
  private readonly cx = new Float32Array(MAX_WALKERS);
  private readonly cz = new Float32Array(MAX_WALKERS);
  private readonly hd = new Float32Array(MAX_WALKERS);
  private readonly faceTo = new Float32Array(MAX_WALKERS);
  private readonly timer = new Float32Array(MAX_WALKERS);
  private readonly idleTimer = new Float32Array(MAX_WALKERS);
  private readonly tx = new Float32Array(MAX_WALKERS);
  private readonly tz = new Float32Array(MAX_WALKERS);
  private readonly doorX = new Float32Array(MAX_WALKERS);
  private readonly doorZ = new Float32Array(MAX_WALKERS);
  private readonly committed = new Uint8Array(MAX_WALKERS);
  private readonly bench = new Int16Array(MAX_WALKERS);
  private readonly body = new Uint8Array(MAX_WALKERS);
  private readonly female = new Uint8Array(MAX_WALKERS);
  private readonly hairStyle = new Uint8Array(MAX_WALKERS);
  private readonly top = new Uint8Array(MAX_WALKERS);
  private readonly pants = new Uint8Array(MAX_WALKERS);
  private readonly hair = new Uint8Array(MAX_WALKERS);
  private readonly skin = new Uint8Array(MAX_WALKERS);
  private readonly accent = new Uint8Array(MAX_WALKERS);
  private readonly traits = new Uint16Array(MAX_WALKERS);
  private readonly phase = new Float32Array(MAX_WALKERS);
  private readonly rank = new Float32Array(MAX_WALKERS);
  private readonly scale = new Float32Array(MAX_WALKERS);
  private readonly leader = new Int16Array(MAX_WALKERS);
  private readonly follower = new Int16Array(MAX_WALKERS);
  private readonly dogIndex = new Int16Array(MAX_WALKERS);
  private readonly dogSide = new Int8Array(MAX_WALKERS);
  private readonly ids = new Int32Array(MAX_WALKERS);

  // Resolved output per slot.
  private readonly vis = new Uint8Array(MAX_WALKERS);
  private readonly ox = new Float32Array(MAX_WALKERS);
  private readonly oz = new Float32Array(MAX_WALKERS);
  private readonly oy = new Float32Array(MAX_WALKERS);
  private readonly oh = new Float32Array(MAX_WALKERS);
  private readonly opose = new Uint8Array(MAX_WALKERS);
  private readonly ospeed = new Float32Array(MAX_WALKERS);

  // Dogs.
  private readonly dogPhase = new Float32Array(MAX_DOGS);
  private readonly dogCoat = new Uint8Array(MAX_DOGS);
  private readonly dogX = new Float32Array(MAX_DOGS);
  private readonly dogZ = new Float32Array(MAX_DOGS);
  private readonly dogH = new Float32Array(MAX_DOGS);
  private readonly dogSpeed = new Float32Array(MAX_DOGS);
  private readonly handX = new Float32Array(MAX_DOGS);
  private readonly handZ = new Float32Array(MAX_DOGS);
  private readonly dogOwner = new Int16Array(MAX_DOGS);

  private readonly benchX: Float32Array;
  private readonly benchZ: Float32Array;
  private readonly benchF: Float32Array;
  private readonly benchOcc: Int16Array;

  private readonly pool: PedestrianRender[] = [];
  private readonly out: PedestrianRender[] = [];
  private readonly boundMinX: number;
  private readonly boundMaxX: number;
  private readonly boundMinZ: number;
  private readonly boundMaxZ: number;
  private visibleCount = 0;
  private readonly statsData: PedestrianStats = { crossings: 0, chats: 0, sits: 0, looks: 0, doors: 0, waits: 0 };
  private readonly behaviour = { walking: 0, crossing: 0, waiting: 0, looking: 0, chatting: 0, sitting: 0, moving: 0, hidden: 0 };

  constructor(layout: CityLayout, options: PedestriansOptions) {
    this.layout = layout;
    this.multiplier = Math.max(0, options.trafficMultiplier);
    this.rng = createRng(options.seed ?? 7);
    this.lights = options.lights ?? null;
    this.rects = buildRoadRects(layout);
    this.g = buildGraph(layout, this.rects);
    this.density = crowdDensityAt(options.timeOfDay ?? 12);
    const tb = layout.townBounds;
    this.boundMinX = tb.minX + 0.08;
    this.boundMaxX = tb.maxX - 0.08;
    this.boundMinZ = tb.minZ + 0.08;
    this.boundMaxZ = tb.maxZ - 0.08;

    const B = layout.benches.length;
    this.benchX = new Float32Array(B);
    this.benchZ = new Float32Array(B);
    this.benchF = new Float32Array(B);
    this.benchOcc = new Int16Array(B).fill(-1);
    layout.benches.forEach((b, i) => {
      this.benchX[i] = b.position.x;
      this.benchZ[i] = b.position.z;
      this.benchF[i] = b.facing;
    });

    this.leader.fill(-1);
    this.follower.fill(-1);
    this.dogIndex.fill(-1);
    this.bench.fill(-1);
    for (let i = 0; i < MAX_WALKERS; i++) {
      this.pool.push({
        id: 0,
        position: { x: 0, z: 0 },
        y: SIDEWALK_Y,
        heading: 0,
        dog: null,
        body: 0,
        female: 0,
        hairStyle: 0,
        top: 0,
        pants: 0,
        hair: 0,
        skin: 0,
        accent: 0,
        traits: 0,
        pose: 0,
        speed: 0,
        phase: 0,
        umbrellaRank: 0,
        scale: 1,
      });
    }
    this.dogPool = [];
    for (let i = 0; i < MAX_DOGS; i++) {
      this.dogPool.push({ position: { x: 0, z: 0 }, heading: 0, phase: 0, speed: 0, coat: 0, leashHand: { x: 0, z: 0 } });
    }

    if (this.g.edgeCount > 0 && this.g.spawnTotal > 0) {
      this.createPeople();
      this.setCap();
      this.populateInitial();
    }
  }

  private readonly dogPool: DogRender[];

  /** Maximum number of walkers at the current multiplier (full density; the time of day thins the crowd). */
  get capacity(): number {
    return this.cap;
  }

  /** Number of walkers currently visible (not hidden inside a door or off duty). */
  get count(): number {
    return this.visibleCount;
  }

  /** Number of visible dogs. */
  get dogsVisible(): number {
    let n = 0;
    for (let i = 0; i < this.cap; i++) if (this.vis[i] === 1 && this.dogIndex[i] >= 0) n++;
    return n;
  }

  get stats(): Readonly<PedestrianStats> {
    return this.statsData;
  }

  /** Current crowd density factor 0..1 from the time of day. */
  get crowdDensity(): number {
    return this.density;
  }

  /** Live counts per behaviour (reused object, refreshed by update()). */
  get behaviours(): Readonly<{ walking: number; crossing: number; waiting: number; looking: number; chatting: number; sitting: number; moving: number; hidden: number }> {
    return this.behaviour;
  }

  setTrafficMultiplier(m: number): void {
    this.multiplier = Math.max(0, m);
    if (this.g.edgeCount > 0) this.setCap();
  }

  // --- Setup -------------------------------------------------------------------------------------------

  private createPeople(): void {
    const rng = this.rng;
    let nextId = 1;
    let dogs = 0;
    const setLook = (i: number, age: number, female: number): void => {
      this.body[i] = age;
      this.female[i] = female;
      this.top[i] = Math.floor(rng() * 16);
      this.pants[i] = Math.floor(rng() * 12);
      const hairRoll = rng();
      if (age === BODY_ELDER) {
        // Most elders have grey or white hair.
        this.hair[i] = hairRoll < 0.75 ? GREY_HAIR[Math.floor(rng() * GREY_HAIR.length)] : Math.floor(rng() * 6);
      } else if (age === BODY_ADULT) {
        this.hair[i] = Math.floor(hairRoll * 10);
      } else {
        // Children and teens: natural tones only.
        this.hair[i] = Math.floor(hairRoll * 6);
      }
      this.hairStyle[i] = hairStyleFor(age, female, rng());
      this.skin[i] = Math.floor(rng() * 8);
      this.accent[i] = Math.floor(rng() * 12);
      let t = 0;
      if (rng() < 0.25) t |= TRAIT_HAT;
      if (rng() < 0.65) t |= TRAIT_SCARF;
      if (rng() < (age === BODY_CHILD ? 0.85 : 0.45)) t |= TRAIT_BAG;
      if (rng() < (age === BODY_CHILD ? 0.7 : age === BODY_TEEN ? 0.4 : 0.5)) t |= TRAIT_SHORTS;
      if (rng() < 0.7) t |= TRAIT_SHORT_SLEEVES;
      if (!female && (age === BODY_ADULT || age === BODY_ELDER)) {
        if (rng() < (age === BODY_ELDER ? 0.45 : 0.25)) t |= TRAIT_BEARD;
        if (rng() < (age === BODY_ELDER ? 0.3 : 0.15)) t |= TRAIT_MOUSTACHE;
      }
      // Patterned tops for 70 percent of walkers (men and women), one of six patterns.
      if (rng() < 0.7) t |= PATTERN_TRAITS[Math.min(PATTERN_TRAITS.length - 1, Math.floor(rng() * PATTERN_TRAITS.length))];
      this.traits[i] = t;
      this.phase[i] = rng() * Math.PI * 2;
      this.rank[i] = rng();
      this.scale[i] = 0.95 + rng() * 0.1;
      this.ids[i] = nextId++;
      this.lat[i] = (rng() - 0.5) * 1.5;
      this.hd[i] = rng() * Math.PI * 2;
      this.idleTimer[i] = 6 + rng() * 60;
      this.speed[i] = speedFor(age, female, rng());
      this.state[i] = S_HIDDEN;
      this.timer[i] = 0;
    };
    const addDog = (owner: number, side: number): void => {
      if (dogs >= MAX_DOGS) return;
      this.dogIndex[owner] = dogs;
      this.dogSide[owner] = side;
      this.dogOwner[dogs] = owner;
      this.dogPhase[dogs] = rng() * Math.PI * 2;
      this.dogCoat[dogs] = Math.floor(rng() * 5);
      dogs++;
    };

    let i = 0;
    while (i < MAX_WALKERS) {
      if (i + 1 < MAX_WALKERS && rng() < PAIR_CHANCE) {
        // Pairs: elder couple, adult couple (opposite sexes), parent and child, parent and teen, two teens.
        const kind = rng();
        const couple = kind < 0.5;
        const leadBody = kind < 0.2 ? BODY_ELDER : kind < 0.85 ? BODY_ADULT : BODY_TEEN;
        const followBody = kind < 0.2 ? BODY_ELDER : kind < 0.5 ? BODY_ADULT : kind < 0.7 ? BODY_CHILD : BODY_TEEN;
        const leadFemale = rng() < 0.5 ? 1 : 0;
        const followFemale = couple ? 1 - leadFemale : rng() < 0.5 ? 1 : 0;
        setLook(i, leadBody, leadFemale);
        setLook(i + 1, followBody, followFemale);
        this.follower[i] = i + 1;
        this.leader[i + 1] = i;
        // The adult waits for a child, so the pair walks at the child's own pace (the child's wobble is render only).
        if (followBody === BODY_CHILD) this.speed[i] = this.speed[i + 1];
        else this.speed[i + 1] = this.speed[i];
        this.rank[i + 1] = this.rank[i];
        this.lat[i] = -0.35;
        this.lat[i + 1] = 0.35;
        if (rng() < DOG_CHANCE) addDog(i, -1);
        i += 2;
      } else {
        const r = rng();
        setLook(i, r < 0.7 ? BODY_ADULT : r < 0.8 ? BODY_TEEN : BODY_ELDER, rng() < 0.5 ? 1 : 0);
        if (rng() < DOG_CHANCE) addDog(i, this.lat[i] > 0 ? -1 : 1);
        i += 1;
      }
    }
    for (let k = 0; k < MAX_WALKERS; k++) this.doorFromEdge(k);
  }

  private setCap(): void {
    let cap = Math.min(MAX_WALKERS, Math.floor(this.multiplier * WALKERS_PER_ROAD * this.layout.roads.length));
    // Never split a pair across the cap.
    if (cap > 0 && cap < MAX_WALKERS && this.follower[cap - 1] === cap) cap += 1;
    const old = this.cap;
    this.cap = cap;
    for (let i = cap; i < old; i++) this.vanish(i);
  }

  private vanish(i: number): void {
    if (this.bench[i] >= 0) {
      this.benchOcc[this.bench[i]] = -1;
      this.bench[i] = -1;
    }
    this.state[i] = S_HIDDEN;
    this.timer[i] = 0;
    this.vis[i] = 0;
    this.doorFromEdge(i);
  }

  /** Puts a hidden slot's door on a random building edge. */
  private doorFromEdge(i: number): void {
    const g = this.g;
    const e = this.pickSpawnEdge();
    const s = this.rng() * g.len[e];
    this.edge[i] = e;
    this.S[i] = s;
    this.dirv[i] = this.rng() < 0.5 ? 1 : -1;
    const wall = g.build[e] === 1 ? 1.4 : 0;
    this.doorX[i] = g.ax[e] + g.dx[e] * s + g.inx[e] * wall;
    this.doorZ[i] = g.az[e] + g.dz[e] * s + g.inz[e] * wall;
  }

  private populateInitial(): void {
    for (let i = 0; i < this.cap; i++) {
      if (this.leader[i] >= 0) continue;
      if (!(this.rank[i] < this.density)) {
        this.doorFromEdge(i);
        const f = this.follower[i];
        if (f >= 0) this.doorFromEdge(f);
        continue;
      }
      const e = this.pickSpawnEdge();
      this.edge[i] = e;
      this.S[i] = this.rng() * this.g.len[e];
      this.dirv[i] = this.rng() < 0.5 ? 1 : -1;
      this.state[i] = S_WALK;
      this.committed[i] = 0;
      this.snapToEdge(i);
      const f = this.follower[i];
      if (f >= 0) {
        this.state[f] = S_WALK;
        this.edge[f] = e;
      }
    }
    this.resolve(0.016);
  }

  private pickSpawnEdge(): number {
    const g = this.g;
    const r = this.rng() * g.spawnTotal;
    let lo = 0;
    let hi = g.edgeCount - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (g.spawnCum[mid] >= r) hi = mid;
      else lo = mid + 1;
    }
    // spawnCum is flat across crossing edges; step forward to a real sidewalk edge.
    let e = lo;
    while (e < g.edgeCount && g.cross[e] === 1) e++;
    if (e >= g.edgeCount) {
      e = lo;
      while (e > 0 && g.cross[e] === 1) e--;
    }
    return e;
  }

  // --- Public update -----------------------------------------------------------------------------------

  update(dt: number, env?: PedestrianEnv): void {
    if (!(dt > 0) || this.g.edgeCount === 0) return;
    if (dt > 0.25) dt = 0.25;
    this.time += dt;
    if (env) {
      this.density = crowdDensityAt(env.timeOfDay);
      this.rain = Math.min(1, Math.max(0, env.rain ?? 0));
      this.speedMul = 1 + 0.12 * this.rain;
    }
    const cap = this.cap;
    for (let i = 0; i < cap; i++) {
      if (this.leader[i] >= 0) continue; // followers are resolved from their leader
      this.stepLeader(i, dt);
    }
    this.resolve(dt);
  }

  /** Visible walkers. The returned array and its objects are reused every call. */
  getPedestrians(): PedestrianRender[] {
    const out = this.out;
    let n = 0;
    for (let i = 0; i < this.cap; i++) {
      if (this.vis[i] === 0) continue;
      const r = this.pool[i];
      r.id = this.ids[i];
      r.position.x = this.ox[i];
      r.position.z = this.oz[i];
      r.y = this.oy[i];
      r.heading = this.oh[i];
      r.body = this.body[i];
      r.female = this.female[i];
      r.hairStyle = this.hairStyle[i];
      r.top = this.top[i];
      r.pants = this.pants[i];
      r.hair = this.hair[i];
      r.skin = this.skin[i];
      r.accent = this.accent[i];
      r.traits = this.traits[i];
      r.pose = this.opose[i];
      r.speed = this.ospeed[i];
      r.phase = this.phase[i];
      r.umbrellaRank = this.rank[i];
      r.scale = this.scale[i];
      const d = this.dogIndex[i];
      if (d >= 0) {
        const dr = this.dogPool[d];
        dr.position.x = this.dogX[d];
        dr.position.z = this.dogZ[d];
        dr.heading = this.dogH[d];
        dr.phase = this.dogPhase[d];
        dr.speed = this.dogSpeed[d];
        dr.coat = this.dogCoat[d];
        dr.leashHand.x = this.handX[d];
        dr.leashHand.z = this.handZ[d];
        r.dog = dr;
      } else {
        r.dog = null;
      }
      out[n++] = r;
    }
    out.length = n;
    return out;
  }

  // --- Per-walker logic --------------------------------------------------------------------------------

  private stepLeader(i: number, dt: number): void {
    const g = this.g;
    switch (this.state[i]) {
      case S_WALK: {
        // Off duty: head for the nearest door and stay inside.
        if (!(this.rank[i] < this.density + 0.02)) {
          const e = this.edge[i];
          if (g.cross[e] === 0 && g.build[e] === 1 && this.S[i] > 2 && this.S[i] < g.len[e] - 2) {
            this.startDoor(i, 0);
            return;
          }
        }
        this.stepWalk(i, dt);
        if (this.state[i] === S_WALK && g.cross[this.edge[i]] === 0) {
          this.idleTimer[i] -= dt;
          if (this.idleTimer[i] <= 0) this.tryIdle(i);
        }
        break;
      }
      case S_WAIT: {
        this.timer[i] += dt;
        const e = this.edge[i];
        const sp = Math.max(0.5, this.speed[i] * this.speedMul);
        if (this.crossAllowed(e, g.len[e] / sp)) {
          this.state[i] = S_WALK;
          this.committed[i] = 1;
        } else if (this.timer[i] > GIVE_UP_WAIT) {
          this.dirv[i] = -this.dirv[i] as 1 | -1;
          this.committed[i] = 1;
          this.state[i] = S_WALK;
        }
        this.faceAlong(i);
        this.placeOnEdge(i, dt);
        break;
      }
      case S_LOOK:
      case S_CHAT: {
        this.timer[i] -= dt;
        this.turn(i, this.faceTo[i], dt);
        if (this.timer[i] <= 0) this.startReturn(i);
        break;
      }
      case S_SIT: {
        this.timer[i] -= dt;
        this.turn(i, this.faceTo[i], dt);
        if (this.timer[i] <= 0) {
          this.releaseBench(i);
          this.startReturn(i);
        }
        break;
      }
      case S_MOVE: {
        this.stepMove(i, dt);
        break;
      }
      case S_HIDDEN: {
        this.timer[i] -= dt;
        if (this.timer[i] <= 0 && this.rank[i] < this.density) this.emerge(i);
        break;
      }
      default:
        break;
    }
  }

  private stepWalk(i: number, dt: number): void {
    const g = this.g;
    const e = this.edge[i];
    const dir = this.dirv[i];
    const len = g.len[e];
    const sp = this.speed[i] * this.speedMul;
    const ns = this.S[i] + dir * sp * dt;

    if (g.cross[e] === 1 && this.committed[i] === 0) {
      const p = dir > 0 ? ns : len - ns;
      if (p >= WAIT_DIST) {
        if (this.crossAllowed(e, len / Math.max(0.5, sp))) {
          this.committed[i] = 1;
        } else {
          this.S[i] = dir > 0 ? WAIT_DIST : len - WAIT_DIST;
          this.state[i] = S_WAIT;
          this.timer[i] = 0;
          this.statsData.waits++;
          this.faceAlong(i);
          this.placeOnEdge(i, dt);
          return;
        }
      }
    }

    if (ns < 0 || ns > len) {
      const atB = ns > len;
      const node = atB ? g.nodeB[e] : g.nodeA[e];
      const over = Math.min(atB ? ns - len : -ns, 0.3);
      const wasCross = g.cross[e] === 1;
      const ne = this.chooseNext(i, e, node, dir);
      this.edge[i] = ne;
      const ndir = g.nodeA[ne] === node ? 1 : -1;
      this.dirv[i] = ndir;
      this.S[i] = ndir > 0 ? over : g.len[ne] - over;
      this.committed[i] = 0;
      if (wasCross) this.statsData.crossings++;
      if (g.cross[ne] === 0) this.idleTimer[i] = Math.min(this.idleTimer[i], 40);
    } else {
      this.S[i] = ns;
    }
    this.faceAlong(i);
    this.placeOnEdge(i, dt);
  }

  private faceAlong(i: number): void {
    const g = this.g;
    const e = this.edge[i];
    const d = this.dirv[i];
    this.faceTo[i] = Math.atan2(g.dx[e] * d, g.dz[e] * d);
  }

  private turn(i: number, target: number, dt: number): void {
    let d = target - this.hd[i];
    d -= Math.PI * 2 * Math.round(d / (Math.PI * 2));
    const m = TURN_RATE * dt;
    this.hd[i] += d > m ? m : d < -m ? -m : d;
  }

  /** Writes the on-edge position (without the decaying correction) and turns toward the walking direction. */
  private placeOnEdge(i: number, dt: number): void {
    const g = this.g;
    const e = this.edge[i];
    this.turn(i, this.faceTo[i], dt);
    const h = this.hd[i];
    const lx = Math.cos(h);
    const lz = -Math.sin(h);
    let lat = this.lat[i];
    if (g.cross[e] === 1 && lat > 0.8) lat = 0.8;
    if (g.cross[e] === 1 && lat < -0.8) lat = -0.8;
    const s = this.S[i];
    this.px[i] = g.ax[e] + g.dx[e] * s + lx * lat;
    this.pz[i] = g.az[e] + g.dz[e] * s + lz * lat;
  }

  private snapToEdge(i: number): void {
    this.faceAlong(i);
    this.hd[i] = this.faceTo[i];
    this.placeOnEdge(i, 0);
    this.cx[i] = 0;
    this.cz[i] = 0;
  }

  private crossAllowed(e: number, crossTime: number): boolean {
    const g = this.g;
    if (g.ctl[e] === 0) return true;
    const t = this.lights ? this.lights.elapsed : this.time;
    const rem = redRemaining(g.cycle[e], g.nsG[e], g.ewG[e], g.yel[e], g.axis[e], t, g.allR[e]);
    return rem >= crossTime + CROSS_MARGIN;
  }

  private chooseNext(i: number, e: number, node: number, dir: number): number {
    const g = this.g;
    const start = g.nodeStart[node];
    const end = g.nodeStart[node + 1];
    if (end - start <= 1) return e; // dead end: turn around
    const cdx = g.dx[e] * dir;
    const cdz = g.dz[e] * dir;
    const rainFactor = 1 - 0.5 * this.rain;
    let sum = 0;
    for (let k = start; k < end; k++) sum += this.candidateWeight(g.nodeEdges[k], e, node, cdx, cdz, rainFactor);
    let r = this.rng() * sum;
    let pick = e;
    for (let k = start; k < end; k++) {
      const ee = g.nodeEdges[k];
      const w = this.candidateWeight(ee, e, node, cdx, cdz, rainFactor);
      if (w <= 0) continue;
      pick = ee;
      r -= w;
      if (r <= 0) break;
    }
    void i;
    return pick;
  }

  private candidateWeight(ee: number, cur: number, node: number, cdx: number, cdz: number, rainFactor: number): number {
    if (ee === cur) return 0;
    const g = this.g;
    const sgn = g.nodeA[ee] === node ? 1 : -1;
    const dot = g.dx[ee] * sgn * cdx + g.dz[ee] * sgn * cdz;
    if (g.cross[ee] === 1) return 1.1 * g.weight[ee] * rainFactor;
    if (dot > 0.7) return 3 * g.weight[ee];
    if (dot < -0.7) return 0.05;
    return 1.2 * g.weight[ee];
  }

  // --- Idle behaviours ---------------------------------------------------------------------------------

  private tryIdle(i: number): void {
    const g = this.g;
    const rng = this.rng;
    const e = this.edge[i];
    const len = g.len[e];
    const s = this.S[i];
    if (s < 3.5 || s > len - 3.5) {
      this.idleTimer[i] = 1.5;
      return;
    }
    const hasFollower = this.follower[i] >= 0;
    const rainy = this.rain > 0.3;
    const benchIdx = rainy ? -1 : this.findBench(i);
    const wBench = benchIdx >= 0 ? 0.3 : 0;
    const wLook = g.build[e] === 1 ? 0.25 : 0;
    const wChat = hasFollower ? 0.35 : 0;
    const wDoor = g.build[e] === 1 ? 0.1 + (rainy ? 0.35 : 0) : 0;
    const total = wBench + wLook + wChat + wDoor;
    if (total <= 0) {
      this.idleTimer[i] = 5;
      return;
    }
    let r = rng() * total;
    this.idleTimer[i] = 25 + rng() * 60;
    if ((r -= wBench) < 0) {
      this.startBench(i, benchIdx);
    } else if ((r -= wLook) < 0) {
      this.startLook(i);
    } else if ((r -= wChat) < 0) {
      this.startChat(i);
    } else {
      this.startDoor(i, 15 + rng() * 55);
    }
  }

  private findBench(i: number): number {
    const B = this.benchX.length;
    let best = -1;
    let bestD = 9;
    const x = this.px[i];
    const z = this.pz[i];
    for (let b = 0; b < B; b++) {
      if (this.benchOcc[b] >= 0) continue;
      const d = Math.hypot(this.benchX[b] - x, this.benchZ[b] - z);
      if (d >= bestD) continue;
      if (!this.pathClear(x, z, this.benchX[b], this.benchZ[b])) continue;
      best = b;
      bestD = d;
    }
    return best;
  }

  private pathClear(x0: number, z0: number, x1: number, z1: number): boolean {
    for (let k = 0; k <= 6; k++) {
      const t = k / 6;
      if (inRoad(this.rects, x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, 0.15)) return false;
    }
    return true;
  }

  private startBench(i: number, b: number): void {
    this.benchOcc[b] = i;
    this.bench[i] = b;
    const f = this.benchF[b];
    // Pairs share the bench: the leader takes the right half, the follower the left half.
    const shift = this.follower[i] >= 0 ? -0.4 : 0;
    this.tx[i] = this.benchX[b] + Math.cos(f) * shift;
    this.tz[i] = this.benchZ[b] - Math.sin(f) * shift;
    this.faceTo[i] = f;
    this.next[i] = N_SIT;
    this.state[i] = S_MOVE;
    this.statsData.sits++;
  }

  private releaseBench(i: number): void {
    const b = this.bench[i];
    if (b >= 0) this.benchOcc[b] = -1;
    this.bench[i] = -1;
  }

  private startLook(i: number): void {
    const g = this.g;
    const e = this.edge[i];
    this.tx[i] = this.px[i] + g.inx[e] * (0.5 + this.rng() * 0.3);
    this.tz[i] = this.pz[i] + g.inz[e] * (0.5 + this.rng() * 0.3);
    this.faceTo[i] = Math.atan2(g.inx[e], g.inz[e]);
    this.next[i] = N_LOOK;
    this.state[i] = S_MOVE;
    this.statsData.looks++;
  }

  private startChat(i: number): void {
    this.state[i] = S_CHAT;
    this.timer[i] = 5 + this.rng() * 15;
    this.faceTo[i] = this.hd[i];
    this.statsData.chats++;
  }

  private startDoor(i: number, hideFor: number): void {
    const g = this.g;
    const e = this.edge[i];
    const wall = 1.4;
    this.doorX[i] = g.ax[e] + g.dx[e] * this.S[i] + g.inx[e] * wall;
    this.doorZ[i] = g.az[e] + g.dz[e] * this.S[i] + g.inz[e] * wall;
    this.tx[i] = this.doorX[i];
    this.tz[i] = this.doorZ[i];
    this.faceTo[i] = Math.atan2(g.inx[e], g.inz[e]);
    this.timer[i] = hideFor;
    this.next[i] = N_HIDE;
    this.state[i] = S_MOVE;
    this.statsData.doors++;
  }

  /** Walks from the current spot back to the walking line, then resumes the walk. */
  private startReturn(i: number): void {
    const g = this.g;
    const e = this.edge[i];
    const d = this.dirv[i];
    const wh = Math.atan2(g.dx[e] * d, g.dz[e] * d);
    this.tx[i] = g.ax[e] + g.dx[e] * this.S[i] + Math.cos(wh) * this.lat[i];
    this.tz[i] = g.az[e] + g.dz[e] * this.S[i] - Math.sin(wh) * this.lat[i];
    this.faceTo[i] = wh;
    this.next[i] = N_WALK;
    this.state[i] = S_MOVE;
  }

  private emerge(i: number): void {
    this.px[i] = this.doorX[i];
    this.pz[i] = this.doorZ[i];
    this.cx[i] = 0;
    this.cz[i] = 0;
    this.vis[i] = 1;
    this.committed[i] = 0;
    this.faceAlong(i);
    this.hd[i] = this.faceTo[i];
    this.idleTimer[i] = 15 + this.rng() * 50;
    this.startReturn(i);
    const f = this.follower[i];
    if (f >= 0) this.vis[f] = 1;
  }

  private stepMove(i: number, dt: number): void {
    const dx = this.tx[i] - this.px[i];
    const dz = this.tz[i] - this.pz[i];
    const d = Math.hypot(dx, dz);
    const step = this.speed[i] * 0.8 * dt;
    if (d <= step + 1e-4) {
      this.px[i] = this.tx[i];
      this.pz[i] = this.tz[i];
      this.arrive(i);
      return;
    }
    this.px[i] += (dx / d) * step;
    this.pz[i] += (dz / d) * step;
    this.turn(i, Math.atan2(dx, dz), dt);
  }

  private arrive(i: number): void {
    switch (this.next[i]) {
      case N_WALK: {
        const ox = this.px[i];
        const oz = this.pz[i];
        this.state[i] = S_WALK;
        this.faceAlong(i);
        this.placeOnEdge(i, 0);
        this.cx[i] = ox - this.px[i];
        this.cz[i] = oz - this.pz[i];
        break;
      }
      case N_LOOK:
        this.state[i] = S_LOOK;
        this.timer[i] = 6 + this.rng() * 14;
        break;
      case N_SIT:
        this.state[i] = S_SIT;
        this.timer[i] = 10 + this.rng() * 30;
        break;
      case N_HIDE:
        this.state[i] = S_HIDDEN;
        this.vis[i] = 0;
        {
          const f = this.follower[i];
          if (f >= 0) this.vis[f] = 0;
        }
        break;
      default:
        this.state[i] = S_WALK;
    }
  }

  // --- Output resolve ----------------------------------------------------------------------------------

  /** Computes final positions, poses, followers and dogs for every live slot. */
  private resolve(dt: number): void {
    const g = this.g;
    const cap = this.cap;
    const decay = Math.exp(-6 * dt);
    const beh = this.behaviour;
    beh.walking = beh.crossing = beh.waiting = beh.looking = beh.chatting = beh.sitting = beh.moving = beh.hidden = 0;
    let visible = 0;
    for (let i = 0; i < cap; i++) {
      const L = this.leader[i];
      if (L < 0) {
        const st = this.state[i];
        if (st === S_HIDDEN) {
          this.vis[i] = 0;
          beh.hidden++;
          const f = this.follower[i];
          if (f >= 0) this.vis[f] = 0;
          continue;
        }
        this.vis[i] = 1;
        const onEdge = st === S_WALK || st === S_WAIT;
        // The correction decays so state changes never pop.
        if (onEdge) {
          this.cx[i] *= decay;
          this.cz[i] *= decay;
        }
        let x = this.px[i] + (onEdge ? this.cx[i] : 0);
        let z = this.pz[i] + (onEdge ? this.cz[i] : 0);
        const h = this.hd[i];
        let pose = POSE_STAND;
        let spd = 0;
        let y = SIDEWALK_Y;
        switch (st) {
          case S_WALK:
          case S_MOVE:
            pose = POSE_WALK;
            spd = this.speed[i] * (st === S_MOVE ? 0.8 : this.speedMul);
            // Children are erratic: their gait rate wobbles (render only; positions are unchanged).
            if (this.body[i] === BODY_CHILD) spd *= 1 + 0.25 * Math.sin(this.time * 2.3 + this.phase[i]);
            if (st === S_WALK) {
              const e = this.edge[i];
              if (g.cross[e] === 1) {
                const dist = Math.min(this.S[i], g.len[e] - this.S[i]);
                const c = g.curb[e];
                y = dist <= c - 0.2 ? SIDEWALK_Y : dist >= c + 0.2 ? 0 : (SIDEWALK_Y * (c + 0.2 - dist)) / 0.4;
                beh.crossing++;
              } else beh.walking++;
            } else beh.moving++;
            break;
          case S_WAIT:
            beh.waiting++;
            break;
          case S_LOOK:
            beh.looking++;
            break;
          case S_CHAT:
            pose = POSE_CHAT;
            beh.chatting++;
            if (this.follower[i] >= 0) {
              x -= Math.sin(h) * 0.47;
              z -= Math.cos(h) * 0.47;
            }
            break;
          case S_SIT:
            pose = POSE_SIT;
            beh.sitting++;
            break;
          default:
            break;
        }
        this.ox[i] = x;
        this.oz[i] = z;
        this.oy[i] = y;
        this.oh[i] = h;
        this.opose[i] = pose;
        this.ospeed[i] = spd;
        visible++;
        this.clamp(i);
      } else {
        // Follower: mirror the leader.
        if (this.vis[L] === 0) {
          this.vis[i] = 0;
          continue;
        }
        this.vis[i] = 1;
        const pose = this.opose[L];
        const h = this.oh[L];
        let x = this.ox[L];
        let z = this.oz[L];
        let hh = h;
        if (pose === POSE_CHAT) {
          x += Math.sin(h) * 0.95;
          z += Math.cos(h) * 0.95;
          hh = h + Math.PI;
        } else if (pose === POSE_SIT) {
          const w = 0.8;
          x += Math.cos(h) * w;
          z -= Math.sin(h) * w;
        } else {
          const w = this.body[i] === BODY_CHILD ? 0.62 : 0.7;
          x += Math.cos(h) * w;
          z -= Math.sin(h) * w;
        }
        this.ox[i] = x;
        this.oz[i] = z;
        this.oy[i] = this.oy[L];
        this.oh[i] = hh;
        this.opose[i] = pose;
        // A follower keeps the leader's pace: a child walking with an adult goes at the adult's pace (the adult waits).
        // Children keep their own erratic wobble on top; teens take a slightly quicker rate.
        const rate = this.body[i] === BODY_TEEN ? 1.1 : 1;
        const wobble = this.body[i] === BODY_CHILD ? 1 + 0.25 * Math.sin(this.time * 2.3 + this.phase[i]) : 1;
        this.ospeed[i] = this.ospeed[L] * rate * wobble;
        visible++;
        this.clamp(i);
      }
    }
    this.visibleCount = visible;

    // Dogs trail beside their owner; the leash runs from the owner's hand to the dog.
    for (let i = 0; i < cap; i++) {
      const d = this.dogIndex[i];
      if (d < 0 || this.vis[i] === 0) continue;
      const h = this.oh[i];
      const fx = Math.sin(h);
      const fz = Math.cos(h);
      const lx = Math.cos(h);
      const lz = -Math.sin(h);
      const moving = this.ospeed[i] > 0.05;
      const back = moving ? 0.85 + 0.2 * Math.sin(this.time * 0.9 + this.dogPhase[d]) : 0.55;
      const side = this.dogSide[i] * 0.5;
      // Never onto the road unless the owner is there: a dog trailing an owner who has just turned at a kerb
      // would otherwise stand in the street. The first candidate off the asphalt wins (no allocation).
      let dxp = 0;
      let dzp = 0;
      for (let c = 0; c < 3; c++) {
        const bk = c === 0 ? back : c === 1 ? 0.55 : 0;
        dxp = this.ox[i] - fx * bk + lx * side;
        dzp = this.oz[i] - fz * bk + lz * side;
        if (!inRoad(this.rects, dxp, dzp, 0.05)) break;
      }
      if (dxp < this.boundMinX) dxp = this.boundMinX;
      if (dxp > this.boundMaxX) dxp = this.boundMaxX;
      if (dzp < this.boundMinZ) dzp = this.boundMinZ;
      if (dzp > this.boundMaxZ) dzp = this.boundMaxZ;
      this.dogX[d] = dxp;
      this.dogZ[d] = dzp;
      this.dogH[d] = h;
      this.dogSpeed[d] = moving ? this.ospeed[i] : 0;
      const hx = this.ox[i] + lx * this.dogSide[i] * 0.22 + fx * 0.08;
      const hz = this.oz[i] + lz * this.dogSide[i] * 0.22 + fz * 0.08;
      this.handX[d] = Math.min(this.boundMaxX, Math.max(this.boundMinX, hx));
      this.handZ[d] = Math.min(this.boundMaxZ, Math.max(this.boundMinZ, hz));
    }
  }

  private clamp(i: number): void {
    if (this.ox[i] < this.boundMinX) this.ox[i] = this.boundMinX;
    else if (this.ox[i] > this.boundMaxX) this.ox[i] = this.boundMaxX;
    if (this.oz[i] < this.boundMinZ) this.oz[i] = this.boundMinZ;
    else if (this.oz[i] > this.boundMaxZ) this.oz[i] = this.boundMaxZ;
  }
}

/** Walking speed in m/s by age group and sex (r is a 0..1 spread). Children and teens quick, elders slow, women a touch slower than men. */
function speedFor(age: number, female: number, r: number): number {
  if (age === BODY_CHILD) return 1.4 + r * 0.25;
  if (age === BODY_TEEN) return 1.4 + r * 0.2;
  if (age === BODY_ELDER) return (female ? 0.78 : 0.82) + r * 0.1;
  return (female ? 1.08 : 1.15) + r * 0.28;
}

/** Grey and white hair colour indices in palettes.ts (elders). */
const GREY_HAIR = [6, 7, 10, 11];

/**
 * Hair style by age group and sex. Styles (see personGeometry.ts): 0 short crop, 1 side parting with a fringe,
 * 2 curly, 3 bald, 4 long to the shoulders, 5 ponytail, 6 bun, 7 bob, 8 long to the waist, 9 pigtails.
 */
function hairStyleFor(age: number, female: number, r: number): number {
  if (age === BODY_CHILD) return female ? (r < 0.5 ? 9 : r < 0.75 ? 0 : 1) : r < 0.5 ? 0 : 1;
  if (female) {
    // Women and girls (teens included): 90 percent long, 10 percent short.
    if (r < 0.9) return LONG_FEMALE_STYLES[Math.min(LONG_FEMALE_STYLES.length - 1, Math.floor((r / 0.9) * LONG_FEMALE_STYLES.length))];
    return SHORT_FEMALE_STYLES[Math.min(SHORT_FEMALE_STYLES.length - 1, Math.floor(((r - 0.9) / 0.1) * SHORT_FEMALE_STYLES.length))];
  }
  if (age === BODY_TEEN) return r < 0.5 ? 0 : r < 0.8 ? 1 : 2;
  if (age === BODY_ELDER) return r < 0.4 ? 3 : r < 0.7 ? 0 : r < 0.9 ? 1 : 2;
  return r < 0.3 ? 0 : r < 0.55 ? 1 : r < 0.7 ? 2 : r < 0.9 ? 3 : 0;
}
