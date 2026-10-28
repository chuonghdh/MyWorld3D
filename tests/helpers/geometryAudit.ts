// Geometry audit helpers (pure three.js geometry, no WebGL).
//
// What they catch, and why the thresholds are what they are:
//
//  * coplanarOverlaps: pairs of triangles that lie in the same plane and overlap in area. The two
//    surfaces then have (almost) identical depth, so the GPU picks one per pixel by rounding noise:
//    that is z-fighting. Defaults: normals within 1 degree, every vertex of each triangle within
//    2 cm of the other's plane, shared area above 1 cm2. 2 cm is the minimum separation the building
//    code promises between visible overlapping surfaces; with the dynamic near/far planes of the
//    orbit camera it is comfortably resolvable. Pairs facing the same way are real z-fights
//    (`sameFacing`); pairs facing opposite ways (`opposed`) cannot fight because the back one is
//    culled, but they are hidden faces that waste triangles and make shadow acne, so they are
//    counted separately and the tests keep that number at zero too.
//  * windingMismatches: triangles whose winding (geometric normal) disagrees with the stored vertex
//    normal. With FrontSide materials such a triangle is culled or lit from the wrong side, which
//    shows up as black faces or missing walls. This also catches negative-determinant matrices baked
//    into merged geometry, because applyMatrix4 transforms the normals but never flips the winding.
//  * seeThrough: the envelope check. Rays are cast from outside the bounding box inwards on a grid
//    (17 directions, 0.5 m spacing). The nearest surface along every ray must face the viewer; a
//    nearest hit that faces away means the viewer looks through a missing or wrongly wound face.
//    The ray caster is a small grid-accelerated Moller-Trumbore (a Raycaster against 15k+ triangles
//    per ray would make the exhaustive matrix too slow); `raycasterHitsFront` cross-checks single
//    rays against THREE.Raycaster. Upward rays are skipped (the underside of a house is never seen),
//    rays below y = 2 cm are skipped (below ground), and with `floors` a downward ray that reaches the
//    ground inside a footprint without touching anything counts as a hole in the roof.

import * as THREE from 'three';

export interface AuditItem {
  geometry: THREE.BufferGeometry;
  name: string;
  /** Baked into positions and normals before auditing. */
  matrix?: THREE.Matrix4;
  /** True when the material is FrontSide (back faces are culled). Default true. */
  frontOnly?: boolean;
}

export type AuditInput = THREE.Object3D | THREE.BufferGeometry | readonly AuditItem[];

/** Normalises any input to a list of audit items (meshes get their world matrix). */
export function toItems(input: AuditInput): AuditItem[] {
  if (input instanceof THREE.BufferGeometry) return [{ geometry: input, name: 'geometry' }];
  if (Array.isArray(input)) return [...(input as readonly AuditItem[])];
  const out: AuditItem[] = [];
  const root = input as THREE.Object3D;
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const mat = o.material as THREE.Material;
    out.push({
      geometry: o.geometry as THREE.BufferGeometry,
      name: o.name || mat.name || 'mesh',
      matrix: o.matrixWorld.clone(),
      frontOnly: mat.side === THREE.FrontSide,
    });
  });
  return out;
}

/** Flat world-space triangle soup. */
export interface TriSet {
  count: number;
  /** 9 numbers per triangle. */
  p: Float64Array;
  /** Mean stored normal per triangle (3 numbers), zero when the geometry has no normals. */
  stored: Float32Array;
  /** aSurface id of the first vertex, or -1. */
  surf: Float32Array;
  /** Index into `names`. */
  mesh: Uint16Array;
  names: string[];
  frontOnly: boolean[];
  /** First triangle index of each mesh. */
  offsets: number[];
}

export function buildTriSet(input: AuditInput): TriSet {
  const items = toItems(input);
  let total = 0;
  for (const it of items) {
    const pos = it.geometry.getAttribute('position');
    const idx = it.geometry.getIndex();
    total += idx ? idx.count / 3 : pos.count / 3;
  }
  const p = new Float64Array(total * 9);
  const stored = new Float32Array(total * 3);
  const surf = new Float32Array(total).fill(-1);
  const mesh = new Uint16Array(total);
  const names: string[] = [];
  const frontOnly: boolean[] = [];
  const offsets: number[] = [];
  const v = new THREE.Vector3();
  const nm = new THREE.Matrix3();
  let t = 0;
  items.forEach((it, mi) => {
    names.push(it.name);
    offsets.push(t);
    frontOnly.push(it.frontOnly !== false);
    const g = it.geometry;
    const pos = g.getAttribute('position');
    const nor = g.getAttribute('normal');
    const sf = g.getAttribute('aSurface');
    const idx = g.getIndex();
    const tris = idx ? idx.count / 3 : pos.count / 3;
    const m = it.matrix;
    if (m) nm.getNormalMatrix(m);
    const n = new THREE.Vector3();
    for (let k = 0; k < tris; k++) {
      let sx = 0;
      let sy = 0;
      let sz = 0;
      for (let c = 0; c < 3; c++) {
        const vi = idx ? idx.getX(k * 3 + c) : k * 3 + c;
        v.fromBufferAttribute(pos, vi);
        if (m) v.applyMatrix4(m);
        p[t * 9 + c * 3] = v.x;
        p[t * 9 + c * 3 + 1] = v.y;
        p[t * 9 + c * 3 + 2] = v.z;
        if (nor) {
          n.fromBufferAttribute(nor, vi);
          if (m) n.applyMatrix3(nm).normalize();
          sx += n.x;
          sy += n.y;
          sz += n.z;
        }
        if (c === 0 && sf) surf[t] = sf.getX(vi);
      }
      stored[t * 3] = sx / 3;
      stored[t * 3 + 1] = sy / 3;
      stored[t * 3 + 2] = sz / 3;
      mesh[t] = mi;
      t++;
    }
  });
  return { count: total, p, stored, surf, mesh, names, frontOnly, offsets };
}

