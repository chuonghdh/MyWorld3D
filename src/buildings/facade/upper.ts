// Upper floors of a street facade: piers and spandrels around recessed windows, plus
// per-style details (frames, sills, surrounds, pediments, shutters, balconies, string courses).
// Glass towers and Bauhaus ribbons have their own builders.

import { NN, NU, NY, PU, PY, col, scale } from './mesh';
import { extAt, type Segment } from './layout';
import {
  band,
  bayColumns,
  consoleBracket,
  continuousBalcony,
  frameBars,
  glassRail,
  pane,
  pot,
  railN,
  railU,
  skin,
  type Ctx,
} from './parts';
import { chance, pick } from './rng';

interface UnitOpts {
  floor: number;
  col: number;
  balconyFloor: boolean;
  smallBalcony: boolean;
  leftRoom: number;
  rightRoom: number;
  /** Ground-floor window: no guard rail or juliet balcony. */
  ground?: boolean;
}

/** Window contents for an opening in the skin: glass, frame, sill, surround, hood, shutters, guard. */
export function windowUnit(ctx: Ctx, u0: number, u1: number, y0: number, y1: number, o: UnitOpts): void {
  const { m, look, c, rng } = ctx;
  const r = look.r;
  const nG = -r + 0.03;
  const w = u1 - u0;
  const cu = (u0 + u1) / 2;
  const modern = ctx.modern;

  const closed = ctx.hasShutters && chance(rng, 0.12);
  const sh = c.shutter ?? c.frame;
  if (closed) {
    const half = w / 2;
    for (const s of [0, 1]) {
      const a = u0 + s * half + 0.01;
      const b = a + half - 0.02;
      m.b(sh, a, b, y0, y1, -r + 0.04, -r + 0.1, NN);
      for (let k = 1; k < 4; k++) {
        const yy = y0 + ((y1 - y0) * k) / 4;
        m.b(scale(sh, 0.7), a + 0.04, b - 0.04, yy - 0.02, yy + 0.02, -r + 0.1, -r + 0.12, NN | NY | PU | NU);
      }
    }
  } else {
    pane(ctx, u0, u1, y0, y1, nG);
    frameBars(ctx, look.frame, u0, u1, y0, y1, nG);
  }

  // Sill.
  if (!o.balconyFloor && !o.smallBalcony) {
    if (modern) m.b(scale(c.frame, 1.4), u0 - 0.03, u1 + 0.03, y0 - 0.04, y0 + 0.01, -r, 0.05, NN);
    else m.b(c.trim, u0 - 0.09, u1 + 0.09, y0 - 0.08, y0 + 0.02, -r, 0.09, NN);
  }

  // Moulded surround.
  const sw = 0.13;
  if (look.surround) {
    m.b(c.trim, u0 - sw, u0, y0, y1 + sw, 0, 0.04, NN | NY);
    m.b(c.trim, u1, u1 + sw, y0, y1 + sw, 0, 0.04, NN | NY);
    m.b(c.trim, u0, u1, y1, y1 + sw, 0, 0.04, NN | NY);
  }
  const top = y1 + (look.surround ? sw : 0);

  // Hood, lintel or pediment.
  switch (look.hood) {
    case 'flat':
      m.b(c.cornice, u0 - 0.2, u1 + 0.2, top, top + 0.1, 0, 0.13, NN);
      break;
    case 'lintel':
      m.b(c.trim, u0 - 0.12, u1 + 0.12, y1, y1 + 0.26, 0, 0.05, NN);
      m.b(c.trim, u0 - 0.17, u1 + 0.17, y1 + 0.26, y1 + 0.33, 0, 0.1, NN);
      break;
    case 'pediment':
      if (o.floor === 2) {
        m.b(c.cornice, u0 - 0.22, u1 + 0.22, top, top + 0.1, 0, 0.15, NN);
        if (o.col % 2 === 0) {
          m.prismUY(c.cornice, [[u0 - 0.24, top + 0.1], [u1 + 0.24, top + 0.1], [cu, top + 0.48]], 0, 0.13);
        } else {
          const pts: [number, number][] = [];
          for (let k = 0; k <= 6; k++) {
            const a = Math.PI * (k / 6);
            pts.push([cu - Math.cos(a) * (w / 2 + 0.24), top + 0.1 + Math.sin(a) * 0.3]);
          }
          m.prismUY(c.cornice, pts, 0, 0.13);
        }
      } else if (o.floor === 1) {
        m.b(c.cornice, u0 - 0.18, u1 + 0.18, top, top + 0.1, 0, 0.12, NN);
        m.b(c.trim, cu - 0.11, cu + 0.11, y1 - 0.06, top + 0.08, 0, 0.08, NN);
      } else {
        m.b(c.cornice, u0 - 0.16, u1 + 0.16, top, top + 0.08, 0, 0.1, NN);
      }
      break;
    case 'none':
      break;
  }
  if (look.keystone && look.hood !== 'pediment') m.b(c.trim, cu - 0.1, cu + 0.1, y1 - 0.05, y1 + 0.28, 0, 0.07, NN);

  // Shutters: open against the wall when there is room, else folded into the reveal.
  if (ctx.hasShutters && !closed) {
    const lw = w / 2;
    if (o.leftRoom >= lw + 0.1 && o.rightRoom >= lw + 0.1) {
      for (const [a, b] of [
        [u0 - 0.05 - lw, u0 - 0.05],
        [u1 + 0.05, u1 + 0.05 + lw],
      ] as const) {
        m.b(sh, a, b, y0, y1, 0, 0.05, NN);
        const slats = Math.max(3, Math.round((y1 - y0) / 0.5));
        for (let k = 1; k < slats; k++) {
          const yy = y0 + ((y1 - y0) * k) / slats;
          m.b(scale(sh, 0.72), a + 0.05, b - 0.05, yy - 0.018, yy + 0.018, 0.05, 0.065, NN | NY | PU | NU);
        }
      }
    } else {
      m.b(sh, u0, u0 + 0.08, y0, y1, -r + 0.11, -0.02, NN);
      m.b(sh, u1 - 0.08, u1, y0, y1, -r + 0.11, -0.02, NN);
    }
  }

  // Guard rails on French windows that have no balcony.
  if (!o.balconyFloor && !o.smallBalcony && !closed && !o.ground) {
    if (look.balconies === 'haussmann') railU(ctx, u0 + 0.02, u1 - 0.02, y0, 0.85, -0.05, { spacing: 0.13, band: true });
    else if (look.balconies === 'haussmann-glass') glassRail(ctx, u0 + 0.02, u1 - 0.02, y0, 0.9, -0.05);
    else if (look.balconies === 'juliet-glass' && o.floor > 0) glassRail(ctx, u0 - 0.05, u1 + 0.05, y0, 0.95, 0.05);
    else if (look.balconies === 'shophouse' && look.win.sill < 0.6) railU(ctx, u0 + 0.02, u1 - 0.02, y0, 0.8, -0.05, { spacing: 0.14 });
  }

  // Window boxes with flowers.
  if (look.flowerBoxes && !o.balconyFloor && !o.smallBalcony && !closed && chance(rng, 0.3)) {
    m.b(scale(c.pot, 0.9), u0 + 0.02, u1 - 0.02, y0 + 0.02, y0 + 0.2, 0.02, 0.24, NY);
    const bloom = pick(rng, [col('#d9465f'), col('#f2c14e'), col('#c84a8a'), col('#e8e1f0')]);
    m.b(c.green, u0 + 0.04, u1 - 0.04, y0 + 0.2, y0 + 0.33, 0.0, 0.27, NY);
    for (let k = 0; k < 3; k++) {
      const uu = u0 + 0.15 + ((w - 0.3) * k) / 2;
      m.b(bloom, uu - 0.07, uu + 0.07, y0 + 0.3, y0 + 0.38, 0.06, 0.2, NY);
    }
  }
}

