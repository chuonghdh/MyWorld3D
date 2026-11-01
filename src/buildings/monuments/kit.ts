// Modelling kit for the block monuments: a ColorBatch with a transform stack,
// low-poly primitives, facade helpers and small props (people, cars, trees, signs).
// Every piece ends up in at most three meshes (body, glass, glassLit) with shared materials.

import * as THREE from 'three';
import { ColorBatch, frustum, gable, type ColorTarget, type V3 } from '../geometry';
import { createRng } from '../../core/rng';
import { WIND, anchorWeight } from '../facade/polish';
import { buildings } from '../../config/tuning';

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

export interface TierOptions {
  cx: number;
  cz: number;
  /** Inner radii (x and z) of the first row. */
  a0: number;
  b0: number;
  /** Radial depth and rise of each row. */
  step: number;
  rise: number;
  rows: number;
  th0: number;
  th1: number;
  segs: number;
  /** Seat colour per segment and row. */
  seat: (seg: number, row: number) => string;
  riser: string;
  outer: string;
  /** Close the ends of a partial arc. */
  caps?: boolean;
}

/** Stepped elliptic bowl (stadium stands, theatre cavea). Angles: x = cos, z = sin. Returns top height. */
export function tiers(k: Kit, o: TierOptions): number {
  const s = new Shell();
  const P = (r: number, th: number, y: number): V3 => [
    o.cx + (o.a0 + r * o.step) * Math.cos(th),
    y,
    o.cz + (o.b0 + r * o.step) * Math.sin(th),
  ];
  const H = o.rows * o.rise;
  for (let i = 0; i < o.segs; i++) {
    const ta = o.th0 + ((o.th1 - o.th0) * i) / o.segs;
    const tb = o.th0 + ((o.th1 - o.th0) * (i + 1)) / o.segs;
    const tm = (ta + tb) / 2;
    const inward: V3 = [-Math.cos(tm), 0, -Math.sin(tm)];
    const outward: V3 = [Math.cos(tm), 0, Math.sin(tm)];
    for (let r = 0; r < o.rows; r++) {
      const yl = r * o.rise;
      const yh = (r + 1) * o.rise;
      s.quad(o.riser, P(r, ta, yl), P(r, tb, yl), P(r, tb, yh), P(r, ta, yh), inward);
      s.quad(o.seat(i, r), P(r, ta, yh), P(r, tb, yh), P(r + 1, tb, yh), P(r + 1, ta, yh), [0, 1, 0]);
    }
    s.quad(o.outer, P(o.rows, ta, 0), P(o.rows, tb, 0), P(o.rows, tb, H), P(o.rows, ta, H), outward);
  }
  if (o.caps) {
    for (const [th, sign] of [[o.th0, -1], [o.th1, 1]] as const) {
      const tang: V3 = [-Math.sin(th) * sign, 0, Math.cos(th) * sign];
      for (let r = 0; r < o.rows; r++) {
        const yh = (r + 1) * o.rise;
        s.quad(o.outer, P(r, th, 0), P(r + 1, th, 0), P(r + 1, th, yh), P(r, th, yh), tang);
      }
    }
  }
  s.flush(k);
  return H;
}

// ---------- facades ----------

export interface WindowStyle {
  frame?: C;
  glass?: C;
  depth?: number;
  sill?: boolean;
  mullion?: boolean;
  /** Pointed (gothic) top. */
  pointed?: boolean;
}

/**
 * A window in the current frame on a wall whose outer face is the plane z = 0 (facing +z).
 * The pane sits flush with the wall and the frame stands proud, so the glass reads as recessed.
 */
