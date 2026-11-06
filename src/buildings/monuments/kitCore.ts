// Monument kit core: Kit builder, Site and shell helpers (split from kit.ts).

import * as THREE from 'three';
import { ColorBatch, frustum, gable, type ColorTarget, type V3 } from '../geometry';
import { createRng } from '../../core/rng';

export type C = THREE.ColorRepresentation;

/** Context handed to every monument builder. */
export interface Site {
  /** Block width along x and depth along z (metres). */
  W: number;
  D: number;
  hw: number;
  hd: number;
}

const UP = new THREE.Vector3(0, 1, 0);
const ONE = new THREE.Vector3(1, 1, 1);

function compose(pos: V3, rot: V3, scale: V3): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(pos[0], pos[1], pos[2]),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2])),
    new THREE.Vector3(scale[0], scale[1], scale[2]),
  );
}

export class Kit {
  readonly batch = new ColorBatch();
  readonly rng: () => number;
  private readonly stack: THREE.Matrix4[] = [new THREE.Matrix4()];
  private readonly tmpColor = new THREE.Color();

  constructor(seed: number) {
    this.rng = createRng(seed);
  }

  // ---------- random helpers ----------
  range(a: number, b: number): number {
    return a + (b - a) * this.rng();
  }
  chance(p: number): boolean {
    return this.rng() < p;
  }
  pick<T>(list: readonly T[]): T {
    return list[Math.floor(this.rng() * list.length) % list.length];
  }
  /** Colour with a small random lightness jitter (amount in HSL lightness units). */
  jit(c: C, amount = 0.03): string {
    return '#' + this.tmpColor.set(c).offsetHSL(0, 0, (this.rng() - 0.5) * 2 * amount).getHexString();
  }

  // ---------- transform stack ----------
  private get m(): THREE.Matrix4 {
    return this.stack[this.stack.length - 1];
  }

  /**
   * Runs fn in a local frame moved to (x, y, z) and turned by ry around Y.
   * In the frame, local +z is the "front" direction.
   */
  at(x: number, z: number, ry: number, fn: () => void, y = 0, s = 1): this {
    const local = compose([x, y, z], [0, ry, 0], [s, s, s]);
    this.stack.push(this.m.clone().multiply(local));
    try {
      fn();
    } finally {
      this.stack.pop();
    }
    return this;
  }

  /**
   * Adds a geometry transformed by the current frame and the local matrix. Body pieces are rigid (wind id 0)
   * unless emitted inside withWind().
   */
  put(target: ColorTarget, geo: THREE.BufferGeometry, color: C, local?: THREE.Matrix4): this {
    if (local) geo.applyMatrix4(local);
    if (this.windCode !== 0 && this.windWeight && target === 'body') {
      // Weights are evaluated in the current frame (before the frame matrix), like the facade code does.
      const p = geo.getAttribute('position');
      const uv = new Float32Array(p.count * 2);
      for (let i = 0; i < p.count; i++) {
        uv[i * 2] = this.windCode;
        uv[i * 2 + 1] = this.windWeight(p.getX(i), p.getY(i), p.getZ(i));
      }
      this.batch.windUv = uv;
    }
    geo.applyMatrix4(this.m);
    this.batch.add(target, geo, color);
    return this;
  }

  private windCode = 0;
  private windWeight: ((x: number, y: number, z: number) => number) | null = null;

  /**
   * Runs fn so that the body pieces it emits are flexible: wind behaviour `code` (WIND.*) with an anchor weight
   * (0 where fixed, 1 at the free edge) computed from the vertex position in the current frame.
   * Everything outside such a call stays rigid, so stone, metal, towers, domes and statues never move.
   */
  withWind(code: number, weight: (x: number, y: number, z: number) => number, fn: () => void): this {
    const pc = this.windCode;
    const pw = this.windWeight;
    this.windCode = code;
    this.windWeight = weight;
    try {
      fn();
    } finally {
      this.windCode = pc;
      this.windWeight = pw;
    }
    return this;
  }

  add(target: ColorTarget, geo: THREE.BufferGeometry, color: C, pos: V3 = [0, 0, 0], rot: V3 = [0, 0, 0], scale: V3 = [1, 1, 1]): this {
    return this.put(target, geo, color, compose(pos, rot, scale));
  }

