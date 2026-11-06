// Facade context types, bays, skins and panes (split from parts.ts).

import { HouseMesh, NN, col, mix, scale, type Col, type Target } from './mesh';
import type { Layout, Segment } from './layout';
import type { Look } from './presets';
import { pick, range, type Rng } from './rng';
import { buildings } from '../../config/tuning';
import { CURTAIN_COLORS } from '../palette';
import { SURFACE } from '../surface';

export interface Colors {
  wall: Col;
  party: Col;
  trim: Col;
  cornice: Col;
  base: Col;
  frame: Col;
  shutter: Col | null;
  roof: Col;
  roofTop: Col;
  iron: Col;
  door: Col;
  shop: Col;
  awning: Col;
  white: Col;
  deck: Col;
  chimney: Col;
  pot: Col;
  railGlass: Col;
  glassTop: Col;
  glassBottom: Col;
  green: Col;
  accent: Col;
  sign: Col;
  /** Rear elevation wall: the wall colour dulled and 6% darker. */
  rear: Col;
}

/** Top of a chimney pot in house-local coordinates (x, z from the house centre, y height). */
export interface HouseChimney {
  x: number;
  y: number;
  z: number;
}

export interface Ctx extends Layout {
  m: HouseMesh;
  /** Geometry variation stream. */
  rng: Rng;
  /** Glass tone and night-light stream (kept separate so lights never move geometry). */
  rngGlass: Rng;
  look: Look;
  c: Colors;
  hasShutters: boolean;
  /** Wall surface id (SURFACE.*) of the preset's walls. */
  wallSurface: number;
  /** Roof surface id of tiled or zinc roofs; PLAIN for flat roofs. */
  roofSurface: number;
  /** Stream for the rear elevation (kept apart so front geometry never shifts). */
  rngRear: Rng;
  /** Stream for sign choice. */
  rngSign: Rng;
  /** Stream for the Round 6 extras (rooftop features): kept apart so older streams never shift. */
  rngDetail: Rng;
  /** Corner or avenue lot: shops may carry a blade sign. */
  avenue: boolean;
  /** Back faces a merged block's shared courtyard: richer rear elevation (see HouseParams.sharedCourtyard). */
  sharedCourtyard: boolean;
  /**
   * Corner lot whose back touches a neighbour: the rear wall is set back by this distance (m) and the rear
   * keeps every detail inside the lot (no extension, balcony, step, AC, line or flue). 0 = ordinary rear.
   */
  rearSetback: number;
  /** Collected chimney pot tops. */
  chimneyTops: HouseChimney[];
}

/** Window columns for a segment: centres and bay width. Corner piers are 0.3 m wider. */
export function bayColumns(ctx: Ctx, L: number, bay = ctx.spec.bay): { centres: number[]; bw: number } {
  const extra = L < 4 ? 0.15 : 0.3;
  const usable = Math.max(0.5, L - 2 * extra);
  const n = L < 4 ? 1 : Math.max(2, Math.round(usable / bay));
  const bw = usable / n;
  const centres: number[] = [];
  for (let i = 0; i < n; i++) centres.push(-usable / 2 + (i + 0.5) * bw);
  return { centres, bw };
}

/** Sets the mesh frame to a segment. */
export function useSegment(ctx: Ctx, seg: Segment): void {
  ctx.m.frame = seg.frame;
}

/**
 * Wall skin piece from the reveal plane (-r) to the facade plane (0), with optional horizontal
 * coursing (rustication, timber boards, board-marked concrete) and a stone plinth near the ground.
 */
export function skin(
  ctx: Ctx,
  u0: number,
  u1: number,
  y0: number,
  y1: number,
  opts: { color?: Col; courses?: { h: number; gap: number; proj: number } | null; plinth?: boolean } = {},
): void {
  if (u1 - u0 < 1e-4 || y1 - y0 < 1e-4) return;
  const m = ctx.m;
  m.withSurface(opts.color ? 0 : ctx.wallSurface, () => skinInner(ctx, u0, u1, y0, y1, opts));
}

function skinInner(
  ctx: Ctx,
  u0: number,
  u1: number,
  y0: number,
  y1: number,
  opts: { color?: Col; courses?: { h: number; gap: number; proj: number } | null; plinth?: boolean },
): void {
  const m = ctx.m;
  const r = ctx.look.r;
  const c = opts.color ?? ctx.c.wall;
  const courses = opts.courses === undefined ? ctx.look.texture : opts.courses;
  if (courses) {
    // Recessed joint colour behind raised courses.
    m.b(scale(c, 0.78), u0, u1, y0, y1, -r, 0);
    const k0 = Math.floor(y0 / courses.h);
    for (let k = k0; k * courses.h < y1; k++) {
      const a = Math.max(y0, k * courses.h + courses.gap / 2);
      const b = Math.min(y1, (k + 1) * courses.h - courses.gap / 2);
      if (b - a < 0.01) continue;
      // Slight per-course tone change reads as stone blocks or boards.
      const tone = 0.97 + 0.06 * (((k * 7919) % 13) / 13);
      // Closed except the back, which sits on the joint backing.
      m.b(scale(c, tone), u0, u1, a, b, 0, courses.proj, NN);
    }
  } else {
    m.b(c, u0, u1, y0, y1, -r, 0);
  }
  if (opts.plinth !== false && y0 < 0.5 && !courses) {
    m.withSurface(SURFACE.STONE, () => m.b(ctx.c.base, u0, u1, y0, Math.min(0.5, y1), 0, 0.035, NN));
  }
}

/** Glass pane with a sky-reflection gradient, optional curtains or blind. */
export function pane(
  ctx: Ctx,
  u0: number,
  u1: number,
  y0: number,
  y1: number,
  n: number,
  opts: { lit?: boolean; litChance?: number; dressing?: boolean } = {},
): boolean {
  const g = ctx.rngGlass;
  const lit = opts.lit ?? g() < (opts.litChance ?? buildings.litWindowShare);
  const t: Target = lit ? 'glassLit' : 'glass';
  const m = ctx.m;
  const jitter = 0.85 + g() * 0.3;
  const bot = scale(ctx.c.glassBottom, jitter);
  const top = scale(ctx.c.glassTop, jitter);
  const quad = (a: number, b: number, c0: number, c1: number, cb: Col, ct: Col): void => {
    m.quad(t, [a, c0, n], [b, c0, n], [b, c1, n], [a, c1, n], [cb, cb, ct, ct]);
  };
  const roll = opts.dressing === false ? 1 : g();
  const w = u1 - u0;
  // One schedule seed per window, so curtains and glass switch on together.
  m.paneGroup(() => {
  if (roll < 0.3 && w > 0.5) {
    // Sheer curtains drawn to the sides.
    const cc = scale(col(pick(g, CURTAIN_COLORS)), 0.55);
    const cw = w * range(g, 0.18, 0.3);
    quad(u0, u0 + cw, y0, y1, scale(cc, 0.85), cc);
    quad(u0 + cw, u1 - cw, y0, y1, bot, top);
    quad(u1 - cw, u1, y0, y1, scale(cc, 0.85), cc);
  } else if (roll < 0.45) {
    // Roller blind pulled half down.
    const cc = scale(col(pick(g, CURTAIN_COLORS)), 0.6);
    const yb = y1 - (y1 - y0) * range(g, 0.25, 0.6);
    quad(u0, u1, y0, yb, bot, mix(bot, top, 0.5));
    quad(u0, u1, yb, y1, cc, cc);
  } else {
    quad(u0, u1, y0, y1, bot, top);
  }
  });
  return lit;
}
