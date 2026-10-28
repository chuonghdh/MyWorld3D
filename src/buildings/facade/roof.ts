// Roofs: mansard with dormers, gables (plain, stepped, bell), hip and low tiled roofs,
// flat roofs with parapets, cornice roofs and roof terraces; chimney stacks with pots on party
// walls and rooftop clutter on flat roofs.

import { HOUSE_FRAME, NN, NY, PN, PY, col, scale, type Col, type Frame, type P3 } from './mesh';
import {
  MANSARD_LOWER_H,
  MANSARD_LOWER_INSET,
  MANSARD_UPPER_H,
  gableRise,
  isFlatRoof,
  offsetPolygon,
  offsetPolygonSafe,
  type Segment,
} from './layout';
import { bayColumns, consoleBracket, frameBars, glassRail, pane, railU, type Ctx } from './parts';
import { chance, int, pick, range } from './rng';
import { WIND, anchorWeight } from './polish';
import { SURFACE } from '../surface';
import type { Edge } from './layout';

type SurfaceFn = (x: number, z: number) => number;

const MANSARD_BASE_INSET = 0.12;

export function buildRoof(ctx: Ctx): void {
  ctx.m.frame = HOUSE_FRAME;
  let surface: SurfaceFn = () => 0;
  switch (ctx.roof) {
    case 'mansard':
      surface = mansard(ctx);
      break;
    case 'flat':
      flatRoof(ctx, 0.47);
      break;
    case 'parapet':
      flatRoof(ctx, 1.02);
      break;
    case 'cornice':
      corniceRoof(ctx);
      break;
    case 'terrace':
      terraceRoof(ctx);
      break;
    case 'gable':
      surface = gableRoof(ctx, false);
      break;
    case 'step-gable':
      surface = gableRoof(ctx, true);
      break;
    case 'hip':
      surface = hipRoof(ctx, 0.45, false);
      break;
    case 'low-tiled':
      surface = hipRoof(ctx, 0.55, true);
      break;
  }
  const kind = ctx.spec.kind;
  if (kind !== 'tower' && kind !== 'bauhaus' && kind !== 'brutalist') chimneys(ctx, surface);
  ctx.m.frame = HOUSE_FRAME;
}

// ---------------------------------------------------------------------------------------------
// Helpers

function ringPts(poly: [number, number][], y: number): P3[] {
  return poly.map(([x, z]) => [x, y, z] as P3);
}

/** Side faces between two rings, coloured per edge, plus an optional top cap. */
/** Colour of a non-facade wall: the rear elevation colour at the back, party colour elsewhere. */
function sideCol(ctx: Ctx, e: Edge): Col {
  return e.side === 'back' ? ctx.c.rear : ctx.c.party;
}

function ring(ctx: Ctx, a: P3[], b: P3[], colorOf: (i: number) => Col, cap: Col | null, roofy = true): void {
  const m = ctx.m;
  const n = a.length;
  let ix = 0;
  let iy = 0;
  let iz = 0;
  for (const p of [...a, ...b]) {
    ix += p[0];
    iy += p[1];
    iz += p[2];
  }
  const interior: P3 = [ix / (2 * n), iy / (2 * n) - 0.01, iz / (2 * n)];
  for (let i = 0; i < n; i++) {
    const j = (i - 1 + n) % n;
    // Edge i runs from vertex i-1 to vertex i.
    m.surface = ctx.edges[i].facade ? (roofy ? ctx.roofSurface : SURFACE.PLAIN) : ctx.wallSurface;
    m.poly('body', [a[j], a[i], b[i], b[j]], colorOf(i), interior);
  }
  m.surface = roofy ? ctx.roofSurface : SURFACE.PLAIN;
  if (cap) m.poly('body', b, cap, interior);
  m.surface = SURFACE.PLAIN;
}

function toLocal(f: Frame, x: number, z: number): [number, number] {
  const dx = x - f.ox;
  const dz = z - f.oz;
  return [dx * f.ux + dz * f.uz, dx * f.nx + dz * f.nz];
}

function toHouse(f: Frame, u: number, n: number): [number, number] {
  return [f.ox + u * f.ux + n * f.nx, f.oz + u * f.uz + n * f.nz];
}

/** Distance inside a facade edge for polygon roofs. */
function edgeDistances(ctx: Ctx, x: number, z: number): number[] {
  const out: number[] = [];
  for (const e of ctx.edges) if (e.facade) out.push(e.c - (e.nx * x + e.nz * z));
  return out;
}

// ---------------------------------------------------------------------------------------------
// Mansard

function mansardUpperInset(ctx: Ctx): number {
  const f = ctx.facades;
  const step = MANSARD_BASE_INSET + MANSARD_LOWER_INSET;
  const lim = (a: boolean, b: boolean, extent: number): number => {
    const rem = extent - (a ? step : 0) - (b ? step : 0);
    return a && b ? rem / 2 - 0.05 : a || b ? rem - 0.5 : Infinity;
  };
  return Math.max(0.3, Math.min(2.2, lim(f.front, f.back, ctx.D), lim(f.left, f.right, ctx.W)));
}

