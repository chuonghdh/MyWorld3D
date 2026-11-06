// Monument kit structures: tiers, windows, wings, lettering and water basins (split from kit.ts).

import * as THREE from 'three';
import { type ColorTarget, type V3 } from '../geometry';
import { buildings } from '../../config/tuning';
import { C, Kit, tint, Shell } from './kitCore';

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
  /** Back face (seen only from far away): skip the jambs and the sill to save about 3 boxes. Default off. */
  backFace?: boolean;
}

/**
 * A window in the current frame on a wall whose outer face is the plane z = 0 (facing +z).
 * The pane sits flush with the wall and the frame stands proud, so the glass reads as recessed.
 */
export function windowAt(k: Kit, x: number, y0: number, w: number, h: number, lit: boolean, st: WindowStyle = {}): void {
  const frame = st.frame ?? '#f4efe3';
  const d = st.depth ?? 0.18;
  const t = 0.13;
  const bare = st.backFace === true;
  k.glass(lit, w, h, 0.06, x, y0, 0.0, st.glass ?? '#2c3a48');
  if (!bare) {
    k.box(frame, t, h, d, x - w / 2 - t / 2, y0, d / 2);
    k.box(frame, t, h, d, x + w / 2 + t / 2, y0, d / 2);
  }
  if (st.pointed) {
    const s = w / Math.SQRT2;
    k.add(lit ? 'glassLit' : 'glass', new THREE.BoxGeometry(s, s, 0.06), st.glass ?? '#2c3a48', [x, y0 + h, 0], [0, 0, Math.PI / 4]);
    k.boxR('body', frame, t, w * 0.78, d, [x - w * 0.27, y0 + h + w * 0.26, d / 2], [0, 0, -Math.PI / 4]);
    k.boxR('body', frame, t, w * 0.78, d, [x + w * 0.27, y0 + h + w * 0.26, d / 2], [0, 0, Math.PI / 4]);
  } else {
    k.box(frame, w + 2 * t + 0.12, 0.2, d + 0.04, x, y0 + h, (d + 0.04) / 2);
  }
  if (st.sill !== false && !bare) k.box(frame, w + 0.34, 0.1, d + 0.14, x, y0 - 0.1, (d + 0.14) / 2);
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
  /** Recessed openings cut into the front face (door bays). Default none: output identical to before. */
  bayOpenings?: BayOpening[];
}

/** A rectangular opening in the front face, recessed by depth. u = offset from the front centre, y0 = 0. */
export interface BayOpening {
  u: number;
  w: number;
  h: number;
  depth: number;
}

/**
 * A box (x centred at x, base at y0, front face at z + d/2) with rectangular notches cut from its front face.
 * Each notch is open at the bottom and recessed by its depth: the pieces are the solid columns beside it,
 * the solid head above it and the back wall of the recess. No face is coplanar with another solid face.
 */
