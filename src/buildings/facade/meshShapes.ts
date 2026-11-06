// HouseMesh shape primitives: polygons, boxes, solids and the deferred flush (split from mesh.ts).

import { paneSeed } from './polish';
import { fixedFace, resolveLayers } from './layers';
import { Target, UV, Col, P3, PU, NU, PY, NY, PN, NN, trace, traceSource, boxCasts, POLY_CAST_AREA } from './meshBasics';
import { Buf, PendingBox } from './meshCore';
import { HouseMeshCore } from './meshCore';

export class HouseMeshShapes extends HouseMeshCore {
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
    const polyCasts = len * 0.5 >= POLY_CAST_AREA ? 1 : 0;
    const buf = this.bufs[t];
    const seed = t === 'glassLit' ? (this.fixedSeed ?? paneSeed(this.paneCount++)) : 0;
    const wcode = t === 'body' || t === 'sign' ? this.windCode : 0;
    const traceStart = trace.on ? buf.p.len / 9 : 0;
    const push = (i: number): void => {
      buf.p.push3(w[i * 3], w[i * 3 + 1], w[i * 3 + 2]);
      buf.n.push3(nx, ny, nz);
      const cc = (perVertex ? (c as readonly Col[])[i] : (c as Col));
      buf.c.push3(cc[0], cc[1], cc[2]);
      if (buf.s) buf.s.push1(this.surface);
      if (buf.k) buf.k.push1(polyCasts);
      const pi = pts[i];
      const wt = wcode === 0 ? 0 : this.windWeight ? this.windWeight(pi[0], pi[1], pi[2]) : 1;
      if (buf.uv) {
        if (t === 'sign') {
          const uv = uvs ? uvs[i] : null;
          buf.uv.push2(uv ? uv[0] : 0, uv ? uv[1] : 0);
        } else if (t === 'body') buf.uv.push2(wcode, wt);
        else buf.uv.push2(seed, 0);
      }
      if (buf.w) buf.w.push2(wcode, wt);
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
      caster: boxCasts(u1 - u0, y1 - y0, n1 - n0),
      windCode: this.windCode,
      windWeight: this.windWeight,
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
  protected flush(): void {
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

  protected emitBox(buf: Buf, bx: PendingBox): void {
    const { f, u0, u1, y0, y1, n0, n1, skip, c, top } = bx;
    const prevSurface = this.surface;
    const prevWind = this.windCode;
    const prevWeight = this.windWeight;
    this.surface = bx.surface;
    this.caster = bx.caster;
    this.windCode = bx.windCode;
    this.windWeight = bx.windWeight;
    this.emitFrame = f;
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
      // Vertex order of the two triangles: a b c a c d.
      this.extraAt(buf, ax, ay, az);
      this.extraAt(buf, bx2, by, bz);
      this.extraAt(buf, cx, cy, cz);
      this.extraAt(buf, ax, ay, az);
      this.extraAt(buf, cx, cy, cz);
      this.extraAt(buf, dx, dy, dz);
    };
    // +n face: (u0,y0,n1) (u1,y0,n1) (u1,y1,n1) (u0,y1,n1)
    if (!(skip & PN)) quad(x01, y0, z01, x11, y0, z11, x11, y1, z11, x01, y1, z01, f.nx, 0, f.nz, c);
    if (!(skip & NN)) quad(x10, y0, z10, x00, y0, z00, x00, y1, z00, x10, y1, z10, -f.nx, 0, -f.nz, c);
    if (!(skip & PU)) quad(x11, y0, z11, x10, y0, z10, x10, y1, z10, x11, y1, z11, f.ux, 0, f.uz, c);
    if (!(skip & NU)) quad(x00, y0, z00, x01, y0, z01, x01, y1, z01, x00, y1, z00, -f.ux, 0, -f.uz, c);
    if (!(skip & PY)) quad(x01, y1, z01, x11, y1, z11, x10, y1, z10, x00, y1, z00, 0, 1, 0, top);
    if (!(skip & NY)) quad(x00, y0, z00, x10, y0, z10, x11, y0, z11, x01, y0, z01, 0, -1, 0, c);
    this.surface = prevSurface;
    this.windCode = prevWind;
    this.windWeight = prevWeight;
  }
}
