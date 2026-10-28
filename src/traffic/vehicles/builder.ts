// Tiny flat-shaded geometry builder for the vehicle models (non-indexed, one merged BufferGeometry).
// Every vertex carries: position, normal, colour, and `aPart` = (kind, paint mask, pivotY, pivotZ).
// kind: see PART. paint = 1 means the per-instance colour multiplies the vertex colour.
// Local frame: origin on the ground, +Z forward, +X to the left of the driver (facing +Z).

import * as THREE from 'three';

export type V3 = [number, number, number];

/** Part kinds read by the vehicle shader. */
export const PART = {
  body: 0,
  wheel: 1, // spins around the X axis through (pivotY, pivotZ)
  head: 2, // warm white, lit at night
  tail: 3, // dim red, brighter at night, very bright when braking
  brake: 4, // high-mounted brake lamp, only on braking
  indicator: 5, // amber blink on the side of the turn
  cabin: 6, // glass: warm interior glow at night (buses)
  board: 8, // destination board or taxi sign, amber glow
} as const;

export interface Style {
  c: number;
  paint?: boolean;
  part?: number;
  py?: number;
  pz?: number;
}

/** Paint: white vertex colour, multiplied by the instance colour. */
export const PAINT: Style = { c: 0xffffff, paint: true };
export const fixed = (c: number): Style => ({ c });
export const GLASS: Style = { c: 0x2b3f52 };
export const GLASS_LIT: Style = { c: 0x2b3f52, part: PART.cabin };
export const TRIM: Style = { c: 0x17181b };
export const RUBBER: Style = { c: 0x1b1b1d };
export const ALLOY: Style = { c: 0xb4b9c0 };
export const CHROME: Style = { c: 0x9aa0a8 };
export const HEAD: Style = { c: 0xd8d6c8, part: PART.head };
export const TAIL: Style = { c: 0x6a0c0c, part: PART.tail };
export const BRAKE: Style = { c: 0x6a0c0c, part: PART.brake };
export const INDICATOR: Style = { c: 0x9a5a14, part: PART.indicator };
export const BOARD: Style = { c: 0xb98a2a, part: PART.board };
export const PLATE: Style = { c: 0xe8e6da };

const tmpColor = new THREE.Color();