function mansard(ctx: Ctx): SurfaceFn {
  const { m, c, edges, wallTop } = ctx;
  const uIn = mansardUpperInset(ctx);
  const b0 = offsetPolygonSafe(edges, edges.map((e) => (e.facade ? MANSARD_BASE_INSET : 0)));
  const b1 = offsetPolygonSafe(edges, edges.map((e) => (e.facade ? MANSARD_BASE_INSET + MANSARD_LOWER_INSET : 0)));
  const b2 = offsetPolygonSafe(edges, edges.map((e) => (e.facade ? MANSARD_BASE_INSET + MANSARD_LOWER_INSET + uIn : 0)));
  const y1 = wallTop + MANSARD_LOWER_H;
  const y2 = y1 + MANSARD_UPPER_H;
  const slate = c.roof;
  const zinc = c.roofTop;
  ring(ctx, ringPts(b0, wallTop), ringPts(b1, y1), (i) => (edges[i].facade ? slate : sideCol(ctx, edges[i])), null);
  ring(ctx, ringPts(b1, y1), ringPts(b2, y2), (i) => (edges[i].facade ? zinc : sideCol(ctx, edges[i])), zinc);
  // Zinc flashing at the break of slope.
  for (const seg of ctx.segments) {
    if (!seg.facade) continue;
    m.frame = seg.frame;
    const n = -MANSARD_BASE_INSET - MANSARD_LOWER_INSET;
    const a = seg.startTurn === null ? -seg.L / 2 : -seg.L / 2 + MANSARD_LOWER_INSET * 0.4;
    const b = seg.endTurn === null ? seg.L / 2 : seg.L / 2 - MANSARD_LOWER_INSET * 0.4;
    m.b(scale(zinc, 1.12), a, b, y1 - 0.06, y1 + 0.04, n - 0.06, n + 0.06, NN);
    dormers(ctx, seg);
  }
  m.frame = HOUSE_FRAME;
  return (x, z) => {
    let h = MANSARD_LOWER_H + MANSARD_UPPER_H;
    for (const d of edgeDistances(ctx, x, z)) {
      const dd = d - MANSARD_BASE_INSET;
      const v = dd <= 0 ? 0 : dd < MANSARD_LOWER_INSET ? (dd / MANSARD_LOWER_INSET) * MANSARD_LOWER_H : MANSARD_LOWER_H + Math.min(1, (dd - MANSARD_LOWER_INSET) / uIn) * MANSARD_UPPER_H;
      h = Math.min(h, v);
    }
    return h;
  };
}

/** One dormer per bay on the lower mansard slope, with a small pediment (classic) or a box (modern). */
function dormers(ctx: Ctx, seg: Segment): void {
  const { m, c, rng, wallTop } = ctx;
  const modern = ctx.modern;
  // Dormers stay clear of facade corners, where the neighbouring segment's dormers (and the sloping
  // mansard return) would overlap them.
  const halfW = (modern ? 0.75 : 0.58) + 0.2;
  const margin = 1.2;
  const centres = bayColumns(ctx, seg.L).centres.filter(
    (cu) => (seg.startTurn === null || cu - halfW >= -seg.L / 2 + margin) && (seg.endTurn === null || cu + halfW <= seg.L / 2 - margin),
  );
  const yb = wallTop + 0.28;
  const yt = wallTop + (modern ? 2.0 : 1.95);
  const nf = -0.3;
  const nb = -1.75;
  const half = modern ? 0.75 : 0.58;
  const body = modern ? c.roofTop : c.trim;
  const segmental = chance(rng, 0.5);
  centres.forEach((cu, i) => {
    const a = cu - half;
    const b = cu + half;
    const cheek = modern ? 0.08 : 0.15;
    m.b(body, a, a + cheek, yb, yt, nb, nf, NN);
    m.b(body, b - cheek, b, yb, yt, nb, nf, NN);
    m.b(body, a + cheek, b - cheek, yb, yb + 0.22, nb, nf, NN);
    m.b(body, a + cheek, b - cheek, yt - (modern ? 0.12 : 0.2), yt, nb, nf, NN);
    const nG = nf - 0.12;
    pane(ctx, a + cheek, b - cheek, yb + 0.22, yt - (modern ? 0.12 : 0.2), nG);
    frameBars(ctx, modern ? 'modern' : 'french', a + cheek, b - cheek, yb + 0.22, yt - (modern ? 0.12 : 0.2), nG);
    if (modern) {
      m.b(scale(c.roofTop, 0.9), a - 0.06, b + 0.06, yt, yt + 0.12, nb, nf + 0.08, NN);
      return;
    }
    // Pediment in stone and the zinc dormer roof behind it.
    m.b(c.cornice, a - 0.06, b + 0.06, yt, yt + 0.08, nf - 0.05, nf + 0.08, NN);
    const apex = 0.42;
    if (segmental && i % 2 === 1) {
      const pts: [number, number][] = [];
      for (let k = 0; k <= 6; k++) {
        const t = Math.PI * (k / 6);
        pts.push([cu - Math.cos(t) * (half + 0.06), yt + 0.08 + Math.sin(t) * apex * 0.75]);
      }
      m.prismUY(c.cornice, pts, nf - 0.12, nf + 0.06, true);
      m.withSurface(SURFACE.ZINC, () => m.prismUY(c.roofTop, pts.map(([u, y]) => [u, y - 0.02] as [number, number]), nb, nf - 0.12, true));
    } else {
      const tri: [number, number][] = [
        [a - 0.06, yt + 0.08],
        [b + 0.06, yt + 0.08],
        [cu, yt + 0.08 + apex],
      ];
      m.prismUY(c.cornice, tri, nf - 0.12, nf + 0.06, true);
      m.withSurface(SURFACE.ZINC, () => m.prismUY(c.roofTop, tri.map(([u, y]) => [u, y - 0.02] as [number, number]), nb, nf - 0.12, true));
    }
  });
}

