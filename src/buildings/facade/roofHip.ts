// Hip and tiled roofs and chimneys (split from roof.ts).

import { HOUSE_FRAME, NN, NY, col, scale } from './mesh';
import { isFlatRoof, offsetPolygon, type Segment } from './layout';
import { type Ctx } from './parts';
import { chance, range } from './rng';
import { SURFACE } from '../surface';
import { SurfaceFn, ringPts, sideCol, ring, toLocal, toHouse, edgeDistances } from './roofCore';

export function hipRoof(ctx: Ctx, overhang: number, tiled: boolean): SurfaceFn {
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

export function chimneys(ctx: Ctx, surface: SurfaceFn): void {
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
