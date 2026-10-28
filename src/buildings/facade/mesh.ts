// Fast vertex-colour mesh builder for houses.
//
// Same output contract as ColorBatch in ../geometry.ts (at most three meshes named body, glass and
// glassLit, non-indexed position/normal/uv/color attributes, the shared materials from
// ../materials.ts), but it writes triangles straight into flat arrays instead of creating a
// BufferGeometry per piece. A detailed house has well over a thousand pieces, so this keeps a
// whole city build fast.
//
// Every primitive is given in the coordinates of the current Frame: u along a facade (left to
// right when seen from the street), y up, n outward from the facade plane. The default frame is
// the identity (u = x, n = z), so house-space code can use it directly.

import * as THREE from 'three';
import { getBodyMaterial, getGlassLitMaterial, getGlassMaterial } from '../materials';
import { SURFACE, SURFACE_ATTRIBUTE } from '../surface';
import { getSignMaterial } from '../signs';
import { fixedFace, resolveLayers, type LayerBox, type LayerLimits, type Solid } from './layers';

export type Target = 'body' | 'glass' | 'glassLit' | 'sign';
/** Texture coordinates of one quad corner (sign atlas cell). */
export type UV = readonly [number, number];
/** Linear RGB colour. */
export type Col = readonly [number, number, number];
/** Point in frame coordinates [u, y, n]. */
export type P3 = readonly [number, number, number];

const tmpColor = new THREE.Color();
const colorCache = new Map<string, Col>();

/** Converts a hex / CSS colour to linear RGB (the same conversion ColorBatch uses). */
export function col(hex: string): Col {
  let c = colorCache.get(hex);
  if (!c) {
    tmpColor.set(hex);
    c = [tmpColor.r, tmpColor.g, tmpColor.b];
    colorCache.set(hex, c);
  }
  return c;
}

/** Shifts the HSL lightness of a hex colour (delta in 0..1 units) and returns linear RGB. */
export function shiftLightness(hex: string, delta: number, satDelta = 0): Col {
  tmpColor.set(hex).offsetHSL(0, satDelta, delta);
  return [tmpColor.r, tmpColor.g, tmpColor.b];
}

export function scale(c: Col, k: number): Col {
  return [c[0] * k, c[1] * k, c[2] * k];
}

