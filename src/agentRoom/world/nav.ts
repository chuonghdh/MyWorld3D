// Walking routes (pure, deterministic): footprints of furniture from the layout, a coarse occupancy grid inflated by
// the robot radius, A* (8-way, no corner cutting, fixed tie-break) and line-of-sight smoothing.
// Start or goal inside furniture (a sofa seat, a stool) is reached by a short final leg from the nearest free cell.
import { BOARD, DESK, DISCUSS, LEAD_DESK, ROOM, SPECIALISTS, deskPose, type Vec2 } from './layout';
import { BAR_TABLE, COFFEE_TABLE, PANTRY } from './office';
import { PLANT_SPOTS, partitions } from './Decor';
import { plantSpots } from './plants';

export type Footprint = { kind: 'rect'; x: number; z: number; hw: number; hd: number; yaw: number } | { kind: 'circle'; x: number; z: number; r: number };

export const CELL = 0.2;
export const ROBOT_R = 0.35;
const NX = Math.round((ROOM.halfW * 2) / CELL);
const NZ = Math.round((ROOM.halfD * 2) / CELL);

/** Furniture footprints in world x/z (yaw as in the layout: local x rotated by yaw). */
export function footprints(): Footprint[] {
  const f: Footprint[] = [];
  for (const id of SPECIALISTS) {
    const { pos, yaw } = deskPose(id);
    f.push({ kind: 'rect', x: pos.x, z: pos.z, hw: DESK.w / 2, hd: DESK.d / 2, yaw });
  }
  f.push({ kind: 'circle', x: DISCUSS.x, z: DISCUSS.z, r: DISCUSS.w / 2 });
  f.push({ kind: 'rect', x: LEAD_DESK.x, z: LEAD_DESK.z, hw: LEAD_DESK.w / 2, hd: LEAD_DESK.d / 2, yaw: LEAD_DESK.yaw });
  f.push({ kind: 'rect', x: BOARD.x, z: BOARD.z, hw: BOARD.w / 2 + 0.06, hd: 0.08, yaw: 0 });
  for (const p of partitions()) f.push({ kind: 'rect', x: p.x, z: p.z, hw: 0.7, hd: 0.03, yaw: p.yaw });
  f.push({ kind: 'rect', x: ROOM.halfW - 0.4, z: -5.5, hw: 0.4, hd: 1.55, yaw: 0 }); // sofa A (right wall)
  f.push({ kind: 'rect', x: ROOM.halfW - 2.85, z: -ROOM.halfD + 0.4, hw: 1.05, hd: 0.4, yaw: 0 }); // sofa B (back wall)
  f.push({ kind: 'rect', x: ROOM.halfW - 0.45, z: -2.6, hw: 0.35, hd: 0.8, yaw: 0 }); // counter
  f.push({ kind: 'rect', x: COFFEE_TABLE.x, z: COFFEE_TABLE.z, hw: 0.55, hd: 0.35, yaw: 0 });
  f.push({ kind: 'circle', x: BAR_TABLE.x, z: BAR_TABLE.z, r: 0.45 });
  f.push({ kind: 'rect', x: PANTRY.x0, z: (-ROOM.halfD + PANTRY.z1) / 2, hw: 0.02, hd: (PANTRY.z1 + ROOM.halfD) / 2, yaw: 0 }); // pantry glass
  for (const [x, z] of PLANT_SPOTS) f.push({ kind: 'circle', x, z, r: 0.3 });
  for (const p of plantSpots()) f.push({ kind: 'circle', x: p.x, z: p.z, r: 0.3 });
  return f;
}

/** Is a point inside a footprint grown by `pad`? */
export function hits(fp: Footprint, x: number, z: number, pad: number): boolean {
  if (fp.kind === 'circle') return Math.hypot(x - fp.x, z - fp.z) < fp.r + pad;
  const dx = x - fp.x;
  const dz = z - fp.z;
  const c = Math.cos(fp.yaw);
  const s = Math.sin(fp.yaw);
  const lx = dx * c - dz * s; // inverse of local->world (x' = x c + z s, z' = -x s + z c)
  const lz = dx * s + dz * c;
  return Math.abs(lx) < fp.hw + pad && Math.abs(lz) < fp.hd + pad;
}

export interface NavGrid {
  free: Uint8Array;
  fps: Footprint[];
}

export function buildGrid(): NavGrid {
  const fps = footprints();
  const free = new Uint8Array(NX * NZ);
  for (let j = 0; j < NZ; j++)
    for (let i = 0; i < NX; i++) {
      const { x, z } = cellCenter(i, j);
      const inRoom = Math.abs(x) < ROOM.halfW - ROBOT_R && Math.abs(z) < ROOM.halfD - ROBOT_R;
      free[j * NX + i] = inRoom && !fps.some((f) => hits(f, x, z, ROBOT_R)) ? 1 : 0;
    }
  return { free, fps };
}

