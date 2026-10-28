// Tiny flat-shaded mesh builder for the rigged people and dogs. Every triangle carries four vertex
// attributes: colour (grey shade or fixed colour), and aRig = (part id, colour region, pivotY, pivotZ)
// which the vertex shader uses to swing limbs and to pick per-instance clothing colours.
// Geometry is non-indexed (flat shading). Builds in plain Node: no WebGL needed.

import * as THREE from 'three';

type V3 = [number, number, number];

export class RigBuilder {
  private readonly pos: number[] = [];
  private readonly nor: number[] = [];
  private readonly col: number[] = [];
  private readonly rig: number[] = [];
  private part = 0;
  private region = 0;
  private pivY = 0;
  private pivZ = 0;
  private r = 1;
  private g = 1;
  private b = 1;
  private shiftY = 0;
  private shiftZ = 0;
  private xf: THREE.Matrix4 | null = null;
  private readonly nm = new THREE.Matrix3();
  private readonly tmp = new THREE.Vector3();

  /** Sets the part id, colour region, pivot (y, z) and base colour for the next primitives. */
  set(part: number, region: number, color: number | string, pivotY = 0, pivotZ = 0): this {
    this.part = part;
    this.region = region;
    this.pivY = pivotY + this.shiftY;
    this.pivZ = pivotZ + this.shiftZ;
    const c = new THREE.Color(color);
    this.r = c.r;
    this.g = c.g;
    this.b = c.b;
    return this;
  }

  /** Translation applied to all following vertices (used to follow a stooped torso). */
  shift(dy: number, dz: number): this {
    this.shiftY = dy;
    this.shiftZ = dz;
    return this;
  }

  /** Rotation matrix applied to all following vertices before the shift (null to clear). */
  transform(m: THREE.Matrix4 | null): this {
    this.xf = m;
    if (m) this.nm.getNormalMatrix(m);
    return this;
  }

  get triangleCount(): number {
    return this.pos.length / 9;
  }

  private emit(p: V3, n: V3): void {
    this.tmp.set(p[0], p[1], p[2]);
    let nx = n[0];
    let ny = n[1];
    let nz = n[2];
    if (this.xf) {
      this.tmp.applyMatrix4(this.xf);
      this.tmp.set(this.tmp.x, this.tmp.y, this.tmp.z);
      const e = this.nm.elements;
      const tx = e[0] * nx + e[3] * ny + e[6] * nz;
      const ty = e[1] * nx + e[4] * ny + e[7] * nz;
      const tz = e[2] * nx + e[5] * ny + e[8] * nz;
      nx = tx;
      ny = ty;
      nz = tz;
    }
    this.pos.push(this.tmp.x, this.tmp.y + this.shiftY, this.tmp.z + this.shiftZ);
    this.nor.push(nx, ny, nz);
    this.col.push(this.r, this.g, this.b);
    this.rig.push(this.part, this.region, this.pivY, this.pivZ);
  }

  /** One triangle with a flat face normal, or with explicit vertex normals. */
  tri(a: V3, b: V3, c: V3, na?: V3, nb?: V3, nc?: V3): void {
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-9) return; // degenerate (sphere poles)
    nx /= l;
    ny /= l;
    nz /= l;
    const f: V3 = [nx, ny, nz];
    this.emit(a, na ?? f);
    this.emit(b, nb ?? f);
    this.emit(c, nc ?? f);
  }

  quad(a: V3, b: V3, c: V3, d: V3): void {
    this.tri(a, b, c);
    this.tri(a, c, d);
  }

  /**
   * Tapered box: bottom rectangle (bw x bd) at y0, top rectangle (tw x td) at y1, both centred on
   * (cx, cz), the top optionally shifted forward by `tz`. The bottom face is skipped unless asked.
   */
  box(cx: number, y0: number, y1: number, cz: number, bw: number, bd: number, tw = bw, td = bd, tz = 0, bottom = false, top = true): this {
    const b00: V3 = [cx - bw / 2, y0, cz - bd / 2];
    const b10: V3 = [cx + bw / 2, y0, cz - bd / 2];
    const b11: V3 = [cx + bw / 2, y0, cz + bd / 2];
    const b01: V3 = [cx - bw / 2, y0, cz + bd / 2];
    const t00: V3 = [cx - tw / 2, y1, cz + tz - td / 2];
    const t10: V3 = [cx + tw / 2, y1, cz + tz - td / 2];
    const t11: V3 = [cx + tw / 2, y1, cz + tz + td / 2];
    const t01: V3 = [cx - tw / 2, y1, cz + tz + td / 2];
    this.quad(b01, b11, t11, t01); // front +z
    this.quad(b10, b00, t00, t10); // back -z
    this.quad(b11, b10, t10, t11); // +x
    this.quad(b00, b01, t01, t00); // -x
    if (top) this.quad(t01, t11, t10, t00);
    if (bottom) this.quad(b00, b10, b11, b01);
    return this;
  }

  /** Open or capped n-sided frustum along Y, elliptical via sx and sz. */
  frustum(cx: number, y0: number, y1: number, cz: number, rb: number, rt: number, sides: number, sx = 1, sz = 1, topCap = false, bottomCap = false): this {
    const ring = (y: number, r: number, k: number): V3 => {
      const a = (k / sides) * Math.PI * 2;
      return [cx + Math.cos(a) * r * sx, y, cz + Math.sin(a) * r * sz];
    };
    for (let k = 0; k < sides; k++) {
      const b0 = ring(y0, rb, k);
      const b1 = ring(y0, rb, k + 1);
      const t0 = ring(y1, rt, k);
      const t1 = ring(y1, rt, k + 1);
      this.quad(b1, b0, t0, t1);
      if (topCap) this.tri([cx, y1, cz], t1, t0);
      if (bottomCap) this.tri([cx, y0, cz], b0, b1);
    }
    return this;
  }

  /** Ellipsoid (or a cap of one) with smooth normals. thetaLen is the polar sweep from the +Y pole. */
  ellipsoid(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, wSeg: number, hSeg: number, thetaLen = Math.PI): this {
    const pt = (i: number, j: number): { p: V3; n: V3 } => {
      const th = (i / hSeg) * thetaLen;
      const ph = (j / wSeg) * Math.PI * 2;
      const sx = Math.sin(th) * Math.cos(ph);
      const sy = Math.cos(th);
      const sz = Math.sin(th) * Math.sin(ph);
      const nx = sx / rx;
      const ny = sy / ry;
      const nz = sz / rz;
      const l = Math.hypot(nx, ny, nz) || 1;
      return { p: [cx + sx * rx, cy + sy * ry, cz + sz * rz], n: [nx / l, ny / l, nz / l] };
    };
    for (let i = 0; i < hSeg; i++) {
      for (let j = 0; j < wSeg; j++) {
        const a = pt(i, j);
        const b = pt(i, j + 1);
        const c = pt(i + 1, j + 1);
        const d = pt(i + 1, j);
        this.tri(a.p, b.p, c.p, a.n, b.n, c.n);
        this.tri(a.p, c.p, d.p, a.n, c.n, d.n);
      }
    }
    return this;
  }

  /** Builds the final geometry (non-indexed, attributes position, normal, color, aRig). */
  build(): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    geo.setAttribute('aRig', new THREE.Float32BufferAttribute(this.rig, 4));
    geo.computeBoundingSphere();
    return geo;
  }
}
