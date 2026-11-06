// HouseMesh composite helpers (bars, lofts, prisms), remap, shading and build (split from mesh.ts).

import * as THREE from 'three';
import { getBodyMaterial, getGlassLitMaterial, getGlassMaterial } from '../materials';
import { SURFACE_ATTRIBUTE } from '../surface';
import { getSignMaterial } from '../signs';
import { WIND_ATTRIBUTE } from '../shaders/wind';
import { Target, Col, P3, CASTER_ATTRIBUTE } from './meshBasics';
import { HouseMeshShapes } from './meshShapes';

export class HouseMesh extends HouseMeshShapes {
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
      if (buf.w) g.setAttribute(WIND_ATTRIBUTE, new THREE.BufferAttribute(buf.w.take(), 2));
      g.setAttribute('color', new THREE.BufferAttribute(buf.c.take(), 3));
      if (buf.s) g.setAttribute(SURFACE_ATTRIBUTE, new THREE.BufferAttribute(buf.s.take(), 1));
      if (buf.k) g.setAttribute(CASTER_ATTRIBUTE, new THREE.BufferAttribute(buf.k.take(), 1));
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