function sub(a: V3, b: V3): V3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function cross(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function dot(a: V3, b: V3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function norm(a: V3): V3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

export class GeoBuilder {
  private readonly pos: number[] = [];
  private readonly nor: number[] = [];
  private readonly col: number[] = [];
  private readonly part: number[] = [];

  get triangleCount(): number {
    return this.pos.length / 9;
  }

  /** One triangle. If ref is given the winding is flipped so the normal faces away from ref. */
  tri(a: V3, b: V3, c: V3, s: Style, ref?: V3): void {
    let n = cross(sub(b, a), sub(c, a));
    const len = Math.hypot(n[0], n[1], n[2]);
    if (len < 1e-9) return;
    n = [n[0] / len, n[1] / len, n[2] / len];
    if (ref) {
      const cen: V3 = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
      if (dot(n, sub(cen, ref)) < 0) {
        const t = b;
        b = c;
        c = t;
        n = [-n[0], -n[1], -n[2]];
      }
    }
    tmpColor.set(s.c);
    const kind = s.part ?? PART.body;
    const paint = s.paint ? 1 : 0;
    for (const p of [a, b, c]) {
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(n[0], n[1], n[2]);
      this.col.push(tmpColor.r, tmpColor.g, tmpColor.b);
      this.part.push(kind, paint, s.py ?? 0, s.pz ?? 0);
    }
  }

  quad(a: V3, b: V3, c: V3, d: V3, s: Style, ref?: V3): void {
    // Orient once for the whole quad so both triangles agree.
    if (ref) {
      const n = cross(sub(b, a), sub(d, a));
      const cen: V3 = [(a[0] + b[0] + c[0] + d[0]) / 4, (a[1] + b[1] + c[1] + d[1]) / 4, (a[2] + b[2] + c[2] + d[2]) / 4];
      if (dot(n, sub(cen, ref)) < 0) {
        this.tri(a, d, c, s);
        this.tri(a, c, b, s);
        return;
      }
    }
    this.tri(a, b, c, s);
    this.tri(a, c, d, s);
  }

  /** Convex polygon as a fan, facing `outward`. */
  poly(pts: V3[], s: Style, outward: V3): void {
    if (pts.length < 3) return;
    const o = pts[0];
    for (let i = 1; i < pts.length - 1; i++) {
      const n = cross(sub(pts[i], o), sub(pts[i + 1], o));
      if (dot(n, outward) >= 0) this.tri(o, pts[i], pts[i + 1], s);
      else this.tri(o, pts[i + 1], pts[i], s);
    }
  }

  /** Axis-aligned box. faces: 0 +x, 1 -x, 2 +y, 3 -y, 4 +z, 5 -z. A style function may return null to skip a face. */
  box(cx: number, cy: number, cz: number, w: number, h: number, d: number, s: Style | ((face: number) => Style | null)): void {
    const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    const ref: V3 = [cx, cy, cz];
    const st = (f: number): Style | null => (typeof s === 'function' ? s(f) : s);
    const faces: V3[][] = [
      [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]],
      [[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]],
      [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]],
      [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]],
      [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]],
      [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]],
    ];
    for (let f = 0; f < 6; f++) {
      const style = st(f);
      if (style) this.quad(faces[f][0], faces[f][1], faces[f][2], faces[f][3], style, ref);
    }
  }

  /** A square-section bar between two points. */
  bar(a: V3, b: V3, w: number, h: number, s: Style): void {
    const d = norm(sub(b, a));
    let u = cross(d, [0, 0, 1]);
    if (Math.hypot(u[0], u[1], u[2]) < 1e-3) u = cross(d, [1, 0, 0]);
    u = norm(u);
    const v = norm(cross(d, u));
    const corner = (p: V3, su: number, sv: number): V3 => [
      p[0] + (u[0] * su * w) / 2 + (v[0] * sv * h) / 2,
      p[1] + (u[1] * su * w) / 2 + (v[1] * sv * h) / 2,
      p[2] + (u[2] * su * w) / 2 + (v[2] * sv * h) / 2,
    ];
    const ref: V3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    const A = [corner(a, -1, -1), corner(a, 1, -1), corner(a, 1, 1), corner(a, -1, 1)];
    const B = [corner(b, -1, -1), corner(b, 1, -1), corner(b, 1, 1), corner(b, -1, 1)];
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      this.quad(A[i], A[j], B[j], B[i], s, ref);
    }
    this.poly(A, s, [-d[0], -d[1], -d[2]]);
    this.poly(B, s, d);
  }

  /** Surface through cross-section rings (each ring a closed loop of the same length). */
  loft(
    rings: V3[][],
    style: (edge: number, seg: number) => Style | null,
    opts: { ref: V3; capA?: Style; capB?: Style },
  ): void {
    const m = rings[0].length;
    for (let seg = 0; seg < rings.length - 1; seg++) {
      for (let e = 0; e < m; e++) {
        const s = style(e, seg);
        if (!s) continue;
        const e2 = (e + 1) % m;
        this.quad(rings[seg][e], rings[seg][e2], rings[seg + 1][e2], rings[seg + 1][e], s, opts.ref);
      }
    }
    if (opts.capA) this.poly(rings[0], opts.capA, [0, 0, 1]);
    if (opts.capB) this.poly(rings[rings.length - 1], opts.capB, [0, 0, -1]);
  }

  /** Low-poly sphere (helmets). */
  sphere(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, seg: number, rings: number, s: Style): void {
    const pt = (i: number, j: number): V3 => {
      const th = (j / rings) * Math.PI;
      const ph = (i / seg) * Math.PI * 2;
      return [cx + Math.sin(th) * Math.cos(ph) * rx, cy + Math.cos(th) * ry, cz + Math.sin(th) * Math.sin(ph) * rz];
    };
    const ref: V3 = [cx, cy, cz];
    for (let j = 0; j < rings; j++) {
      for (let i = 0; i < seg; i++) {
        this.quad(pt(i, j), pt(i + 1, j), pt(i + 1, j + 1), pt(i, j + 1), s, ref);
      }
    }
  }

  /**
   * Wheel with its axis along X. side = +1 puts the visible face toward +X, -1 toward -X.
   * The wheel is flagged so the shader spins it around (pivotY = radius, pivotZ = cz).
   */
  wheel(cx: number, r: number, cz: number, width: number, side: 1 | -1, seg = 10): void {
    const cy = r;
    const tyre: Style = { ...RUBBER, part: PART.wheel, py: cy, pz: cz };
    const rim: Style = { ...ALLOY, part: PART.wheel, py: cy, pz: cz };
    const xo = cx + (side * width) / 2;
    const xi = cx - (side * width) / 2;
    const ring = (x: number, rr: number, i: number): V3 => {
      const a = (i / seg) * Math.PI * 2;
      return [x, cy + Math.cos(a) * rr, cz + Math.sin(a) * rr];
    };
    const ref: V3 = [cx, cy, cz];
    for (let i = 0; i < seg; i++) {
      this.quad(ring(xi, r, i), ring(xi, r, i + 1), ring(xo, r, i + 1), ring(xo, r, i), tyre, ref); // tread
      this.quad(ring(xo, r, i), ring(xo, r, i + 1), ring(xo, r * 0.66, i + 1), ring(xo, r * 0.66, i), tyre, ref); // sidewall
    }
    // Five-spoke alloy star on the outer face (makes the spin readable).
    const xs = xo + side * 0.006;
    const star: V3[] = [];
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      const rr = k % 2 === 0 ? r * 0.68 : r * 0.3;
      star.push([xs, cy + Math.cos(a) * rr, cz + Math.sin(a) * rr]);
    }
    const c: V3 = [xs, cy, cz];
    for (let k = 0; k < 10; k++) {
      this.poly([c, star[k], star[(k + 1) % 10]], rim, [side, 0, 0]);
    }
  }

  /** Dark wheel-arch recess painted on a body side at x (half disc above floorY). */
  arch(x: number, cy: number, cz: number, radius: number, floorY: number, side: 1 | -1): void {
    const n = 8;
    const centre: V3 = [x, floorY, cz];
    const s: Style = { c: 0x0b0b0d };
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI;
      const a1 = ((i + 1) / n) * Math.PI;
      const p: V3 = [x, Math.max(floorY, cy + Math.sin(a0) * radius), cz + Math.cos(a0) * radius];
      const q: V3 = [x, Math.max(floorY, cy + Math.sin(a1) * radius), cz + Math.cos(a1) * radius];
      this.poly([centre, p, q], s, [side, 0, 0]);
    }
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aPart', new THREE.Float32BufferAttribute(this.part, 4));
    g.computeBoundingSphere();
    return g;
  }
}