/** Haussmann balcony floors: the 2nd and the top floor. */
function haussmannBalconyFloors(floors: number): Set<number> {
  if (floors >= 4) return new Set([2, floors - 1]);
  if (floors === 3) return new Set([2]);
  return new Set([1]);
}

/** Pier-and-spandrel upper floors (Haussmann, canal, Mediterranean, brownstone, nordic, shophouse, brutalist). */
export function upperPierFacade(ctx: Ctx, seg: Segment): void {
  const { m, look, c, rng } = ctx;
  const L = seg.L;
  const { centres, bw } = bayColumns(ctx, L);
  const w = Math.max(0.5, Math.min(look.win.w, bw - 0.55));
  const kind = ctx.spec.kind;
  const balFloors =
    look.balconies === 'haussmann' || look.balconies === 'haussmann-glass' ? haussmannBalconyFloors(ctx.floors) : new Set<number>();
  const shopBalcony = look.balconies === 'shophouse';

  // Full-height piers between window columns.
  const cuts: number[] = [-L / 2];
  for (const cx of centres) cuts.push(cx - w / 2, cx + w / 2);
  cuts.push(L / 2);
  for (let k = 0; k < cuts.length; k += 2) skin(ctx, cuts[k], cuts[k + 1], ctx.groundH, ctx.wallTop);

  for (let f = 1; f < ctx.floors; f++) {
    const y0 = ctx.floorY[f];
    const y1 = ctx.floorTop[f];
    const isTop = f === ctx.floors - 1;
    const balc = balFloors.has(f) || (shopBalcony && f === 1);
    const topMargin = isTop ? (look.cornice === 'coping' ? 0.4 : look.cornice === 'bracketed' ? 0.5 : 0.72) : 0.42;
    centres.forEach((cx, i) => {
      const u0 = cx - w / 2;
      const u1 = cx + w / 2;
      const small = look.balconies === 'med' && chance(rng, 0.4);
      const sill = balc || small ? 0.05 : look.win.sill;
      const h = Math.max(0.6, Math.min(look.win.h, y1 - y0 - sill - topMargin));
      const oy0 = y0 + sill;
      const oy1 = oy0 + h;
      skin(ctx, u0, u1, y0, oy0);
      skin(ctx, u0, u1, oy1, y1);
      const leftRoom = i === 0 ? u0 + L / 2 : (u0 - (centres[i - 1] + w / 2)) / 2;
      const rightRoom = i === centres.length - 1 ? L / 2 - u1 : ((centres[i + 1] - w / 2) - u1) / 2;
      windowUnit(ctx, u0, u1, oy0, oy1, { floor: f, col: i, balconyFloor: balc, smallBalcony: small, leftRoom, rightRoom });
      if (small) {
        const a = u0 - 0.25;
        const b = u1 + 0.25;
        m.b(c.trim, a, b, y0 - 0.12, y0 + 0.03, -0.05, 0.6, NN);
        consoleBracket(ctx, a + 0.15, y0 - 0.12, 0.45, 0.32, c.trim, 0.12);
        consoleBracket(ctx, b - 0.15, y0 - 0.12, 0.45, 0.32, c.trim, 0.12);
        railU(ctx, a + 0.02, b - 0.02, y0 + 0.03, 0.95, 0.55, { spacing: 0.14 });
        railN(ctx, a + 0.02, 0, 0.55, y0 + 0.03, 0.95);
        railN(ctx, b - 0.02, 0, 0.55, y0 + 0.03, 0.95);
        if (chance(rng, 0.7)) pot(ctx, a + 0.2, y0 + 0.03, 0.32);
        if (chance(rng, 0.5)) pot(ctx, b - 0.2, y0 + 0.03, 0.32, 0.8);
      }
    });

    if (look.stringCourse && !balc) band(ctx, seg, y0 - 0.1, y0 + 0.06, 0.1, c.trim);
    if (balFloors.has(f)) {
      const glass = look.balconies === 'haussmann-glass';
      const brackets: number[] = [];
      if (!glass) {
        brackets.push(-L / 2 + 0.45, L / 2 - 0.45);
        for (let i = 0; i < centres.length - 1; i++) brackets.push((centres[i] + centres[i + 1]) / 2);
      }
      continuousBalcony(ctx, seg, y0, glass ? 0.95 : 0.78, { glass, brackets: glass ? undefined : brackets, slabColor: glass ? c.white : c.trim });
    } else if (shopBalcony && f === 1) {
      continuousBalcony(ctx, seg, y0, 0.9, { band: false, slabColor: c.trim, partyInset: 0.12 });
      const n = Math.max(1, Math.floor(L / 2.2));
      for (let k = 0; k < n; k++) if (chance(rng, 0.75)) pot(ctx, -L / 2 + 0.6 + ((L - 1.2) * (k + 0.5)) / n, y0 + 0.02, 0.62);
    }
  }

  // Per-style extras.
  if (look.cornerBoards) {
    const p = (look.texture?.proj ?? 0) + 0.03;
    m.b(c.trim, -L / 2, -L / 2 + 0.16, 0, ctx.wallTop, 0, p, NN);
    m.b(c.trim, L / 2 - 0.16, L / 2, 0, ctx.wallTop, 0, p, NN);
  }
  if (look.pilasters) {
    for (const [a, b] of [
      [-L / 2, -L / 2 + 0.32],
      [L / 2 - 0.32, L / 2],
    ] as const) {
      m.b(c.trim, a, b, ctx.groundH, ctx.wallTop - 0.3, 0, 0.07, NN);
      m.b(c.cornice, a - (a < 0 ? 0 : 0.04), b + (b > 0 ? 0 : 0.04), ctx.wallTop - 0.42, ctx.wallTop - 0.3, 0, 0.12, NN);
    }
  }
  if (kind === 'brutalist' && !ctx.modern) {
    // Raw concrete grid: projecting fins and heavy floor slabs.
    const fins: number[] = [];
    for (let i = 0; i < centres.length - 1; i++) fins.push((centres[i] + centres[i + 1]) / 2);
    for (const u of fins) m.withSurface(ctx.wallSurface, () => m.b(scale(c.wall, 0.95), u - 0.16, u + 0.16, ctx.groundH, ctx.wallTop, 0, 0.32, NN));
    for (let f = 1; f < ctx.floors; f++) m.withSurface(ctx.wallSurface, () => band(ctx, seg, ctx.floorY[f] - 0.28, ctx.floorY[f] + 0.22, 0.42, scale(c.wall, 1.04), -0.1));
  } else if (kind === 'brutalist') {
    // Precast panels: thin joints on a regular grid.
    const j = scale(c.wall, 0.7);
    for (let i = 0; i <= centres.length; i++) {
      const u = i === 0 ? -L / 2 + 0.3 : i === centres.length ? L / 2 - 0.3 : (centres[i - 1] + centres[i]) / 2;
      m.b(j, u - 0.02, u + 0.02, ctx.groundH, ctx.wallTop, 0, 0.008, NN | PY | NY);
    }
    for (let f = 1; f < ctx.floors; f++) band(ctx, seg, ctx.floorY[f] - 0.02, ctx.floorY[f] + 0.02, 0.008, j, -0.01);
  }
}

