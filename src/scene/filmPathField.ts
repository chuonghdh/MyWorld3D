import type { Block, CityLayout, RoadSegment } from '../city/layout';
import type { V3 } from './cameraMath';

// Height field of the film path (pure): roof tops from the layout, clearance tests for lines and roads.
// Roofs are estimates from the layout (not the built pieces), so P6 must check them by eye.

/** Raster cell of the height field, metres. A cell counts as roof when its centre lies in the footprint (+ half a cell). */
export const CELL_M = 2;
/** Roof height estimate from buildings/facade/layout.ts storey heights (not measured): ground, storey, roof. */
export const GROUND_FLOOR_M = 4.2;
export const STOREY_M = 3.4;
export const ROOF_M = 4;
/** Monument height estimate (cathedral spire included), metres. */
export const MONUMENT_TOP_M = 45;
/** Shortest road usable for the descent, metres: the descent runs between two approach points at the road ends. */
export const MIN_ROAD_M = 150;
export const ROAD_SAMPLE_M = 1;
/** Approach distance before a drop: the knot before a descent or perch sits this far off, at cruise height, so no knot pair is vertical (no spline overshoot), metres. */
export const APPROACH_M = 60;

export interface HeightField {
  x0: number;
  z0: number;
  nx: number;
  nz: number;
  top: Float32Array;
  max: number;
}

/** Roof top estimate for a lot with `floors` storeys. */
export function roofTopM(floors: number): number {
  return GROUND_FLOOR_M + Math.max(0, floors - 1) * STOREY_M + ROOF_M;
}

function insideRect(px: number, pz: number, cx: number, cz: number, facing: number, width: number, depth: number, pad: number): boolean {
  const dx = px - cx;
  const dz = pz - cz;
  const s = Math.sin(facing);
  const c = Math.cos(facing);
  const along = dx * s + dz * c; // lot front axis (lotGeometry in city/blocks.ts)
  const lat = dx * c - dz * s;
  return Math.abs(along) <= depth / 2 + pad && Math.abs(lat) <= width / 2 + pad;
}

export function buildField(layout: CityLayout): HeightField {
  const b = layout.townBounds;
  const x0 = b.minX - 2 * CELL_M;
  const z0 = b.minZ - 2 * CELL_M;
  const nx = Math.ceil((b.maxX - b.minX) / CELL_M) + 5;
  const nz = Math.ceil((b.maxZ - b.minZ) / CELL_M) + 5;
  const top = new Float32Array(nx * nz);
  const kindOf = new Map<string, Block['kind']>(layout.blocks.map((blk) => [blk.id, blk.kind]));

  const stamp = (cx: number, cz: number, facing: number, width: number, depth: number, h: number): void => {
    const s = Math.abs(Math.sin(facing));
    const c = Math.abs(Math.cos(facing));
    const ex = (depth / 2) * s + (width / 2) * c + CELL_M;
    const ez = (depth / 2) * c + (width / 2) * s + CELL_M;
    const i0 = Math.max(0, Math.floor((cx - ex - x0) / CELL_M));
    const i1 = Math.min(nx - 1, Math.floor((cx + ex - x0) / CELL_M));
    const j0 = Math.max(0, Math.floor((cz - ez - z0) / CELL_M));
    const j1 = Math.min(nz - 1, Math.floor((cz + ez - z0) / CELL_M));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const px = x0 + (i + 0.5) * CELL_M;
        const pz = z0 + (j + 0.5) * CELL_M;
        if (!insideRect(px, pz, cx, cz, facing, width, depth, CELL_M / 2)) continue;
        const k = j * nx + i;
        if (top[k]! < h) top[k] = h;
      }
    }
  };

  for (const blk of layout.blocks) {
    if (blk.kind !== 'monument') continue;
    const r = blk.bounds;
    stamp((r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2, 0, r.maxX - r.minX, r.maxZ - r.minZ, MONUMENT_TOP_M);
  }
  for (const lot of layout.lots) {
    if (kindOf.get(lot.blockId) === 'monument') continue;
    stamp(lot.position.x, lot.position.z, lot.facing, lot.width, lot.depth, roofTopM(lot.floors));
  }
  let max = 0;
  for (const v of top) if (v > max) max = v;
  return { x0, z0, nx, nz, top, max };
}

/** Height floor under (x, z): the roof top of the footprint that holds the point, 0 on open ground. */
export function floorAt(f: HeightField, x: number, z: number): number {
  const i = Math.floor((x - f.x0) / CELL_M);
  const j = Math.floor((z - f.z0) / CELL_M);
  if (i < 0 || j < 0 || i >= f.nx || j >= f.nz) return 0;
  return f.top[j * f.nx + i]!;
}

/** True when the straight line a -> b stays at or above floor + minH (sampled). */
export function lineClear(f: HeightField, a: V3, b: V3, minH: number): boolean {
  const n = 24;
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const x = a[0] + (b[0] - a[0]) * t;
    const y = a[1] + (b[1] - a[1]) * t;
    const z = a[2] + (b[2] - a[2]) * t;
    if (y < floorAt(f, x, z) + minH) return false;
  }
  return true;
}

export function roadIsClear(f: HeightField, road: RoadSegment, clearance: number): boolean {
  const dx = road.end.x - road.start.x;
  const dz = road.end.z - road.start.z;
  const len = Math.hypot(dx, dz);
  if (len < MIN_ROAD_M) return false;
  const ux = dx / len;
  const uz = dz / len;
  const px = -uz;
  const pz = ux;
  const span = len - 2 * APPROACH_M;
  const n = Math.max(1, Math.floor(span / ROAD_SAMPLE_M));
  for (let k = 0; k <= n; k++) {
    const d = APPROACH_M + (span * k) / n;
    const x = road.start.x + ux * d;
    const z = road.start.z + uz * d;
    if (floorAt(f, x, z) > 0 || floorAt(f, x + px * clearance, z + pz * clearance) > 0 || floorAt(f, x - px * clearance, z - pz * clearance) > 0) return false;
  }
  return true;
}

/** Wall clearance of the route, in field cells (one cell = CELL_M metres): a roof within this reach lifts the camera. */
export const WALL_CLEAR_CELLS = 1;

/**
 * Field dilated by `cells` in every direction (max filter). The route floor reads this field, so the camera is
 * raised above any roof it passes within the wall clearance, not only above the roof it is over.
 */
export function dilateField(f: HeightField, cells: number): HeightField {
  const { nx, nz } = f;
  const tmp = new Float32Array(nx * nz);
  const top = new Float32Array(nx * nz);
  // Horizontal pass into tmp, then vertical pass into top (separable max filter).
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      let m = 0;
      for (let di = Math.max(0, i - cells); di <= Math.min(nx - 1, i + cells); di++) m = Math.max(m, f.top[j * nx + di]!);
      tmp[j * nx + i] = m;
    }
  }
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      let m = 0;
      for (let dj = Math.max(0, j - cells); dj <= Math.min(nz - 1, j + cells); dj++) m = Math.max(m, tmp[dj * nx + i]!);
      top[j * nx + i] = m;
    }
  }
  return { x0: f.x0, z0: f.z0, nx, nz, top, max: f.max };
}
