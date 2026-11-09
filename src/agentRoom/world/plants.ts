// Room plants (pure, deterministic): one tidy row of evenly spaced slots tight against the right window wall (the glass
// side). Slots alternate tall and short; a slot is used only when it keeps clear of every
// walking line, the desks, the lead desk, the discuss table, the board wall, the pantry, the door and the glass dividers.
import { agentRoom } from '../../config/tuning';
import { BOARD, DISCUSS, LEAD_DESK, ROOM, SPECIALISTS, deskPose, type Vec2 } from './layout';
import { ROW_Z, TOP_Z, corridorLines } from './corridors';
import { PANTRY } from './office';
import { partitions, PLANT_SPOTS } from './Decor';

export interface Plant extends Vec2 {
  tall: boolean;
}

const WALL_GAP = 0.3; // pot centre from the interior face of the right window wall, metres
const SLOT = 2.2; // spacing of the row, metres
const WALK_CLEAR = 0.85;
const DESK_CLEAR = 2.0; // from a subagent desk centre (desk, stand spot and chair)
const LEAD_CLEAR = 2.2;
const TABLE_CLEAR = DISCUSS.r + 0.9;
const SPACING = 1.4;

function segDist(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2)) : 0;
  return Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t));
}

function freeSpot(c: Vec2, segs: [Vec2, Vec2][], desks: Vec2[], parts: Vec2[]): boolean {
  if (segs.some(([a, b]) => segDist(c, a, b) < WALK_CLEAR)) return false;
  if (desks.some((d) => Math.hypot(c.x - d.x, c.z - d.z) < DESK_CLEAR)) return false;
  if (Math.hypot(c.x - LEAD_DESK.x, c.z - LEAD_DESK.z) < LEAD_CLEAR) return false;
  if (Math.hypot(c.x - DISCUSS.x, c.z - DISCUSS.z) < TABLE_CLEAR) return false;
  if (c.z < BOARD.z + 1.4 && Math.abs(c.x - BOARD.x) < BOARD.w / 2 + 1) return false; // board wall
  if (c.x > PANTRY.x0 - 0.9 && c.z < PANTRY.z1 + 0.5) return false; // pantry lounge
  if (parts.some((p) => Math.abs(c.x - p.x) < 0.9 && Math.abs(c.z - p.z) < 1.0)) return false; // glass dividers
  return true;
}

let cache: Plant[] | null = null;

/** Fixed slots along the wall side of the far-right corridor, from its bottom end upwards. Pure and cached. */
export function plantSpots(): Plant[] {
  if (cache) return cache;
  const segs: [Vec2, Vec2][] = [];
  for (const line of corridorLines()) for (let i = 1; i < line.length; i++) segs.push([line[i - 1]!, line[i]!]);
  const desks = SPECIALISTS.map((id) => deskPose(id).pos);
  const parts = partitions().map((p) => ({ x: p.x, z: p.z }));
  const taken: Vec2[] = PLANT_SPOTS.map(([x, z]) => ({ x, z }));
  const slots: Vec2[] = [];
  for (let z = ROW_Z[1] - 0.4; z >= TOP_Z + 0.5; z -= SLOT) slots.push({ x: ROOM.halfW - WALL_GAP, z });

  // Alternate tall and short; when one kind runs out, the other fills the rest. Counts come from the knobs.
  let tallLeft: number = agentRoom.plantTallCount;
  let shortLeft: number = agentRoom.plantShortCount;
  let wantTall = true;
  const out: Plant[] = [];
  for (const c of slots) {
    if (tallLeft + shortLeft === 0) break;
    if (!freeSpot(c, segs, desks, parts)) continue;
    if (taken.some((t) => Math.hypot(t.x - c.x, t.z - c.z) < SPACING)) continue;
    const tall: boolean = (wantTall && tallLeft > 0) || shortLeft === 0;
    if (tall) tallLeft--;
    else shortLeft--;
    out.push({ x: c.x, z: c.z, tall });
    taken.push(c);
    wantTall = !tall;
  }
  cache = out;
  return out;
}
