// Roof dispatch, mansard roofs, dormers and parapets (split from roof.ts).

import { HOUSE_FRAME, NN, NY, PY, scale, type Col, type Frame, type P3 } from './mesh';
import { MANSARD_LOWER_H, MANSARD_LOWER_INSET, MANSARD_UPPER_H, offsetPolygonSafe, type Segment } from './layout';
import { bayColumns, frameBars, glassRail, pane, railU, type Ctx } from './parts';
import { chance } from './rng';
import { SURFACE, roofSurfaceId } from '../surface';
import type { Edge } from './layout';
import { flatRoof, corniceRoof, terraceRoof } from './roofFlat';
import { gableRoof } from './roofGable';
import { hipRoof, chimneys } from './roofHip';

export type SurfaceFn = (x: number, z: number) => number;

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

export function ringPts(poly: [number, number][], y: number): P3[] {
  return poly.map(([x, z]) => [x, y, z] as P3);
}

/** Side faces between two rings, coloured per edge, plus an optional top cap. */
/** Colour of a non-facade wall: the rear elevation colour at the back, party colour elsewhere. */
export function sideCol(ctx: Ctx, e: Edge): Col {
  return e.side === 'back' ? ctx.c.rear : ctx.c.party;
}

export function ring(ctx: Ctx, a: P3[], b: P3[], colorOf: (i: number) => Col, cap: Col | null, roofy = true): void {
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

export function toLocal(f: Frame, x: number, z: number): [number, number] {
  const dx = x - f.ox;
  const dz = z - f.oz;
  return [dx * f.ux + dz * f.uz, dx * f.nx + dz * f.nz];
}

export function toHouse(f: Frame, u: number, n: number): [number, number] {
  return [f.ox + u * f.ux + n * f.nx, f.oz + u * f.uz + n * f.nz];
}

/** Distance inside a facade edge for polygon roofs. */
export function edgeDistances(ctx: Ctx, x: number, z: number): number[] {
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
export function parapets(ctx: Ctx, h: number, opts: { facadeColor?: Col; railing?: 'iron' | 'glass' | 'tube' | null } = {}): void {
  const { m, c, wallTop, look } = ctx;
  for (const seg of ctx.segments) {
    m.frame = seg.frame;
    const L = seg.L;
    const t = (seg.facade ? look.r : 0.04) + 0.22;
    const color = seg.facade ? (opts.facadeColor ?? c.wall) : seg.side === 'back' ? c.rear : c.party;
    m.withSurface(ctx.wallSurface, () => m.b(color, -L / 2, L / 2, wallTop, wallTop + h, -t, 0, NY));
    const copeOut = seg.facade ? 0.05 : 0;
    // Coping stone takes the membrane pattern and the roof moss like the flat top it sits on.
    m.withSurface(roofSurfaceId(SURFACE.ROOF_FLAT, wallTop), () => m.b(scale(c.trim, 0.96), -L / 2, L / 2, wallTop + h, wallTop + h + 0.08, -t - 0.04, copeOut, NY));
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
