// Park-like greenery for the large shared courtyard of a merged block (city/merge.ts).
//
// A merged block has one courtyard that spans what used to be two to four courtyards plus the street between them.
// The small-courtyard recipe (edge hedges, 2-4 beds, 3-5 bushes) leaves such a yard as a bare lawn, so large yards
// get their own plan: hedges along the rear lots with gaps where the paths arrive, clusters of small trees of mixed
// kinds and sizes, bushes at the cluster edges, flower beds lining the path arms near the centre, and one sitting
// spot (benches round a sandbox, framed by a low hedge). Everything is placed off the gravel paths that
// streets/surfaces.ts draws (a cross through the centre plus a loop) and off a clear central plaza where the
// fountain goes. Density scales with the yard area.
//
// The plan is pure data (testable without WebGL); `buildParkYard` turns it into triangles in the three greenery
// builders, so a park adds no draw call.

import type { CourtyardRect, Rect } from '../city/layout';


/** Gravel paths of streets/surfaces.ts `buildCourtyard` (kept in sync by tests/parkYard.test.ts). */
export function courtyardPathWidth(r: Rect): number {
  return Math.min(1.4, Math.min(r.maxX - r.minX, r.maxZ - r.minZ) * 0.12);
}
/** Inset of the path loop from each edge, as a fraction of the side (surfaces.ts uses 0.27 when both sides >= 14 m). */
export const PATH_LOOP_INSET = 0.27;
/** Radius kept free round the centre for the fountain plaza and its benches. */
export const PARK_PLAZA_CLEAR = 6.5;
/** Distance kept between anything planted and a path edge. */
const PATH_MARGIN = 0.5;
/** Tree trunks stay this far inside the courtyard edge. */
const TREE_EDGE = 2.6;
/** Tree crowns stay this far inside the edge: clear of the edge hedges, never over the rear lots. */
export const CROWN_EDGE = 2.4;
/** Beds, bushes and the sitting spot stay this far inside the edge (clear of the edge hedges). */
const ITEM_EDGE = 2.2;
const HEDGE_INSET = 0.5;
const HEDGE_WIDTH = 0.7;

/** A courtyard is a park when it is the shared yard of a merged block (flag set by city/generate.ts). */
export function isParkYard(r: CourtyardRect): boolean {
  return r.merged === true;
}

export type ParkTreeKind = 'round' | 'conifer' | 'column';

export interface ParkTree {
  x: number;
  z: number;
  kind: ParkTreeKind;
  /** Overall scale, 0.8-1.9 (1 is a ~3.5 m tree). */
  size: number;
  /** Ground radius of the crown. */
  radius: number;
}

export interface ParkBox {
  cx: number;
  cz: number;
  w: number;
  d: number;
}

export interface ParkPlan {
  /** Hedge runs [x0, z0, x1, z1]. */
  hedges: [number, number, number, number][];
  beds: ParkBox[];
  bushes: { x: number; z: number; size: number }[];
  trees: ParkTree[];
  /** Sandbox of the sitting spot, or null (no free patch, or only room for the compact bench pair). */
  play: ParkBox | null;
  /** Benches: centre and yaw (the seat faces +z rotated by yaw). */
  benches: { x: number; z: number; yaw: number }[];
}

/** Circle to keep clear (e.g. an existing courtyard tree). `reserved` discs (the fountain plaza) are also respected by small yards. */
export interface ParkObstacle {
  x: number;
  z: number;
  r: number;
  reserved?: true;
}

const range = (rng: () => number, lo: number, hi: number) => lo + (hi - lo) * rng();

/** Axis-aligned keep-out boxes: the path cross, the path loop and the central plaza (as a square). */
export function parkKeepOut(r: Rect): Rect[] {
  const w = r.maxX - r.minX;
  const d = r.maxZ - r.minZ;
  const cx = (r.minX + r.maxX) / 2;
  const cz = (r.minZ + r.maxZ) / 2;
  const h = courtyardPathWidth(r) / 2 + PATH_MARGIN;
  const out: Rect[] = [
    { minX: r.minX, maxX: r.maxX, minZ: cz - h, maxZ: cz + h },
    { minX: cx - h, maxX: cx + h, minZ: r.minZ, maxZ: r.maxZ },
  ];
  if (w >= 14 && d >= 14) {
    const x0 = r.minX + w * PATH_LOOP_INSET;
    const x1 = r.maxX - w * PATH_LOOP_INSET;
    const z0 = r.minZ + d * PATH_LOOP_INSET;
    const z1 = r.maxZ - d * PATH_LOOP_INSET;
    const pw = courtyardPathWidth(r);
    const m = PATH_MARGIN;
    out.push(
      { minX: x0 - m, maxX: x1 + m, minZ: z0 - m, maxZ: z0 + pw + m },
      { minX: x0 - m, maxX: x1 + m, minZ: z1 - pw - m, maxZ: z1 + m },
      { minX: x0 - m, maxX: x0 + pw + m, minZ: z0 - m, maxZ: z1 + m },
      { minX: x1 - pw - m, maxX: x1 + m, minZ: z0 - m, maxZ: z1 + m },
    );
  }
  return out;
}

