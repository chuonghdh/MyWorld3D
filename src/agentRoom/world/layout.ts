// Room layout (ADR 0013), from the human's floor plan (2026-11-08): command board on the back wall (centre-left),
// lead desk beside it on a slight diagonal, round discuss table in front of the board with a ring of white stools,
// pantry in the back-right corner, nine desks (two 2x2 blocks plus one beside the right block) in the front half, split by a central aisle.
// Agents work on the front side of their desk, facing the board. Fixed, deterministic positions; geometry constants.
import type { AgentId } from '../model/types';
import { agentRoom } from '../../config/tuning';

export interface Vec2 {
  x: number;
  z: number;
}

// Walls are raised so the taller board (twice the old 2.7 m) stays under the top of the back wall.
export const ROOM = { halfW: agentRoom.roomHalfWidth, halfD: 8, wallH: 6.2, wallT: 0.2 } as const;
/** Plan x positions were drawn for a 10 m half width; they scale with the knob to keep the plan's proportions. */
export const SX = ROOM.halfW / 10;
/** Subagent desk: longer than the old 1.6 m (monitors are 1.5x and need the room). */
export const DESK = { w: 2.2, d: 0.8, h: 0.75 } as const;

/** Command board (kanban + mission control + ticker) mounted on the back wall, facing the room (+z). Twice the old height. */
export const BOARD = { x: -1.6 * SX, z: -ROOM.halfD + 0.12, yaw: 0, w: 7.5, h: 5.4, bottom: 0.3 } as const;

/** Round discuss table in front of the board. Seats sit on a ring around it (SEAT_R from the centre). */
export const DISCUSS = { x: -1.6 * SX, z: -3.6, r: 1.1, w: 2.2, d: 2.2, h: 0.75 } as const;
/** Huddle seat ring radius, metres (table radius plus stool and robot clearance). */
export const SEAT_R = 1.65;
/** Seats on the ring: one per specialist. */
export const SEAT_COUNT = 9;
/** Seat k on the ring; seat 0 faces the room (+z), seats run clockwise from above. */
export function seatPos(k: number): Vec2 {
  const t = (2 * Math.PI * k) / SEAT_COUNT;
  return { x: DISCUSS.x + SEAT_R * Math.sin(t), z: DISCUSS.z + SEAT_R * Math.cos(t) };
}
/** Kept for the discuss-table centrepiece (orb and glowing ring). */
export const HUB = { r: 0.55, h: DISCUSS.h } as const;

/** Lead desk: beside the board's right end, larger than a subagent desk, yawed off the walls. */
export const LEAD_DESK = { x: 3.0, z: -5.2, yaw: agentRoom.leadDeskYaw, w: 2.4, d: 1.1 } as const;

/** Desk column (x) of the left and right blocks (cols 0-3), a ninth desk column right of them (col 4), and the two desk rows (z). Central aisle at AISLE_X. */
export const DESK_COLS = [-7.8 * SX, -4.4 * SX, 0.6 * SX, 4.2 * SX, 7.1 * SX] as const;
export const DESK_ROWS = [0.6, 4.4] as const;
export const AISLE_X = -2.0 * SX;
/** Distance from desk centre to where the agent stands (front side, facing the desk). */
export const STAND = DESK.d / 2 + 0.5;

/** Roster order -> desk: left block (cols 0-1) then right block (cols 2-3), top row first. Stable. */
export const SPECIALISTS: readonly AgentId[] = [
  'buildings', 'city-streets', 'traffic-life', 'sky-environment', 'audio', 'ui-camera', 'scene-qa', 'architect', 'graphics-character',
];
/** Roster index -> [column, row]. The ninth desk (Graphics & Character) stands alone in column 4, row 0. */
export const DESK_SLOTS: readonly (readonly [number, number])[] = [
  [0, 0], [1, 0], [0, 1], [1, 1], [2, 0], [3, 0], [2, 1], [3, 1], [4, 0],
];

/** Desk centre and yaw. Yaw 0: desk-local +z points to the front (where the agent stands); monitors face +z. */
export function deskPose(id: AgentId): { pos: Vec2; yaw: number } {
  const i = SPECIALISTS.indexOf(id);
  if (i < 0) return { pos: { x: 0, z: 0 }, yaw: 0 };
  const [c, r] = DESK_SLOTS[i]!;
  return { pos: { x: DESK_COLS[c]!, z: DESK_ROWS[r]! }, yaw: 0 };
}

/** Where the agent stands when working: in front of its desk. */
export function homeSpot(id: AgentId): Vec2 {
  const { pos } = deskPose(id);
  return { x: pos.x, z: pos.z + STAND };
}

/** Where the lead sits when working: on the far side of its desk (away from the members, desk-local -z), facing it. */
export function leadHome(): Vec2 {
  const f = LEAD_DESK.d / 2 + 0.5;
  return { x: LEAD_DESK.x - f * Math.sin(LEAD_DESK.yaw), z: LEAD_DESK.z - f * Math.cos(LEAD_DESK.yaw) };
}


/** Board panel on the back wall (used by the window wall to leave a solid panel behind it). */
export const WALL_SCREEN = { x: BOARD.x, w: BOARD.w, h: BOARD.h, y: BOARD.bottom + BOARD.h / 2, z: BOARD.z } as const;