type V3 = [number, number, number];

function triNormal(p: Float64Array, t: number, out: V3): number {
  const o = t * 9;
  const ax = p[o + 3] - p[o];
  const ay = p[o + 4] - p[o + 1];
  const az = p[o + 5] - p[o + 2];
  const bx = p[o + 6] - p[o];
  const by = p[o + 7] - p[o + 1];
  const bz = p[o + 8] - p[o + 2];
  const nx = ay * bz - az * by;
  const ny = az * bx - ax * bz;
  const nz = ax * by - ay * bx;
  const len = Math.hypot(nx, ny, nz);
  if (len < 1e-12) {
    out[0] = out[1] = out[2] = 0;
    return 0;
  }
  out[0] = nx / len;
  out[1] = ny / len;
  out[2] = nz / len;
  return len / 2;
}

function centroid(p: Float64Array, t: number): V3 {
  const o = t * 9;
  return [(p[o] + p[o + 3] + p[o + 6]) / 3, (p[o + 1] + p[o + 4] + p[o + 7]) / 3, (p[o + 2] + p[o + 5] + p[o + 8]) / 3];
}

// ---------------------------------------------------------------------------------------------
// Winding

export interface WindingReport {
  triangles: number;
  mismatches: number;
  degenerate: number;
  samples: { position: V3; mesh: string; surface: number; dot: number }[];
}

/** Triangles whose geometric (winding) normal disagrees with the stored normal: dot below minDot. */
export function windingMismatches(input: AuditInput, opts: { minDot?: number; maxSamples?: number } = {}): WindingReport {
  const minDot = opts.minDot ?? 0.2;
  const maxSamples = opts.maxSamples ?? 12;
  const ts = buildTriSet(input);
  const rep: WindingReport = { triangles: ts.count, mismatches: 0, degenerate: 0, samples: [] };
  const n: V3 = [0, 0, 0];
  for (let t = 0; t < ts.count; t++) {
    const area = triNormal(ts.p, t, n);
    if (area < 1e-9) {
      rep.degenerate++;
      continue;
    }
    const sl = Math.hypot(ts.stored[t * 3], ts.stored[t * 3 + 1], ts.stored[t * 3 + 2]);
    if (sl < 1e-6) continue;
    const dot = (n[0] * ts.stored[t * 3] + n[1] * ts.stored[t * 3 + 1] + n[2] * ts.stored[t * 3 + 2]) / sl;
    if (dot < minDot) {
      rep.mismatches++;
      if (rep.samples.length < maxSamples) rep.samples.push({ position: centroid(ts.p, t), mesh: ts.names[ts.mesh[t]], surface: ts.surf[t], dot });
    }
  }
  return rep;
}

// ---------------------------------------------------------------------------------------------
// Coplanar overlaps

export interface CoplanarOptions {
  /** Max angle between normals (parallel or anti-parallel), degrees. Default 1. */
  angleDeg?: number;
  /** Minimum required separation along the normal, metres: pairs with every vertex closer than this to the other plane are flagged. Default 0.02. */
  planeTol?: number;
  /** Min shared area, square metres. Default 1e-4 (1 cm2). */
  minArea?: number;
  maxSamples?: number;
}

export interface CoplanarPair {
  position: V3;
  area: number;
  sameFacing: boolean;
  /** Plane distance between the two triangles (max vertex distance), metres. */
  gap: number;
  meshA: string;
  meshB: string;
  surfaceA: number;
  surfaceB: number;
  normal: V3;
  /** Centroid of the second triangle. */
  positionB: V3;
  /** Triangle indices within their own mesh (A, B). */
  localA: number;
  localB: number;
}

export interface CoplanarReport {
  triangles: number;
  /** Overlapping coplanar pairs facing the same way: true z-fights. */
  sameFacing: number;
  /** Overlapping coplanar pairs facing opposite ways: hidden / coincident faces. */
  opposed: number;
  samplesSame: CoplanarPair[];
  samplesOpposed: CoplanarPair[];
}

function polyArea2(poly: number[]): number {
  let a = 0;
  const n = poly.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a += poly[i * 2] * poly[j * 2 + 1] - poly[j * 2] * poly[i * 2 + 1];
  }
  return Math.abs(a) / 2;
}

