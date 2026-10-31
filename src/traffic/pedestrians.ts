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
import type { TrafficLightController } from './lights';
import { MAX_WALKERS, MAX_DOGS } from './walkers/constants';
import type { DogRender, PedestrianRender, PedestriansOptions, PedestrianEnv, PedestrianStats, Graph, RoadRects } from './walkers/types';
import { crowdDensityAt } from './walkers/density';
import { setupSystem } from './walkers/setup';
import { setCap, stepLeader } from './walkers/movement';
import { getPedestrians } from './walkers/output';
import { resolve } from './walkers/resolve';

export class Pedestrians {

  layout!: CityLayout;

  g!: Graph;

  rects!: RoadRects;

  rng!: () => number;

  lights!: TrafficLightController | null;

  multiplier!: number;

  cap = 0;

  time = 0;

  density!: number;

  rain = 0;

  speedMul = 1;

  // Per-slot state (struct of arrays).
  state = new Uint8Array(MAX_WALKERS);

  next = new Uint8Array(MAX_WALKERS);

  edge = new Int32Array(MAX_WALKERS);

  dirv = new Int8Array(MAX_WALKERS);

  S = new Float32Array(MAX_WALKERS);

  speed = new Float32Array(MAX_WALKERS);

  lat = new Float32Array(MAX_WALKERS);

  px = new Float32Array(MAX_WALKERS);

  pz = new Float32Array(MAX_WALKERS);

  cx = new Float32Array(MAX_WALKERS);

  cz = new Float32Array(MAX_WALKERS);

  hd = new Float32Array(MAX_WALKERS);

  faceTo = new Float32Array(MAX_WALKERS);

  timer = new Float32Array(MAX_WALKERS);

  idleTimer = new Float32Array(MAX_WALKERS);

  tx = new Float32Array(MAX_WALKERS);

  tz = new Float32Array(MAX_WALKERS);

  doorX = new Float32Array(MAX_WALKERS);

  doorZ = new Float32Array(MAX_WALKERS);

  committed = new Uint8Array(MAX_WALKERS);

  bench = new Int16Array(MAX_WALKERS);

  body = new Uint8Array(MAX_WALKERS);

  female = new Uint8Array(MAX_WALKERS);

  hairStyle = new Uint8Array(MAX_WALKERS);

  top = new Uint8Array(MAX_WALKERS);

  pants = new Uint8Array(MAX_WALKERS);

  hair = new Uint8Array(MAX_WALKERS);

  skin = new Uint8Array(MAX_WALKERS);

  accent = new Uint8Array(MAX_WALKERS);

  traits = new Uint16Array(MAX_WALKERS);

  phase = new Float32Array(MAX_WALKERS);

  rank = new Float32Array(MAX_WALKERS);

  scale = new Float32Array(MAX_WALKERS);

  leader = new Int16Array(MAX_WALKERS);

  follower = new Int16Array(MAX_WALKERS);

  dogIndex = new Int16Array(MAX_WALKERS);

  dogSide = new Int8Array(MAX_WALKERS);

  ids = new Int32Array(MAX_WALKERS);

  // Resolved output per slot.
  vis = new Uint8Array(MAX_WALKERS);

  ox = new Float32Array(MAX_WALKERS);

  oz = new Float32Array(MAX_WALKERS);

  oy = new Float32Array(MAX_WALKERS);

  oh = new Float32Array(MAX_WALKERS);

  opose = new Uint8Array(MAX_WALKERS);

  ospeed = new Float32Array(MAX_WALKERS);

  // Dogs.
  dogPhase = new Float32Array(MAX_DOGS);

  dogCoat = new Uint8Array(MAX_DOGS);

  dogX = new Float32Array(MAX_DOGS);

  dogZ = new Float32Array(MAX_DOGS);

  dogH = new Float32Array(MAX_DOGS);

  dogSpeed = new Float32Array(MAX_DOGS);

  handX = new Float32Array(MAX_DOGS);

  handZ = new Float32Array(MAX_DOGS);

  dogOwner = new Int16Array(MAX_DOGS);

  benchX!: Float32Array;

  benchZ!: Float32Array;

  benchF!: Float32Array;

  benchOcc!: Int16Array;

  pool: PedestrianRender[] = [];

  out: PedestrianRender[] = [];

  boundMinX!: number;

  boundMaxX!: number;

  boundMinZ!: number;

  boundMaxZ!: number;

  visibleCount = 0;

  statsData: PedestrianStats = { crossings: 0, chats: 0, sits: 0, looks: 0, doors: 0, waits: 0 };

  behaviour = { walking: 0, crossing: 0, waiting: 0, looking: 0, chatting: 0, sitting: 0, moving: 0, hidden: 0 };

  constructor(layout: CityLayout, options: PedestriansOptions) {
    setupSystem(this, layout, options);
  }

  dogPool!: DogRender[];

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
    if (this.g.edgeCount > 0) setCap(this);
  }

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
      stepLeader(this, i, dt);
    }
    resolve(this, dt);
  }

  /** Visible walkers. The returned array and its objects are reused every call. */
  getPedestrians(): PedestrianRender[] {
    return getPedestrians(this);
  }

}

export { POSE_WALK } from './walkers/constants';
export { POSE_STAND } from './walkers/constants';
export { POSE_CHAT } from './walkers/constants';
export { POSE_SIT } from './walkers/constants';
export { TRAIT_HAT } from './walkers/constants';
export { TRAIT_SCARF } from './walkers/constants';
export { TRAIT_BAG } from './walkers/constants';
export { TRAIT_SHORTS } from './walkers/constants';
export { TRAIT_SHORT_SLEEVES } from './walkers/constants';
export { TRAIT_BEARD } from './walkers/constants';
export { TRAIT_MOUSTACHE } from './walkers/constants';
export { TRAIT_DOTS } from './walkers/constants';
export { TRAIT_HEARTS } from './walkers/constants';
export { TRAIT_HSTRIPES } from './walkers/constants';
export { TRAIT_VSTRIPES } from './walkers/constants';
export { TRAIT_CHECKS } from './walkers/constants';
export { TRAIT_DIAGONAL } from './walkers/constants';
export { BODY_ADULT } from './walkers/constants';
export { BODY_CHILD } from './walkers/constants';
export { BODY_ELDER } from './walkers/constants';
export { BODY_TEEN } from './walkers/constants';
export { HAIR_STYLE_COUNT } from './walkers/constants';
export { MAX_WALKERS } from './walkers/constants';
export { MAX_DOGS } from './walkers/constants';
export type { DogRender } from './walkers/types';
export type { PedestrianRender } from './walkers/types';
export type { PedestriansOptions } from './walkers/types';
export type { PedestrianEnv } from './walkers/types';
export type { PedestrianStats } from './walkers/types';
export { crowdDensityAt } from './walkers/density';
export { redRemaining } from './walkers/density';
