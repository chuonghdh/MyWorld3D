// Live world buffer (ADR 0013): mutable view state derived from engine state via the office plan. Read in useFrame;
// never written by components. `stepWorld` is deterministic for the same (state, dt, now) sequence.
import type { AgentId } from '../model/types';
import type { RoomState } from '../engine/state';
import { ALL_AGENTS, initialState } from '../engine/state';
import type { Vec2 } from './layout';
import { planFor, type Activity, type Timing } from './office';
import { route } from './route';
import { agentRoom } from '../../config/tuning';

export interface AgentView {
  id: AgentId;
  pos: Vec2;
  target: Vec2;
  look: Vec2;
  activity: Activity;
  seatY: number;
  /** True once within ARRIVE of the target (sitting, typing and huddling only happen on arrival). */
  arrived: boolean;
  /** Ring buffer of past positions, x,z pairs. */
  trail: Float32Array;
  trailHead: number;
  trailCount: number;
  /** Seconds since the last trail sample. */
  trailClock: number;
  /** 0..1 desk screen glow, eased toward 1 while the owner works at the desk. */
  glow: number;
  /** Current route (waypoints, last = target) and the index of the next waypoint. */
  path: Vec2[];
  pathIdx: number;
  pathKey: string;
  /** Metres walked along the current route, and the route's total length (ease-in / ease-out). */
  moveDone: number;
  moveLen: number;
}

export interface LiveWorld {
  agents: Record<AgentId, AgentView>;
  /** Room time in ms on the engine clock (event.t scale). */
  now: number;
}

const TRAIL_STEP_SEC = 0.15;
const GLOW_RATE = 3;
export const ARRIVE = 0.08;

export function createLiveWorld(trailLength: number, timing: Timing = { meetMs: 8000, reportMs: 6000, idleMs: 20000 }): LiveWorld {
  const s0 = initialState('simulation');
  const agents = {} as Record<AgentId, AgentView>;
  for (const id of ALL_AGENTS) {
    const p = planFor(s0, id, 0, timing);
    agents[id] = {
      id,
      pos: { ...p.target },
      target: { ...p.target },
      look: { ...p.look },
      activity: p.activity,
      seatY: p.seatY,
      arrived: true,
      trail: new Float32Array(trailLength * 2),
      trailHead: 0,
      trailCount: 0,
      trailClock: 0,
      glow: 0,
      path: [],
      pathIdx: 0,
      pathKey: `${p.target.x},${p.target.z}`,
      moveDone: 0,
      moveLen: 0,
    };
  }
  return { agents, now: 0 };
}

function pathLength(pts: Vec2[]): number {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.z - pts[i - 1]!.z);
  return s;
}

/** Speed factor at distance `done` along a move of `len` metres: eases from the minimum to full speed over the
 *  ramp and back down at the end (smoothstep). Pure; sim-time dt only. */
export function easeFactor(done: number, len: number): number {
  const r = agentRoom.easeRampM;
  if (r <= 0) return 1;
  const t = Math.max(0, Math.min(1, Math.min(done, len - done) / r));
  const s = t * t * (3 - 2 * t);
  return agentRoom.easeMinSpeedFrac + (1 - agentRoom.easeMinSpeedFrac) * s;
}

export function stepWorld(w: LiveWorld, state: RoomState, dt: number, now: number, walkSpeed: number, timing: Timing): void {
  w.now = now;
  for (let k = 0; k < ALL_AGENTS.length; k++) {
    const id = ALL_AGENTS[k]!;
    const a = w.agents[id];
    const p = planFor(state, id, now, timing);
    a.target.x = p.target.x;
    a.target.z = p.target.z;
    a.look.x = p.look.x;
    a.look.z = p.look.z;
    a.activity = p.activity;
    a.seatY = p.seatY;
    const key = `${p.target.x},${p.target.z}`;
    if (key !== a.pathKey) {
      a.pathKey = key;
      a.path = route({ x: a.pos.x, z: a.pos.z }, p.target);
      a.pathIdx = 1;
      a.moveDone = 0;
      a.moveLen = pathLength(a.path);
    }
    // Walk along the route; several waypoints may be passed in one step.
    const x0 = a.pos.x;
    const z0 = a.pos.z;
    let budget = walkSpeed * dt * easeFactor(a.moveDone, a.moveLen);
    while (budget > 1e-6 && a.pathIdx < a.path.length) {
      const wp = a.path[a.pathIdx]!;
      const ex = wp.x - a.pos.x;
      const ez = wp.z - a.pos.z;
      const seg = Math.hypot(ex, ez);
      if (seg <= budget) {
        a.pos.x = wp.x;
        a.pos.z = wp.z;
        budget -= seg;
        a.pathIdx++;
      } else {
        a.pos.x += (ex / seg) * budget;
        a.pos.z += (ez / seg) * budget;
        budget = 0;
      }
    }
    const d = Math.hypot(a.pos.x - x0, a.pos.z - z0);
    a.moveDone += d;
    const left = Math.hypot(p.target.x - a.pos.x, p.target.z - a.pos.z);
    a.arrived = left < ARRIVE;
    a.trailClock += dt;
    if (a.trailClock >= TRAIL_STEP_SEC && d > 1e-3) {
      a.trailClock = 0;
      const cap = a.trail.length / 2;
      a.trail[a.trailHead * 2] = a.pos.x;
      a.trail[a.trailHead * 2 + 1] = a.pos.z;
      a.trailHead = (a.trailHead + 1) % cap;
      a.trailCount = Math.min(cap, a.trailCount + 1);
    }
    const goal = a.activity === 'work' && a.arrived ? 1 : 0;
    a.glow += (goal - a.glow) * Math.min(1, dt * GLOW_RATE);
  }
}