/** Area of the intersection of two 2D triangles (Sutherland-Hodgman). Triangles are [x0,y0,x1,y1,x2,y2]. */
export function triOverlapArea2D(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const orient = (t: ArrayLike<number>): number[] => {
    const s = (t[2] - t[0]) * (t[5] - t[1]) - (t[4] - t[0]) * (t[3] - t[1]);
    return s >= 0 ? [t[0], t[1], t[2], t[3], t[4], t[5]] : [t[0], t[1], t[4], t[5], t[2], t[3]];
  };
  let subject = orient(a);
  const clip = orient(b);
  for (let e = 0; e < 3; e++) {
    const ax = clip[e * 2];
    const ay = clip[e * 2 + 1];
    const bx = clip[((e + 1) % 3) * 2];
    const by = clip[((e + 1) % 3) * 2 + 1];
    const side = (x: number, y: number): number => (bx - ax) * (y - ay) - (by - ay) * (x - ax);
    const out: number[] = [];
    const n = subject.length / 2;
    for (let i = 0; i < n; i++) {
      const cx = subject[i * 2];
      const cy = subject[i * 2 + 1];
      const dx = subject[((i + 1) % n) * 2];
      const dy = subject[((i + 1) % n) * 2 + 1];
      const sc = side(cx, cy);
      const sd = side(dx, dy);
      if (sc >= 0) out.push(cx, cy);
      if ((sc >= 0) !== (sd >= 0)) {
        const t = sc / (sc - sd);
        out.push(cx + (dx - cx) * t, cy + (dy - cy) * t);
      }
    }
    subject = out;
    if (subject.length < 6) return 0;
  }
  return polyArea2(subject);
}

const CELL_N = 0.04;
const CELL_D = 0.04;
const TOL_N = 0.02;