export function cellCenter(i: number, j: number): Vec2 {
  return { x: -ROOM.halfW + (i + 0.5) * CELL, z: -ROOM.halfD + (j + 0.5) * CELL };
}
function cellOf(p: Vec2): [number, number] {
  return [Math.min(NX - 1, Math.max(0, Math.floor((p.x + ROOM.halfW) / CELL))), Math.min(NZ - 1, Math.max(0, Math.floor((p.z + ROOM.halfD) / CELL)))];
}

/** Nearest free cell by growing square rings, scanned in a fixed order (deterministic). */
function nearestFree(g: NavGrid, p: Vec2): number {
  const [ci, cj] = cellOf(p);
  for (let r = 0; r < Math.max(NX, NZ); r++) {
    let best = -1;
    let bestD = Infinity;
    for (let j = cj - r; j <= cj + r; j++)
      for (let i = ci - r; i <= ci + r; i++) {
        if (i < 0 || j < 0 || i >= NX || j >= NZ || (Math.abs(i - ci) !== r && Math.abs(j - cj) !== r)) continue;
        if (!g.free[j * NX + i]) continue;
        const c = cellCenter(i, j);
        const d = Math.hypot(c.x - p.x, c.z - p.z);
        if (d < bestD - 1e-9) [best, bestD] = [j * NX + i, d];
      }
    if (best >= 0) return best;
  }
  return 0;
}

/** Straight segment stays on free cells (sampled every CELL / 2). */
export function clear(g: NavGrid, a: Vec2, b: Vec2): boolean {
  const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (CELL / 2));
  for (let k = 0; k <= n; k++) {
    const t = n ? k / n : 0;
    const [i, j] = cellOf({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
    if (!g.free[j * NX + i]) return false;
  }
  return true;
}

const DIRS: readonly [number, number, number][] = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];

/** Waypoints from `from` to `to` (both included). */
export function findPath(g: NavGrid, from: Vec2, to: Vec2): Vec2[] {
  const s = nearestFree(g, from);
  const e = nearestFree(g, to);
  const gs = new Float64Array(NX * NZ).fill(Infinity);
  const prev = new Int32Array(NX * NZ).fill(-1);
  const closed = new Uint8Array(NX * NZ);
  const ei = e % NX;
  const ej = Math.floor(e / NX);
  const h = (c: number) => Math.hypot((c % NX) - ei, Math.floor(c / NX) - ej);
  const open: number[] = [s];
  gs[s] = 0;
  while (open.length) {
    let bi = 0;
    for (let k = 1; k < open.length; k++) {
      const a = open[k]!;
      const b = open[bi]!;
      const fa = gs[a]! + h(a);
      const fb = gs[b]! + h(b);
      if (fa < fb - 1e-9 || (Math.abs(fa - fb) <= 1e-9 && a < b)) bi = k;
    }
    const cur = open.splice(bi, 1)[0]!;
    if (cur === e) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    const ci = cur % NX;
    const cj = Math.floor(cur / NX);
    for (const [di, dj, cost] of DIRS) {
      const i = ci + di;
      const j = cj + dj;
      if (i < 0 || j < 0 || i >= NX || j >= NZ) continue;
      const n = j * NX + i;
      if (!g.free[n] || closed[n]) continue;
      if (di && dj && (!g.free[cj * NX + i] || !g.free[j * NX + ci])) continue; // no corner cutting
      const ng = gs[cur]! + cost;
      if (ng < gs[n]! - 1e-9) {
        gs[n] = ng;
        prev[n] = cur;
        open.push(n);
      }
    }
  }
  const cells: Vec2[] = [];
  for (let c = e; c >= 0; c = c === s ? -1 : prev[c]!) {
    cells.push(cellCenter(c % NX, Math.floor(c / NX)));
    if (c !== s && prev[c]! < 0) break; // unreachable: keep what we have
  }
  cells.reverse();
  const pts = [from, ...cells, to];
  // Line-of-sight smoothing between the free waypoints (first and last legs are kept as given).
  const out: Vec2[] = [from];
  let k = 1;
  while (k < pts.length - 1) {
    let far = k;
    for (let m = pts.length - 2; m > k; m--) if (clear(g, pts[k]!, pts[m]!)) { far = m; break; }
    out.push(pts[k]!);
    k = far === k ? k + 1 : far;
  }
  out.push(pts[pts.length - 2]!, to);
  return out.filter((p, i) => i === 0 || Math.hypot(p.x - out[i - 1]!.x, p.z - out[i - 1]!.z) > 1e-6);
}