function notchedBox(k: Kit, c: C, w: number, h: number, d: number, x: number, y0: number, z: number, cuts: readonly BayOpening[]): void {
  const left = x - w / 2;
  const right = x + w / 2;
  const front = z + d / 2;
  const piece = (x0: number, x1: number, ya: number, yb: number, za: number, zb: number): void => {
    if (x1 - x0 < 1e-6 || yb - ya < 1e-6 || zb - za < 1e-6) return;
    k.add('body', new THREE.BoxGeometry(x1 - x0, yb - ya, zb - za), c, [(x0 + x1) / 2, (ya + yb) / 2, (za + zb) / 2]);
  };
  let cursor = left;
  for (const cut of [...cuts].sort((a, b) => a.u - b.u)) {
    if (cut.depth <= 0 || cut.depth >= d) throw new Error(`notchedBox: depth ${cut.depth} outside (0, ${d})`);
    const x0 = x + cut.u - cut.w / 2;
    const x1 = x + cut.u + cut.w / 2;
    if (x0 < cursor - 1e-6 || x1 > right + 1e-6) throw new Error('notchedBox: opening outside the face or overlapping');
    piece(cursor, x0, y0, y0 + h, z - d / 2, front);
    const ch = Math.min(cut.h, h);
    piece(x0, x1, y0, y0 + ch, z - d / 2, front - cut.depth);
    if (ch < h) piece(x0, x1, y0 + ch, y0 + h, z - d / 2, front);
    cursor = x1;
  }
  piece(cursor, right, y0, y0 + h, z - d / 2, front);
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
  if (o.bayOpenings?.length) {
    notchedBox(k, o.wall, o.w, H, o.d, o.x, 0, o.z, o.bayOpenings);
    notchedBox(k, o.base, o.w + 0.16, 0.9, o.d + 0.16, o.x, 0, o.z, o.bayOpenings);
  } else {
    k.box(o.wall, o.w, H, o.d, o.x, 0, o.z);
    k.box(o.base, o.w + 0.16, 0.9, o.d + 0.16, o.x, 0, o.z);
  }
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

// ---------- water ----------

/** Footprint of a water basin: outer size along x and z, and the coping width (metres). */
export interface BasinRim {
  w: number;
  d: number;
  coping: number;
}

// Geometry constants of waterBasin (not designer knobs).
const BASIN_STONE = '#cbbfa8';
const BASIN_WALL_T = 0.1;
const BASIN_COPING_H = 0.12;
const BASIN_SINK = 0.02;
const BASIN_WATER_LEVEL = 0.6;
const BASIN_WATER_T = 0.02;
const BASIN_WATER_INSET = 0.02;

/**
 * A recessed water basin in the current frame, origin at the centre of the deck top (y = 0 is the deck top).
 * The coping ring stands BASIN_COPING_H above the deck, the stone pit goes down to -depth and the water
 * surface sits at 0.6 * depth below the deck top. The caller must leave the basin footprint open in the deck.
 * Only body and glass targets are used; pieces stay rigid (wind code 0) even inside withWind().
 */
export function waterBasin(k: Kit, rim: BasinRim, depth: number, colour: C): void {
  const { w, d, coping: c } = rim;
  const ix = w / 2 - c - BASIN_WALL_T; // inner half-size of the pit along x
  const iz = d / 2 - c - BASIN_WALL_T;
  if (!(c > 0) || !(ix > 0) || !(iz > 0) || !(depth >= 0.1)) {
    throw new Error(`waterBasin: bad size w=${w} d=${d} coping=${c} depth=${depth}`);
  }
  const floorY = -depth;
  const waterY = -depth * BASIN_WATER_LEVEL;
  const H = BASIN_COPING_H + BASIN_SINK;
  const floorC = tint(colour, -0.2);
  k.withWind(0, () => 0, () => {
    // Coping ring: outer ring of body boxes, sunk slightly into the deck to avoid a gap.
    k.box(BASIN_STONE, w, H, c, 0, -BASIN_SINK, d / 2 - c / 2);
    k.box(BASIN_STONE, w, H, c, 0, -BASIN_SINK, -(d / 2 - c / 2));
    k.box(BASIN_STONE, c, H, d - 2 * c, w / 2 - c / 2, -BASIN_SINK, 0);
    k.box(BASIN_STONE, c, H, d - 2 * c, -(w / 2 - c / 2), -BASIN_SINK, 0);
    // Pit walls: top at -BASIN_SINK so they never share a face plane with the coping.
    const wallH = depth - BASIN_SINK;
    k.box(BASIN_STONE, 2 * (ix + BASIN_WALL_T), wallH, BASIN_WALL_T, 0, floorY, iz + BASIN_WALL_T / 2);
    k.box(BASIN_STONE, 2 * (ix + BASIN_WALL_T), wallH, BASIN_WALL_T, 0, floorY, -(iz + BASIN_WALL_T / 2));
    k.box(BASIN_STONE, BASIN_WALL_T, wallH, 2 * iz, ix + BASIN_WALL_T / 2, floorY, 0);
    k.box(BASIN_STONE, BASIN_WALL_T, wallH, 2 * iz, -(ix + BASIN_WALL_T / 2), floorY, 0);
    // Pit floor, top exactly at floorY.
    k.box(floorC, 2 * ix, 0.05, 2 * iz, 0, floorY - 0.05, 0);
    // Water: a thin glass slab whose top is the water surface, clearly below the deck top.
    k.glass(false, 2 * (ix - BASIN_WATER_INSET), BASIN_WATER_T, 2 * (iz - BASIN_WATER_INSET), 0, waterY - BASIN_WATER_T, 0, colour);
  });
}

// ---------- props ----------