/** Finds overlapping coplanar triangle pairs. Plane hashing keeps it near-linear on large merged blocks. */
export function coplanarOverlaps(input: AuditInput, opts: CoplanarOptions = {}): CoplanarReport {
  const cosA = Math.cos(((opts.angleDeg ?? 1) * Math.PI) / 180);
  const planeTol = opts.planeTol ?? 0.02;
  const minArea = opts.minArea ?? 1e-4;
  const maxSamples = opts.maxSamples ?? 12;
  const ts = buildTriSet(input);
  const n = ts.count;
  const nrm = new Float64Array(n * 3);
  const dist = new Float64Array(n);
  const area = new Float64Array(n);
  const bb = new Float64Array(n * 6);
  const tmp: V3 = [0, 0, 0];
  // Two levels: plane (normal + offset cell) -> 1 m spatial cell of the triangle's bounding box -> triangles.
  const grid = new Map<number, Map<number, number[]>>();
  const BIG = -1;
  const SPAN = 64;
  const spatial = (x: number, y: number, z: number): number => ((Math.floor(x) + 512) * 1024 + (Math.floor(y) + 512)) * 1024 + (Math.floor(z) + 512);
  const KEY = 1 << 17;
  const cellKey = (qx: number, qy: number, qz: number, qd: number): number =>
    (((qx + 64) * 128 + (qy + 64)) * 128 + (qz + 64)) * KEY + (qd + KEY / 2);

  for (let t = 0; t < n; t++) {
    const a = triNormal(ts.p, t, tmp);
    area[t] = a;
    if (a < 1e-7) continue;
    nrm[t * 3] = tmp[0];
    nrm[t * 3 + 1] = tmp[1];
    nrm[t * 3 + 2] = tmp[2];
    dist[t] = tmp[0] * ts.p[t * 9] + tmp[1] * ts.p[t * 9 + 1] + tmp[2] * ts.p[t * 9 + 2];
    for (let k = 0; k < 3; k++) {
      let lo = Infinity;
      let hi = -Infinity;
      for (let c = 0; c < 3; c++) {
        const v = ts.p[t * 9 + c * 3 + k];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      bb[t * 6 + k] = lo;
      bb[t * 6 + 3 + k] = hi;
    }
    const key = cellKey(Math.floor(tmp[0] / CELL_N), Math.floor(tmp[1] / CELL_N), Math.floor(tmp[2] / CELL_N), Math.floor(dist[t] / CELL_D));
    let inner = grid.get(key);
    if (!inner) {
      inner = new Map();
      grid.set(key, inner);
    }
    const nx0 = Math.floor(bb[t * 6]), nx1 = Math.floor(bb[t * 6 + 3]);
    const ny0 = Math.floor(bb[t * 6 + 1]), ny1 = Math.floor(bb[t * 6 + 4]);
    const nz0 = Math.floor(bb[t * 6 + 2]), nz1 = Math.floor(bb[t * 6 + 5]);
    const count = (nx1 - nx0 + 1) * (ny1 - ny0 + 1) * (nz1 - nz0 + 1);
    const push = (k: number): void => {
      const l = inner!.get(k);
      if (l) l.push(t);
      else inner!.set(k, [t]);
    };
    if (count > SPAN) push(BIG);
    else for (let x = nx0; x <= nx1; x++) for (let y = ny0; y <= ny1; y++) for (let z = nz0; z <= nz1; z++) push(spatial(x, y, z));
  }

  const rep: CoplanarReport = { triangles: n, sameFacing: 0, opposed: 0, samplesSame: [], samplesOpposed: [] };
  const offsets = (v: number, size: number, tol: number): number[] => {
    const c = Math.floor(v / size);
    const r = v - c * size;
    const out = [c];
    if (r < tol) out.push(c - 1);
    if (size - r < tol) out.push(c + 1);
    return out;
  };
  const pa = new Array<number>(6);
  const pb = new Array<number>(6);

  const seen = new Int32Array(n).fill(-1);
  let token = 0;
  const cand: number[] = [];
  const consider = (a: number, b: number): void => {
    const dotn = nrm[a * 3] * nrm[b * 3] + nrm[a * 3 + 1] * nrm[b * 3 + 1] + nrm[a * 3 + 2] * nrm[b * 3 + 2];
    if (Math.abs(dotn) < cosA) return;
    if (
      bb[a * 6] > bb[b * 6 + 3] + planeTol || bb[b * 6] > bb[a * 6 + 3] + planeTol ||
      bb[a * 6 + 1] > bb[b * 6 + 4] + planeTol || bb[b * 6 + 1] > bb[a * 6 + 4] + planeTol ||
      bb[a * 6 + 2] > bb[b * 6 + 5] + planeTol || bb[b * 6 + 2] > bb[a * 6 + 5] + planeTol
    ) return;
    // Vertex distances to the other plane.
    let gap = 0;
    for (let c = 0; c < 3; c++) {
      const dB = Math.abs(nrm[a * 3] * ts.p[b * 9 + c * 3] + nrm[a * 3 + 1] * ts.p[b * 9 + c * 3 + 1] + nrm[a * 3 + 2] * ts.p[b * 9 + c * 3 + 2] - dist[a]);
      const dA = Math.abs(nrm[b * 3] * ts.p[a * 9 + c * 3] + nrm[b * 3 + 1] * ts.p[a * 9 + c * 3 + 1] + nrm[b * 3 + 2] * ts.p[a * 9 + c * 3 + 2] - dist[b]);
      gap = Math.max(gap, dA, dB);
    }
    // Exactly planeTol apart counts as separated (float noise): flag only gaps clearly below it.
    if (gap >= planeTol - 1e-3) return;
    // Project both triangles orthogonally onto the plane of A (an in-plane orthonormal basis), so the
    // small offset between the two planes does not shift one against the other on oblique planes.
    const nx = nrm[a * 3];
    const ny = nrm[a * 3 + 1];
    const nz = nrm[a * 3 + 2];
    // Helper axis: the world axis least aligned with the normal.
    const hx = Math.abs(nx) <= Math.abs(ny) && Math.abs(nx) <= Math.abs(nz) ? 1 : 0;
    const hy = hx === 0 && Math.abs(ny) <= Math.abs(nz) ? 1 : 0;
    const hz = hx === 0 && hy === 0 ? 1 : 0;
    let e1x = ny * hz - nz * hy;
    let e1y = nz * hx - nx * hz;
    let e1z = nx * hy - ny * hx;
    const el = Math.hypot(e1x, e1y, e1z);
    e1x /= el;
    e1y /= el;
    e1z /= el;
    const e2x = ny * e1z - nz * e1y;
    const e2y = nz * e1x - nx * e1z;
    const e2z = nx * e1y - ny * e1x;
    for (let c = 0; c < 3; c++) {
      const ax = ts.p[a * 9 + c * 3], ay = ts.p[a * 9 + c * 3 + 1], az = ts.p[a * 9 + c * 3 + 2];
      pa[c * 2] = ax * e1x + ay * e1y + az * e1z;
      pa[c * 2 + 1] = ax * e2x + ay * e2y + az * e2z;
      const bx = ts.p[b * 9 + c * 3], by = ts.p[b * 9 + c * 3 + 1], bz = ts.p[b * 9 + c * 3 + 2];
      pb[c * 2] = bx * e1x + by * e1y + bz * e1z;
      pb[c * 2 + 1] = bx * e2x + by * e2y + bz * e2z;
    }
    const ov = triOverlapArea2D(pa, pb);
    if (ov < minArea) return;
    const same = dotn > 0;
    const pair: CoplanarPair = {
      position: centroid(ts.p, a),
      area: ov,
      sameFacing: same,
      gap,
      meshA: ts.names[ts.mesh[a]],
      meshB: ts.names[ts.mesh[b]],
      surfaceA: ts.surf[a],
      surfaceB: ts.surf[b],
      normal: [nrm[a * 3], nrm[a * 3 + 1], nrm[a * 3 + 2]],
      positionB: centroid(ts.p, b),
      localA: a - ts.offsets[ts.mesh[a]],
      localB: b - ts.offsets[ts.mesh[b]],
    };
    if (same) {
      rep.sameFacing++;
      if (rep.samplesSame.length < maxSamples) rep.samplesSame.push(pair);
    } else {
      rep.opposed++;
      if (rep.samplesOpposed.length < maxSamples) rep.samplesOpposed.push(pair);
    }
  };

  for (let a = 0; a < n; a++) {
    if (area[a] < 1e-7) continue;
    const ax0 = Math.floor(bb[a * 6] - planeTol), ax1 = Math.floor(bb[a * 6 + 3] + planeTol);
    const ay0 = Math.floor(bb[a * 6 + 1] - planeTol), ay1 = Math.floor(bb[a * 6 + 4] + planeTol);
    const az0 = Math.floor(bb[a * 6 + 2] - planeTol), az1 = Math.floor(bb[a * 6 + 5] + planeTol);
    const aBig = (ax1 - ax0 + 1) * (ay1 - ay0 + 1) * (az1 - az0 + 1) > SPAN;
    for (const sign of [1, -1] as const) {
      const sx = nrm[a * 3] * sign;
      const sy = nrm[a * 3 + 1] * sign;
      const sz = nrm[a * 3 + 2] * sign;
      const sd = dist[a] * sign;
      for (const qx of offsets(sx, CELL_N, TOL_N))
        for (const qy of offsets(sy, CELL_N, TOL_N))
          for (const qz of offsets(sz, CELL_N, TOL_N))
            for (const qd of offsets(sd, CELL_D, planeTol)) {
              const inner = grid.get(cellKey(qx, qy, qz, qd));
              if (!inner) continue;
              token++;
              cand.length = 0;
              const take = (list: number[] | undefined): void => {
                if (!list) return;
                for (const b of list) {
                  if (b <= a || seen[b] === token) continue;
                  seen[b] = token;
                  cand.push(b);
                }
              };
              take(inner.get(BIG));
              if (aBig) for (const [k, l] of inner) { if (k !== BIG) take(l); }
              else for (let x = ax0; x <= ax1; x++) for (let y = ay0; y <= ay1; y++) for (let z = az0; z <= az1; z++) take(inner.get(spatial(x, y, z)));
              for (const b of cand) {
                const dn = nrm[a * 3] * nrm[b * 3] + nrm[a * 3 + 1] * nrm[b * 3 + 1] + nrm[a * 3 + 2] * nrm[b * 3 + 2];
                // The same pair can be reached through the +n and -n lookups; keep the matching one.
                if ((sign === 1) !== dn > 0) continue;
                consider(a, b);
              }
            }
    }
  }
  return rep;
}

// ---------------------------------------------------------------------------------------------
// See-through envelope check

/** Oriented footprint rectangle: centre, half extents along the local x and z axes, rotation about y. */
export interface FloorRect {
  x: number;
  z: number;
  hw: number;
  hd: number;
  /** Rotation about y (three.js convention, as lot.facing). */
  facing: number;
}

export interface SeeThroughOptions {
  /** Origin grid spacing, metres. Default 0.5. */
  spacing?: number;
  maxSamples?: number;
  /** Only audit this region (default: bounds of the input). */
  bounds?: THREE.Box3;
  /**
   * Regions (oriented rectangles in the xz plane) where the underside is closed: a downward ray that
   * reaches y = 0 inside one of them without hitting anything is a hole. Default: none (floor check off).
   */
  floors?: readonly FloorRect[];
  /**
   * Meshes (by name) that never count as see-through. Default ['sign', 'building-sign']: shop and blade signs are
   * single-sided decal quads floating 2.5-3.5 cm in front of a closed carrier, so a grazing ray can slip
   * into that slot and meet the decal from behind; the carrier itself is part of the checked envelope.
   */
  ignoreMeshes?: readonly string[];
}

export interface SeeThroughHit {
  origin: V3;
  direction: V3;
  point: V3;
  mesh: string;
  surface: number;
  /** Triangle index within its mesh (for tracing), or -1. */
  local: number;
}

export interface SeeThroughReport {
  rays: number;
  /** Rays whose nearest surface faces away from the viewer (see-through). */
  violations: number;
  /** Distinct culprit triangles. */
  culprits: number;
  samples: SeeThroughHit[];
}

const D = Math.SQRT1_2;
const T = 1 / Math.sqrt(3);
/** 17 directions: 4 horizontal axes, straight down, 4 horizontal diagonals, 4 down diagonals, 4 down edge diagonals. */
export const SEE_THROUGH_DIRECTIONS: readonly V3[] = [
  [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0],
  [D, 0, D], [D, 0, -D], [-D, 0, D], [-D, 0, -D],
  [T, -T, T], [T, -T, -T], [-T, -T, T], [-T, -T, -T],
  [D, -D, 0], [-D, -D, 0], [0, -D, D], [0, -D, -D],
];

interface Grid {
  min: V3;
  cell: number;
  dim: V3;
  cells: Int32Array[] | (number[] | undefined)[];
}

function buildGrid(ts: TriSet, box: THREE.Box3, cellSize: number): Grid {
  const dim: V3 = [
    Math.max(1, Math.ceil((box.max.x - box.min.x) / cellSize)),
    Math.max(1, Math.ceil((box.max.y - box.min.y) / cellSize)),
    Math.max(1, Math.ceil((box.max.z - box.min.z) / cellSize)),
  ];
  const cells: (number[] | undefined)[] = new Array(dim[0] * dim[1] * dim[2]);
  const mn: V3 = [box.min.x, box.min.y, box.min.z];
  for (let t = 0; t < ts.count; t++) {
    const lo: V3 = [0, 0, 0];
    const hi: V3 = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      let a = Infinity;
      let b = -Infinity;
      for (let c = 0; c < 3; c++) {
        const v = ts.p[t * 9 + c * 3 + k];
        if (v < a) a = v;
        if (v > b) b = v;
      }
      lo[k] = Math.max(0, Math.min(dim[k] - 1, Math.floor((a - mn[k]) / cellSize)));
      hi[k] = Math.max(0, Math.min(dim[k] - 1, Math.floor((b - mn[k]) / cellSize)));
    }
    for (let z = lo[2]; z <= hi[2]; z++)
      for (let y = lo[1]; y <= hi[1]; y++)
        for (let x = lo[0]; x <= hi[0]; x++) {
          const i = (z * dim[1] + y) * dim[0] + x;
          const l = cells[i];
          if (l) l.push(t);
          else cells[i] = [t];
        }
  }
  return { min: mn, cell: cellSize, dim, cells };
}