/** Glass curtain wall with spandrel bands and mullions (glass-tower). */
export function upperCurtainWall(ctx: Ctx, seg: Segment): void {
  const { m, c, look } = ctx;
  const L = seg.L;
  const r = look.r;
  const modern = ctx.modern;
  const endPier = 0.35;
  const a = seg.startTurn === null ? -L / 2 + endPier : -L / 2;
  const b = seg.endTurn === null ? L / 2 - endPier : L / 2;
  const count = Math.max(2, Math.round((b - a) / 1.5));
  const mw = (b - a) / count;
  const spandrel = modern ? col('#2e3a40') : col('#56666c');
  const mullion = modern ? col('#1a1c1f') : col('#7d858c');
  // Solid end piers against party walls.
  if (seg.startTurn === null) m.b(c.wall, -L / 2, a, ctx.groundH, ctx.wallTop, -r, 0.05, NN);
  if (seg.endTurn === null) m.b(c.wall, b, L / 2, ctx.groundH, ctx.wallTop, -r, 0.05, NN);
  for (let f = 1; f < ctx.floors; f++) {
    const y0 = ctx.floorY[f];
    const y1 = ctx.floorTop[f];
    const gy0 = f === 1 ? y0 + 0.35 : y0 + 0.45;
    const gy1 = y1 - 0.45;
    for (let k = 0; k < count; k++) {
      const u0 = a + k * mw;
      // Corner glass meets the neighbouring facade's glass plane.
      const s0 = k === 0 && seg.startTurn !== null ? u0 + r - 0.02 : u0;
      const s1 = k === count - 1 && seg.endTurn !== null ? u0 + mw - r + 0.02 : u0 + mw;
      pane(ctx, s0, s1, gy0, gy1, -r + 0.02, { dressing: ctx.rngGlass() < 0.5 });
    }
    // Spandrel band across the floor slab.
    const sa = seg.startTurn === null ? a : -L / 2 - extAt(seg.startTurn, 0.04);
    const sb = seg.endTurn === null ? b : L / 2 + extAt(seg.endTurn, 0.04);
    m.b(spandrel, sa, sb, y0 - (f === 1 ? 0.1 : 0.45), gy0, -r, 0.0, NN);
  }
  // Top band.
  const ta = seg.startTurn === null ? -L / 2 : -L / 2 - extAt(seg.startTurn, 0.04);
  const tb = seg.endTurn === null ? L / 2 : L / 2 + extAt(seg.endTurn, 0.04);
  m.b(spandrel, ta, tb, ctx.wallTop - 0.45, ctx.wallTop, -r, 0.0, NN);
  // Mullions (modern: deep vertical fins).
  const depth = modern ? 0.42 : 0.07;
  for (let k = 0; k <= count; k++) {
    const u = a + k * mw;
    if ((k === 0 && seg.startTurn !== null) || (k === count && seg.endTurn !== null)) continue;
    m.b(mullion, u - 0.05, u + 0.05, ctx.groundH, ctx.wallTop, -r, depth, NN);
  }
  // Floor transoms.
  for (let f = 1; f <= ctx.floors; f++) {
    const y = f === ctx.floors ? ctx.wallTop - 0.45 : ctx.floorY[f] + (f === 1 ? 0.35 : 0.45);
    m.b(mullion, a, b, y - 0.05, y + 0.02, -r, 0.05, NN);
  }
}