export function windowAt(k: Kit, x: number, y0: number, w: number, h: number, lit: boolean, st: WindowStyle = {}): void {
  const frame = st.frame ?? '#f4efe3';
  const d = st.depth ?? 0.18;
  const t = 0.13;
  k.glass(lit, w, h, 0.06, x, y0, 0.0, st.glass ?? '#2c3a48');
  k.box(frame, t, h, d, x - w / 2 - t / 2, y0, d / 2);
  k.box(frame, t, h, d, x + w / 2 + t / 2, y0, d / 2);
  if (st.pointed) {
    const s = w / Math.SQRT2;
    k.add(lit ? 'glassLit' : 'glass', new THREE.BoxGeometry(s, s, 0.06), st.glass ?? '#2c3a48', [x, y0 + h, 0], [0, 0, Math.PI / 4]);
    k.boxR('body', frame, t, w * 0.78, d, [x - w * 0.27, y0 + h + w * 0.26, d / 2], [0, 0, -Math.PI / 4]);
    k.boxR('body', frame, t, w * 0.78, d, [x + w * 0.27, y0 + h + w * 0.26, d / 2], [0, 0, Math.PI / 4]);
  } else {
    k.box(frame, w + 2 * t + 0.12, 0.2, d + 0.04, x, y0 + h, (d + 0.04) / 2);
  }
  if (st.sill !== false) k.box(frame, w + 0.34, 0.1, d + 0.14, x, y0 - 0.1, (d + 0.14) / 2);
  if (st.mullion) k.box(frame, 0.07, h, 0.08, x, y0, 0.04);
}

export type Face = 'front' | 'back' | 'left' | 'right';

export interface WingOptions {
  x: number;
  z: number;
  w: number;
  d: number;
  floors: number;
  groundH: number;
  floorH: number;
  wall: C;
  trim: C;
  base: C;
  faces: Partial<Record<Face, boolean>>;
  bay?: number;
  winW?: number;
  winH?: number;
  litP?: number;
  window?: WindowStyle;
  /** Return true to leave a window out (e.g. for an entrance). u = offset along the face from its centre. */
  skip?: (face: Face, u: number, floor: number) => boolean;
  cornice?: boolean;
}

/** Runs fn in the frame of one face of a box footprint: origin at the face centre, local +z outwards. */
export function onFace(k: Kit, f: Face, x: number, z: number, w: number, d: number, fn: (span: number) => void): void {
  if (f === 'front') k.at(x, z + d / 2, 0, () => fn(w));
  else if (f === 'back') k.at(x, z - d / 2, Math.PI, () => fn(w));
  else if (f === 'right') k.at(x + w / 2, z, Math.PI / 2, () => fn(d));
  else k.at(x - w / 2, z, -Math.PI / 2, () => fn(d));
}

/** A rectangular building wing with plinth, string courses, cornice and framed windows. Returns the top height. */
export function wing(k: Kit, o: WingOptions): number {
  const H = o.groundH + (o.floors - 1) * o.floorH;
  const bay = o.bay ?? 2.8;
  const winW = o.winW ?? 1.2;
  const winH = o.winH ?? 1.9;
  const litP = o.litP ?? buildings.litWindowShareMonument;
  k.box(o.wall, o.w, H, o.d, o.x, 0, o.z);
  k.box(o.base, o.w + 0.16, 0.9, o.d + 0.16, o.x, 0, o.z);
  for (let f = 1; f < o.floors; f++) {
    const y = o.groundH + (f - 1) * o.floorH - 0.1;
    k.box(o.trim, o.w + 0.14, 0.18, o.d + 0.14, o.x, y, o.z);
  }
  let top = H;
  if (o.cornice !== false) {
    k.box(o.trim, o.w + 0.3, 0.25, o.d + 0.3, o.x, H - 0.25, o.z);
    k.box(o.trim, o.w + 0.7, 0.3, o.d + 0.7, o.x, H, o.z);
    top = H + 0.3;
  }
  for (const face of ['front', 'back', 'left', 'right'] as const) {
    if (!o.faces[face]) continue;
    onFace(k, face, o.x, o.z, o.w, o.d, (span) => {
      const n = Math.max(1, Math.floor((span - 1.4) / bay));
      for (let f = 0; f < o.floors; f++) {
        const y0 = f === 0 ? 1.1 : o.groundH + (f - 1) * o.floorH + 0.9;
        const h = f === 0 ? Math.min(o.groundH - 1.6, winH + 0.3) : Math.min(winH, o.floorH - 1.15);
        for (let i = 0; i < n; i++) {
          const u = (i - (n - 1) / 2) * bay;
          if (o.skip?.(face, u, f)) continue;
          windowAt(k, u, y0, winW, h, k.chance(litP), o.window);
        }
      }
    });
  }
  return top;
}