/**
 * Casts rays from outside the bounds toward the interior; the nearest surface must face the viewer.
 * Meshes whose material is not FrontSide never count as see-through.
 */
export function seeThrough(input: AuditInput, opts: SeeThroughOptions = {}): SeeThroughReport {
  const spacing = opts.spacing ?? 0.5;
  const maxSamples = opts.maxSamples ?? 12;
  const ts = buildTriSet(input);
  const ignore = new Set(opts.ignoreMeshes ?? ['sign', 'building-sign']);
  ts.names.forEach((n, i) => {
    if (ignore.has(n)) ts.frontOnly[i] = false;
  });
  const rep: SeeThroughReport = { rays: 0, violations: 0, culprits: 0, samples: [] };
  if (ts.count === 0) return rep;
  const box = opts.bounds ? opts.bounds.clone() : new THREE.Box3();
  if (!opts.bounds) {
    for (let t = 0; t < ts.count; t++) for (let c = 0; c < 3; c++) box.expandByPoint(new THREE.Vector3(ts.p[t * 9 + c * 3], ts.p[t * 9 + c * 3 + 1], ts.p[t * 9 + c * 3 + 2]));
  }
  // Nothing below the ground is ever seen.
  box.min.y = Math.max(box.min.y, 0.02);
  const size = box.getSize(new THREE.Vector3());
  const cellSize = Math.max(0.6, Math.cbrt((size.x * size.y * size.z) / 40000));
  const grid = buildGrid(ts, box, cellSize);
  const nrm = new Float64Array(ts.count * 3);
  for (let t = 0; t < ts.count; t++) {
    const tmp: V3 = [0, 0, 0];
    triNormal(ts.p, t, tmp);
    nrm[t * 3] = tmp[0];
    nrm[t * 3 + 1] = tmp[1];
    nrm[t * 3 + 2] = tmp[2];
  }
  const stamp = new Int32Array(ts.count).fill(-1);
  const centre = box.getCenter(new THREE.Vector3());
  const R = size.length() / 2 + 1;
  const culprits = new Set<number>();
  const floors = opts.floors && opts.floors.length > 0 ? opts.floors : null;
  let rayId = 0;

  for (const dir of SEE_THROUGH_DIRECTIONS) {
    const d = new THREE.Vector3(...dir);
    const helper = Math.abs(d.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const u = new THREE.Vector3().crossVectors(d, helper).normalize();
    const v = new THREE.Vector3().crossVectors(d, u).normalize();
    let ulo = Infinity, uhi = -Infinity, vlo = Infinity, vhi = -Infinity;
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const q = new THREE.Vector3(x, y, z).sub(centre);
      const a = q.dot(u);
      const b = q.dot(v);
      ulo = Math.min(ulo, a); uhi = Math.max(uhi, a); vlo = Math.min(vlo, b); vhi = Math.max(vhi, b);
    }
    const jitterU = 0.0371 * spacing;
    const jitterV = 0.0613 * spacing;
    for (let a = ulo + jitterU; a <= uhi; a += spacing) {
      for (let b = vlo + jitterV; b <= vhi; b += spacing) {
        const o = new THREE.Vector3().copy(centre).addScaledVector(d, -R).addScaledVector(u, a).addScaledVector(v, b);
        // Slab test against the box: skip rays that miss the footprint entirely.
        let t0 = 0;
        let t1 = Infinity;
        let miss = false;
        for (let k = 0; k < 3; k++) {
          const ok = k === 0 ? o.x : k === 1 ? o.y : o.z;
          const dk = dir[k];
          const lo = k === 0 ? box.min.x : k === 1 ? box.min.y : box.min.z;
          const hi = k === 0 ? box.max.x : k === 1 ? box.max.y : box.max.z;
          if (Math.abs(dk) < 1e-12) {
            if (ok < lo || ok > hi) { miss = true; break; }
          } else {
            let ta = (lo - ok) / dk;
            let tb = (hi - ok) / dk;
            if (ta > tb) [ta, tb] = [tb, ta];
            t0 = Math.max(t0, ta);
            t1 = Math.min(t1, tb);
          }
        }
        if (miss || t0 > t1) continue;
        rep.rays++;
        rayId++;
        // Walk the grid (3D DDA) from the entry point.
        const px = o.x + dir[0] * (t0 + 1e-9);
        const py = o.y + dir[1] * (t0 + 1e-9);
        const pz = o.z + dir[2] * (t0 + 1e-9);
        const cx = Math.max(0, Math.min(grid.dim[0] - 1, Math.floor((px - grid.min[0]) / cellSize)));
        const cy = Math.max(0, Math.min(grid.dim[1] - 1, Math.floor((py - grid.min[1]) / cellSize)));
        const cz = Math.max(0, Math.min(grid.dim[2] - 1, Math.floor((pz - grid.min[2]) / cellSize)));
        const cur: V3 = [cx, cy, cz];
        const step: V3 = [dir[0] > 0 ? 1 : -1, dir[1] > 0 ? 1 : -1, dir[2] > 0 ? 1 : -1];
        const org: V3 = [o.x, o.y, o.z];
        const tMax: V3 = [Infinity, Infinity, Infinity];
        const tDelta: V3 = [Infinity, Infinity, Infinity];
        for (let k = 0; k < 3; k++) {
          if (Math.abs(dir[k]) < 1e-12) continue;
          const next = grid.min[k] + (cur[k] + (step[k] > 0 ? 1 : 0)) * cellSize;
          tMax[k] = (next - org[k]) / dir[k];
          tDelta[k] = cellSize / Math.abs(dir[k]);
        }
        let bestT = Infinity;
        let bestTri = -1;
        let bestFront = false;
        for (;;) {
          const list = grid.cells[(cur[2] * grid.dim[1] + cur[1]) * grid.dim[0] + cur[0]] as number[] | undefined;
          if (list) {
            for (const t of list) {
              if (stamp[t] === rayId) continue;
              stamp[t] = rayId;
              const hit = rayTri(ts.p, t, org, dir);
              if (hit < 0) continue;
              const front = nrm[t * 3] * dir[0] + nrm[t * 3 + 1] * dir[1] + nrm[t * 3 + 2] * dir[2] < 0 || !ts.frontOnly[ts.mesh[t]];
              if (hit < bestT - 1e-5 || (Math.abs(hit - bestT) <= 1e-5 && front && !bestFront)) {
                bestT = hit;
                bestTri = t;
                bestFront = front;
              }
            }
          }
          const axis = tMax[0] < tMax[1] ? (tMax[0] < tMax[2] ? 0 : 2) : tMax[1] < tMax[2] ? 1 : 2;
          // Everything before the next cell boundary has been examined.
          if (bestT <= tMax[axis]) break;
          cur[axis] += step[axis];
          if (cur[axis] < 0 || cur[axis] >= grid.dim[axis]) break;
          tMax[axis] += tDelta[axis];
        }
        // A downward ray that reaches the ground inside a closed footprint saw no roof at all.
        if (floors && dir[1] < -1e-9) {
          const tf = (0 - o.y) / dir[1];
          if (tf > 0 && tf < bestT - 1e-5) {
            const fx = o.x + dir[0] * tf;
            const fz = o.z + dir[2] * tf;
            if (floors.some((r) => insideFloor(r, fx, fz))) {
              rep.violations++;
              if (rep.samples.length < maxSamples) rep.samples.push({ origin: [o.x, o.y, o.z], direction: dir, point: [fx, 0, fz], mesh: 'floor', surface: -1, local: -1 });
              continue;
            }
          }
        }
        if (bestTri >= 0 && !bestFront) {
          rep.violations++;
          culprits.add(bestTri);
          if (rep.samples.length < maxSamples) {
            rep.samples.push({
              origin: [o.x, o.y, o.z],
              direction: dir,
              point: [o.x + dir[0] * bestT, o.y + dir[1] * bestT, o.z + dir[2] * bestT],
              mesh: ts.names[ts.mesh[bestTri]],
              surface: ts.surf[bestTri],
              local: bestTri - ts.offsets[ts.mesh[bestTri]],
            });
          }
        }
      }
    }
  }
  rep.culprits = culprits.size;
  return rep;
}

