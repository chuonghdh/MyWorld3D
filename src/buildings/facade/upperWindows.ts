// Window units and balcony floors for upper storeys (split from upper.ts).

import { NN, NU, NY, PU, col, scale } from './mesh';
import { WIND, anchorWeight } from './polish';
import { frameBars, glassRail, pane, railU, type Ctx } from './parts';
import { chance, pick } from './rng';
import { SURFACE } from '../surface';

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
    else m.withSurface(SURFACE.TRIM_AGED, () => m.b(c.trim, u0 - 0.09, u1 + 0.09, y0 - 0.08, y0 + 0.02, -r, 0.09, NN));
  }

  // Moulded surround.
  const sw = 0.13;
  if (look.surround) {
    m.withSurface(SURFACE.TRIM_AGED, () => {
      m.b(c.trim, u0 - sw, u0, y0, y1 + sw, 0, 0.04, NN | NY);
      m.b(c.trim, u1, u1 + sw, y0, y1 + sw, 0, 0.04, NN | NY);
      m.b(c.trim, u0, u1, y1, y1 + sw, 0, 0.04, NN | NY);
    });
  }
  const top = y1 + (look.surround ? sw : 0);

  // Hood, lintel or pediment.
  switch (look.hood) {
    case 'flat':
      m.b(c.cornice, u0 - 0.2, u1 + 0.2, top, top + 0.1, 0, 0.13, NN);
      break;
    case 'lintel':
      m.withSurface(SURFACE.TRIM_AGED, () => {
        m.b(c.trim, u0 - 0.12, u1 + 0.12, y1, y1 + 0.26, 0, 0.05, NN);
        m.b(c.trim, u0 - 0.17, u1 + 0.17, y1 + 0.26, y1 + 0.33, 0, 0.1, NN);
      });
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
    // Foliage and blooms nod in the wind; the pot stays still.
    m.withWind(WIND.PLANT, (_u, y) => anchorWeight(y, y0 + 0.2, y0 + 0.38), () => {
      m.b(c.green, u0 + 0.04, u1 - 0.04, y0 + 0.2, y0 + 0.33, 0.0, 0.27, NY);
      for (let k = 0; k < 3; k++) {
        const uu = u0 + 0.15 + ((w - 0.3) * k) / 2;
        m.b(bloom, uu - 0.07, uu + 0.07, y0 + 0.3, y0 + 0.38, 0.06, 0.2, NY);
      }
    });
  }
}

/** Haussmann balcony floors: the 2nd and the top floor. */
export function haussmannBalconyFloors(floors: number): Set<number> {
  if (floors >= 4) return new Set([2, floors - 1]);
  if (floors === 3) return new Set([2]);
  return new Set([1]);
}
