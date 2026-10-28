// Layering pass for oriented boxes.
//
// Houses are built from many boxes: wall skin, courses, frames, sills, shutters, trims. Whenever two
// of them end up with a face on (nearly) the same plane looking the same way, the GPU cannot decide
// which one is in front and the pixels flicker (z-fighting). Instead of hand-tuning every offset, the
// mesh builder defers its boxes and runs this pass before emitting triangles:
//
//  * two overlapping faces that look the same way are always at least LAYER_STEP (2 cm) apart along
//    their normal. Boxes are processed in emission order, so a later detail adapts to earlier
//    geometry: a face level with or in front of an earlier face is pushed forward to LAYER_STEP in
//    front of it; a face just behind one is pulled back (a thin box slides back as a whole);
//  * a face that touches earlier faces looking the other way (a box standing on a wall, two boxes
//    meeting face to face) and is covered by them is hidden between two solids and is not emitted;
//    every other face is always emitted, so a box is never open (nothing can be seen through it).
//
// Boxes stay closed solids: only extents change, the list of faces never does. Boxes live in a frame
// (u along a facade, n outward, y up) that may be rotated about the vertical axis, so chamfered
// corners are handled exactly like straight facades.

/** Face flags, identical to PU..NN in mesh.ts (set bit = face not emitted). */
export const F_PU = 1;
export const F_NU = 2;
export const F_PY = 4;
export const F_NY = 8;
export const F_PN = 16;
export const F_NN = 32;

/** Minimum separation between two overlapping, equally facing faces (metres). */
export const LAYER_STEP = 0.02;
/** Pairs closer than this are separated (a hair under LAYER_STEP so exact 2 cm steps are left alone). */
const LAYER_TRIGGER = LAYER_STEP - 0.0005;
/** Minimum shared face area that counts as an overlap (m2). */
const LAYER_MIN_AREA = 4e-5;

export interface LayerFrame {
  ox: number;
  oz: number;
  ux: number;
  uz: number;
  nx: number;
  nz: number;
}

export interface LayerBox {
  f: LayerFrame;
  u0: number;
  u1: number;
  y0: number;
  y1: number;
  n0: number;
  n1: number;
  /** Faces not emitted (F_*). Updated by the pass when it drops hidden faces. */
  skip: number;
}

type Poly = number[];

interface FaceRec {
  /** Plane coordinate along the canonical direction. */
  pc: number;
  /** Rectangle extent for vertical faces: t0, t1 (horizontal), y0, y1. Polygon bounds for y faces. */
  a0: number;
  a1: number;
  b0: number;
  b1: number;
  /** Convex polygon (x, z pairs) of a horizontal face. */
  poly: Poly | null;
}

interface FaceInfo extends FaceRec {
  /** Index slot: canonical direction key * 2 + (looks along canonical ? 0 : 1). */
  slot: number;
  /** +1 when the face looks along the canonical direction, else -1. */
  sgn: number;
  /** 0 when the face looks along x, 2 along z (either way), -1 for any other direction. */
  axis: number;
}

export const FACES = [F_PU, F_NU, F_PY, F_NY, F_PN, F_NN];
const Y_KEY = 4_100_000;

function axisOf(cx: number, cz: number): number {
  if (Math.abs(cx) > 0.9999) return 0;
  if (Math.abs(cz) > 0.9999) return 2;
  return -1;
}

function dirKey(dx: number, dz: number): { key: number; sgn: number; cx: number; cz: number } {
  let kx = Math.round(dx * 1000);
  let kz = Math.round(dz * 1000);
  let sgn = 1;
  if (kx < 0 || (kx === 0 && kz < 0)) {
    kx = -kx;
    kz = -kz;
    sgn = -1;
  }
  // The key is rounded (frames of one orientation share a slot); the plane coordinate uses the exact direction.
  return { key: (kx + 1000) * 2001 + (kz + 1000), sgn, cx: sgn * dx, cz: sgn * dz };
}

