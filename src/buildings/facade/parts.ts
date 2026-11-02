// Shared facade parts: wall skin, windows, frames, shutters, railings, balconies, cornices.
// Everything is drawn in the current segment frame (u along the facade, y up, n outward).

import {
  HouseMesh,
  NN,
  NU,
  NY,
  PY,
  col,
  mix,
  scale,
  type Col,
  type P3,
  type Target,
} from './mesh';
import type { Layout, Segment } from './layout';
import { extAt } from './layout';
import type { FrameKind, Look } from './presets';
import { chance, pick, range, type Rng } from './rng';
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

/** Window frame and glazing bars in front of the glass at nGlass. */
export function frameBars(ctx: Ctx, kind: FrameKind, u0: number, u1: number, y0: number, y1: number, nGlass: number, color = ctx.c.frame): void {
  const m = ctx.m;
  const modern = kind === 'modern';
  const t = modern ? 0.045 : 0.075;
  const d0 = nGlass;
  const d1 = nGlass + (modern ? 0.05 : 0.07);
  const w = u1 - u0;
  const h = y1 - y0;
  const cu = (u0 + u1) / 2;
  m.b(color, u0, u0 + t, y0, y1, d0, d1, NN | PY | NY);
  m.b(color, u1 - t, u1, y0, y1, d0, d1, NN | PY | NY);
  m.b(color, u0 + t, u1 - t, y1 - t, y1, d0, d1, NN);
  m.b(color, u0 + t, u1 - t, y0, y0 + t, d0, d1, NN);
  const thin = 0.035;
  switch (kind) {
    case 'french':
      m.b(color, cu - 0.03, cu + 0.03, y0, y1, d0, d1, NN | PY | NY);
      m.b(color, u0 + t, u1 - t, y0 + h * 0.78, y0 + h * 0.78 + 0.06, d0, d1, NN);
      break;
    case 'sash':
      m.b(color, u0 + t, u1 - t, y0 + h * 0.5 - 0.035, y0 + h * 0.5 + 0.035, d0, d1 + 0.02, NN);
      m.b(color, cu - thin / 2, cu + thin / 2, y0, y1, d0, d1 - 0.02, NN | PY | NY);
      m.b(color, u0 + t, u1 - t, y0 + h * 0.25, y0 + h * 0.25 + thin, d0, d1 - 0.02, NN);
      m.b(color, u0 + t, u1 - t, y0 + h * 0.75, y0 + h * 0.75 + thin, d0, d1 - 0.02, NN);
      break;
    case 'casement':
      m.b(color, cu - 0.03, cu + 0.03, y0, y1, d0, d1, NN | PY | NY);
      break;
    case 'cross':
      m.b(color, cu - 0.03, cu + 0.03, y0, y1, d0, d1, NN | PY | NY);
      m.b(color, u0 + t, u1 - t, y0 + h * 0.66, y0 + h * 0.66 + 0.06, d0, d1, NN);
      break;
    case 'modern':
      if (w > 1.7) m.b(color, cu - 0.025, cu + 0.025, y0, y1, d0, d1, NN | PY | NY);
      break;
  }
}

/** Horizontal iron railing along u at depth n: top rail, bottom rail, ornament band and balusters. */
export function railU(ctx: Ctx, u0: number, u1: number, y0: number, h: number, n: number, opts: { spacing?: number; band?: boolean; color?: Col } = {}): void {
  const m = ctx.m;
  const c = opts.color ?? ctx.c.iron;
  // Balusters are closed boxes now; 15% wider spacing keeps the triangle budget.
  const sp = (opts.spacing ?? 0.15) * 1.15;
  m.b(c, u0, u1, y0 + h - 0.05, y0 + h, n - 0.03, n + 0.03);
  // Both rails are as deep as the top rail and the balusters 2 cm slimmer on each side than them, so the
  // balusters stand inside the rails with no face closer than 2 cm to a rail face (and end flush inside them).
  m.b(c, u0, u1, y0 + 0.05, y0 + 0.09, n - 0.03, n + 0.03, PY);
  if (opts.band) m.b(c, u0, u1, y0 + h - 0.24, y0 + h - 0.21, n - 0.03, n + 0.03, PY | NY);
  const count = Math.max(1, Math.round((u1 - u0) / sp));
  for (let i = 0; i <= count; i++) {
    const u = u0 + ((u1 - u0) * i) / count;
    const s = i === 0 || i === count ? 0.025 : 0.01;
    m.b(c, u - s, u + s, y0, y0 + h - 0.05, n - s, n + s, PY | NY | NN);
  }
}

/** Railing running along n (balcony returns) at u. */
export function railN(ctx: Ctx, u: number, n0: number, n1: number, y0: number, h: number, spacing = 0.15, color = ctx.c.iron): void {
  const m = ctx.m;
  spacing *= 1.15;
  m.b(color, u - 0.03, u + 0.03, y0 + h - 0.05, y0 + h, n0, n1);
  m.b(color, u - 0.03, u + 0.03, y0 + 0.05, y0 + 0.09, n0, n1, PY);
  const count = Math.max(1, Math.round((n1 - n0) / spacing));
  for (let i = 1; i < count; i++) {
    const n = n0 + ((n1 - n0) * i) / count;
    m.b(color, u - 0.01, u + 0.01, y0, y0 + h - 0.05, n - 0.01, n + 0.01, PY | NY | NU);
  }
}