function insideFloor(r: FloorRect, x: number, z: number): boolean {
  const dx = x - r.x;
  const dz = z - r.z;
  const c = Math.cos(r.facing);
  const s = Math.sin(r.facing);
  // Inverse of a rotation about y by `facing`: local = R^-1 * d.
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  return Math.abs(lx) <= r.hw && Math.abs(lz) <= r.hd;
}

/** Moller-Trumbore, double sided; returns t or -1. Edge hits count (tiny tolerance) so rays cannot slip between triangles. */
function rayTri(p: Float64Array, t: number, o: V3, d: V3): number {
  const k = t * 9;
  const e1x = p[k + 3] - p[k];
  const e1y = p[k + 4] - p[k + 1];
  const e1z = p[k + 5] - p[k + 2];
  const e2x = p[k + 6] - p[k];
  const e2y = p[k + 7] - p[k + 1];
  const e2z = p[k + 8] - p[k + 2];
  const px = d[1] * e2z - d[2] * e2y;
  const py = d[2] * e2x - d[0] * e2z;
  const pz = d[0] * e2y - d[1] * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-12) return -1;
  const inv = 1 / det;
  const tx = o[0] - p[k];
  const ty = o[1] - p[k + 1];
  const tz = o[2] - p[k + 2];
  const u = (tx * px + ty * py + tz * pz) * inv;
  const eps = 1e-7;
  if (u < -eps || u > 1 + eps) return -1;
  const qx = ty * e1z - tz * e1y;
  const qy = tz * e1x - tx * e1z;
  const qz = tx * e1y - ty * e1x;
  const v = (d[0] * qx + d[1] * qy + d[2] * qz) * inv;
  if (v < -eps || u + v > 1 + eps) return -1;
  const tt = (e2x * qx + e2y * qy + e2z * qz) * inv;
  return tt > 1e-6 ? tt : -1;
}