function corners(b: LayerBox): Poly {
  const f = b.f;
  const pt = (u: number, n: number): [number, number] => [f.ox + u * f.ux + n * f.nx, f.oz + u * f.uz + n * f.nz];
  const p0 = pt(b.u0, b.n0);
  const p1 = pt(b.u1, b.n0);
  const p2 = pt(b.u1, b.n1);
  const p3 = pt(b.u0, b.n1);
  const poly = [...p0, ...p1, ...p2, ...p3];
  // Counter-clockwise for the clipper (frames can be mirrored).
  return polyAreaSigned(poly) < 0 ? [...p3, ...p2, ...p1, ...p0] : poly;
}

function polyAreaSigned(p: Poly): number {
  let a = 0;
  const n = p.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a += p[i * 2] * p[j * 2 + 1] - p[j * 2] * p[i * 2 + 1];
  }
  return a / 2;
}

/** Area of the intersection of two convex counter-clockwise polygons (Sutherland-Hodgman). */
function clipArea(a: Poly, b: Poly): number {
  let subject = a;
  const m = b.length / 2;
  for (let e = 0; e < m; e++) {
    const ax = b[e * 2];
    const ay = b[e * 2 + 1];
    const bx = b[((e + 1) % m) * 2];
    const by = b[((e + 1) % m) * 2 + 1];
    const side = (x: number, y: number): number => (bx - ax) * (y - ay) - (by - ay) * (x - ax);
    const out: Poly = [];
    const n = subject.length / 2;
    for (let i = 0; i < n; i++) {
      const cx = subject[i * 2];
      const cy = subject[i * 2 + 1];
      const dx = subject[((i + 1) % n) * 2];
      const dy = subject[((i + 1) % n) * 2 + 1];
      const sc = side(cx, cy);
      const sd = side(dx, dy);
      if (sc >= 0) out.push(cx, cy);
      if (sc >= 0 !== sd >= 0) {
        const t = sc / (sc - sd);
        out.push(cx + (dx - cx) * t, cy + (dy - cy) * t);
      }
    }
    subject = out;
    if (subject.length < 6) return 0;
  }
  return Math.abs(polyAreaSigned(subject));
}

/** Debug: face record of a box (used by the geometry tests to re-verify the pass). */
export function faceInfo(b: LayerBox, face: number): FaceInfo {
  const f = b.f;
  const ou = f.ox * f.ux + f.oz * f.uz;
  const on = f.ox * f.nx + f.oz * f.nz;
  switch (FACES[face]) {
    case F_PY:
    case F_NY: {
      const up = FACES[face] === F_PY;
      const poly = corners(b);
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      for (let i = 0; i < poly.length; i += 2) {
        a0 = Math.min(a0, poly[i]); a1 = Math.max(a1, poly[i]);
        b0 = Math.min(b0, poly[i + 1]); b1 = Math.max(b1, poly[i + 1]);
      }
      return { slot: Y_KEY * 2 + (up ? 0 : 1), sgn: up ? 1 : -1, axis: -1, pc: up ? b.y1 : b.y0, a0, a1, b0, b1, poly };
    }
    default: {
      // Vertical face: direction D is +-U or +-N; the in-plane horizontal axis is P = D rotated 90 degrees.
      const isU = FACES[face] === F_PU || FACES[face] === F_NU;
      const positive = FACES[face] === F_PU || FACES[face] === F_PN;
      const dx = (isU ? f.ux : f.nx) * (positive ? 1 : -1);
      const dz = (isU ? f.uz : f.nz) * (positive ? 1 : -1);
      const { key, sgn, cx, cz } = dirKey(dx, dz);
      // Plane coordinate along the canonical direction.
      const own = isU ? (positive ? ou + b.u1 : -(ou + b.u0)) : positive ? on + b.n1 : -(on + b.n0);
      const pc = own * sgn;
      // In-plane extent along P = (-cz, cx): P . p over the two end corners.
      const px = -cz;
      const pz = cx;
      const along = isU ? [b.n0, b.n1] : [b.u0, b.u1];
      const at = (v: number): number => {
        const u = isU ? (positive ? b.u1 : b.u0) : v;
        const n = isU ? v : positive ? b.n1 : b.n0;
        return px * (f.ox + u * f.ux + n * f.nx) + pz * (f.oz + u * f.uz + n * f.nz);
      };
      const t0 = at(along[0]);
      const t1 = at(along[1]);
      return { slot: key * 2 + (sgn > 0 ? 0 : 1), sgn, axis: axisOf(cx, cz), pc, a0: Math.min(t0, t1), a1: Math.max(t0, t1), b0: b.y0, b1: b.y1, poly: null };
    }
  }
}

