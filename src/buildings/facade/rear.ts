// Rear elevation: the courtyard side of a building whose back is not a street facade.
//
// Plain plaster or brick, fewer and smaller irregular windows (no mouldings, simple sills), a
// courtyard door with a step, drainpipes, an optional lean-to or stair tower with its own roof,
// small balconies with railings, AC units, now and then a washing line and a flue pipe.
// Everything is drawn in the back segment's frame (u along the wall, y up, n outward = -z) and stays
// within 1.2 m of the lot edge.

import { NN, NY, PY, col, scale, type Col } from './mesh';
import type { Segment } from './layout';
import { bayColumns, frameBars, pane, railN, railU, type Ctx } from './parts';
import { chance, int, pick, range } from './rng';
import { SURFACE } from '../surface';
import { MANSARD_LOWER_H, MANSARD_UPPER_H } from './layout';

const WALL_N = -0.04;
const MAX_DEPTH = 0.9;

interface Ext {
  kind: 'lean' | 'tower';
  a: number;
  b: number;
  h: number;
}

export function rearElevation(ctx: Ctx, seg: Segment): void {
  const { m, c, look } = ctx;
  const rng = ctx.rngRear;
  const L = seg.L;
  m.frame = seg.frame;
  const wallTop = ctx.wallTop;
  const frameKind = ctx.modern ? 'modern' : 'casement';
  const frameCol = ctx.modern ? c.frame : scale(c.white, 0.9);
  const sillCol = scale(c.trim, 0.85);
  const roofSurface = ctx.roofSurface === SURFACE.PLAIN ? SURFACE.ZINC : ctx.roofSurface;

  // Window columns: about 55% of the front bays, irregularly spaced.
  const frontBays = bayColumns(ctx, L).centres.length;
  const nCols = Math.max(1, Math.round(frontBays * 0.55));
  const slot = (L - 0.8) / nCols;

  // Extension (lean-to or stair tower) on about 40% of houses.
  let ext: Ext | null = null;
  if (L >= 5 && ctx.floors >= 2 && chance(rng, 0.4)) {
    const tower = ctx.floors >= 3 && L >= 6.5 && chance(rng, 0.4);
    const w = tower ? range(rng, 1.7, 2.1) : Math.min(L - 2.2, range(rng, L * 0.35, L * 0.5));
    if (w > 1.2) {
      const left = chance(rng, 0.5);
      const a = left ? -L / 2 + 0.2 : L / 2 - 0.2 - w;
      ext = {
        kind: tower ? 'tower' : 'lean',
        a,
        b: a + w,
        // Height varies in 3 cm steps per house, so two extensions that meet across a narrow yard never share a roof plane.
        h: (tower ? wallTop - 0.5 : Math.min(3.2, ctx.groundH - 0.5)) - 0.03 * int(rng, 0, 3),
      };
    }
  }

  interface Col2 {
    cu: number;
    w: number;
    hMul: number;
  }
  const cols: Col2[] = [];
  for (let k = 0; k < nCols; k++) {
    const cu = -L / 2 + 0.4 + (k + 0.5) * slot + range(rng, -slot * 0.12, slot * 0.12);
    const w = Math.max(0.55, Math.min(look.win.w * range(rng, 0.65, 0.9), slot - 0.5));
    cols.push({ cu, w, hMul: range(rng, 0.85, 1.1) });
  }
  const blocked = (cu: number, w: number, floor: number): boolean => {
    if (!ext) return false;
    const over = cu + w / 2 + 0.25 > ext.a && cu - w / 2 - 0.25 < ext.b;
    if (!over) return false;
    return ext.kind === 'tower' || floor === 0;
  };

  // Courtyard door on a free column, or at the end opposite the extension.
  let doorU = 0;
  const free = cols.filter((cl) => !blocked(cl.cu, 1.0, 0));
  let doorCol: Col2 | null = null;
  if (free.length > 0) {
    doorCol = pick(rng, free);
    doorU = doorCol.cu;
  } else {
    doorU = ext && ext.a < 0 ? L / 2 - 1.0 : -L / 2 + 1.0;
  }
  {
    const dw = 1.0;
    const dh = 2.15;
    const a = doorU - dw / 2;
    const b = doorU + dw / 2;
    const door = c.door;
    m.b(scale(door, 0.8), a - 0.08, b + 0.08, 0, dh + 0.08, WALL_N, 0.06, NN | NY);
    m.b(door, a, b, 0, dh, 0.06, 0.1, NN | NY);
    m.b(scale(door, 1.2), a + 0.1, b - 0.1, 0.3, dh - 0.3, 0.1, 0.12, NN | NY);
    m.b(scale(c.trim, 0.9), a - 0.2, b + 0.2, dh + 0.08, dh + 0.2, WALL_N, 0.35, NN);
    m.withSurface(SURFACE.STONE, () => m.b(c.base, a - 0.2, b + 0.2, 0, 0.16, 0.1, 0.55, NN));
  }

  // Which floors get balconies and where.
  const balcony = new Map<number, number>();
  if (ctx.floors >= 3 && chance(rng, 0.55)) {
    const n = chance(rng, 0.4) ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const f = int(rng, 1, ctx.floors - 1);
      const ci = int(rng, 0, cols.length - 1);
      if (!balcony.has(f) && !blocked(cols[ci].cu, cols[ci].w, f)) balcony.set(f, ci);
    }
  }
  const stairCol = cols.length >= 2 ? int(rng, 0, cols.length - 1) : -1;

  // Windows.
  for (let f = 0; f < ctx.floors; f++) {
    const y0 = ctx.floorY[f];
    const y1 = ctx.floorTop[f];
    const fh = y1 - y0;
    cols.forEach((cl, ci) => {
      if (blocked(cl.cu, cl.w, f)) return;
      if (f === 0 && doorCol === cl) return;
      if (f > 0 && chance(rng, 0.07)) return;
      const isBalc = balcony.get(f) === ci;
      const stair = ci === stairCol && f > 0;
      const w = (stair ? Math.min(0.7, cl.w) : cl.w) * (isBalc ? 1.0 : range(rng, 0.92, 1.05));
      let sill = f === 0 ? 1.05 : range(rng, 0.78, 1.0);
      let h = Math.min(fh - sill - 0.55, range(rng, 1.15, 1.55) * cl.hMul);
      if (isBalc) {
        sill = 0.05;
        h = Math.min(fh - 0.55, 2.1);
      }
      let oy0 = y0 + sill;
      if (stair) {
        h = Math.min(h, 1.0);
        oy0 = y0 + fh * 0.5;
      }
      if (h < 0.5) return;
      const u0 = cl.cu - w / 2;
      const u1 = cl.cu + w / 2;
      pane(ctx, u0, u1, oy0, oy0 + h, -0.02, { dressing: true });
      frameBars(ctx, frameKind, u0, u1, oy0, oy0 + h, -0.02, frameCol);
      if (!isBalc) m.b(sillCol, u0 - 0.05, u1 + 0.05, oy0 - 0.06, oy0, WALL_N, 0.1, NN);
      if (isBalc) {
        const a = u0 - 0.35;
        const b = u1 + 0.35;
        const slab = scale(c.trim, 0.82);
        m.b(slab, a, b, y0 - 0.12, y0 + 0.03, WALL_N, 0.8, NN);
        railU(ctx, a + 0.02, b - 0.02, y0 + 0.03, 1.0, 0.77, { spacing: 0.16, band: false });
        railN(ctx, a + 0.02, 0.0, 0.77, y0 + 0.03, 1.0, 0.2);
        railN(ctx, b - 0.02, 0.0, 0.77, y0 + 0.03, 1.0, 0.2);
        if (chance(rng, 0.6)) m.b(scale(c.pot, 0.9), u0, u0 + 0.3, y0 + 0.03, y0 + 0.3, 0.45, 0.7, NY);
      }
    });
  }

  // Mansard: attic windows on the vertical rear wall above the eaves.
  if (ctx.roof === 'mansard') {
    const y0 = wallTop + 0.55;
    const hh = Math.min(1.5, MANSARD_LOWER_H + MANSARD_UPPER_H - 1.0);
    cols.forEach((cl) => {
      if (blocked(cl.cu, cl.w, 9) || !chance(rng, 0.7)) return;
      const w = cl.w * 0.8;
      pane(ctx, cl.cu - w / 2, cl.cu + w / 2, y0, y0 + hh, -0.02);
      frameBars(ctx, frameKind, cl.cu - w / 2, cl.cu + w / 2, y0, y0 + hh, -0.02, frameCol);
      m.b(sillCol, cl.cu - w / 2 - 0.05, cl.cu + w / 2 + 0.05, y0 - 0.06, y0, WALL_N, 0.1, NN);
    });
  }

  // Extension.
  if (ext) buildExtension(ctx, ext, roofSurface, frameKind, frameCol);

  // Drainpipes.
  const pipe = col('#4a4e52');
  const pipes = int(rng, 1, 2);
  for (let i = 0; i < pipes; i++) {
    const u = i === 0 ? -L / 2 + 0.22 : L / 2 - 0.22;
    if (ext && u + 0.1 > ext.a && u - 0.1 < ext.b && ext.kind === 'tower') continue;
    const top = ext && u + 0.1 > ext.a && u - 0.1 < ext.b ? ext.h : wallTop - 0.25;
    m.b(pipe, u - 0.05, u + 0.05, 0.12, top, WALL_N, 0.08, NN | PY);
    m.b(pipe, u - 0.07, u + 0.07, 0.0, 0.25, WALL_N, 0.12, NN);
  }

  // AC units.
  const acCount = int(rng, 0, 3);
  for (let i = 0; i < acCount; i++) {
    const f = int(rng, 1, Math.max(1, ctx.floors - 1));
    const cl = pick(rng, cols);
    const side = chance(rng, 0.5) ? 1 : -1;
    const u = cl.cu + side * (cl.w / 2 + 0.55);
    if (Math.abs(u) > L / 2 - 0.6 || blocked(u, 0.8, f)) continue;
    const y = ctx.floorY[f] + range(rng, 1.0, 1.8);
    m.b(col('#d8d8d3'), u - 0.35, u + 0.35, y, y + 0.46, WALL_N, 0.3, NN);
    m.b(col('#4b4f54'), u - 0.22, u + 0.22, y + 0.07, y + 0.39, 0.3, 0.32, NN | NY);
  }

  // Washing line.
  if (ctx.floors >= 2 && L >= 5 && chance(rng, 0.25)) {
    const f = int(rng, 1, ctx.floors - 1);
    const a = -L / 2 + 0.7 + range(rng, 0, L * 0.15);
    const b = a + Math.min(L - 1.6, 2.2);
    const y = ctx.floorY[f] + 2.3;
    if (!blocked((a + b) / 2, b - a, f) && y < wallTop - 0.4) {
      const dark = col('#2b2d30');
      m.bar(dark, [a, y, WALL_N], [a, y, 0.5], 0.03);
      m.bar(dark, [b, y, WALL_N], [b, y, 0.5], 0.03);
      m.bar(dark, [a, y - 0.02, 0.5], [b, y - 0.04, 0.5], 0.015);
      const n = int(rng, 2, 3);
      for (let k = 0; k < n; k++) {
        const cu = a + ((b - a) * (k + 0.6)) / (n + 0.2);
        const clr = col(pick(rng, ['#e8e4da', '#c8553d', '#2f5d8a', '#e0b13a', '#f1ece0']));
        m.b(clr, cu - 0.17, cu + 0.17, y - 0.52, y - 0.04, 0.485, 0.505, 0);
      }
    }
  }

  // Flue pipe.
  if (chance(rng, 0.5)) {
    const u = range(rng, -L / 2 + 1.2, L / 2 - 1.2);
    if (!(ext && u + 0.2 > ext.a && u - 0.2 < ext.b)) {
      m.b(scale(c.party, 0.9), u - 0.1, u + 0.1, wallTop * 0.4, wallTop + 0.3, WALL_N, 0.16, NN);
      m.b(pipe, u - 0.14, u + 0.14, wallTop + 0.3, wallTop + 0.4, WALL_N - 0.02, 0.2, NN);
    }
  }
  m.frame = seg.frame;
}

