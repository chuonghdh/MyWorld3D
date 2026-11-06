// Residential bases, brownstone stoops and tower lobbies (split from ground.ts).

import { NN, NY, PY, col, scale } from './mesh';
import type { Segment } from './layout';
import { bayColumns, pane, railN, railU, skin, type Ctx } from './parts';
import { windowUnit } from './upper';
import { chance } from './rng';
import { buildings } from '../../config/tuning';
import { signLetters, lantern, entrance } from './groundFront';

/** Residential ground floor: rusticated base, entrance, barred windows, stoop or steps. */
export function residentialGround(ctx: Ctx, seg: Segment): void {
  const { m, c, look, rng } = ctx;
  const L = seg.L;
  const gH = ctx.groundH;
  const kind = ctx.spec.kind;
  const { centres, bw } = bayColumns(ctx, L);
  const n = centres.length;
  const stoop = look.door === 'stoop' && seg.main;
  const doorIdx = seg.main || seg.side === 'back' ? (stoop || n === 2 ? (chance(rng, 0.5) ? 0 : n - 1) : Math.floor(n / 2)) : -1;
  const courses = look.rustic ?? look.texture;
  const raise = stoop ? 1.2 : kind === 'canal' && !ctx.modern && seg.main ? 0.36 : 0;

  interface Op {
    a: number;
    b: number;
    y0: number;
    y1: number;
    door: boolean;
  }
  const ops: Op[] = centres.map((cx, i) => {
    if (i === doorIdx) {
      const dw = Math.min(look.door === 'arch' ? 1.7 : 1.35, bw - 0.5);
      const y0 = seg.main ? raise : 0;
      const y1 = Math.min(gH - 0.45, y0 + (look.door === 'arch' ? 3.1 : 2.95));
      return { a: cx - dw / 2, b: cx + dw / 2, y0, y1, door: true };
    }
    const gw = look.groundWin;
    const w = Math.min(gw.w, bw - 0.6);
    const sill = gw.sill + (stoop ? 0.5 : 0);
    const h = Math.max(0.6, Math.min(gw.h, gH - sill - 0.5));
    return { a: cx - w / 2, b: cx + w / 2, y0: sill, y1: sill + h, door: false };
  });

  // Skin: piers between openings, spandrels below and above.
  const cuts: number[] = [-L / 2];
  for (const o of ops) cuts.push(o.a, o.b);
  cuts.push(L / 2);
  for (let k = 0; k < cuts.length; k += 2) skin(ctx, cuts[k], cuts[k + 1], 0, gH, { courses });
  ops.forEach((o, i) => {
    skin(ctx, o.a, o.b, 0, o.y0, { courses });
    skin(ctx, o.a, o.b, o.y1, gH, { courses, plinth: false });
    if (o.door) {
      entrance(ctx, o.a, o.b, o.y0, o.y1, stoop ? 'stoop' : look.door === 'stoop' ? 'transom' : look.door);
      if (!ctx.modern) lantern(ctx, o.b + 0.3, o.y0 + 2.2);
    } else {
      const leftRoom = i === 0 ? o.a + L / 2 : (o.a - ops[i - 1].b) / 2;
      const rightRoom = i === n - 1 ? L / 2 - o.b : (ops[i + 1].a - o.b) / 2;
      windowUnit(ctx, o.a, o.b, o.y0, o.y1, { floor: 0, col: i, balconyFloor: false, smallBalcony: false, leftRoom, rightRoom, ground: true });
      if (look.bars) {
        const nb = Math.max(3, Math.round((o.b - o.a) / 0.16));
        for (let k = 1; k < nb; k++) {
          const u = o.a + ((o.b - o.a) * k) / nb;
          m.b(c.iron, u - 0.012, u + 0.012, o.y0, o.y1, -0.07, -0.045, PY | NY);
        }
        m.b(c.iron, o.a, o.b, o.y1 - 0.25, o.y1 - 0.22, -0.07, -0.045, PY | NY);
      }
      if (stoop) {
        // Garden-level window below the parlour floor.
        const by0 = 0.25;
        const by1 = Math.min(o.y0 - 0.35, 1.0);
        if (by1 - by0 > 0.3) {
          m.b(scale(c.wall, 0.4), o.a + 0.1, o.b - 0.1, by0, by1, 0.025, 0.03, NN);
          pane(ctx, o.a + 0.15, o.b - 0.15, by0 + 0.05, by1 - 0.05, 0.035, { dressing: false });
          const nb = 5;
          for (let k = 1; k < nb; k++) {
            const u = o.a + 0.15 + ((o.b - o.a - 0.3) * k) / nb;
            m.b(c.iron, u - 0.012, u + 0.012, by0, by1, 0.05, 0.075, PY | NY);
          }
        }
      }
    }
  });

  const door = doorIdx >= 0 ? ops[doorIdx] : null;
  if (door && raise > 0 && seg.main) {
    const cu = (door.a + door.b) / 2;
    if (stoop) brownstoneStoop(ctx, seg, cu);
    else {
      // A couple of stone steps up to the door.
      const steps = Math.round(raise / 0.18);
      for (let k = 0; k < steps; k++) {
        m.b(c.base, door.a - 0.25, door.b + 0.25, 0, raise - k * 0.18, 0, 0.3 * (k + 1), NN);
      }
    }
  }

  // Ground-floor string course / top of the base.
  if (!ctx.modern && kind !== 'nordic') {
    const yb = gH;
    m.b(c.cornice, -L / 2 + (seg.startTurn === null ? 0 : -0.12), L / 2 + (seg.endTurn === null ? 0 : 0.12), yb - 0.12, yb + 0.06, -0.1, 0.12, NN);
  }
}

