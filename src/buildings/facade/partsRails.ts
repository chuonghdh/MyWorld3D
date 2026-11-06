// Frame bars, rails, brackets, bands, balconies and pots (split from parts.ts).

import { NN, NU, NY, PY, col, scale, type Col, type P3 } from './mesh';
import type { Segment } from './layout';
import { extAt } from './layout';
import type { FrameKind } from './presets';
import { chance, pick } from './rng';
import { Ctx } from './partsCore';

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
