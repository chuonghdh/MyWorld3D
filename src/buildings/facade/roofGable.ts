// Gable roofs: stepped, bell and gable windows (split from roof.ts).

import { HOUSE_FRAME, NN, NY, col, scale, type Frame, type P3 } from './mesh';
import { buildings } from '../../config/tuning';
import { gableRise, type Segment } from './layout';
import { frameBars, pane, type Ctx } from './parts';
import { chance, range } from './rng';
import { SURFACE } from '../surface';
import { SurfaceFn } from './roofCore';

export function gableRoof(ctx: Ctx, stepped: boolean): SurfaceFn {
  const { m, c, W, D, wallTop, facades: f, rng } = ctx;
  const toStreet = stepped || ctx.gableToStreet;
  const frame: Frame = toStreet ? HOUSE_FRAME : { ox: 0, oz: 0, ux: 0, uz: -1, nx: 1, nz: 0 };
  const S = toStreet ? W : D;
  const Lr = toStreet ? D : W;
  // Facade flags of the eave sides (u = -S/2, +S/2) and the gable ends (n = -Lr/2, +Lr/2).
  const sideFac = toStreet ? [f.left, f.right] : [f.front, f.back];
  const endFac = toStreet ? [f.back, f.front] : [f.left, f.right];
  const endSide = toStreet ? (['back', 'front'] as const) : (['left', 'right'] as const);
  const h = gableRise(ctx.spec, W, D, toStreet, stepped);
  const tanP = h / (S / 2);
  const ang = Math.atan(tanP);
  const sinP = Math.sin(ang);
  const cosP = Math.cos(ang);
  const thick = 0.16;
  const stepEnd = [stepped && endFac[0], stepped && endFac[1]];
  const ovN = endFac.map((e, i) => (e && !stepEnd[i] ? 0.35 : 0));
  // Slab ends: past the wall on street gables (overhang), tucked 3 cm inside on party gables so the
  // slab never shares the lot-boundary plane with the gable wall, the chimneys or a neighbour.
  const n0 = -Lr / 2 - ovN[0] + (ovN[0] > 0 ? 0 : 0.03);
  const n1 = Lr / 2 + ovN[1] - (ovN[1] > 0 ? 0 : 0.03);
  const roofCol = c.roof;
  m.frame = frame;

  for (const s of [-1, 1] as const) {
    const ov = sideFac[s < 0 ? 0 : 1] ? 0.45 : 0;
    const delta = ov > 0 ? -ov : thick * sinP + 0.003;
    const eu = s * (S / 2 - delta);
    const ey = wallTop + delta * tanP;
    const ru = -s * 0.02;
    const ry = wallTop + h + 0.02 * tanP;
    // The two slabs overlap at the ridge: the right one is 2.5 cm shorter at each end.
    const sn0 = n0 + (s > 0 ? 0.025 : 0);
    const sn1 = n1 - (s > 0 ? 0.025 : 0);
    const mid: P3 = [(eu + ru) / 2 + s * sinP * thick * 0.5, (ey + ry) / 2 + cosP * thick * 0.5, (sn0 + sn1) / 2];
    const half = Math.hypot(ru - eu, ry - ey) / 2;
    m.surface = ctx.roofSurface;
    m.obox('body', roofCol, mid, [0, 0, (sn1 - sn0) / 2], [((ru - eu) / (2 * half)) * half, ((ry - ey) / (2 * half)) * half, 0], [s * sinP * thick * 0.5, cosP * thick * 0.5, 0]);
    m.surface = SURFACE.PLAIN;
    if (ov > 0) {
      // Gutter along the eave.
      m.b(col('#5d6166'), eu + s * 0.0 - 0.07, eu + s * 0.0 + 0.07, ey - 0.12, ey + 0.02, n0 - 0.03, n1 + 0.03, 0);
    } else {
      // Close the slit between the wall head and the underside of the slab along party eaves.
      // Sunk 5 cm into the wall head and set 2 cm behind the wall face, so no face shares a plane with the wall.
      m.b(c.party, s * (S / 2 - 0.06), s * (S / 2 - delta + 0.01), wallTop - 0.05, ey + 0.03, n0 + 0.03, n1 - 0.03, 0);
    }
  }
  // Ridge cap.
  m.b(scale(roofCol, 0.75), -0.14, 0.14, wallTop + h - 0.04, wallTop + h + thick + 0.06, n0 + 0.06, n1 - 0.06, NY);

  // Gable ends.
  for (const e of [0, 1] as const) {
    const sgn = e === 0 ? -1 : 1;
    const nEdge = sgn * Lr / 2;
    const fac = endFac[e];
    // Behind a stepped or bell gable the wall base sinks 2 cm into the wall head and its face stands 10 cm
    // behind the core front wall (no shared plane with the steps' feet or the wall below).
    const base = wallTop - (stepEnd[e] ? 0.02 : 0);
    const tri: [number, number][] = [
      [-S / 2, base],
      [S / 2, base],
      [0, wallTop + h],
    ];
    const colr = fac ? c.wall : endSide[e] === 'back' ? c.rear : c.party;
    m.surface = ctx.wallSurface;
    // Closed gable wall (its back face stays open, it faces the roof space). Behind a stepped or bell
    // gable it is recessed, so the roof triangle is closed wherever the steps leave gaps.
    const triRing = (n: number): P3[] => tri.map(([u, y]) => [u, y, n] as P3);
    const rec = stepEnd[e] ? ctx.look.r + 0.1 : 0;
    if (sgn > 0) m.loft('body', colr, triRing(nEdge - rec - 0.3), triRing(nEdge - rec), null, colr);
    else m.loft('body', colr, triRing(nEdge + rec), triRing(nEdge + rec + 0.3), colr, null);
    m.surface = SURFACE.PLAIN;
    if (fac && !stepEnd[e]) {
      // Bargeboards along the verges.
      const nb = nEdge + sgn * (ovN[e] - 0.02);
      const trim = ctx.spec.kind === 'nordic' ? c.trim : scale(roofCol, 0.8);
      for (const s of [-1, 1]) {
        const ov = sideFac[s < 0 ? 0 : 1] ? 0.45 : -0.12;
        // The two boards overlap at the apex: the right one sits 2.5 cm further out so their sides never share a plane.
        const nbs = nb + (s > 0 ? sgn * 0.025 : 0);
        // Hung 5 cm below the slab line so its underside is not coplanar with the slab's.
        m.bar(trim, [s * (S / 2 + ov), wallTop - ov * tanP - 0.03, nbs], [0, wallTop + h + 0.07, nbs], 0.14);
      }
    }
  }
  // Roof windows on slopes whose eave is not a street facade (rear slope seen from the courtyard).
  for (const s of [-1, 1] as const) {
    if (sideFac[s < 0 ? 0 : 1] || Lr < 4 || S < 5 || !chance(ctx.rngRear, 0.6)) continue;
    const nC = range(ctx.rngRear, -Lr / 4, Lr / 4);
    const t0 = S * 0.12;
    const t1 = t0 + Math.min(1.1, S * 0.2);
    const yAt = (t: number): number => wallTop + t * tanP + thick / cosP + 0.04;
    const hw = 0.45;
    const P = (t: number, n: number): P3 => [s * (S / 2 - t), yAt(t), n];
    const grey = col('#c9c9c4');
    m.poly('glass', [P(t0, nC - hw), P(t0, nC + hw), P(t1, nC + hw), P(t1, nC - hw)], c.glassTop, [s * (S / 2 - t0), wallTop, nC]);
    for (const [ta, tb, na, nb] of [
      [t0, t1, nC - hw, nC - hw],
      [t0, t1, nC + hw, nC + hw],
      [t0, t0, nC - hw, nC + hw],
      [t1, t1, nC - hw, nC + hw],
    ] as const) m.bar(grey, P(ta, na), P(tb, nb), 0.07);
  }
  m.frame = HOUSE_FRAME;

  // Rear gable window.
  if (toStreet && !endFac[0] && h > 2.2) {
    const back = ctx.segments.find((sg) => sg.side === 'back');
    if (back) {
      m.frame = back.frame;
      const hh = Math.min(1.0, h * 0.3);
      const y0 = wallTop + 0.45;
      const w = 0.7;
      pane(ctx, -w / 2, w / 2, y0, y0 + hh, 0.02);
      frameBars(ctx, ctx.modern ? 'modern' : 'casement', -w / 2, w / 2, y0, y0 + hh, 0.02, ctx.modern ? c.frame : scale(c.white, 0.9));
      m.b(scale(c.trim, 0.85), -w / 2 - 0.05, w / 2 + 0.05, y0 - 0.06, y0, 0, 0.1, NN);
      m.frame = HOUSE_FRAME;
    }
  }

  // Details on facade gable ends, drawn in the matching segment frame.
  for (const e of [0, 1] as const) {
    if (!endFac[e]) continue;
    const seg = ctx.segments.find((sg) => sg.side === endSide[e]);
    if (!seg) continue;
    m.frame = seg.frame;
    if (stepEnd[e]) {
      if (ctx.spec.kind === 'canal' && !ctx.modern && chance(rng, 0.45)) bellGable(ctx, seg, h);
      else steppedGable(ctx, seg, h);
    }
    gableWindows(ctx, seg, h);
  }
  m.frame = HOUSE_FRAME;

  return (x, z) => {
    const across = toStreet ? Math.abs(x) : Math.abs(z);
    return Math.max(0, h * (1 - across / (S / 2)));
  };
}