export function mix(a: Col, b: Col, t: number): Col {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Maps frame coordinates (u, y, n) to house coordinates (x, y, z). */
export interface Frame {
  ox: number;
  oz: number;
  ux: number;
  uz: number;
  nx: number;
  nz: number;
}

export const HOUSE_FRAME: Frame = { ox: 0, oz: 0, ux: 1, uz: 0, nx: 0, nz: 1 };

/** Face flags for box(): skip the given faces (+u, -u, +y, -y, +n, -n). */
export const PU = 1;
export const NU = 2;
export const PY = 4;
export const NY = 8;
export const PN = 16;
export const NN = 32;

/**
 * Debug trace of where primitives come from (tests only): when `on`, every box() and poly() records
 * the triangle range it wrote and the two nearest caller frames, so an audit hit can be traced back
 * to the line of code that emitted it.
 */
export const trace = {
  on: false,
  log: [] as { t: Target; start: number; count: number; src: string }[],
  /** The boxes of the last flush (resolved), for re-verification in tests. */
  boxes: [] as (LayerBox & { src: string })[],
};

function traceSource(): string {
  const lines = (new Error().stack ?? '').split('\n').slice(1);
  const out: string[] = [];
  for (const l of lines) {
    if (/mesh\.ts/.test(l)) continue;
    const m = /([\w.]+\.ts):(\d+):\d+/.exec(l);
    if (m) out.push(`${m[1]}:${m[2]}`);
    if (out.length >= 3) break;
  }
  return out.join(' < ');
}

/** Growable Float32Array. */
class FBuf {
  a = new Float32Array(3072);
  len = 0;
  push1(x: number): void {
    if (this.len + 1 > this.a.length) {
      const b = new Float32Array(this.a.length * 2);
      b.set(this.a);
      this.a = b;
    }
    this.a[this.len++] = x;
  }
  push2(x: number, y: number): void {
    this.push1(x);
    this.push1(y);
  }
  push3(x: number, y: number, z: number): void {
    if (this.len + 3 > this.a.length) {
      const b = new Float32Array(this.a.length * 2);
      b.set(this.a);
      this.a = b;
    }
    this.a[this.len++] = x;
    this.a[this.len++] = y;
    this.a[this.len++] = z;
  }
  take(): Float32Array {
    return this.a.slice(0, this.len);
  }
}

interface Buf {
  p: FBuf;
  n: FBuf;
  c: FBuf;
  /** Surface ids, one float per vertex (body only). */
  s: FBuf | null;
  /** Texture coordinates, two floats per vertex (sign only). */
  uv: FBuf | null;
}

function newBuf(t: Target): Buf {
  return {
    p: new FBuf(),
    n: new FBuf(),
    c: new FBuf(),
    s: t === 'body' ? new FBuf() : null,
    uv: t === 'sign' ? new FBuf() : null,
  };
}

interface PendingBox extends LayerBox {
  t: Target;
  c: Col;
  top: Col;
  surface: number;
  src: string;
}

export class HouseMesh {
  frame: Frame = HOUSE_FRAME;
  /** Surface id written for every body vertex emitted from now on (see ../surface.ts). */
  surface: number = SURFACE.PLAIN;
  private readonly bufs: Record<Target, Buf> = {
    body: newBuf('body'),
    glass: newBuf('glass'),
    glassLit: newBuf('glassLit'),
    sign: newBuf('sign'),
  };
  /** Boxes waiting for the layering pass (see layers.ts). */
  private pending: PendingBox[] = [];
  /** Emitted polygons that boxes must keep clear of (panes, gable ends ...). */
  private fixed: ReturnType<typeof fixedFace>[] = [];
  /** Closed volumes (the house core) that hide the faces of boxes standing on them. */
  private solids: Solid[] = [];
  /** Where equally facing faces may be pushed to (set by the house: its lot plus allowed projections). */
  limits: LayerLimits | null = null;

  /** Runs fn with the given body surface id, then restores the previous one. */
  withSurface(id: number, fn: () => void): void {
    const prev = this.surface;
    this.surface = id;
    try {
      fn();
    } finally {
      this.surface = prev;
    }
  }

  /** Appends the per-vertex extras (surface id, uv) for `count` vertices that have no uv. */
  private extras(buf: Buf, count: number): void {
    if (buf.s) for (let i = 0; i < count; i++) buf.s.push1(this.surface);
    if (buf.uv) for (let i = 0; i < count; i++) buf.uv.push2(0, 0);
  }

  /** Triangle count so far. */
  get triangles(): number {
    this.flush();
    let t = 0;
    for (const b of Object.values(this.bufs)) t += b.p.len / 9;
    return t;
  }

  /**
   * Convex planar polygon in frame coordinates. Vertices should be counter-clockwise seen from the
   * front; pass `interior` (a point inside the solid) to have the winding fixed automatically.
   * `c` is one colour, or one colour per vertex.
   */
  poly(t: Target, pts: readonly P3[], c: Col | readonly Col[], interior?: P3, uvs?: readonly UV[]): void {
    const f = this.frame;
    const n = pts.length;
    if (n < 3) return;
    const w: number[] = new Array(n * 3);
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      w[i * 3] = f.ox + p[0] * f.ux + p[2] * f.nx;
      w[i * 3 + 1] = p[1];
      w[i * 3 + 2] = f.oz + p[0] * f.uz + p[2] * f.nz;
    }
    // Newell normal.
    let nx = 0;
    let ny = 0;
    let nz = 0;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const xi = w[i * 3];
      const yi = w[i * 3 + 1];
      const zi = w[i * 3 + 2];
      const xj = w[j * 3];
      const yj = w[j * 3 + 1];
      const zj = w[j * 3 + 2];
      nx += (yi - yj) * (zi + zj);
      ny += (zi - zj) * (xi + xj);
      nz += (xi - xj) * (yi + yj);
      cx += xi;
      cy += yi;
      cz += zi;
    }
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-9) return;
    nx /= len;
    ny /= len;
    nz /= len;
    let flip = false;
    if (interior) {
      const ix = f.ox + interior[0] * f.ux + interior[2] * f.nx;
      const iz = f.oz + interior[0] * f.uz + interior[2] * f.nz;
      const d = nx * (cx / n - ix) + ny * (cy / n - interior[1]) + nz * (cz / n - iz);
      if (d < 0) {
        flip = true;
        nx = -nx;
        ny = -ny;
        nz = -nz;
      }
    }
    const perVertex = Array.isArray(c[0]);
    const buf = this.bufs[t];
    const traceStart = trace.on ? buf.p.len / 9 : 0;
    const push = (i: number): void => {
      buf.p.push3(w[i * 3], w[i * 3 + 1], w[i * 3 + 2]);
      buf.n.push3(nx, ny, nz);
      const cc = (perVertex ? (c as readonly Col[])[i] : (c as Col));
      buf.c.push3(cc[0], cc[1], cc[2]);
      if (buf.s) buf.s.push1(this.surface);
      if (buf.uv) {
        const uv = uvs ? uvs[i] : null;
        buf.uv.push2(uv ? uv[0] : 0, uv ? uv[1] : 0);
      }
    };
    for (let k = 1; k < n - 1; k++) {
      const b = flip ? k + 1 : k;
      const d = flip ? k : k + 1;
      // Skip degenerate triangles (collapsed roof ridges and the like).
      const ax = w[b * 3] - w[0];
      const ay = w[b * 3 + 1] - w[1];
      const az = w[b * 3 + 2] - w[2];
      const bx = w[d * 3] - w[0];
      const by = w[d * 3 + 1] - w[1];
      const bz = w[d * 3 + 2] - w[2];
      const cr = Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx);
      if (cr < 1e-8) continue;
      push(0);
      push(b);
      push(d);
    }
    this.fixed.push(fixedFace(w, nx, ny, nz));
    if (trace.on) trace.log.push({ t, start: traceStart, count: buf.p.len / 9 - traceStart, src: traceSource() });
  }

  /** Quad with four corners already in counter-clockwise order. */
  quad(t: Target, a: P3, b: P3, c: P3, d: P3, color: Col | readonly Col[]): void {
    this.poly(t, [a, b, c, d], color);
  }

  /**
   * Quad with texture coordinates (a sign atlas cell): corners counter-clockwise from the front,
   * u0,v0 at the first corner, u1,v0 at the second, u1,v1 at the third, u0,v1 at the fourth.
   * `interior` fixes the winding like poly().
   */
  uvQuad(t: Target, a: P3, b: P3, c: P3, d: P3, color: Col, u0: number, v0: number, u1: number, v1: number, interior?: P3): void {
    this.poly(t, [a, b, c, d], color, interior, [
      [u0, v0],
      [u1, v0],
      [u1, v1],
      [u0, v1],
    ]);
  }

  /**
   * Box (in frame coordinates) from min/max corners. The PU..NN skip argument is accepted for compatibility but ignored. Boxes are collected
   * and emitted together by flush(), after the layering pass has separated near-coplanar faces.
   */
  box(t: Target, c: Col, u0: number, u1: number, y0: number, y1: number, n0: number, n1: number, _skip = 0, top?: Col): void {
    if (u0 > u1) [u0, u1] = [u1, u0];
    if (y0 > y1) [y0, y1] = [y1, y0];
    if (n0 > n1) [n0, n1] = [n1, n0];
    if (u1 - u0 < 1e-6 || y1 - y0 < 1e-6 || n1 - n0 < 1e-6) return;
    this.pending.push({
      t,
      c,
      top: top ?? c,
      surface: this.surface,
      f: this.frame,
      u0,
      u1,
      y0,
      y1,
      n0,
      n1,
      // The caller's skip flags are ignored: boxes are closed solids and a face is dropped only when the
      // layering pass proves it hidden (covered by another solid or by the house core), so a wrongly
      // skipped face can never open a hole.
      skip: 0,
      src: trace.on ? traceSource() : '',
    });
  }

  /** Registers a convex prism (xz polygon, y range) as solid: box faces buried inside it are not emitted. */
  addSolid(poly: readonly [number, number][], y0: number, y1: number): void {
    let a = 0;
    for (let i = 0; i < poly.length; i++) {
      const j = (i + 1) % poly.length;
      a += poly[i][0] * poly[j][1] - poly[j][0] * poly[i][1];
    }
    const pts = a >= 0 ? poly : [...poly].reverse();
    this.solids.push({ poly: pts.flat(), y0, y1 });
  }

  /** Runs the layering pass over the deferred boxes and writes their triangles. */
  private flush(): void {
    if (this.pending.length === 0) return;
    const boxes = this.pending;
    this.pending = [];
    if (trace.on) trace.boxes = boxes;
    resolveLayers(boxes, this.fixed.filter((x): x is NonNullable<typeof x> => x !== null), this.solids, this.limits);
    for (const b of boxes) {
      const buf = this.bufs[b.t];
      const start = buf.p.len / 9;
      this.emitBox(buf, b);
      if (trace.on) trace.log.push({ t: b.t, start, count: buf.p.len / 9 - start, src: b.src });
    }
  }

  private emitBox(buf: Buf, bx: PendingBox): void {
    const { f, u0, u1, y0, y1, n0, n1, skip, c, top } = bx;
    const prevSurface = this.surface;
    this.surface = bx.surface;
    // World x/z of the four (u, n) corners; y is shared.
    const X = (u: number, n: number): number => f.ox + u * f.ux + n * f.nx;
    const Z = (u: number, n: number): number => f.oz + u * f.uz + n * f.nz;
    const x00 = X(u0, n0), z00 = Z(u0, n0);
    const x10 = X(u1, n0), z10 = Z(u1, n0);
    const x11 = X(u1, n1), z11 = Z(u1, n1);
    const x01 = X(u0, n1), z01 = Z(u0, n1);
    const quad = (
      ax: number, ay: number, az: number,
      bx2: number, by: number, bz: number,
      cx: number, cy: number, cz: number,
      dx: number, dy: number, dz: number,
      nx: number, ny: number, nz: number,
      col: Col,
    ): void => {
      const p = buf.p;
      p.push3(ax, ay, az);
      p.push3(bx2, by, bz);
      p.push3(cx, cy, cz);
      p.push3(ax, ay, az);
      p.push3(cx, cy, cz);
      p.push3(dx, dy, dz);
      for (let i = 0; i < 6; i++) {
        buf.n.push3(nx, ny, nz);
        buf.c.push3(col[0], col[1], col[2]);
      }
      this.extras(buf, 6);
    };
    // +n face: (u0,y0,n1) (u1,y0,n1) (u1,y1,n1) (u0,y1,n1)
    if (!(skip & PN)) quad(x01, y0, z01, x11, y0, z11, x11, y1, z11, x01, y1, z01, f.nx, 0, f.nz, c);
    if (!(skip & NN)) quad(x10, y0, z10, x00, y0, z00, x00, y1, z00, x10, y1, z10, -f.nx, 0, -f.nz, c);
    if (!(skip & PU)) quad(x11, y0, z11, x10, y0, z10, x10, y1, z10, x11, y1, z11, f.ux, 0, f.uz, c);
    if (!(skip & NU)) quad(x00, y0, z00, x01, y0, z01, x01, y1, z01, x00, y1, z00, -f.ux, 0, -f.uz, c);
    if (!(skip & PY)) quad(x01, y1, z01, x11, y1, z11, x10, y1, z10, x00, y1, z00, 0, 1, 0, top);
    if (!(skip & NY)) quad(x00, y0, z00, x10, y0, z10, x11, y0, z11, x01, y0, z01, 0, -1, 0, c);
    this.surface = prevSurface;
  }

  /** Body box shorthand. */
  b(c: Col, u0: number, u1: number, y0: number, y1: number, n0: number, n1: number, skip = 0): void {
    this.box('body', c, u0, u1, y0, y1, n0, n1, skip);
  }

  /** Oriented box: centre plus three half-extent vectors. */
  obox(t: Target, c: Col, ctr: P3, ax: P3, ay: P3, az: P3, skipEnds = false): void {
    const corner = (i: number, j: number, k: number): P3 => [
      ctr[0] + i * ax[0] + j * ay[0] + k * az[0],
      ctr[1] + i * ax[1] + j * ay[1] + k * az[1],
      ctr[2] + i * ax[2] + j * ay[2] + k * az[2],
    ];
    const faces: [number, number, number][][] = [
      [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]],
      [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]],
      [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]],
      [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]],
    ];
    if (!skipEnds) {
      faces.push([[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]]);
      faces.push([[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]]);
    }
    for (const fc of faces) this.poly(t, fc.map(([i, j, k]) => corner(i, j, k)), c, ctr);
  }

  /** Thin bar between two points (square section of the given size). */
  bar(c: Col, a: P3, b: P3, size: number, t: Target = 'body'): void {
    const d: P3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const len = Math.hypot(d[0], d[1], d[2]);
    if (len < 1e-6) return;
    const ax: P3 = [d[0] / 2, d[1] / 2, d[2] / 2];
    // Pick a helper axis not parallel to the bar.
    const up: P3 = Math.abs(d[1]) / len > 0.9 ? [1, 0, 0] : [0, 1, 0];
    let s: P3 = [d[1] * up[2] - d[2] * up[1], d[2] * up[0] - d[0] * up[2], d[0] * up[1] - d[1] * up[0]];
    let sl = Math.hypot(s[0], s[1], s[2]);
    s = [(s[0] / sl) * size * 0.5, (s[1] / sl) * size * 0.5, (s[2] / sl) * size * 0.5];
    let q: P3 = [d[1] * s[2] - d[2] * s[1], d[2] * s[0] - d[0] * s[2], d[0] * s[1] - d[1] * s[0]];
    sl = Math.hypot(q[0], q[1], q[2]);
    q = [(q[0] / sl) * size * 0.5, (q[1] / sl) * size * 0.5, (q[2] / sl) * size * 0.5];
    const ctr: P3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    this.obox(t, c, ctr, ax, s, q, false);
  }

  /**
   * Solid between two convex rings with the same vertex count (prisms, frustums, roofs).
   * Caps are optional; each may have its own colour.
   */
  loft(t: Target, c: Col, a: readonly P3[], b: readonly P3[], capA: Col | null, capB: Col | null, sides = true): void {
    const n = a.length;
    let ix = 0;
    let iy = 0;
    let iz = 0;
    for (const p of [...a, ...b]) {
      ix += p[0];
      iy += p[1];
      iz += p[2];
    }
    const interior: P3 = [ix / (2 * n), iy / (2 * n), iz / (2 * n)];
    if (sides) {
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        this.poly(t, [a[i], a[j], b[j], b[i]], c, interior);
      }
    }
    if (capA) this.poly(t, a, capA, interior);
    if (capB) this.poly(t, b, capB, interior);
  }

  /** Convex polygon in the (u, y) plane extruded along n from n0 to n1. */
  prismUY(c: Col, pts: readonly (readonly [number, number])[], n0: number, n1: number, back = false, t: Target = 'body'): void {
    const a = pts.map(([u, y]) => [u, y, n0] as P3);
    const b = pts.map(([u, y]) => [u, y, n1] as P3);
    this.loft(t, c, a, b, back ? c : null, c);
  }

  /** Convex profile in the (n, y) plane extruded along u from u0 to u1. */
  prismNY(c: Col, pts: readonly (readonly [number, number])[], u0: number, u1: number): void {
    const a = pts.map(([n, y]) => [u0, y, n] as P3);
    const b = pts.map(([n, y]) => [u1, y, n] as P3);
    this.loft('body', c, a, b, c, c);
  }

  /** Vertical prism over a convex (u, n) polygon. */
  prismY(c: Col, pts: readonly (readonly [number, number])[], y0: number, y1: number, top: Col | null = c, bottom: Col | null = null): void {
    const a = pts.map(([u, n]) => [u, y0, n] as P3);
    const b = pts.map(([u, n]) => [u, y1, n] as P3);
    this.loft('body', c, a, b, bottom, top);
  }

  /**
   * Affine remap of world x and z: x' = ax * x + bx, z' = az * z + bz. Used last, to pull the sides
   * that touch a neighbour in from the lot line. Normals are left alone (the scale is within 0.5%).
   */
  remapXZ(ax: number, bx: number, az: number, bz: number): void {
    this.flush();
    for (const buf of Object.values(this.bufs)) {
      const p = buf.p.a;
      for (let i = 0; i < buf.p.len; i += 3) {
        p[i] = p[i] * ax + bx;
        p[i + 2] = p[i + 2] * az + bz;
      }
    }
  }

  /** Multiplies vertex colours by fn(y) (e.g. fake ground occlusion). */
  shade(fn: (y: number) => number): void {
    this.flush();
    for (const buf of Object.values(this.bufs)) {
      const p = buf.p.a;
      const c = buf.c.a;
      for (let i = 0; i < buf.p.len; i += 3) {
        const k = fn(p[i + 1]);
        c[i] *= k;
        c[i + 1] *= k;
        c[i + 2] *= k;
      }
    }
  }

  /** Merges into a Group of up to four meshes named body, glass, glassLit and sign. */
  build(): THREE.Group {
    this.flush();
    const materials: Record<Target, THREE.Material> = {
      body: getBodyMaterial(),
      glass: getGlassMaterial(),
      glassLit: getGlassLitMaterial(),
      sign: getSignMaterial(),
    };
    const group = new THREE.Group();
    for (const t of ['body', 'glass', 'glassLit', 'sign'] as const) {
      const buf = this.bufs[t];
      if (buf.p.len === 0) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(buf.p.take(), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(buf.n.take(), 3));
      g.setAttribute(
        'uv',
        new THREE.BufferAttribute(buf.uv ? buf.uv.take() : new Float32Array((buf.p.len / 3) * 2), 2),
      );
      g.setAttribute('color', new THREE.BufferAttribute(buf.c.take(), 3));
      if (buf.s) g.setAttribute(SURFACE_ATTRIBUTE, new THREE.BufferAttribute(buf.s.take(), 1));
      g.computeBoundingBox();
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, materials[t]);
      mesh.name = t;
      mesh.castShadow = t === 'body';
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    return group;
  }
}