/** Glass balustrade along u with a slim steel top rail. */
export function glassRail(ctx: Ctx, u0: number, u1: number, y0: number, h: number, n: number): void {
  const m = ctx.m;
  m.box('glass', ctx.c.railGlass, u0, u1, y0 + 0.04, y0 + h - 0.04, n - 0.015, n + 0.015);
  m.b(scale(ctx.c.iron, 1.6), u0, u1, y0 + h - 0.04, y0 + h, n - 0.03, n + 0.03);
}

/** Console bracket under a balcony slab or cornice (profile in the n-y plane). */
export function consoleBracket(ctx: Ctx, u: number, yTop: number, depth: number, height: number, color = ctx.c.trim, w = 0.18): void {
  ctx.m.prismNY(
    color,
    [
      [-0.02, yTop],
      [depth, yTop],
      [depth, yTop - height * 0.22],
      [0.12, yTop - height],
      [-0.02, yTop - height],
    ],
    u - w / 2,
    u + w / 2,
  );
}

/** Horizontal band along a whole segment, wrapping round facade corners. */
export function band(ctx: Ctx, seg: Segment, y0: number, y1: number, proj: number, color: Col, back = -0.1, inset = 0): void {
  const L = seg.L;
  const a = seg.startTurn === null ? -L / 2 + inset : -L / 2 - extAt(seg.startTurn, proj);
  const b = seg.endTurn === null ? L / 2 - inset : L / 2 + extAt(seg.endTurn, proj);
  ctx.m.b(color, a, b, y0, y1, back, proj, NN);
}

/** Stepped cornice made of layers [height, projection], bottom to top, ending at yTop. */
export function stepped(ctx: Ctx, seg: Segment, yTop: number, layers: readonly (readonly [number, number])[], color: Col): void {
  let total = 0;
  for (const [h] of layers) total += h;
  let y = yTop - total;
  for (const [h, p] of layers) {
    band(ctx, seg, y, y + h, p, color);
    y += h;
  }
}

/** Continuous balcony along a segment: slab, brackets, railing and returns. */
export function continuousBalcony(
  ctx: Ctx,
  seg: Segment,
  y: number,
  depth: number,
  opts: { glass?: boolean; brackets?: number[]; band?: boolean; slabColor?: Col; partyInset?: number },
): void {
  const m = ctx.m;
  const L = seg.L;
  const pi = opts.partyInset ?? 0.25;
  const a = seg.startTurn === null ? -L / 2 + pi : -L / 2 - extAt(seg.startTurn, depth);
  const b = seg.endTurn === null ? L / 2 - pi : L / 2 + extAt(seg.endTurn, depth);
  const slab = opts.slabColor ?? ctx.c.trim;
  const thick = opts.glass ? 0.14 : 0.2;
  m.b(slab, a, b, y - thick, y + 0.02, -0.05, depth, NN);
  if (opts.brackets) for (const u of opts.brackets) consoleBracket(ctx, u, y - thick, depth * 0.8, 0.5);
  const rn = depth - 0.06;
  const ra = seg.startTurn === null ? a + 0.03 : -L / 2 - extAt(seg.startTurn, rn);
  const rb = seg.endTurn === null ? b - 0.03 : L / 2 + extAt(seg.endTurn, rn);
  if (opts.glass) {
    glassRail(ctx, ra, rb, y + 0.02, 1.0, rn);
    if (seg.startTurn === null) m.box('glass', ctx.c.railGlass, a, a + 0.03, y + 0.06, y + 0.98, 0, rn);
    if (seg.endTurn === null) m.box('glass', ctx.c.railGlass, b - 0.03, b, y + 0.06, y + 0.98, 0, rn);
  } else {
    railU(ctx, ra, rb, y + 0.02, 1.0, rn, { band: opts.band ?? true });
    if (seg.startTurn === null) railN(ctx, a + 0.03, 0, rn, y + 0.02, 1.0);
    if (seg.endTurn === null) railN(ctx, b - 0.03, 0, rn, y + 0.02, 1.0);
  }
}

/** Terracotta pot with a green shrub. */
export function pot(ctx: Ctx, u: number, y: number, n: number, s = 1): void {
  const m = ctx.m;
  const r = 0.14 * s;
  m.b(ctx.c.pot, u - r, u + r, y, y + 0.3 * s, n - r, n + r, NY);
  const g = scale(ctx.c.green, 0.85 + ctx.rng() * 0.3);
  m.b(g, u - r * 1.3, u + r * 1.3, y + 0.3 * s, y + 0.62 * s, n - r * 1.3, n + r * 1.3, NY);
  if (chance(ctx.rng, 0.5)) {
    const bloom: Col = pick(ctx.rng, [col('#d9465f'), col('#f2c14e'), col('#e8e1f0'), col('#c84a8a')]);
    m.b(bloom, u - r * 0.8, u + r * 0.8, y + 0.62 * s, y + 0.7 * s, n - r * 0.8, n + r * 0.8, NY);
  }
}

/** Point shorthand. */
export function p3(u: number, y: number, n: number): P3 {
  return [u, y, n];
}