/** Brownstone stoop: stone steps with iron rails and an areaway fence along the front. */
function brownstoneStoop(ctx: Ctx, seg: Segment, cu: number): void {
  const { m, c } = ctx;
  const sw = 1.8;
  const a = cu - sw / 2;
  const b = cu + sw / 2;
  const stone = scale(c.trim, 0.85);
  const steps = 6;
  for (let k = 0; k < steps; k++) {
    const yTop = 1.2 - k * 0.2;
    const nOut = 0.3 + k * 0.24;
    m.b(stone, a, b, 0, yTop, 0, nOut, NN);
    m.b(scale(stone, 1.08), a - 0.02, b + 0.02, yTop - 0.04, yTop, nOut - 0.02, Math.min(1.5, nOut + 0.03), NN);
  }
  // Cheek walls are implied by the step blocks; rails on both sides.
  for (const u of [a + 0.06, b - 0.06]) {
    const bottom: [number, number, number] = [u, 0.2 + 0.9, 1.42];
    const top: [number, number, number] = [u, 1.2 + 0.9, 0.12];
    m.bar(c.iron, bottom, top, 0.05);
    m.b(c.iron, u - 0.05, u + 0.05, 0.2, 1.25, 1.37, 1.47);
    m.b(c.iron, u - 0.06, u + 0.06, 1.25, 1.33, 1.36, 1.48);
    for (let k = 1; k < 6; k++) {
      const t = k / 6;
      const n = 1.42 + (0.12 - 1.42) * t;
      const y0 = 0.2 + (1.2 - 0.2) * t;
      m.b(c.iron, u - 0.012, u + 0.012, y0, y0 + 0.88, n - 0.012, n + 0.012, PY | NY);
    }
  }
  // Areaway fence along the front, leaving the stoop open.
  const L = seg.L;
  const fn = 1.42;
  const runs: [number, number][] = [
    [-L / 2 + 0.05, a - 0.05],
    [b + 0.05, L / 2 - 0.05],
  ];
  for (const [ra, rb] of runs) {
    if (rb - ra < 0.3) continue;
    railU(ctx, ra, rb, 0, 0.95, fn, { spacing: 0.14 });
    railN(ctx, ra, 0.05, fn, 0, 0.95, 0.2);
    railN(ctx, rb, 0.05, fn, 0, 0.95, 0.2);
  }
}

/** Glass tower lobby: recessed glazing behind a colonnade, with a canopy over the entrance. */
export function towerLobby(ctx: Ctx, seg: Segment): void {
  const { m, c } = ctx;
  const L = seg.L;
  const rg = 1.0;
  const gH = ctx.groundH;
  const endPier = 0.35;
  const a = seg.startTurn === null ? -L / 2 + endPier : -L / 2 + rg - 0.03;
  const b = seg.endTurn === null ? L / 2 - endPier : L / 2 - rg + 0.03;
  if (seg.startTurn === null) m.b(c.wall, -L / 2, -L / 2 + endPier, 0, gH, -rg, 0.05, NN);
  if (seg.endTurn === null) m.b(c.wall, L / 2 - endPier, L / 2, 0, gH, -rg, 0.05, NN);
  const glassTop = gH - 0.6;
  const panels = Math.max(2, Math.round((b - a) / 1.5));
  const pw = (b - a) / panels;
  const nG = -rg + 0.03;
  const mull = ctx.modern ? col('#1a1c1f') : col('#7d858c');
  for (let k = 0; k < panels; k++) {
    pane(ctx, a + k * pw, a + (k + 1) * pw, 0.05, glassTop, nG, { litChance: buildings.litWindowShareGroundAlt, dressing: false });
  }
  for (let k = 0; k <= panels; k++) {
    const u = a + k * pw;
    m.b(mull, u - 0.04, u + 0.04, 0, glassTop, nG, nG + 0.08, NN | PY);
  }
  m.b(mull, a, b, glassTop, glassTop + 0.1, nG, nG + 0.1, NN);
  m.b(mull, a, b, 0, 0.06, nG, nG + 0.1, NN);
  // Lintel band at the lot line, soffit is the underside of the upper core.
  m.b(ctx.modern ? col('#2e3a40') : col('#56666c'), -L / 2, L / 2, gH - 0.55, gH, -rg, 0.0, NN);
  // Colonnade.
  const q = Math.max(2, Math.round(L / 4.5));
  for (let k = 0; k <= q; k++) {
    const u = -L / 2 + (L * k) / q;
    const u0 = Math.max(-L / 2, u - 0.25);
    const u1 = Math.min(L / 2, u + 0.25);
    if ((k === 0 && seg.startTurn === null) || (k === q && seg.endTurn === null)) continue;
    m.b(c.wall, u0, u1, 0, gH - 0.55, -0.5, 0, PY);
  }
  if (ctx.ground !== 'residential') signLetters(ctx, a, b, gH - 0.5, gH - 0.05, 0.0, c.sign);
  if (seg.main) {
    m.b(scale(c.white, 0.85), -1.6, 1.6, gH - 0.95, gH - 0.8, -rg, 1.3, NN);
  }
}
