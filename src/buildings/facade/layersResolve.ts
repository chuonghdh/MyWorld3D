// Layer resolution: limits, layered solids and buried-face removal (split from layers.ts).

import { F_PU, F_NU, F_PY, F_NY, F_PN, F_NN, LAYER_STEP, LAYER_TRIGGER, LAYER_MIN_AREA, LayerBox, FaceRec, FaceInfo, FACES, polyAreaSigned, faceInfo, overlap, shiftFace, thickness } from './layersGeometry';

/** World limits (x, z) that equally facing faces must not be pushed beyond (the lot, plus what a side may project). */
export interface LayerLimits {
  xmin: number;
  xmax: number;
  zmin: number;
  zmax: number;
}

export function resolveLayers(
  boxes: readonly LayerBox[],
  fixed: readonly FaceInfo[] = [],
  solids: readonly Solid[] = [],
  limits: LayerLimits | null = null,
): void {
  const index = new Map<number, FaceRec[]>();
  const bucketOf = (c: number): number => Math.round(c / LAYER_STEP);
  const keyOf = (slot: number, bucket: number): number => slot * 1_000_003 + bucket + 500_000;
  for (const info of fixed) {
    const key = keyOf(info.slot, bucketOf(info.pc));
    const list = index.get(key);
    if (list) list.push(info);
    else index.set(key, [info]);
  }

  /** Earlier faces looking the same way whose plane is within `radius` and that overlap the probe. */
  const near = (info: FaceInfo, radius: number): FaceRec[] => {
    const out: FaceRec[] = [];
    const bk = bucketOf(info.pc);
    const span = Math.ceil(radius / LAYER_STEP);
    for (let d = -span; d <= span; d++) {
      const list = index.get(keyOf(info.slot, bk + d));
      if (!list) continue;
      for (const r of list) {
        if (Math.abs(r.pc - info.pc) >= radius) continue;
        if (overlap(r, info) > LAYER_MIN_AREA) out.push(r);
      }
    }
    return out;
  };
  const oppositeSlot = (slot: number): number => (slot % 2 === 0 ? slot + 1 : slot - 1);

  for (const b of boxes) {
    // The underside of anything standing on the ground is below the ground surface: never seen, never moved.
    if (b.y0 <= 0.005) b.skip |= F_NY;
    for (let pass = 0; pass < 10; pass++) {
      let changed = false;
      for (let face = 0; face < 6; face++) {
        if (b.skip & FACES[face]) continue;
        const info = faceInfo(b, face);
        const hits = near(info, LAYER_TRIGGER);
        if (hits.length === 0) continue;
        // Free position: at least LAYER_STEP from every overlapping earlier face nearby, as close to
        // the current one as possible (forward wins ties); backward moves must leave a usable box.
        const around = near(info, 6 * LAYER_STEP).map((r) => info.sgn * r.pc);
        const here = info.sgn * info.pc;
        const thick = thickness(b, face);
        let best = NaN;
        let bestCost = Infinity;
        let bestSlide = false;
        for (const r of around) {
          for (const cand of [r + LAYER_STEP, r - LAYER_STEP]) {
            if (!around.every((o) => Math.abs(cand - o) >= LAYER_TRIGGER)) continue;
            const back = here - cand;
            // A box too thin to shrink by `back` slides back as a whole (a little less attractive).
            const slide = back > 0 && thick - back < 0.004;
            if (limits && info.axis >= 0 && cand > here) {
              // The plane coordinate along the canonical direction (x or z) must stay inside the limits.
              const pcNew = info.sgn * cand;
              const lo = info.axis === 0 ? limits.xmin : limits.zmin;
              const hi = info.axis === 0 ? limits.xmax : limits.zmax;
              if (pcNew > hi + 1e-9 || pcNew < lo - 1e-9) continue;
            }
            const cost = Math.abs(cand - here) + (back > 0 ? 1e-6 : 0) + (slide ? 0.05 : 0);
            if (cost < bestCost) {
              bestCost = cost;
              best = cand;
              bestSlide = slide;
            }
          }
        }
        if (Number.isNaN(best)) best = Math.max(...around) + LAYER_STEP;
        shiftFace(b, face, best - here);
        // Sliding: move the opposite face the same way (PU/NU, PY/NY and PN/NN are neighbours in FACES).
        if (bestSlide) shiftFace(b, face ^ 1, here - best);
        changed = true;
      }
      if (!changed) break;
    }
    // Hidden faces: touching earlier faces that look the other way and together cover this one. Opposite
    // faces in one plane never overlap each other (equally facing ones are kept 2 cm apart), so their
    // overlap areas add up.
    for (let face = 0; face < 6; face++) {
      if (b.skip & FACES[face]) continue;
      const info = faceInfo(b, face);
      const oslot = oppositeSlot(info.slot);
      const bk = bucketOf(info.pc);
      const own = info.poly ? Math.abs(polyAreaSigned(info.poly)) : (info.a1 - info.a0) * (info.b1 - info.b0);
      let covered = 0;
      for (let d = -1; d <= 1; d++) {
        const list = index.get(keyOf(oslot, bk + d));
        if (!list) continue;
        for (const r of list) {
          if (Math.abs(r.pc - info.pc) >= 1e-3) continue;
          covered += overlap(r, info);
        }
      }
      if (covered >= own * 0.999) b.skip |= FACES[face];
    }
    // Register this box's visible faces.
    for (let face = 0; face < 6; face++) {
      if (b.skip & FACES[face]) continue;
      const info = faceInfo(b, face);
      const key = keyOf(info.slot, bucketOf(info.pc));
      const list = index.get(key);
      if (list) list.push(info);
      else index.set(key, [info]);
    }
  }
  dropBuriedFaces(boxes, solids);
}