/** Overlap area between a face record and a probe face (both in the same slot). */
export function overlap(r: FaceRec, q: FaceRec): number {
  if (r.a0 >= q.a1 || q.a0 >= r.a1 || r.b0 >= q.b1 || q.b0 >= r.b1) return 0;
  if (!r.poly && !q.poly) {
    const da = Math.min(r.a1, q.a1) - Math.max(r.a0, q.a0);
    const db = Math.min(r.b1, q.b1) - Math.max(r.b0, q.b0);
    return da > 0 && db > 0 ? da * db : 0;
  }
  const rect = (f: FaceRec): Poly => [f.a0, f.b0, f.a1, f.b0, f.a1, f.b1, f.a0, f.b1];
  return clipArea(r.poly ?? rect(r), q.poly ?? rect(q));
}

/**
 * Face record of an emitted polygon (world xyz triples, convex, planar) with the given unit normal, so
 * boxes keep clear of it. Polygons that are neither vertical nor horizontal (roof slopes) return null.
 */
export function fixedFace(pts: readonly number[], nx: number, ny: number, nz: number): FaceInfo | null {
  const n = pts.length / 3;
  if (n < 3) return null;
  if (Math.abs(ny) > 0.9995) {
    const up = ny > 0;
    const poly: Poly = [];
    let y = 0;
    for (let i = 0; i < n; i++) {
      poly.push(pts[i * 3], pts[i * 3 + 2]);
      y += pts[i * 3 + 1];
    }
    const ccw = polyAreaSigned(poly) >= 0 ? poly : reversePoly(poly);
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (let i = 0; i < ccw.length; i += 2) {
      a0 = Math.min(a0, ccw[i]); a1 = Math.max(a1, ccw[i]);
      b0 = Math.min(b0, ccw[i + 1]); b1 = Math.max(b1, ccw[i + 1]);
    }
    return { slot: Y_KEY * 2 + (up ? 0 : 1), sgn: up ? 1 : -1, axis: -1, pc: y / n, a0, a1, b0, b1, poly: ccw };
  }
  if (Math.abs(ny) > 0.01) return null;
  const len = Math.hypot(nx, nz);
  const { key, sgn, cx, cz } = dirKey(nx / len, nz / len);
  const px = -cz;
  const pz = cx;
  const poly: Poly = [];
  let pc = 0;
  for (let i = 0; i < n; i++) {
    poly.push(px * pts[i * 3] + pz * pts[i * 3 + 2], pts[i * 3 + 1]);
    pc += cx * pts[i * 3] + cz * pts[i * 3 + 2];
  }
  const ccw = polyAreaSigned(poly) >= 0 ? poly : reversePoly(poly);
  let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
  for (let i = 0; i < ccw.length; i += 2) {
    a0 = Math.min(a0, ccw[i]); a1 = Math.max(a1, ccw[i]);
    b0 = Math.min(b0, ccw[i + 1]); b1 = Math.max(b1, ccw[i + 1]);
  }
  return { slot: key * 2 + (sgn > 0 ? 0 : 1), sgn, axis: axisOf(cx, cz), pc: pc / n, a0, a1, b0, b1, poly: ccw };
}

function reversePoly(p: Poly): Poly {
  const out: Poly = [];
  for (let i = p.length / 2 - 1; i >= 0; i--) out.push(p[i * 2], p[i * 2 + 1]);
  return out;
}

/** Moves one face of the box forward (positive) or back along its own normal. */
function shiftFace(b: LayerBox, face: number, delta: number): void {
  switch (FACES[face]) {
    case F_PU: b.u1 += delta; break;
    case F_NU: b.u0 -= delta; break;
    case F_PY: b.y1 += delta; break;
    case F_NY: b.y0 -= delta; break;
    case F_PN: b.n1 += delta; break;
    case F_NN: b.n0 -= delta; break;
  }
}

function thickness(b: LayerBox, face: number): number {
  switch (FACES[face]) {
    case F_PU:
    case F_NU: return b.u1 - b.u0;
    case F_PY:
    case F_NY: return b.y1 - b.y0;
    default: return b.n1 - b.n0;
  }
}

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