/** Bauhaus: horizontal ribbon windows that wrap round facade corners, cantilevered balconies. */
export function upperRibbons(ctx: Ctx, seg: Segment): void {
  const { m, c, look, rng } = ctx;
  const L = seg.L;
  const r = look.r;
  const endPier = 0.6;
  const ga = seg.startTurn === null ? -L / 2 + endPier : -L / 2 + r - 0.02;
  const gb = seg.endTurn === null ? L / 2 - endPier : L / 2 - r + 0.02;
  const mullion = c.frame;
  for (let f = 1; f < ctx.floors; f++) {
    const y0 = ctx.floorY[f];
    const y1 = ctx.floorTop[f];
    const ry0 = y0 + 0.95;
    const ry1 = Math.min(y1 - 0.4, ry0 + 1.4);
    // Solid bands below and above the ribbon wrap the corners.
    m.withSurface(ctx.wallSurface, () => {
      band(ctx, seg, y0, ry0, 0, c.wall, -r);
      band(ctx, seg, ry1, y1, 0, c.wall, -r);
    });
    if (seg.startTurn === null) skin(ctx, -L / 2, ga, ry0, ry1);
    if (seg.endTurn === null) skin(ctx, gb, L / 2, ry0, ry1);
    // Glass in panels of about 2.2 m, each lit independently.
    const panels = Math.max(1, Math.round((gb - ga) / 2.2));
    const pw = (gb - ga) / panels;
    for (let k = 0; k < panels; k++) pane(ctx, ga + k * pw, ga + (k + 1) * pw, ry0, ry1, -r + 0.03);
    const mulls = Math.max(1, Math.round((gb - ga) / 1.1));
    for (let k = 0; k <= mulls; k++) {
      const u = ga + ((gb - ga) * k) / mulls;
      m.b(mullion, u - 0.025, u + 0.025, ry0, ry1, -r + 0.03, -r + 0.08, NN | PY | NY);
    }
    m.b(scale(c.white, 0.95), ga, gb, ry0 - 0.03, ry0 + 0.02, -r, 0.04, NN);
  }
  // Cantilevered balconies stacked on the main front.
  if (seg.main && L >= 7 && ctx.floors >= 3) {
    const left = chance(rng, 0.5);
    const bw = Math.min(3.4, L * 0.35);
    const ua = left ? -L / 2 + 0.9 : L / 2 - 0.9 - bw;
    const ub = ua + bw;
    const par = ctx.modern ? c.accent : c.white;
    for (let f = 1; f < ctx.floors; f++) {
      const y = ctx.floorY[f];
      m.b(c.white, ua, ub, y - 0.22, y + 0.02, -0.05, 1.3, NN);
      m.b(par, ua, ub, y + 0.02, y + 1.0, 1.2, 1.3, NY);
      m.b(par, ua, ua + 0.1, y + 0.02, y + 1.0, 0, 1.2, NY);
      m.b(par, ub - 0.1, ub, y + 0.02, y + 1.0, 0, 1.2, NY);
      // Tube rail above the parapet.
      m.b(c.iron, ua, ub, y + 1.12, y + 1.16, 1.23, 1.27);
    }
  }
}