/** Simple sign lettering: random glyph-like strokes filling width x h, facing local +z at z. */
export function lettering(k: Kit, x: number, y0: number, z: number, width: number, h: number, c: C, lit: boolean): void {
  const n = Math.max(2, Math.floor(width / (h * 0.8)));
  const cell = width / n;
  const gw = cell * 0.72;
  const t = Math.max(0.05, h * 0.18);
  const target: ColorTarget = lit ? 'glassLit' : 'body';
  for (let i = 0; i < n; i++) {
    const cx = x - width / 2 + cell * (i + 0.5);
    const g = Math.floor(k.rng() * 6);
    const add = (w: number, hh: number, dx: number, dy: number): void => {
      k.add(target, new THREE.BoxGeometry(w, hh, 0.06), c, [cx + dx, y0 + dy + hh / 2, z + 0.03]);
    };
    // vertical strokes
    if (g !== 3) add(t, h, -gw / 2 + t / 2, 0);
    if (g === 0 || g === 2 || g === 4) add(t, h, gw / 2 - t / 2, 0);
    if (g === 3) add(t, h, 0, 0);
    // bars
    if (g !== 4) add(gw, t, 0, h - t);
    if (g === 0 || g === 1 || g === 5) add(gw * 0.8, t, 0, h / 2 - t / 2);
    if (g === 2 || g === 5 || g === 3) add(gw, t, 0, 0);
  }
}

/** Sign board with a lit lettering band, facing local +z. */
export function signBoard(k: Kit, x: number, y0: number, z: number, w: number, h: number, board: C, letters: C, lit = true): void {
  k.box(board, w, h, 0.25, x, y0, z - 0.125);
  lettering(k, x, y0 + h * 0.2, z, w * 0.84, h * 0.6, letters, lit);
}

// ---------- props ----------

const SKIN = ['#e8c4a0', '#c99a72', '#8d5a3b', '#f0d2b4'];
const CLOTHES = ['#b03a2e', '#24395c', '#2f6b4f', '#e2b66c', '#efeee8', '#6c7378', '#c9714f', '#3f6e8f', '#7a2e2a'];
export const CAR_COLORS = ['#b03a2e', '#24395c', '#efeee8', '#22262a', '#6c7378', '#3f6e8f', '#e2b66c', '#2f6b4f', '#c8c4bb'];

/** A standing person, 1.75 m tall, facing local +z after ry. */
export function person(k: Kit, x: number, z: number, ry = 0, shirt?: C): void {
  k.at(x, z, ry, () => {
    k.box(k.pick(['#22262a', '#3a4150', '#5a4a3a', '#24395c']), 0.34, 0.86, 0.2, 0, 0, 0);
    k.box(shirt ?? k.pick(CLOTHES), 0.44, 0.64, 0.26, 0, 0.86, 0);
    k.box(k.pick(SKIN), 0.22, 0.24, 0.22, 0, 1.51, 0);
  });
}

/** A crowd of n people scattered in a rectangle. */
export function crowd(k: Kit, n: number, x0: number, x1: number, z0: number, z1: number): void {
  for (let i = 0; i < n; i++) person(k, k.range(x0, x1), k.range(z0, z1), k.range(0, Math.PI * 2));
}

function wheels(k: Kit, xs: number, zs: readonly number[], r: number, w: number): void {
  for (const z of zs) {
    for (const x of [-xs, xs]) {
      k.add('body', new THREE.CylinderGeometry(r, r, w, 8), '#1d1f22', [x, r, z], [0, 0, Math.PI / 2]);
    }
  }
}