const circleHitsRect = (x: number, z: number, rad: number, b: Rect) => {
  const nx = Math.max(b.minX, Math.min(x, b.maxX));
  const nz = Math.max(b.minZ, Math.min(z, b.maxZ));
  return Math.hypot(x - nx, z - nz) < rad;
};

/** Pure layout of a park courtyard. Deterministic for one rng stream. */
export function planParkYard(r: Rect, rng: () => number, obstacles: readonly ParkObstacle[] = []): ParkPlan {
  const w = r.maxX - r.minX;
  const d = r.maxZ - r.minZ;
  const cx = (r.minX + r.maxX) / 2;
  const cz = (r.minZ + r.maxZ) / 2;
  const area = w * d;
  const keep = parkKeepOut(r);
  const pw = courtyardPathWidth(r);
  const discs: ParkObstacle[] = [...obstacles];
  const boxes: Rect[] = [];

  /** True when a circle is inside the yard (with `edge` margin) and clear of paths, plaza and earlier items. */
  const freeCircle = (x: number, z: number, rad: number, edge: number, gap = 0.3): boolean => {
    if (x - rad < r.minX + edge || x + rad > r.maxX - edge || z - rad < r.minZ + edge || z + rad > r.maxZ - edge) return false;
    if (Math.hypot(x - cx, z - cz) < PARK_PLAZA_CLEAR + rad) return false;
    if (keep.some((k) => circleHitsRect(x, z, rad, k))) return false;
    if (boxes.some((b) => circleHitsRect(x, z, rad + gap, b))) return false;
    return !discs.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + rad + gap);
  };
  const freeBox = (b: Rect, edge: number, gap: number): boolean => {
    if (b.minX < r.minX + edge || b.maxX > r.maxX - edge || b.minZ < r.minZ + edge || b.maxZ > r.maxZ - edge) return false;
    // Distance from the centre to the nearest point of the box.
    const nx = Math.max(b.minX, Math.min(cx, b.maxX));
    const nz = Math.max(b.minZ, Math.min(cz, b.maxZ));
    if (Math.hypot(cx - nx, cz - nz) < PARK_PLAZA_CLEAR) return false;
    const grown = { minX: b.minX - gap, maxX: b.maxX + gap, minZ: b.minZ - gap, maxZ: b.maxZ + gap };
    if (keep.some((k) => k.minX < b.maxX && k.maxX > b.minX && k.minZ < b.maxZ && k.maxZ > b.minZ)) return false;
    if (boxes.some((k) => k.minX < grown.maxX && k.maxX > grown.minX && k.minZ < grown.maxZ && k.maxZ > grown.minZ)) return false;
    return !discs.some((o) => circleHitsRect(o.x, o.z, o.r + gap, b));
  };

  const plan: ParkPlan = { hedges: [], beds: [], bushes: [], trees: [], play: null, benches: [] };

  // 1. Flower beds lining the four path arms just outside the plaza, on alternate sides of each arm.
  const armBeds: [number, number, boolean][] = [
    [1, 0, true],
    [-1, 0, true],
    [0, 1, false],
    [0, -1, false],
  ];
  for (const [ax, az, alongX] of armBeds) {
    const len = range(rng, 3, 4.6);
    const dep = range(rng, 1.1, 1.5);
    const along = PARK_PLAZA_CLEAR + 0.6 + len / 2;
    const side = rng() < 0.5 ? -1 : 1;
    const off = pw / 2 + PATH_MARGIN + 0.2 + dep / 2;
    const bx = cx + ax * along + (alongX ? 0 : side * off);
    const bz = cz + az * along + (alongX ? side * off : 0);
    const bw = alongX ? len : dep;
    const bd = alongX ? dep : len;
    const box = { minX: bx - bw / 2, maxX: bx + bw / 2, minZ: bz - bd / 2, maxZ: bz + bd / 2 };
    if (!freeBox(box, ITEM_EDGE, 0.4)) continue;
    boxes.push(box);
    plan.beds.push({ cx: bx, cz: bz, w: bw, d: bd });
  }

  // 2. Sitting spot: a sandbox with a bench on each side and a low hedge behind them, in a free lawn patch.
  //    Narrow yards fall back to a compact spot: two benches facing each other.
  const spots = [
    { hw: 3.6, hd: 3.2, bench: 2.4, sandbox: true },
    { hw: 1.6, hd: 1.9, bench: 1.0, sandbox: false },
  ];
  for (const spot of spots) {
    for (let tries = 0; tries < 40 && plan.benches.length === 0; tries++) {
      const sx = range(rng, r.minX + ITEM_EDGE + spot.hw, r.maxX - ITEM_EDGE - spot.hw);
      const sz = range(rng, r.minZ + ITEM_EDGE + spot.hd, r.maxZ - ITEM_EDGE - spot.hd);
      const box = { minX: sx - spot.hw, maxX: sx + spot.hw, minZ: sz - spot.hd, maxZ: sz + spot.hd };
      if (!freeBox(box, ITEM_EDGE, 0.6)) continue;
      boxes.push(box);
      if (spot.sandbox) plan.play = { cx: sx, cz: sz, w: 2.6, d: 2.6 };
      plan.benches.push({ x: sx, z: sz - spot.bench, yaw: 0 }, { x: sx, z: sz + spot.bench, yaw: Math.PI });
      // Low hedge on the side towards the nearer courtyard end (shelter from the rear lots).
      const hx = sx < cx ? sx - spot.hw + 0.5 : sx + spot.hw - 0.5;
      plan.hedges.push([hx, sz - spot.hd + 0.6, hx, sz + spot.hd - 0.6]);
    }
  }

  // 3. Tree clusters of mixed kinds and sizes, spread over the lawn; count scales with the area.
  const clusterCount = Math.max(3, Math.min(18, Math.round(area / 230)));
  const clusterCentres: { x: number; z: number }[] = [];
  for (let tries = 0; tries < clusterCount * 25 && clusterCentres.length < clusterCount; tries++) {
    const x = range(rng, r.minX + TREE_EDGE, r.maxX - TREE_EDGE);
    const z = range(rng, r.minZ + TREE_EDGE, r.maxZ - TREE_EDGE);
    if (clusterCentres.some((c) => Math.hypot(c.x - x, c.z - z) < 7.5)) continue;
    if (!freeCircle(x, z, 0.8, CROWN_EDGE)) continue;
    clusterCentres.push({ x, z });
  }
  clusterCentres.forEach((c) => {
    const n = 2 + Math.floor(rng() * 4);
    const grove: ParkTree[] = [];
    for (let i = 0, tries = 0; i < n && tries < 16; tries++) {
      const a = rng() * Math.PI * 2;
      const dist = i === 0 ? 0 : range(rng, 2.2, 4);
      const roll = rng();
      const kind: ParkTreeKind = roll < 0.55 ? 'round' : roll < 0.82 ? 'conifer' : 'column';
      // Mostly mid-size park trees with the odd young or old one.
      const size = rng() < 0.2 ? range(rng, 0.8, 1.1) : range(rng, 1.2, 1.9);
      const radius = (kind === 'round' ? 1.35 : kind === 'conifer' ? 1.05 : 0.75) * size;
      const x = c.x + Math.cos(a) * dist;
      const z = c.z + Math.sin(a) * dist;
      // Trees of one grove may touch (crowns interleave), so the gap to grove mates is negative.
      if (grove.some((t) => Math.hypot(t.x - x, t.z - z) < (t.radius + radius) * 0.7)) continue;
      if (!freeCircle(x, z, radius, CROWN_EDGE)) continue;
      // Trunk clearance from the edge so crowns stay over the yard.
      if (x < r.minX + TREE_EDGE || x > r.maxX - TREE_EDGE || z < r.minZ + TREE_EDGE || z > r.maxZ - TREE_EDGE) continue;
      grove.push({ x, z, kind, size, radius });
      i++;
    }
    for (const t of grove) discs.push({ x: t.x, z: t.z, r: t.radius });
    plan.trees.push(...grove);
    // Two or three bushes round the grove edge.
    const nb = 2 + Math.floor(rng() * 2);
    for (let i = 0, tries = 0; i < nb && tries < 12; tries++) {
      const a = rng() * Math.PI * 2;
      const dist = range(rng, 2.8, 4.4);
      const x = c.x + Math.cos(a) * dist;
      const z = c.z + Math.sin(a) * dist;
      const size = range(rng, 0.55, 0.85);
      if (!freeCircle(x, z, size * 1.2, ITEM_EDGE, 0.15)) continue;
      discs.push({ x, z, r: size * 1.2 });
      plan.bushes.push({ x, z, size });
      i++;
    }
  });

  // 4. A few more beds and loose bushes on the open lawn.
  const extraBeds = Math.max(1, Math.round(area / 900));
  for (let tries = 0, made = 0; made < extraBeds && tries < 40; tries++) {
    const rot = rng() < 0.5;
    const bw = range(rng, 2.2, 3.8);
    const bd = range(rng, 1.1, 1.8);
    const ew = rot ? bd : bw;
    const ed = rot ? bw : bd;
    const x = range(rng, r.minX + ITEM_EDGE + ew / 2, r.maxX - ITEM_EDGE - ew / 2);
    const z = range(rng, r.minZ + ITEM_EDGE + ed / 2, r.maxZ - ITEM_EDGE - ed / 2);
    const box = { minX: x - ew / 2, maxX: x + ew / 2, minZ: z - ed / 2, maxZ: z + ed / 2 };
    if (!freeBox(box, ITEM_EDGE, 1)) continue;
    boxes.push(box);
    plan.beds.push({ cx: x, cz: z, w: ew, d: ed });
    made++;
  }
  const looseBushes = Math.round(area / 260);
  for (let tries = 0, made = 0; made < looseBushes && tries < looseBushes * 10; tries++) {
    // Mostly along the edge hedges, like a planted border.
    const edgeSide = rng() < 0.7;
    let x = range(rng, r.minX + ITEM_EDGE + 0.8, r.maxX - ITEM_EDGE - 0.8);
    let z = range(rng, r.minZ + ITEM_EDGE + 0.8, r.maxZ - ITEM_EDGE - 0.8);
    if (edgeSide) {
      const s = Math.floor(rng() * 4);
      const inset = ITEM_EDGE + 0.9;
      if (s === 0) x = r.minX + inset;
      else if (s === 1) x = r.maxX - inset;
      else if (s === 2) z = r.minZ + inset;
      else z = r.maxZ - inset;
    }
    const size = range(rng, 0.5, 0.85);
    if (!freeCircle(x, z, size * 1.2, ITEM_EDGE, 0.2)) continue;
    discs.push({ x, z, r: size * 1.2 });
    plan.bushes.push({ x, z, size });
    made++;
  }

  // 5. Hedges along the rear lots with natural gaps, always open where a path meets the edge.
  const x0 = r.minX + HEDGE_INSET + HEDGE_WIDTH / 2;
  const x1 = r.maxX - HEDGE_INSET - HEDGE_WIDTH / 2;
  const z0 = r.minZ + HEDGE_INSET + HEDGE_WIDTH / 2;
  const z1 = r.maxZ - HEDGE_INSET - HEDGE_WIDTH / 2;
  const opening = pw / 2 + 1.2;
  const runs: { ax: number; az: number; bx: number; bz: number; door: number }[] = [
    { ax: x0 - HEDGE_WIDTH / 2, az: z0, bx: x1 + HEDGE_WIDTH / 2, bz: z0, door: cx - (x0 - HEDGE_WIDTH / 2) },
    { ax: x0 - HEDGE_WIDTH / 2, az: z1, bx: x1 + HEDGE_WIDTH / 2, bz: z1, door: cx - (x0 - HEDGE_WIDTH / 2) },
    { ax: x0, az: z0 + HEDGE_WIDTH / 2, bx: x0, bz: z1 - HEDGE_WIDTH / 2, door: cz - (z0 + HEDGE_WIDTH / 2) },
    { ax: x1, az: z0 + HEDGE_WIDTH / 2, bx: x1, bz: z1 - HEDGE_WIDTH / 2, door: cz - (z0 + HEDGE_WIDTH / 2) },
  ];
  for (const { ax, az, bx, bz, door } of runs) {
    const len = Math.hypot(bx - ax, bz - az);
    const ux = (bx - ax) / len;
    const uz = (bz - az) / len;
    let s = range(rng, 0, 1.2);
    while (s < len - 0.8) {
      let seg = Math.min(range(rng, 4, 9), len - s);
      // Cut the run at the path opening.
      if (s < door + opening && s + seg > door - opening) {
        if (s < door - opening) seg = door - opening - s;
        else {
          s = door + opening;
          continue;
        }
      }
      if (seg >= 1.2) plan.hedges.push([ax + ux * s, az + uz * s, ax + ux * (s + seg), az + uz * (s + seg)]);
      s += seg + range(rng, 1.4, 3);
    }
  }
  return plan;
}

export { buildParkYard, type ParkBuilders, type ParkPieces } from './parkGeometry';