// ---------------------------------------------------------------------------------------------
// Flat roofs

/** Parapet walls with coping on every edge. Returns nothing; the deck is the core's top. */
function parapets(ctx: Ctx, h: number, opts: { facadeColor?: Col; railing?: 'iron' | 'glass' | 'tube' | null } = {}): void {
  const { m, c, wallTop, look } = ctx;
  for (const seg of ctx.segments) {
    m.frame = seg.frame;
    const L = seg.L;
    const t = (seg.facade ? look.r : 0.04) + 0.22;
    const color = seg.facade ? (opts.facadeColor ?? c.wall) : seg.side === 'back' ? c.rear : c.party;
    m.withSurface(ctx.wallSurface, () => m.b(color, -L / 2, L / 2, wallTop, wallTop + h, -t, 0, NY));
    const copeOut = seg.facade ? 0.05 : 0;
    m.b(scale(c.trim, 0.96), -L / 2, L / 2, wallTop + h, wallTop + h + 0.08, -t - 0.04, copeOut, NY);
    if (seg.facade && opts.railing) {
      const y = wallTop + h + 0.08;
      const n = -t / 2;
      if (opts.railing === 'iron') railU(ctx, -L / 2 + 0.05, L / 2 - 0.05, y, 0.6, n, { spacing: 0.16 });
      else if (opts.railing === 'glass') glassRail(ctx, -L / 2 + 0.02, L / 2 - 0.02, y, 0.75, n);
      else {
        const posts = Math.max(2, Math.round(L / 1.6));
        for (let k = 0; k <= posts; k++) {
          const u = -L / 2 + 0.06 + ((L - 0.12) * k) / posts;
          m.b(c.iron, u - 0.025, u + 0.025, y, y + 0.9, n - 0.025, n + 0.025, PY | NY);
        }
        m.b(c.iron, -L / 2 + 0.03, L / 2 - 0.03, y + 0.86, y + 0.92, n - 0.03, n + 0.03);
        m.b(c.iron, -L / 2 + 0.03, L / 2 - 0.03, y + 0.45, y + 0.49, n - 0.02, n + 0.02);
      }
    }
  }
  m.frame = HOUSE_FRAME;
}

interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

function roofRect(ctx: Ctx, margin: number): Rect {
  const mg = Math.max(margin, ctx.chamfer * 0.9);
  return { x0: -ctx.W / 2 + mg, x1: ctx.W / 2 - mg, z0: -ctx.D / 2 + mg, z1: ctx.D / 2 - mg };
}

function flatRoof(ctx: Ctx, h: number): void {
  const kind = ctx.spec.kind;
  const railing = kind === 'bauhaus' ? 'tube' : null;
  parapets(ctx, h, { railing });
  const placed: Rect[] = [];
  if (kind === 'tower') placed.push(plantRoom(ctx));
  rooftopItems(ctx, ctx.wallTop, roofRect(ctx, 0.75), int(ctx.rng, 2, 5), placed);
  rooftopExtras(ctx, ctx.wallTop, roofRect(ctx, 0.75), placed);
}