  // ---------- primitives (y0 = base height unless stated) ----------
  box(c: C, w: number, h: number, d: number, x: number, y0: number, z: number, ry = 0): this {
    return this.add('body', new THREE.BoxGeometry(w, h, d), c, [x, y0 + h / 2, z], [0, ry, 0]);
  }
  /** Box centred on (x, y, z) with an XYZ Euler rotation. */
  boxR(target: ColorTarget, c: C, w: number, h: number, d: number, pos: V3, rot: V3): this {
    return this.add(target, new THREE.BoxGeometry(w, h, d), c, pos, rot);
  }
  glass(lit: boolean, w: number, h: number, d: number, x: number, y0: number, z: number, c: C = '#2c3a48', ry = 0): this {
    return this.add(lit ? 'glassLit' : 'glass', new THREE.BoxGeometry(w, h, d), c, [x, y0 + h / 2, z], [0, ry, 0]);
  }
  cyl(c: C, rt: number, rb: number, h: number, x: number, y0: number, z: number, seg = 8, target: ColorTarget = 'body'): this {
    return this.add(target, new THREE.CylinderGeometry(rt, rb, h, seg), c, [x, y0 + h / 2, z]);
  }
  cone(c: C, r: number, h: number, x: number, y0: number, z: number, seg = 8, ry = 0, target: ColorTarget = 'body'): this {
    return this.add(target, new THREE.ConeGeometry(r, h, seg), c, [x, y0 + h / 2, z], [0, ry, 0]);
  }
  /** Low-poly blob centred on (x, y, z), scaled per axis. */
  blob(c: C, r: number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, detail = 0, target: ColorTarget = 'body'): this {
    return this.add(target, new THREE.IcosahedronGeometry(r, detail), c, [x, y, z], [0, 0, 0], [sx, sy, sz]);
  }
  /** Square bar of thickness t from a to b. */
  beam(c: C, a: V3, b: V3, t: number, target: ColorTarget = 'body', t2 = t): this {
    const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = dir.length();
    if (len < 1e-5) return this;
    const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize());
    const mid = new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    return this.put(target, new THREE.BoxGeometry(t, len, t2), c, new THREE.Matrix4().compose(mid, q, ONE));
  }
  /** Pitched roof, ridge along local z (ry turns it). */
  gableRoof(c: C, w: number, h: number, d: number, x: number, y0: number, z: number, ry = 0): this {
    return this.add('body', gable(w, h, d), c, [x, y0, z], [0, ry, 0]);
  }
  frust(c: C, w0: number, d0: number, w1: number, d1: number, h: number, x: number, y0: number, z: number, ry = 0): this {
    return this.add('body', frustum(w0, d0, w1, d1, h), c, [x, y0, z], [0, ry, 0]);
  }
  /** Raw triangles (flat list of xyz) in the current frame. Winding must face outwards. */
  tris(target: ColorTarget, c: C, pos: number[]): this {
    if (pos.length === 0) return this;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return this.put(target, g, c);
  }
}

/** Colour with its HSL lightness shifted by dl. */
export function tint(c: C, dl: number): string {
  return '#' + new THREE.Color(c).offsetHSL(0, 0, dl).getHexString();
}

// ---------- oriented quads for custom shells ----------

/** Collects triangles per colour, orienting each one so its normal agrees with a hint vector. */
export class Shell {
  readonly parts = new Map<string, number[]>();

  quad(color: string, a: V3, b: V3, c: V3, d: V3, hint: V3): void {
    this.tri(color, a, b, c, hint);
    this.tri(color, a, c, d, hint);
  }

  tri(color: string, a: V3, b: V3, c: V3, hint: V3): void {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    let list = this.parts.get(color);
    if (!list) {
      list = [];
      this.parts.set(color, list);
    }
    if (nx * hint[0] + ny * hint[1] + nz * hint[2] < 0) list.push(...a, ...c, ...b);
    else list.push(...a, ...b, ...c);
  }

  flush(k: Kit, target: ColorTarget = 'body'): void {
    for (const [color, pos] of this.parts) k.tris(target, color, pos);
    this.parts.clear();
  }
}