/** A 4.4 m car, front towards local +z. */
export function car(k: Kit, x: number, z: number, ry: number, color: C): void {
  k.at(x, z, ry, () => {
    k.box(color, 1.8, 0.62, 4.4, 0, 0.3, 0);
    k.glass(false, 1.62, 0.46, 2.3, 0, 0.92, -0.25, '#3a4a58');
    k.box(color, 1.58, 0.08, 2.0, 0, 1.38, -0.3);
    k.box('#2a2d31', 1.84, 0.2, 0.18, 0, 0.3, 2.2);
    k.box('#2a2d31', 1.84, 0.2, 0.18, 0, 0.3, -2.2);
    k.glass(true, 0.3, 0.14, 0.06, -0.6, 0.66, 2.2, '#f4efe3');
    k.glass(true, 0.3, 0.14, 0.06, 0.6, 0.66, 2.2, '#f4efe3');
    k.box('#b03a2e', 0.32, 0.14, 0.06, -0.6, 0.68, -2.22);
    k.box('#b03a2e', 0.32, 0.14, 0.06, 0.6, 0.68, -2.22);
    wheels(k, 0.8, [1.35, -1.35], 0.33, 0.24);
  });
}

/** A European box ambulance (white, yellow-green battenburg band), front towards local +z. */
export function ambulance(k: Kit, x: number, z: number, ry: number): void {
  k.at(x, z, ry, () => {
    const white = '#f4f4f0';
    k.box(white, 2.2, 2.3, 4.0, 0, 0.45, -0.7);
    k.box(white, 2.1, 1.25, 1.8, 0, 0.45, 2.2);
    k.boxR('glass', '#3a4a58', 1.9, 0.8, 0.06, [0, 2.1, 2.45], [-0.5, 0, 0]);
    k.box(white, 2.1, 0.8, 1.0, 0, 1.7, 1.75);
    k.glass(false, 2.14, 0.55, 0.8, 0, 1.85, 1.75, '#3a4a58');
    // battenburg band
    for (let i = 0; i < 8; i++) {
      k.box(i % 2 === 0 ? '#e8d33a' : '#2f8f4f', 2.24, 0.45, 0.5, 0, 1.0, -2.45 + i * 0.5);
    }
    k.box('#c0392b', 2.24, 0.12, 4.0, 0, 1.55, -0.7);
    k.box('#c0392b', 0.22, 0.7, 0.04, 0, 1.75, -2.72);
    k.box('#c0392b', 0.7, 0.22, 0.04, 0, 1.99, -2.72);
    k.glass(true, 1.4, 0.18, 0.3, 0, 2.5, 1.9, '#3f6ee8');
    k.glass(true, 0.3, 0.14, 0.06, -0.75, 0.75, 3.11, '#f4efe3');
    k.glass(true, 0.3, 0.14, 0.06, 0.75, 0.75, 3.11, '#f4efe3');
    k.box('#2a2d31', 2.14, 0.25, 0.15, 0, 0.35, 3.1);
    wheels(k, 0.85, [2.1, -1.7], 0.4, 0.26);
  });
}