function corniceRoof(ctx: Ctx): void {
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

function terraceRoof(ctx: Ctx): void {
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

function parasol(ctx: Ctx, x: number, y: number, z: number): void {
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

type ItemKind = 'ac' | 'tank' | 'skylight' | 'hut' | 'vents' | 'antenna' | 'solar';

const ITEM_SIZE: Record<ItemKind, [number, number]> = {
  ac: [1.0, 0.7],
  tank: [1.9, 1.9],
  skylight: [1.4, 1.0],
  hut: [2.2, 2.0],
  vents: [0.7, 0.7],
  antenna: [0.5, 0.5],
  solar: [2.0, 1.3],
};

function overlaps(a: Rect, b: Rect): boolean {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;
}

function rooftopItems(ctx: Ctx, y: number, rect: Rect, count: number, placed: Rect[]): void {
  const { rng } = ctx;
  if (rect.x1 - rect.x0 < 0.8 || rect.z1 - rect.z0 < 0.8) return;
  const kind = ctx.spec.kind;
  const pool: ItemKind[] = ctx.modern
    ? ['ac', 'ac', 'solar', 'skylight', 'vents', 'hut']
    : kind === 'brownstone' || kind === 'brutalist'
      ? ['tank', 'ac', 'vents', 'hut', 'skylight', 'antenna']
      : ['ac', 'vents', 'skylight', 'hut', 'antenna', 'tank'];
  let done = 0;
  for (let attempt = 0; attempt < count * 8 && done < count; attempt++) {
    const k = done === 0 && attempt > count * 4 ? 'vents' : pick(rng, pool);
    let [sx, sz] = ITEM_SIZE[k];
    const rot = chance(rng, 0.5) && k !== 'tank';
    if (rot) [sx, sz] = [sz, sx];
    if (sx > rect.x1 - rect.x0 || sz > rect.z1 - rect.z0) continue;
    const x = range(rng, rect.x0 + sx / 2, rect.x1 - sx / 2);
    const z = range(rng, rect.z0 + sz / 2, rect.z1 - sz / 2);
    const r: Rect = { x0: x - sx / 2 - 0.25, x1: x + sx / 2 + 0.25, z0: z - sz / 2 - 0.25, z1: z + sz / 2 + 0.25 };
    if (placed.some((p) => overlaps(p, r))) continue;
    placed.push(r);
    item(ctx, k, x, y, z, sx, sz);
    done++;
  }
}

/**
 * Round 6 roof features on flat roofs, drawn from the separate detail stream: a flagpole with a flag,
 * a laundry line, a roof terrace with a parasol and a table, a small green roof bed and a large
 * skylight. Each is placed in free space (rects already taken are in `placed`).
 */
function rooftopExtras(ctx: Ctx, y: number, rect: Rect, placed: Rect[]): void {
  const { m, c } = ctx;
  const r = ctx.rngDetail;
  const pad = 0.25;
  const free = (sx: number, sz: number): { x: number; z: number } | null => {
    if (sx > rect.x1 - rect.x0 || sz > rect.z1 - rect.z0) return null;
    for (let attempt = 0; attempt < 6; attempt++) {
      const x = range(r, rect.x0 + sx / 2, rect.x1 - sx / 2);
      const z = range(r, rect.z0 + sz / 2, rect.z1 - sz / 2);
      const box: Rect = { x0: x - sx / 2 - pad, x1: x + sx / 2 + pad, z0: z - sz / 2 - pad, z1: z + sz / 2 + pad };
      if (placed.some((p) => overlaps(p, box))) continue;
      placed.push(box);
      return { x, z };
    }
    return null;
  };
  const iron = col('#55595d');
  // Flagpole with a flag, free edge streaming downwind.
  if (chance(r, 0.3)) {
    const spot = free(1.5, 0.6);
    if (spot) {
      const px = spot.x - 0.6;
      m.bar(iron, [px, y, spot.z], [px, y + 3.4, spot.z], 0.06);
      const flag = col(pick(r, ['#c8453d', '#2f5d8a', '#e8e4da', '#3f7a52', '#e0b13a']));
      const stripe = col(pick(r, ['#f1ece0', '#222a38', '#c8453d']));
      m.withWind(WIND.FLAG, (u) => anchorWeight(u, px + 0.03, px + 1.15), () => {
        m.b(flag, px + 0.03, px + 1.15, y + 2.75, y + 3.1, spot.z - 0.01, spot.z + 0.01, 0);
        m.b(stripe, px + 0.03, px + 1.15, y + 3.1, y + 3.38, spot.z - 0.01, spot.z + 0.01, 0);
      });
    }
  }
  // Laundry line between two posts.
  if (chance(r, 0.35)) {
    const spot = free(3.2, 0.6);
    if (spot) {
      const x0 = spot.x - 1.5;
      const x1 = spot.x + 1.5;
      const post = col('#6e6a64');
      m.bar(post, [x0, y, spot.z], [x0, y + 2.1, spot.z], 0.06);
      m.bar(post, [x1, y, spot.z], [x1, y + 2.1, spot.z], 0.06);
      m.bar(col('#2b2d30'), [x0, y + 2.05, spot.z], [x1, y + 2.0, spot.z], 0.02);
      const n = int(r, 3, 5);
      for (let k = 0; k < n; k++) {
        const cu = x0 + 0.3 + ((x1 - x0 - 0.6) * (k + 0.5)) / n;
        const clr = col(pick(r, ['#e8e4da', '#c8553d', '#2f5d8a', '#e0b13a', '#f1ece0', '#6a9a5b']));
        const hw = range(r, 0.16, 0.3);
        const hh = range(r, 0.45, 0.8);
        m.withWind(WIND.LAUNDRY, (_u, yy) => anchorWeight(yy, y + 1.98, y + 1.98 - hh), () => {
          m.b(clr, cu - hw, cu + hw, y + 1.98 - hh, y + 1.98, spot.z - 0.012, spot.z + 0.012, 0);
        });
      }
    }
  }
  // Roof terrace: parasol over a small table with two chairs.
  if (chance(r, 0.25)) {
    const spot = free(2.4, 2.4);
    if (spot) {
      const deckTop = y + 0.06;
      m.b(scale(c.deck, 1.05), spot.x - 1.2, spot.x + 1.2, y, deckTop, spot.z - 1.2, spot.z + 1.2, NY);
      parasol(ctx, spot.x, deckTop, spot.z);
      m.b(scale(c.white, 0.9), spot.x - 0.4, spot.x + 0.4, deckTop + 0.72, deckTop + 0.76, spot.z - 0.4, spot.z + 0.4, 0);
      for (const sx of [-0.85, 0.85]) {
        m.b(scale(c.accent, 0.9), spot.x + sx - 0.2, spot.x + sx + 0.2, deckTop + 0.42, deckTop + 0.46, spot.z - 0.2, spot.z + 0.2, 0);
        m.b(iron, spot.x + sx - 0.2, spot.x + sx - 0.17, deckTop, deckTop + 0.42, spot.z - 0.2, spot.z - 0.17, 0);
        m.b(iron, spot.x + sx + 0.17, spot.x + sx + 0.2, deckTop, deckTop + 0.42, spot.z + 0.17, spot.z + 0.2, 0);
      }
    }
  }
  // Green roof bed with shrubs.
  if (chance(r, 0.22)) {
    const spot = free(3.0, 2.0);
    if (spot) {
      m.b(scale(c.pot, 0.8), spot.x - 1.5, spot.x + 1.5, y, y + 0.22, spot.z - 1.0, spot.z + 1.0, NY);
      m.b(scale(c.green, 0.8), spot.x - 1.4, spot.x + 1.4, y + 0.22, y + 0.3, spot.z - 0.9, spot.z + 0.9, NY);
      const bloom = col(pick(r, ['#d9465f', '#f2c14e', '#e8e1f0']));
      for (let k = 0; k < 4; k++) {
        const bx = spot.x - 1.0 + k * 0.67;
        const bz = spot.z + range(r, -0.4, 0.4);
        const hgt = range(r, 0.3, 0.55);
        m.withWind(WIND.PLANT, (_u, yy) => anchorWeight(yy, y + 0.3, y + 0.3 + hgt), () => {
          m.b(k % 2 === 0 ? c.green : bloom, bx - 0.2, bx + 0.2, y + 0.3, y + 0.3 + hgt, bz - 0.2, bz + 0.2, NY);
        });
      }
    }
  }
  // A large skylight over the stairwell.
  if (chance(r, 0.2)) {
    const spot = free(2.6, 1.6);
    if (spot) item(ctx, 'skylight', spot.x, y, spot.z, 2.6, 1.6);
  }
}

function item(ctx: Ctx, k: ItemKind, x: number, y: number, z: number, sx: number, sz: number): void {
  const { m, c, rng } = ctx;
  const grey = col('#c9c9c4');
  const dark = col('#3b3e42');
  switch (k) {
    case 'ac':
      m.b(scale(dark, 1.3), x - sx / 2 + 0.05, x + sx / 2 - 0.05, y, y + 0.08, z - sz / 2 + 0.05, z + sz / 2 - 0.05, NY);
      m.b(grey, x - sx / 2, x + sx / 2, y + 0.08, y + 0.75, z - sz / 2, z + sz / 2, NY, );
      m.b(dark, x - 0.25, x + 0.25, y + 0.75, y + 0.78, z - 0.25 * (sz / 0.7) * 0.7, z + 0.25 * (sz / 0.7) * 0.7, NY);
      break;
    case 'tank': {
      const legs: [number, number][] = [
        [-0.6, -0.6],
        [0.6, -0.6],
        [0.6, 0.6],
        [-0.6, 0.6],
      ];
      const steel = col('#4a4d50');
      for (const [dx, dz] of legs) m.bar(steel, [x + dx, y, z + dz], [x + dx, y + 1.1, z + dz], 0.09);
      m.b(steel, x - 0.75, x + 0.75, y + 1.05, y + 1.15, z - 0.75, z + 0.75, 0);
      const oct = (r: number): [number, number][] => {
        const o: [number, number][] = [];
        for (let i = 0; i < 8; i++) {
          const a = (Math.PI * 2 * i) / 8 + Math.PI / 8;
          o.push([x + Math.cos(a) * r, z + Math.sin(a) * r]);
        }
        return o;
      };
      const wood = col(pick(rng, ['#8a6a4a', '#7a5c40', '#93785a']));
      const toP = (pts: [number, number][], yy: number): P3[] => pts.map(([px, pz]) => [px, yy, pz] as P3);
      m.loft('body', wood, toP(oct(0.82), y + 1.15), toP(oct(0.82), y + 2.6), null, null);
      for (const hy of [y + 1.5, y + 2.0, y + 2.4]) m.loft('body', dark, toP(oct(0.85), hy), toP(oct(0.85), hy + 0.05), dark, dark);
      m.loft('body', scale(dark, 1.2), toP(oct(0.9), y + 2.6), toP(oct(0.05), y + 3.0), scale(dark, 1.2), scale(dark, 1.2));
      break;
    }
    case 'skylight': {
      m.b(grey, x - sx / 2, x + sx / 2, y, y + 0.3, z - sz / 2, z + sz / 2, NY);
      const lo = y + 0.3;
      const hi = y + 0.55;
      if (sx >= sz) {
        m.poly('glass', [[x - sx / 2 + 0.06, lo, z + sz / 2 - 0.06], [x + sx / 2 - 0.06, lo, z + sz / 2 - 0.06], [x + sx / 2 - 0.06, hi, z - sz / 2 + 0.06], [x - sx / 2 + 0.06, hi, z - sz / 2 + 0.06]], c.glassTop, [x, y, z]);
        m.poly('body', [[x - sx / 2 + 0.06, lo, z - sz / 2 + 0.06], [x - sx / 2 + 0.06, hi, z - sz / 2 + 0.06], [x - sx / 2 + 0.06, lo, z + sz / 2 - 0.06]], grey, [x, y, z]);
        m.poly('body', [[x + sx / 2 - 0.06, lo, z - sz / 2 + 0.06], [x + sx / 2 - 0.06, hi, z - sz / 2 + 0.06], [x + sx / 2 - 0.06, lo, z + sz / 2 - 0.06]], grey, [x, y, z]);
        m.b(grey, x - sx / 2 + 0.06, x + sx / 2 - 0.06, lo, hi, z - sz / 2 + 0.06, z - sz / 2 + 0.1, NY);
      } else {
        m.b(c.glassTop, x - sx / 2 + 0.06, x + sx / 2 - 0.06, lo, lo + 0.04, z - sz / 2 + 0.06, z + sz / 2 - 0.06, NY);
      }
      break;
    }
    case 'hut': {
      const hc = scale(c.party, 1.05);
      m.b(hc, x - sx / 2, x + sx / 2, y, y + 2.3, z - sz / 2, z + sz / 2, NY);
      m.b(scale(dark, 0.9), x - sx / 2 - 0.12, x + sx / 2 + 0.12, y + 2.3, y + 2.45, z - sz / 2 - 0.12, z + sz / 2 + 0.12, 0);
      // Door on the +z or +x face.
      if (sx >= sz) m.b(col(pick(rng, ['#4a3a2c', '#3a4a52', '#5a2e2a'])), x - 0.4, x + 0.4, y, y + 2.0, z + sz / 2, z + sz / 2 + 0.04, NN | NY);
      else m.b(col('#4a3a2c'), x + sx / 2, x + sx / 2 + 0.04, y, y + 2.0, z - 0.4, z + 0.4, NY);
      break;
    }
    case 'vents': {
      const pipes = int(rng, 2, 3);
      const placedPipes: [number, number][] = [];
      for (let i = 0; i < pipes; i++) {
        const px = x + range(rng, -sx / 2 + 0.12, sx / 2 - 0.12);
        const pz = z + range(rng, -sz / 2 + 0.12, sz / 2 - 0.12);
        const h = range(rng, 0.5, 1.0);
        // Pipes keep 0.3 m apart so their square sections never overlap.
        if (placedPipes.some(([qx, qz]) => Math.hypot(qx - px, qz - pz) < 0.3)) continue;
        placedPipes.push([px, pz]);
        m.bar(grey, [px, y, pz], [px, y + h, pz], 0.13);
        m.b(scale(grey, 0.8), px - 0.11, px + 0.11, y + h, y + h + 0.08, pz - 0.11, pz + 0.11, 0);
      }
      break;
    }
    case 'antenna': {
      const iron = col('#55595d');
      const h = range(rng, 2.0, 3.0);
      m.bar(iron, [x, y, z], [x, y + h, z], 0.05);
      for (let i = 0; i < 3; i++) {
        const yy = y + h - 0.2 - i * 0.35;
        const len = 0.9 - i * 0.2;
        m.bar(iron, [x - len / 2, yy, z + 0.05], [x + len / 2, yy, z + 0.05], 0.03);
      }
      break;
    }
    case 'solar': {
      const tilt = 0.45;
      const hx = sx / 2;
      const hz = sz / 2;
      const lo = y + 0.25;
      const hi = y + 0.25 + 2 * hz * Math.sin(tilt);
      // Tilted panel: a closed shell. The glass is the top face itself (no separate slab top beneath it,
      // so nothing can be seen between the two); the other five faces are grey.
      const dy = hi - lo;
      const dz = -2 * hz;
      const len = Math.hypot(dy, dz);
      const up: P3 = [0, -dz / len, dy / len];
      const th = 0.05;
      const top = (px: number, t: number): P3 => [px, lo + dy * t, z + hz + dz * t];
      const bot = (px: number, t: number): P3 => [px, lo + dy * t - up[1] * th, z + hz + dz * t - up[2] * th];
      const centre: P3 = [x, (lo + hi) / 2 - up[1] * th / 2, z - up[2] * th / 2];
      m.poly('glass', [top(x - hx, 0), top(x + hx, 0), top(x + hx, 1), top(x - hx, 1)], col('#1d2b45'), [x, y, z - 5]);
      m.poly('body', [bot(x - hx, 0), bot(x - hx, 1), bot(x + hx, 1), bot(x + hx, 0)], grey, centre);
      m.poly('body', [top(x - hx, 0), bot(x - hx, 0), bot(x + hx, 0), top(x + hx, 0)], grey, centre);
      m.poly('body', [top(x - hx, 1), top(x + hx, 1), bot(x + hx, 1), bot(x - hx, 1)], grey, centre);
      m.poly('body', [top(x - hx, 0), top(x - hx, 1), bot(x - hx, 1), bot(x - hx, 0)], grey, centre);
      m.poly('body', [top(x + hx, 0), bot(x + hx, 0), bot(x + hx, 1), top(x + hx, 1)], grey, centre);
      m.b(grey, x - hx, x - hx + 0.06, y, hi - 0.03, z - hz, z - hz + 0.06, NY);
      m.b(grey, x + hx - 0.06, x + hx, y, hi - 0.03, z - hz, z - hz + 0.06, NY);
      m.b(grey, x - hx, x + hx, y, lo - 0.03, z + hz - 0.06, z + hz, NY);
      break;
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Gable roofs

function gableRoof(ctx: Ctx, stepped: boolean): SurfaceFn {
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
      const lit = ctx.rngGlass() < 0.4;
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

function hipRoof(ctx: Ctx, overhang: number, tiled: boolean): SurfaceFn {
  const { m, c, edges, wallTop } = ctx;
  const s = ctx.hipInset;
  const h = ctx.roofH;
  const ins0 = edges.map((e) => (e.facade ? -overhang : 0));
  const ins1 = edges.map((e) => (e.facade ? s : 0));
  const base = offsetPolygon(edges, ins0);
  const top = offsetPolygon(edges, ins1);
  const roofCol = c.roof;
  // Fascia board under the eaves.
  const fascia = tiled ? scale(c.trim, 0.95) : scale(roofCol, 0.7);
  ring(ctx, ringPts(base, wallTop - 0.18), ringPts(base, wallTop + 0.02), (i) => (edges[i].facade ? fascia : sideCol(ctx, edges[i])), null, false);
  m.poly('body', ringPts(base, wallTop - 0.18).reverse(), scale(c.trim, 0.85), [0, wallTop, 0]);
  ring(ctx, ringPts(base, wallTop + 0.02), ringPts(top, wallTop + h), (i) => (edges[i].facade ? roofCol : sideCol(ctx, edges[i])), roofCol);

  // Hip and ridge caps.
  const cap = scale(roofCol, tiled ? 0.85 : 0.75);
  const n = edges.length;
  const ridges: [number, number, number, number][] = [];
  const ridgeEnds: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    if (edges[i].facade && edges[j].facade) {
      m.bar(cap, [base[i][0], wallTop + 0.08, base[i][1]], [top[i][0], wallTop + h + 0.06, top[i][1]], 0.16);
    }
    const ti = top[(i - 1 + n) % n];
    const tj = top[i];
    if (Math.hypot(ti[0] - tj[0], ti[1] - tj[1]) > 0.2) {
      const facadeEdge = edges[i].facade;
      if (!facadeEdge) continue;
      // Top edge of a slope: only a ridge when the slope opposite meets it. Opposite slopes share
      // their top edge, so each ridge is emitted once.
      const dup = ridges.some(([ax, az, bx, bz]) => {
        const near = (x1: number, z1: number, x2: number, z2: number): boolean => Math.hypot(x1 - x2, z1 - z2) < 0.05;
        return (near(ax, az, ti[0], ti[1]) && near(bx, bz, tj[0], tj[1])) || (near(ax, az, tj[0], tj[1]) && near(bx, bz, ti[0], ti[1]));
      });
      if (dup) continue;
      ridges.push([ti[0], ti[1], tj[0], tj[1]]);
      ridgeEnds.push([ti[0], ti[1]], [tj[0], tj[1]]);
      // Tucked 10 cm in at both ends so the bar never ends flush with the lot line or a hip.
      const len = Math.hypot(tj[0] - ti[0], tj[1] - ti[1]);
      const ex = ((tj[0] - ti[0]) / len) * 0.1;
      const ez = ((tj[1] - ti[1]) / len) * 0.1;
      m.bar(cap, [ti[0] + ex, wallTop + h + 0.06, ti[1] + ez], [tj[0] - ex, wallTop + h + 0.06, tj[1] - ez], 0.18);
    }
  }

  // Barrel-tile ribs on the street slopes.
  if (tiled) {
    for (const seg of ctx.segments) {
      if (!seg.facade) continue;
      const i = seg.index;
      const f = seg.frame;
      const b0 = toLocal(f, base[(i - 1 + n) % n][0], base[(i - 1 + n) % n][1]);
      const b1 = toLocal(f, base[i][0], base[i][1]);
      const t0 = toLocal(f, top[(i - 1 + n) % n][0], top[(i - 1 + n) % n][1]);
      const t1 = toLocal(f, top[i][0], top[i][1]);
      const ua = Math.max(Math.min(b0[0], b1[0]), Math.min(t0[0], t1[0])) + 0.12;
      const ub = Math.min(Math.max(b0[0], b1[0]), Math.max(t0[0], t1[0])) - 0.12;
      const count = Math.floor((ub - ua) / 0.3);
      m.frame = f;
      const nOut = overhang - 0.02;
      const nIn = -s + 0.05;
      const ribCol = scale(roofCol, 1.12);
      for (let k = 0; k <= count; k++) {
        const u = ua + k * 0.3;
        // A rib that would end beside the end of a ridge bar is left out (their end faces would share a plane).
        const [rx, rz] = toHouse(f, u, nIn);
        if (ridgeEnds.some(([ex, ez]) => Math.hypot(ex - rx, ez - rz) < 0.25)) continue;
        m.bar(ribCol, [u, wallTop + 0.06, nOut], [u, wallTop + h + 0.02 - 0.05, nIn], 0.1);
      }
      // A few tile courses across the slope.
      for (const t of [0.33, 0.66]) {
        const nn = nOut + (nIn - nOut) * t;
        // Each segment's courses sit at their own height (2.5 cm apart) so those of neighbouring slopes never share a plane at the hips.
        const yy = wallTop + 0.06 + (h - 0.05) * t + (seg.index % 4) * 0.025;
        m.bar(scale(roofCol, 0.88), [ua, yy, nn], [ua + count * 0.3, yy, nn], 0.05);
      }
      m.frame = HOUSE_FRAME;
    }
  }
  return (x, z) => {
    let v = h;
    for (const d of edgeDistances(ctx, x, z)) v = Math.min(v, h * Math.max(0, Math.min(1, (d + overhang) / (s + overhang))));
    return v;
  };
}

// ---------------------------------------------------------------------------------------------
// Chimneys

function chimneys(ctx: Ctx, surface: SurfaceFn): void {
  const { m, c, rng, wallTop } = ctx;
  const party = ctx.segments.filter((s) => !s.facade && s.side !== 'chamfer' && s.L > 2.5);
  const potCol = c.pot;
  const potTop = col('#2a2420');
  const stack = (seg: Segment, uc: number, len: number): void => {
    const f = seg.frame;
    const L = seg.L;
    const u0 = Math.max(-L / 2 + 0.05, uc - len / 2);
    const u1 = Math.min(L / 2 - 0.05, uc + len / 2);
    const depth = 0.75;
    let top = 0;
    for (const [u, n] of [
      [u0, 0],
      [u1, 0],
      [u0, -depth],
      [u1, -depth],
      [uc, -depth / 2],
    ] as const) {
      const [x, z] = toHouse(f, u, n);
      top = Math.max(top, surface(x, z));
    }
    const yTop = wallTop + top + range(rng, 0.8, 1.3);
    // The stack stands 6 cm inside the lot line, so its faces are never flush with the party gable,
    // the roof edge or the neighbour's walls. Collar and cap project beyond the stack face in steps.
    const off = 0.06;
    m.frame = { ...f, ox: f.ox - f.nx * off, oz: f.oz - f.nz * off };
    m.withSurface(SURFACE.BRICK, () => m.b(c.chimney, u0, u1, wallTop - 0.3, yTop, -depth, 0, NY));
    m.b(scale(c.chimney, 0.9), u0, u1, yTop - 0.35, yTop - 0.28, -depth - 0.04, 0.03, NY);
    const cu0 = Math.max(-L / 2, u0 - 0.06);
    const cu1 = Math.min(L / 2, u1 + 0.06);
    m.b(scale(c.trim, 0.9), cu0, cu1, yTop, yTop + 0.1, -depth - 0.06, 0.05, NY);
    const pots = Math.max(1, Math.floor((u1 - u0) / 0.36));
    let best: { u: number; y: number } | null = null;
    for (let p = 0; p < pots; p++) {
      const u = u0 + ((u1 - u0) * (p + 0.5)) / pots;
      const ph = range(rng, 0.28, 0.5);
      if (!best || Math.abs(u - uc) < Math.abs(best.u - uc)) best = { u, y: yTop + 0.1 + ph };
      // Pot variety from a position hash (no random draws, so the other streams do not shift).
      const variant = Math.floor(Math.abs(Math.sin(u * 91.7 + yTop * 13.3 + p * 7.1)) * 3.0) % 3;
      if (variant === 0) {
        m.box('body', potCol, u - 0.09, u + 0.09, yTop + 0.1, yTop + 0.1 + ph, -depth / 2 - 0.09, -depth / 2 + 0.09, NY, potTop);
      } else if (variant === 1) {
        // Tall pot with a flared collar.
        const tall = ph + 0.18;
        m.box('body', scale(potCol, 0.88), u - 0.08, u + 0.08, yTop + 0.1, yTop + 0.1 + tall, -depth / 2 - 0.08, -depth / 2 + 0.08, NY, potTop);
        m.box('body', scale(potCol, 0.8), u - 0.12, u + 0.12, yTop + 0.1 + tall, yTop + 0.18 + tall, -depth / 2 - 0.12, -depth / 2 + 0.12, 0, potTop);
      } else {
        // Squat pot under a rain cap.
        m.box('body', scale(c.chimney, 0.8), u - 0.11, u + 0.11, yTop + 0.1, yTop + 0.1 + ph * 0.7, -depth / 2 - 0.11, -depth / 2 + 0.11, NY, potTop);
        m.box('body', scale(potCol, 0.7), u - 0.15, u + 0.15, yTop + 0.1 + ph * 0.7, yTop + 0.18 + ph * 0.7, -depth / 2 - 0.15, -depth / 2 + 0.15, 0, potTop);
      }
    }
    // Flue breast on a side party wall face below: 3 cm proud of the core wall, behind the lot line.
    // (Not on the rear wall: windows and pipes live there.)
    m.frame = f;
    if (seg.side !== 'back') {
      m.withSurface(ctx.wallSurface, () =>
        m.b(scale(c.party, 1.05), uc - (u1 - u0) * 0.4, uc + (u1 - u0) * 0.4, wallTop * 0.3, wallTop - 0.05, -0.045, -0.01, NN | NY),
      );
    }
    if (best) {
      const [hx, hz] = toHouse(f, best.u, -depth / 2 - off);
      ctx.chimneyTops.push({ x: hx, y: best.y, z: hz });
    }
    m.frame = HOUSE_FRAME;
  };
  const modern = ctx.modern;
  // Modern flat roofs carry no stacks (exhaust vents only).
  if (modern && isFlatRoof(ctx.roof)) return;
  for (const seg of party) {
    const k = modern ? (chance(rng, 0.5) ? 1 : 0) : chance(rng, 0.55) ? 2 : 1;
    for (let i = 0; i < k; i++) {
      if (ctx.chimneyTops.length >= 3) break;
      const eave = ctx.gableToStreet && (ctx.roof === 'gable' || ctx.roof === 'step-gable');
      const len = range(rng, 0.9, Math.min(eave ? 1.4 : 2.4, seg.L * 0.3));
      const lo = -seg.L / 2 + len / 2 + 0.6;
      const hi = seg.L / 2 - len / 2 - 0.6;
      if (hi <= lo) continue;
      const span = (hi - lo) / k;
      stack(seg, lo + span * (i + range(rng, 0.2, 0.8)), len);
    }
  }
  if (party.length === 0 || (ctx.chimneyTops.length === 0 && !modern)) {
    // Free-standing: one stack near the middle of the roof.
    const seg: Segment = {
      ...ctx.segments[0],
      frame: { ox: range(rng, -ctx.W * 0.2, ctx.W * 0.2), oz: 0.4, ux: 1, uz: 0, nx: 0, nz: 1 },
      L: 4,
    };
    stack(seg, 0, 1.0);
  }
}