/** Convex prism standing on the ground plane (the house core): xz polygon, counter-clockwise, and y range. */
export interface Solid {
  poly: readonly number[];
  y0: number;
  y1: number;
}

const GRID = 1;
/**
 * A face whose outer side lies entirely inside other solids (another box, or the house core) can never
 * be seen: a box standing on a wall loses its back, stacked boxes lose the faces they share. Faces are
 * tested at a 3 x 3 pattern of points a few millimetres in front of them; one point outside any solid
 * keeps the face.
 */
function dropBuriedFaces(boxes: readonly LayerBox[], solids: readonly Solid[]): void {
  const cells = new Map<string, number[]>();
  const keyOf = (ix: number, iy: number, iz: number): string => `${ix},${iy},${iz}`;
  const world = (b: LayerBox, u: number, n: number): [number, number] => [b.f.ox + u * b.f.ux + n * b.f.nx, b.f.oz + u * b.f.uz + n * b.f.nz];
  boxes.forEach((b, i) => {
    const pts = [world(b, b.u0, b.n0), world(b, b.u1, b.n0), world(b, b.u1, b.n1), world(b, b.u0, b.n1)];
    const x0 = Math.floor(Math.min(...pts.map((p) => p[0])) / GRID);
    const x1 = Math.floor(Math.max(...pts.map((p) => p[0])) / GRID);
    const z0 = Math.floor(Math.min(...pts.map((p) => p[1])) / GRID);
    const z1 = Math.floor(Math.max(...pts.map((p) => p[1])) / GRID);
    const y0 = Math.floor(b.y0 / GRID);
    const y1 = Math.floor(b.y1 / GRID);
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++) {
          const k = keyOf(x, y, z);
          const l = cells.get(k);
          if (l) l.push(i);
          else cells.set(k, [i]);
        }
  });
  const EPS = 1e-4;
  const insideBox = (b: LayerBox, x: number, y: number, z: number): boolean => {
    if (y < b.y0 - EPS || y > b.y1 + EPS) return false;
    const dx = x - b.f.ox;
    const dz = z - b.f.oz;
    const u = dx * b.f.ux + dz * b.f.uz;
    const n = dx * b.f.nx + dz * b.f.nz;
    return u >= b.u0 - EPS && u <= b.u1 + EPS && n >= b.n0 - EPS && n <= b.n1 + EPS;
  };
  const insideSolid = (sd: Solid, x: number, y: number, z: number): boolean => {
    if (y < sd.y0 - EPS || y > sd.y1 + EPS) return false;
    const n = sd.poly.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ex = sd.poly[j * 2] - sd.poly[i * 2];
      const ez = sd.poly[j * 2 + 1] - sd.poly[i * 2 + 1];
      if (ex * (z - sd.poly[i * 2 + 1]) - ez * (x - sd.poly[i * 2]) < -EPS) return false;
    }
    return true;
  };
  const OUT = 0.004;
  // A face is buried when its four corners, pushed a few millimetres outward, all lie inside one single
  // solid (solids are convex, so the whole face is then inside it). Unions of several solids are not
  // considered: a face is kept unless one solid hides all of it, which is what makes gaps between
  // courses, bars and the like safe.
  boxes.forEach((b, i) => {
    for (let face = 0; face < 6; face++) {
      if (b.skip & FACES[face]) continue;
      const cp: [number, number, number][] = [];
      const pts = (u: number[], y: number[], n: number[]): void => {
        for (const uu of u) for (const yy of y) for (const nn of n) {
          const [x, z] = world(b, uu, nn);
          cp.push([x, yy, z]);
        }
      };
      switch (FACES[face]) {
        case F_PU: pts([b.u1 + OUT], [b.y0, b.y1], [b.n0, b.n1]); break;
        case F_NU: pts([b.u0 - OUT], [b.y0, b.y1], [b.n0, b.n1]); break;
        case F_PN: pts([b.u0, b.u1], [b.y0, b.y1], [b.n1 + OUT]); break;
        case F_NN: pts([b.u0, b.u1], [b.y0, b.y1], [b.n0 - OUT]); break;
        case F_PY: pts([b.u0, b.u1], [b.y1 + OUT], [b.n0, b.n1]); break;
        default: pts([b.u0, b.u1], [b.y0 - OUT], [b.n0, b.n1]); break;
      }
      let hidden = false;
      for (const sd of solids) {
        if (cp.every(([x, y, z]) => insideSolid(sd, x, y, z))) {
          hidden = true;
          break;
        }
      }
      if (!hidden) {
        // Candidate boxes: those registered in the cell of the first corner.
        const [x0, y0, z0] = cp[0];
        const list = cells.get(keyOf(Math.floor(x0 / GRID), Math.floor(y0 / GRID), Math.floor(z0 / GRID)));
        if (list) for (const j of list) if (j !== i && cp.every(([x, y, z]) => insideBox(boxes[j], x, y, z))) { hidden = true; break; }
      }
      // The underside of anything standing on the ground is below the ground surface: never seen.
      if (FACES[face] === F_NY && b.y0 <= 0.005) hidden = true;
      if (hidden) b.skip |= FACES[face];
    }
  });
}