/** A red fire engine with a roof ladder, 8.6 m long, front towards local +z. */
export function fireEngine(k: Kit, x: number, z: number, ry: number): void {
  k.at(x, z, ry, () => {
    const red = '#c8231e';
    const chrome = '#c9ccd0';
    k.box('#2a2d31', 2.2, 0.4, 8.2, 0, 0.45, 0);
    k.box(red, 2.5, 2.0, 5.8, 0, 0.75, -1.3);
    k.box(red, 2.5, 2.25, 2.5, 0, 0.75, 2.85);
    k.glass(false, 2.3, 0.9, 0.06, 0, 1.85, 4.12, '#3a4a58');
    k.glass(false, 2.54, 0.75, 1.6, 0, 1.95, 2.9, '#3a4a58');
    k.box('#f4f4f0', 2.54, 0.14, 8.2, 0, 1.35, 0.05);
    // locker shutters
    for (let i = 0; i < 4; i++) k.box(chrome, 2.54, 1.05, 0.05, 0, 0.95 + 0.0, -3.6 + i * 1.3);
    k.box(chrome, 2.6, 0.3, 0.2, 0, 0.45, 4.2);
    // ladder
    for (const sx of [-0.45, 0.45]) k.box(chrome, 0.1, 0.14, 7.0, sx, 2.8, -0.6);
    for (let i = 0; i < 14; i++) k.box(chrome, 0.9, 0.06, 0.06, 0, 2.84, -3.9 + i * 0.5);
    k.box('#2a2d31', 1.1, 0.25, 1.1, 0, 2.75, -3.2);
    k.glass(true, 1.6, 0.18, 0.3, 0, 3.0, 3.0, '#3f6ee8');
    k.glass(true, 0.3, 0.16, 0.06, -0.9, 0.95, 4.13, '#f4efe3');
    k.glass(true, 0.3, 0.16, 0.06, 0.9, 0.95, 4.13, '#f4efe3');
    wheels(k, 1.0, [3.0, -2.0, -3.3], 0.5, 0.36);
  });
}

const GREENS = ['#4f7d3a', '#5d8a45', '#6b9650', '#47703a', '#7aa25a'];

/** A deciduous street tree about h metres tall. */
export function tree(k: Kit, x: number, z: number, h = 6.5): void {
  k.cyl('#6b4a2e', 0.13, 0.2, h * 0.45, x, 0, z, 5);
  const r = h * 0.22;
  const g = k.pick(GREENS);
  // The crown nods in the wind (the trunk above stays rigid).
  k.withWind(WIND.PLANT, (_x, y) => anchorWeight(y, h * 0.45, h * 0.95), () => {
    k.blob(g, r, x, h * 0.62, z, 1.1, 0.9, 1.1);
    k.blob(k.jit(g, 0.05), r * 0.75, x + r * 0.5, h * 0.72, z - r * 0.3);
    k.blob(k.jit(g, 0.06), r * 0.7, x - r * 0.45, h * 0.78, z + r * 0.35);
  });
}

/** A slim Mediterranean cypress. */
export function cypress(k: Kit, x: number, z: number, h = 8): void {
  k.cyl('#5a4030', 0.12, 0.15, 0.8, x, 0, z, 5);
  k.cone('#3a5a32', h * 0.12, h * 0.9, x, 0.6, z, 6);
}

/** Stone planter with a clipped shrub or flowers. */
export function planter(k: Kit, x: number, z: number, w = 1.4, d = w, flowers = false): void {
  k.box('#cbbfa8', w, 0.55, d, x, 0, z);
  k.box('#5a4030', w - 0.2, 0.06, d - 0.2, x, 0.55, z);
  // Only the foliage and blooms nod; the stone trough and soil stay rigid.
  k.withWind(WIND.PLANT, (_x, y) => anchorWeight(y, 0.58, 1.2), () => {
    if (flowers) {
      k.blob('#4f7d3a', w * 0.42, x, 0.75, z, 1, 0.55, d / w);
      const fc = k.pick(['#d9534f', '#f2c14e', '#e8b4a8', '#efeee8', '#9b59b6']);
      k.blob(fc, w * 0.18, x - w * 0.15, 0.95, z + 0.1, 1, 0.6, 1);
      k.blob(fc, w * 0.16, x + w * 0.18, 0.93, z - 0.12, 1, 0.6, 1);
    } else {
      k.blob(k.pick(GREENS), w * 0.45, x, 0.95, z, 1, 0.8, d / w);
    }
  });
}

/** Flagpole with a flag flying towards local +x. */
export function flagpole(k: Kit, x: number, z: number, h: number, flag: C, flag2?: C): void {
  k.cyl('#d8d8d4', 0.05, 0.08, h, x, 0, z, 6);
  k.blob('#e2b66c', 0.1, x, h + 0.05, z);
  // Only the cloth streams; the pole and finial are rigid.
  k.withWind(WIND.FLAG, (px) => anchorWeight(px, x + 0.03, x + 1.53), () => {
    k.box(flag, 1.5, flag2 ? 0.5 : 1.0, 0.04, x + 0.78, h - 1.1, z);
    if (flag2) k.box(flag2, 1.5, 0.5, 0.04, x + 0.78, h - 0.6, z);
  });
}

