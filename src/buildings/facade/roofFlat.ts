// Flat, cornice and terrace roofs, parasols and plant rooms (split from roof.ts).

import { HOUSE_FRAME, NN, NY, PN, col, scale, type P3 } from './mesh';
import { consoleBracket, pane, type Ctx } from './parts';
import { int, range } from './rng';
import { WIND, anchorWeight } from './polish';
import { parapets } from './roofCore';
import { rooftopItems, rooftopExtras } from './roofItems';

export interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

function roofRect(ctx: Ctx, margin: number): Rect {
  const mg = Math.max(margin, ctx.chamfer * 0.9);
  return { x0: -ctx.W / 2 + mg, x1: ctx.W / 2 - mg, z0: -ctx.D / 2 + mg, z1: ctx.D / 2 - mg };
}

export function flatRoof(ctx: Ctx, h: number): void {
  const kind = ctx.spec.kind;
  const railing = kind === 'bauhaus' ? 'tube' : null;
  parapets(ctx, h, { railing });
  const placed: Rect[] = [];
  if (kind === 'tower') placed.push(plantRoom(ctx));
  rooftopItems(ctx, ctx.wallTop, roofRect(ctx, 0.75), int(ctx.rng, 2, 5), placed);
  rooftopExtras(ctx, ctx.wallTop, roofRect(ctx, 0.75), placed);
}

export function corniceRoof(ctx: Ctx): void {
  const { m, c, wallTop } = ctx;
  const h = 0.62;
  parapets(ctx, h - 0.08);
  // A big bracketed cornice crowns every street facade.
  const dark = ctx.modern ? scale(c.cornice, 0.95) : scale(c.cornice, ctx.spec.kind === 'brownstone' ? 0.42 : 1);
  for (const seg of ctx.segments) {
    if (!seg.facade) continue;
    m.frame = seg.frame;
    const L = seg.L;
    const ext = (t: number | null, p: number): number => (t === null ? 0 : p * Math.tan(t / 2));
    const a = (p: number): number => -L / 2 - ext(seg.startTurn, p);
    const b = (p: number): number => L / 2 + ext(seg.endTurn, p);
    m.b(dark, a(0.08), b(0.08), wallTop - 0.1, wallTop + 0.3, -0.1, 0.08, NN);
    m.b(dark, a(0.6), b(0.6), wallTop + 0.3, wallTop + 0.44, -0.1, 0.6, NN);
    m.b(scale(dark, 1.08), a(0.66), b(0.66), wallTop + 0.44, wallTop + 0.62, -0.1, 0.66, NN);
    if (!ctx.modern) {
      const n = Math.max(2, Math.round(L / 0.9));
      for (let k = 0; k <= n; k++) {
        const u = -L / 2 + 0.15 + ((L - 0.3) * k) / n;
        consoleBracket(ctx, u, wallTop + 0.3, 0.55, 0.55, dark, 0.16);
      }
    }
  }
  m.frame = HOUSE_FRAME;
  const placed: Rect[] = [];
  rooftopItems(ctx, wallTop, roofRect(ctx, 0.75), int(ctx.rng, 2, 5), placed);
  rooftopExtras(ctx, wallTop, roofRect(ctx, 0.75), placed);
}

