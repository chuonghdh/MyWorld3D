// Living office (phase 6): fixed spots (board, huddle slots, pantry seats, door bench) and the pure plan that says
// where each agent should be and what it is doing, from engine state and time only. Deterministic, tested.
import type { AgentId, AgentStatus } from '../model/types';
import type { RoomState } from '../engine/state';
import { DISCUSS, LEAD_DESK, ROOM, SPECIALISTS, SX, deskPose, homeSpot, seatPos, type Vec2 } from './layout';
import { LEAD_HOME, LEAD_NODE, SEATS } from './corridors';

export type Activity = 'stand' | 'work' | 'wait' | 'huddle' | 'report' | 'relax' | 'hidden';

export interface Plan {
  target: Vec2;
  /** Point the agent faces once it has arrived. */
  look: Vec2;
  activity: Activity;
  /** Seat top height when the activity is relax (sitting), metres. */
  seatY: number;
}

export interface Timing {
  meetMs: number;
  reportMs: number;
  idleMs: number;
}

export { BOARD } from './layout';

/** Lead stands beside the board's right end (floor plan), facing the discuss table. */
export const LEAD_SPOT: Vec2 = LEAD_NODE;
const TABLE_CENTER: Vec2 = { x: DISCUSS.x, z: DISCUSS.z };

/** Huddle seat on the discuss-table ring: specialist i sits on seat i. */
export function huddleSlot(id: AgentId): Vec2 {
  const i = Math.max(0, SPECIALISTS.indexOf(id));
  return SEATS[i] ?? seatPos(i);
}

/** Pantry lounge in the back-right corner: 3 sofa seats on the right wall, 2 on the back sofa, 3 bar stools, 1 counter stool, and the lead's bar stool. */
export const PANTRY = { x0: 3.6 * SX, x1: ROOM.halfW - 0.3, z0: -ROOM.halfD + 0.3, z1: -1.5 } as const;
export const SOFA_SEAT_Y = 0.42;
export const STOOL_SEAT_Y = 0.72;
/** Ring seats are stools: seated pose uses this seat top height (same stool as the pantry bar). */
export const RING_SEAT_Y = STOOL_SEAT_Y;
/** Desk chair seat top (Desks.tsx: seat box centre 0.46, 0.06 thick); agents sit to work. */
export const CHAIR_SEAT_Y = 0.49;
export const BAR_TABLE: Vec2 = { x: PANTRY.x0 + 1.6, z: -3.6 };
export const COFFEE_TABLE: Vec2 = { x: ROOM.halfW - 2.3, z: -5.5 };
/** Stool in front of the counter (west side): the ninth specialist's pantry seat. */
export const COUNTER_STOOL: Vec2 = { x: ROOM.halfW - 1.3, z: -2.6 };
export const PANTRY_SEATS: readonly { pos: Vec2; look: Vec2; y: number }[] = [
  { pos: { x: ROOM.halfW - 0.6, z: -6.4 }, look: COFFEE_TABLE, y: SOFA_SEAT_Y },
  { pos: { x: ROOM.halfW - 0.6, z: -5.5 }, look: COFFEE_TABLE, y: SOFA_SEAT_Y },
  { pos: { x: ROOM.halfW - 0.6, z: -4.6 }, look: COFFEE_TABLE, y: SOFA_SEAT_Y },
  { pos: { x: ROOM.halfW - 3.3, z: -7.45 }, look: COFFEE_TABLE, y: SOFA_SEAT_Y },
  { pos: { x: ROOM.halfW - 2.4, z: -7.45 }, look: COFFEE_TABLE, y: SOFA_SEAT_Y },
  { pos: { x: BAR_TABLE.x - 0.8, z: -3.6 }, look: BAR_TABLE, y: STOOL_SEAT_Y },
  { pos: { x: BAR_TABLE.x, z: -2.75 }, look: BAR_TABLE, y: STOOL_SEAT_Y },
  { pos: { x: BAR_TABLE.x + 0.8, z: -3.6 }, look: BAR_TABLE, y: STOOL_SEAT_Y },
  { pos: COUNTER_STOOL, look: { x: ROOM.halfW - 0.45, z: -2.6 }, y: STOOL_SEAT_Y },
  { pos: { x: BAR_TABLE.x, z: BAR_TABLE.z - 0.85 }, look: BAR_TABLE, y: STOOL_SEAT_Y }, // the lead's seat (always last)
];

/** Fixed seat per specialist (roster order): no two agents ever share a seat. */
export function seatOf(id: AgentId): number {
  if (id === 'lead') return PANTRY_SEATS.length - 1;
  return Math.max(0, SPECIALISTS.indexOf(id)) % (PANTRY_SEATS.length - 1);
}

const ACTIVE: readonly AgentStatus[] = ['thinking', 'tool', 'delegating', 'waiting', 'error'];

export function planFor(state: RoomState, id: AgentId, now: number, k: Timing): Plan {
  const a = state.agents[id];
  const called = state.called[id];
  const fresh = now - a.lastEventT < k.idleMs;
  const calledNow = called !== undefined && now - called >= 0 && now - called < k.meetMs;
  const reporting = a.status === 'done' && now - a.lastEventT < k.reportMs;

  if (id === 'lead') {
    const meeting = SPECIALISTS.some((s) => {
      const c = state.called[s];
      const st = state.agents[s];
      return (c !== undefined && now - c >= 0 && now - c < k.meetMs) || (st.status === 'done' && now - st.lastEventT < k.reportMs);
    });
    if (meeting) return { target: LEAD_SPOT, look: TABLE_CENTER, activity: 'huddle', seatY: 0 };
    // Any state but idle (thinking, working, waiting, done, error): sit at its desk. Only idle relaxes in the pantry.
    if (a.status !== 'idle') return { target: LEAD_HOME, look: { x: LEAD_DESK.x, z: LEAD_DESK.z }, activity: 'work', seatY: CHAIR_SEAT_Y };
    const seat = PANTRY_SEATS[seatOf('lead')]!;
    return { target: seat.pos, look: seat.look, activity: 'relax', seatY: seat.y };
  }
  if (calledNow) return { target: huddleSlot(id), look: TABLE_CENTER, activity: 'huddle', seatY: RING_SEAT_Y };
  if (reporting) return { target: huddleSlot(id), look: TABLE_CENTER, activity: 'report', seatY: RING_SEAT_Y };
  if (fresh && ACTIVE.includes(a.status)) {
    return { target: homeSpot(id), look: deskPose(id).pos, activity: a.status === 'waiting' || a.status === 'error' ? 'wait' : 'work', seatY: CHAIR_SEAT_Y };
  }
  const seat = PANTRY_SEATS[seatOf(id)]!;
  return { target: seat.pos, look: seat.look, activity: 'relax', seatY: seat.y };
}