/** Classic street lamp, 4.5 m, with a lantern that glows at night. */
export function lamp(k: Kit, x: number, z: number, h = 4.5): void {
  k.cyl('#22262a', 0.06, 0.1, h, x, 0, z, 6);
  k.cyl('#22262a', 0.14, 0.2, 0.4, x, 0, z, 6);
  k.glass(true, 0.32, 0.42, 0.32, x, h, z, '#f6e7c0');
  k.cone('#22262a', 0.3, 0.3, x, h + 0.42, z, 4, Math.PI / 4);
}

export function bench(k: Kit, x: number, z: number, ry = 0): void {
  k.at(x, z, ry, () => {
    k.box('#8a6a45', 1.8, 0.08, 0.45, 0, 0.45, 0);
    k.box('#8a6a45', 1.8, 0.4, 0.06, 0, 0.55, -0.22);
    k.box('#22262a', 0.06, 0.45, 0.4, -0.8, 0, 0);
    k.box('#22262a', 0.06, 0.45, 0.4, 0.8, 0, 0);
  });
}

/** Line of small pennants hanging between two points with a slight sag. */
export function bunting(k: Kit, a: V3, b: V3, colors: readonly C[], sag = 0.6, n?: number): void {
  const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
  const count = n ?? Math.max(3, Math.floor(len / 0.9));
  const pts: V3[] = [];
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t]);
  }
  const ry = -Math.atan2(b[2] - a[2], b[0] - a[0]);
  for (let i = 0; i < count; i++) {
    k.beam('#3a3d42', pts[i], pts[i + 1], 0.03);
    const p = pts[i];
    const q = pts[i + 1];
    const m: V3 = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2];
    // downward-pointing flat pennant
    // The rope is rigid; the pennant hangs from it and flutters.
    const top = m[1] - 0.03;
    k.withWind(WIND.LAUNDRY, (_x, y) => anchorWeight(y, top, top - 0.42), () => {
      k.add('body', new THREE.ConeGeometry(0.22, 0.42, 3), colors[i % colors.length], [m[0], m[1] - 0.24, m[2]], [Math.PI, ry, 0], [1, 1, 0.25]);
    });
  }
}

/** String of light bulbs (lit at night) between two points. */
export function bulbs(k: Kit, a: V3, b: V3, n: number, sag = 0.3): void {
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    k.glass(true, 0.14, 0.14, 0.14, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t) - 0.07, a[2] + (b[2] - a[2]) * t, '#fff1c4');
  }
}

/** Rooftop clutter on a flat roof: AC units, vents, a stair hut. */
export function roofClutter(k: Kit, x: number, z: number, w: number, d: number, y: number, n: number): void {
  for (let i = 0; i < n; i++) {
    const px = x + k.range(-w / 2 + 1.2, w / 2 - 1.2);
    const pz = z + k.range(-d / 2 + 1.2, d / 2 - 1.2);
    const t = k.rng();
    if (t < 0.45) k.box('#b8b8b4', k.range(1, 1.8), 0.8, k.range(0.8, 1.2), px, y, pz);
    else if (t < 0.7) k.cyl('#9a9a96', 0.25, 0.25, 0.9, px, y, pz, 6);
    else if (t < 0.85) k.box('#c8c4bb', 2.2, 2.3, 2.0, px, y, pz);
    else k.glass(false, 1.6, 0.3, 1.2, px, y, pz, '#5a6a78');
  }
}

/** Parking bay markings: n bays of width bw and length bl along local x, opening towards +z. */
export function bays(k: Kit, x0: number, z0: number, n: number, bw: number, bl: number, paint: C = '#efeee8'): void {
  for (let i = 0; i <= n; i++) k.box(paint, 0.12, 0.02, bl, x0 + i * bw, 0.04, z0 + bl / 2);
}