/**
 * Cross-check of one ray with THREE.Raycaster (FrontSide meshes cull back faces): returns true when the
 * ray hits a front face. Used by the tests to validate the fast caster on a few rays.
 */
export function raycasterHitsFront(root: THREE.Object3D, origin: V3, direction: V3): boolean {
  root.updateMatrixWorld(true);
  const rc = new THREE.Raycaster(new THREE.Vector3(...origin), new THREE.Vector3(...direction).normalize());
  return rc.intersectObject(root, true).length > 0;
}

// ---------------------------------------------------------------------------------------------
// Convenience

export interface FullAudit {
  coplanar: CoplanarReport;
  winding: WindingReport;
  seeThrough: SeeThroughReport;
}

export function auditAll(input: AuditInput, opts: { coplanar?: CoplanarOptions; seeThrough?: SeeThroughOptions; skipSeeThrough?: boolean } = {}): FullAudit {
  const items = toItems(input);
  return {
    coplanar: coplanarOverlaps(items, opts.coplanar),
    winding: windingMismatches(items),
    seeThrough: opts.skipSeeThrough ? { rays: 0, violations: 0, culprits: 0, samples: [] } : seeThrough(items, opts.seeThrough),
  };
}

export function formatAudit(label: string, a: FullAudit): string {
  const f = (p: V3): string => p.map((x) => x.toFixed(2)).join(',');
  const lines = [`${label}: same=${a.coplanar.sameFacing} opposed=${a.coplanar.opposed} winding=${a.winding.mismatches} seeThrough=${a.seeThrough.violations}/${a.seeThrough.rays}`];
  for (const s of a.coplanar.samplesSame.slice(0, 4)) lines.push(`  Z ${s.meshA}/${s.meshB} surf ${s.surfaceA}/${s.surfaceB} at ${f(s.position)} n=${f(s.normal)} area=${s.area.toFixed(3)} gap=${s.gap.toFixed(3)}`);
  for (const s of a.coplanar.samplesOpposed.slice(0, 3)) lines.push(`  H ${s.meshA}/${s.meshB} surf ${s.surfaceA}/${s.surfaceB} at ${f(s.position)} n=${f(s.normal)} area=${s.area.toFixed(3)}`);
  for (const s of a.winding.samples.slice(0, 3)) lines.push(`  W ${s.mesh} surf ${s.surface} at ${f(s.position)} dot=${s.dot.toFixed(2)}`);
  for (const s of a.seeThrough.samples.slice(0, 4)) lines.push(`  S ${s.mesh} surf ${s.surface} hit ${f(s.point)} dir ${f(s.direction)}`);
  return lines.join('\n');
}

/** Debug aid: every triangle a ray crosses, nearest first, with its facing (brute force). */
export function traceRay(input: AuditInput, origin: V3, direction: V3): { t: number; mesh: string; local: number; front: boolean; surface: number }[] {
  const ts = buildTriSet(input);
  const out: { t: number; mesh: string; local: number; front: boolean; surface: number }[] = [];
  const n: V3 = [0, 0, 0];
  for (let t = 0; t < ts.count; t++) {
    const hit = rayTri(ts.p, t, origin, direction);
    if (hit < 0) continue;
    triNormal(ts.p, t, n);
    out.push({
      t: hit,
      mesh: ts.names[ts.mesh[t]],
      local: t - ts.offsets[ts.mesh[t]],
      front: n[0] * direction[0] + n[1] * direction[1] + n[2] * direction[2] < 0,
      surface: ts.surf[t],
    });
  }
  return out.sort((a, b) => a.t - b.t);
}