function steppedGable(ctx: Ctx, seg: Segment, h: number): void {
  const { m, c, wallTop } = ctx;
  const L = seg.L;
  const steps = 5;
  const H = h + 0.6;
  const sh = H / steps;
  for (let j = 0; j < steps; j++) {
    const hw = Math.max(0.45, (L / 2) * (1 - j / steps));
    const y0 = wallTop + j * sh;
    m.withSurface(ctx.wallSurface, () => m.b(c.wall, -hw, hw, y0, y0 + sh, -0.4, 0, NN | NY));
    const cw = Math.min(L / 2, hw + 0.05);
    m.b(c.trim, -cw, cw, y0 + sh, y0 + sh + 0.09, -0.45, 0.05, NY);
  }
  m.b(c.trim, -0.1, 0.1, wallTop + H + 0.09, wallTop + H + 0.45, -0.25, -0.05, NY);
}

function bellGable(ctx: Ctx, seg: Segment, h: number): void {
  const { m, c, wallTop } = ctx;
  const L = seg.L;
  const H = h + 0.6;
  const neck = Math.min(0.9, L * 0.16);
  const K = 9;
  const hw = (t: number): number => (t >= 0.62 ? neck : neck + (L / 2 - neck) * Math.pow(1 - t / 0.62, 1.7));
  for (let k = 0; k < K; k++) {
    const t0 = k / K;
    const t1 = (k + 1) / K;
    const a = hw(t0);
    const b = hw(t1);
    m.withSurface(ctx.wallSurface, () => m.prismUY(c.wall, [[-a, wallTop + t0 * H], [a, wallTop + t0 * H], [b, wallTop + t1 * H], [-b, wallTop + t1 * H]], -0.4, 0, true));
  }
  // Scrolls at the shoulders and a segmental cap.
  const ys = wallTop + 0.62 * H;
  for (const s of [-1, 1]) m.b(c.trim, s > 0 ? neck : -neck - 0.35, s > 0 ? neck + 0.35 : -neck, ys - 0.25, ys + 0.05, -0.35, 0.04, NY);
  const pts: [number, number][] = [];
  for (let k = 0; k <= 6; k++) {
    const t = Math.PI * (k / 6);
    pts.push([-Math.cos(t) * (neck + 0.12), wallTop + H + Math.sin(t) * 0.35]);
  }
  m.prismUY(c.trim, pts, -0.42, 0.06, true);
}