export function terraceRoof(ctx: Ctx): void {
  const { m, c, wallTop, rng, W, D, facades: f } = ctx;
  const modern = ctx.modern;
  parapets(ctx, 0.47, { railing: modern ? 'glass' : 'iron' });
  // Set-back penthouse toward the back of the lot, glazed toward the front.
  const x0 = -W / 2 + (f.left ? 1.6 : 0.3);
  const x1 = W / 2 - (f.right ? 1.6 : 0.3);
  const z0 = -D / 2 + (f.back ? 1.6 : 0.3);
  const z1 = Math.min(D / 2 - (f.front ? 2.6 : 0.4), z0 + Math.max(2.6, D * 0.45));
  const placed: Rect[] = [];
  let itemsY = wallTop;
  let itemsRect = roofRect(ctx, 0.75);
  if (x1 - x0 > 2.6 && z1 - z0 > 2.2) {
    const ph = 2.6;
    const pc = modern ? c.white : scale(c.wall, 1.04);
    m.b(pc, x0, x1, wallTop, wallTop + ph, z0, z1 - 0.3, NY);
    // Glazed front between corner posts.
    m.b(pc, x0, x0 + 0.25, wallTop, wallTop + ph, z1 - 0.3, z1, NY);
    m.b(pc, x1 - 0.25, x1, wallTop, wallTop + ph, z1 - 0.3, z1, NY);
    const panels = Math.max(2, Math.round((x1 - x0 - 0.5) / 1.4));
    const pw = (x1 - x0 - 0.5) / panels;
    for (let k = 0; k < panels; k++) {
      const a = x0 + 0.25 + k * pw;
      pane(ctx, a, a + pw, wallTop + 0.05, wallTop + ph - 0.1, z1 - 0.27, { dressing: true });
      m.b(c.frame, a - 0.03, a + 0.03, wallTop, wallTop + ph, z1 - 0.28, z1 - 0.22, NN);
    }
    m.b(c.frame, x0, x1, wallTop + ph - 0.12, wallTop + ph, z1 - 0.28, z1 - 0.2, NN);
    m.b(scale(c.white, 0.92), x0 - 0.15, x1 + 0.15, wallTop + ph, wallTop + ph + 0.22, z0 - 0.1, z1 + 0.5, 0);
    placed.push({ x0: x0 - 0.3, x1: x1 + 0.3, z0: z0 - 0.3, z1: z1 + 0.8 });
    itemsY = wallTop + ph + 0.22;
    itemsRect = { x0: x0 + 0.3, x1: x1 - 0.3, z0: z0 + 0.3, z1: z1 - 0.3 };
    // Parasol and planters on the terrace in front.
    const tz = (z1 + D / 2) / 2;
    if (D / 2 - z1 > 1.8) {
      const px = range(rng, x0 + 1, x1 - 1);
      parasol(ctx, px, wallTop, tz);
      for (const sx of [x0 + 0.5, x1 - 0.5]) {
        m.b(scale(c.pot, 0.9), sx - 0.3, sx + 0.3, wallTop, wallTop + 0.5, tz - 0.6, tz + 0.6, NY);
        m.b(c.green, sx - 0.33, sx + 0.33, wallTop + 0.5, wallTop + 0.95, tz - 0.62, tz + 0.62, NY);
      }
    }
  }
  rooftopItems(ctx, itemsY, itemsRect, int(rng, 2, 3), placed);
  rooftopExtras(ctx, itemsY, itemsRect, placed);
}

export function parasol(ctx: Ctx, x: number, y: number, z: number): void {
  const m = ctx.m;
  const cloth = ctx.c.awning;
  m.bar(ctx.c.iron, [x, y, z], [x, y + 2.2, z], 0.05);
  const n = 8;
  const rimR = 1.1;
  const rim: P3[] = [];
  const tip: P3[] = [];
  for (let k = 0; k < n; k++) {
    const a = (Math.PI * 2 * k) / n;
    rim.push([x + Math.cos(a) * rimR, y + 1.95, z + Math.sin(a) * rimR]);
    tip.push([x + Math.cos(a) * 0.04, y + 2.35, z + Math.sin(a) * 0.04]);
  }
  // The canopy rim flutters in a gust; the apex and pole stay put.
  m.withWind(WIND.PARASOL, (_u, yy) => anchorWeight(yy, y + 2.35, y + 1.95), () => {
    m.loft('body', cloth, rim, tip, scale(cloth, 0.7), cloth);
  });
}

/** Tower plant room with louvre bands. */
function plantRoom(ctx: Ctx): Rect {
  const { m, wallTop, W, D } = ctx;
  const x0 = -W / 2 + Math.min(3, W * 0.25);
  const x1 = W / 2 - Math.min(3, W * 0.25);
  const z0 = -D / 2 + Math.min(2.5, D * 0.2);
  const z1 = z0 + Math.max(2.5, (D - 2 * Math.min(2.5, D * 0.2)) * 0.55);
  const h = 2.8;
  const wall = col('#a8acaf');
  m.b(wall, x0, x1, wallTop, wallTop + h, z0, z1, NY);
  const lv = col('#6f7477');
  for (let k = 0; k < 5; k++) {
    const y = wallTop + 0.6 + k * 0.38;
    m.b(lv, x0 + 0.3, x1 - 0.3, y, y + 0.14, z1, z1 + 0.06, NN | NY);
    m.b(lv, x0 + 0.3, x1 - 0.3, y, y + 0.14, z0 - 0.06, z0, PN | NY);
  }
  m.b(col('#8a8f93'), x0 - 0.1, x1 + 0.1, wallTop + h, wallTop + h + 0.15, z0 - 0.1, z1 + 0.1, NY);
  // Mast.
  const mx = (x0 + x1) / 2;
  const mz = (z0 + z1) / 2;
  m.bar(col('#5d6166'), [mx, wallTop + h, mz], [mx, wallTop + h + 3.2, mz], 0.08);
  m.box('glassLit', col('#ff5a4a'), mx - 0.08, mx + 0.08, wallTop + h + 3.2, wallTop + h + 3.36, mz - 0.08, mz + 0.08);
  return { x0: x0 - 0.3, x1: x1 + 0.3, z0: z0 - 0.3, z1: z1 + 0.3 };
}

// ---------------------------------------------------------------------------------------------
// Rooftop clutter