/** Main cornice or coping at the wall top, per look. */
export function topCornice(ctx: Ctx, seg: Segment): void {
  const { c, look, m } = ctx;
  const yTop = ctx.wallTop;
  const L = seg.L;
  switch (look.cornice) {
    case 'stepped': {
      const lay: [number, number][] = [
        [0.2, 0.12],
        [0.08, 0.2],
        [0.17, 0.42],
        [0.1, 0.55],
      ];
      let y = yTop - 0.55;
      band(ctx, seg, y - 0.25, y, 0.05, scale(c.trim, 0.98));
      for (const [h, p] of lay) {
        band(ctx, seg, y, y + h, p, c.cornice);
        y += h;
      }
      // Modillions under the corona.
      const ym = yTop - 0.55 + 0.28;
      const n = Math.max(2, Math.round(L / 0.6));
      for (let k = 0; k < n; k++) {
        const u = -L / 2 + (L * (k + 0.5)) / n;
        m.b(c.cornice, u - 0.06, u + 0.06, ym - 0.12, ym, 0.12, 0.34, NN | PY);
      }
      break;
    }
    case 'bracketed': {
      const dark = ctx.modern ? c.cornice : scale(c.cornice, 0.42);
      band(ctx, seg, yTop - 0.95, yTop - 0.35, 0.08, dark);
      band(ctx, seg, yTop - 0.35, yTop - 0.2, 0.62, dark);
      band(ctx, seg, yTop - 0.2, yTop, 0.68, scale(dark, 1.1));
      const n = Math.max(2, Math.round(L / 0.95));
      for (let k = 0; k <= n; k++) {
        const u = -L / 2 + 0.15 + ((L - 0.3) * k) / n;
        consoleBracket(ctx, u, yTop - 0.35, 0.58, 0.6, dark, 0.16);
      }
      // Dentils.
      const nd = Math.round(L / 0.22);
      for (let k = 0; k < nd; k++) {
        const u = -L / 2 + (L * (k + 0.5)) / nd;
        m.b(dark, u - 0.05, u + 0.05, yTop - 0.47, yTop - 0.35, 0.08, 0.16, NN | PY);
      }
      break;
    }
    case 'simple':
      band(ctx, seg, yTop - 0.42, yTop - 0.22, 0.1, c.cornice);
      band(ctx, seg, yTop - 0.22, yTop, 0.26, c.cornice);
      break;
    case 'coping':
      band(ctx, seg, yTop - 0.14, yTop, 0.05, ctx.spec.kind === 'tower' ? col('#9aa1a6') : scale(c.white, 0.92));
      break;
  }
}

/** Downpipes at facade ends that meet a party wall. */
export function downpipes(ctx: Ctx, seg: Segment): void {
  const m = ctx.m;
  const pc = ctx.modern ? col('#55595d') : col('#5d6166');
  for (const s of [-1, 1] as const) {
    const turn = s < 0 ? seg.startTurn : seg.endTurn;
    if (turn !== null) continue;
    const u = s * (seg.L / 2 - 0.2);
    m.b(pc, u - 0.055, u + 0.055, 0.15, ctx.wallTop - 0.25, 0.03, 0.14, PY | NN);
    m.b(pc, u - 0.08, u + 0.08, 0.0, 0.25, 0.02, 0.18, NN);
  }
}