/** Attic windows (and the canal hoist beam) in a street-facing gable. */
function gableWindows(ctx: Ctx, seg: Segment, h: number): void {
  const { m, c, wallTop, look } = ctx;
  const kind = ctx.spec.kind;
  if (kind === 'nordic' && ctx.modern) {
    // Big glazed gable.
    const inset = 0.45;
    const yb = wallTop + 0.25;
    const yt = wallTop + h - inset * 1.4;
    const half = (seg.L / 2 - inset) * (1 - 0.25 / h);
    if (yt - yb > 0.8) {
      const lit = ctx.rngGlass() < buildings.litWindowShareRoof;
      m.prismUY(c.glassTop, [[-half, yb], [half, yb], [0, yt]], 0.0, 0.04, false, lit ? 'glassLit' : 'glass');
      m.b(c.frame, -half, half, yb - 0.06, yb + 0.04, 0, 0.08, NN);
      for (const t of [-0.5, 0, 0.5]) m.b(c.frame, t * half - 0.03, t * half + 0.03, yb, yb + (yt - yb) * (1 - Math.abs(t)), 0, 0.08, NN);
    }
    return;
  }
  if (h < 1.8) return;
  const wins: [number, number, number, number][] = [];
  const ww = Math.min(0.85, seg.L * 0.14);
  const wh = Math.min(1.3, h * 0.35);
  const y0 = wallTop + 0.5;
  if (seg.L > 5 && h > 3) {
    wins.push([-seg.L * 0.17, y0, ww, wh], [seg.L * 0.17, y0, ww, wh]);
    if (h > 4.2) wins.push([0, y0 + wh + 0.7, ww * 0.85, wh * 0.8]);
  } else wins.push([0, y0, ww, wh]);
  for (const [cu, wy, w, wh2] of wins) {
    const a = cu - w / 2;
    const b = cu + w / 2;
    pane(ctx, a, b, wy, wy + wh2, 0.03);
    frameBars(ctx, look.frame, a, b, wy, wy + wh2, 0.03);
    const t = 0.1;
    const fc = ctx.modern ? c.frame : c.trim;
    m.b(fc, a - t, a, wy - t, wy + wh2 + t, 0, 0.08, NN);
    m.b(fc, b, b + t, wy - t, wy + wh2 + t, 0, 0.08, NN);
    m.b(fc, a, b, wy + wh2, wy + wh2 + t, 0, 0.08, NN);
    m.b(fc, a - 0.05, b + 0.05, wy - t, wy, 0, 0.12, NN);
  }
  if (kind === 'canal') {
    const yb = wallTop + h * 0.82;
    const wood = col('#3a2c22');
    m.b(wood, -0.08, 0.08, yb, yb + 0.16, 0, 0.95, NN);
    m.bar(col('#2a2a2a'), [0, yb, 0.88], [0, yb - 0.45, 0.88], 0.03);
  }
}

// ---------------------------------------------------------------------------------------------
// Hip and low tiled roofs