function buildExtension(ctx: Ctx, e: Ext, roofSurface: number, frameKind: 'modern' | 'casement', frameCol: Col): void {
  const { m, c } = ctx;
  const rng = ctx.rngRear;
  const depth = MAX_DEPTH;
  const wallCol = scale(c.rear, 0.97);
  m.withSurface(ctx.wallSurface, () => m.b(wallCol, e.a, e.b, 0, e.h, WALL_N, depth, 0));
  const drop = e.kind === 'lean' ? 0.5 : 0.45;
  const top = e.h;
  // Shed roof falling away from the wall.
  m.withSurface(roofSurface, () =>
    m.prismNY(
      c.roof,
      [
        [WALL_N, top + 0.12],
        [depth + 0.15, top - drop + 0.12],
        [depth + 0.15, top - drop],
        [WALL_N, top],
      ],
      e.a - 0.1,
      e.b + 0.1,
    ),
  );
  m.b(scale(c.roof, 0.7), e.a - 0.1, e.b + 0.1, top - drop - 0.1, top - drop, depth + 0.1, depth + 0.2, 0);
  if (e.kind === 'lean') {
    const w = Math.min(1.0, e.b - e.a - 0.6);
    if (w > 0.4) {
      const cu = (e.a + e.b) / 2;
      const y0 = 0.95;
      const y1 = Math.min(top - drop - 0.3, 2.0);
      pane(ctx, cu - w / 2, cu + w / 2, y0, y1, depth + 0.02);
      frameBars(ctx, frameKind, cu - w / 2, cu + w / 2, y0, y1, depth + 0.02, frameCol);
    }
  } else {
    // Narrow stair windows, one per floor.
    const cu = (e.a + e.b) / 2;
    for (let f = 1; f < ctx.floors; f++) {
      const y0 = ctx.floorY[f] - 0.5 + range(rng, 0, 0.2);
      pane(ctx, cu - 0.2, cu + 0.2, y0, y0 + 0.95, depth + 0.02);
      frameBars(ctx, frameKind, cu - 0.2, cu + 0.2, y0, y0 + 0.95, depth + 0.02, frameCol);
    }
  }
}
