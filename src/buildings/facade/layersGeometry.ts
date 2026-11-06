// Layer geometry helpers: face flags, face info, overlap and clipping (split from layers.ts).

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
export const LAYER_TRIGGER = LAYER_STEP - 0.0005;
/** Minimum shared face area that counts as an overlap (m2). */
export const LAYER_MIN_AREA = 4e-5;

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

export interface FaceRec {
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

export interface FaceInfo extends FaceRec {
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

export function polyAreaSigned(p: Poly): number {
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
export function shiftFace(b: LayerBox, face: number, delta: number): void {
  switch (FACES[face]) {
    case F_PU: b.u1 += delta; break;
    case F_NU: b.u0 -= delta; break;
    case F_PY: b.y1 += delta; break;
    case F_NY: b.y0 -= delta; break;
    case F_PN: b.n1 += delta; break;
    case F_NN: b.n0 -= delta; break;
  }
}

export function thickness(b: LayerBox, face: number): number {
  switch (FACES[face]) {
    case F_PU:
    case F_NU: return b.u1 - b.u0;
    case F_PY:
    case F_NY: return b.y1 - b.y0;
    default: return b.n1 - b.n0;
  }
}
