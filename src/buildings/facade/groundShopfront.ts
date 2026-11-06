// Shopfronts, door recesses and cafe terraces (split from ground.ts).

import { NN, NY, PY, col, scale } from './mesh';
import type { Segment } from './layout';
import { bayColumns, frameBars, pane, skin, type Ctx } from './parts';
import { chance, int, pick, range } from './rng';
import { SIGNS, pickSign, signUv } from '../signs';
import { buildings } from '../../config/tuning';
import { SIGN_BOARD_N, SIGN_N, awning, lantern, bladeSign } from './groundFront';

/** Shopfront ground floor; with `terrace`, a cafe with tables on the sidewalk. */
export function shopfront(ctx: Ctx, seg: Segment, terrace: boolean): void {
  const { m, c, look, rng } = ctx;
  const L = seg.L;
  const r = look.r;
  const gH = ctx.groundH;
  const { centres } = bayColumns(ctx, L);
  const n = centres.length;
  const cw0 = seg.startTurn === null ? 0.55 : 0.42;
  const cw1 = seg.endTurn === null ? 0.55 : 0.42;
  const p: number[] = [-L / 2 + cw0];
  for (let k = 1; k < n; k++) p.push((centres[k - 1] + centres[k]) / 2);
  p.push(L / 2 - cw1);
  const shop = c.shop;
  const modern = ctx.modern;

  // Fascia sign: a board in the sign's own colour with the atlas cell on its face. The sign keeps the
  // atlas 4:1 shape (so lettering is not stretched) and is at least 0.9 m tall when the shopfront allows.
  const rs = ctx.rngSign;
  const span = p[n] - p[0];
  const signIdx =
    ctx.ground === 'cafe'
      ? pickSign(chance(rs, 0.25) ? ['cafe', 'restaurant'] : ['cafe'], rs())
      : pickSign(['food', 'shop', 'service', 'culture'], rs());
  const signW = Math.max(Math.min(4.0, span * range(rs, 0.6, 0.9)), Math.min(3.6, span * 0.92));
  const signH = signW / 4;
  const boardH = signH + 0.12;
  const boardTop = gH - 0.08;
  const boardBot = boardTop - boardH;
  const gTop = boardBot - 0.05;
  const boardW = Math.min(span, Math.max(signW + 0.4, span * range(rs, 0.75, 0.95)));
  const bu0 = (p[0] + p[n]) / 2 - boardW / 2;
  const bu1 = bu0 + boardW;

  // Corner piers and the wall band above the fascia.
  skin(ctx, -L / 2, p[0], 0, gH, { courses: look.rustic });
  skin(ctx, p[n], L / 2, 0, gH, { courses: look.rustic });
  skin(ctx, p[0], p[n], gTop, gH, { courses: null, plinth: false });
  // Fascia sign band with a moulded cap.
  m.b(col(SIGNS[signIdx].bg), bu0, bu1, boardBot, boardTop, 0, SIGN_BOARD_N, NN);
  m.b(scale(shop, 0.8), bu0 - 0.05, bu1 + 0.05, boardTop, boardTop + 0.08, 0, 0.2, NN);
  m.b(scale(shop, 0.8), bu0 - 0.04, bu1 + 0.04, boardBot - 0.05, boardBot, 0, 0.16, NN);
  {
    const sc = (bu0 + bu1) / 2;
    const yc = (boardBot + boardTop) / 2;
    const uv = signUv(signIdx);
    m.uvQuad(
      'sign',
      [sc - signW / 2, yc - signH / 2, SIGN_N],
      [sc + signW / 2, yc - signH / 2, SIGN_N],
      [sc + signW / 2, yc + signH / 2, SIGN_N],
      [sc - signW / 2, yc + signH / 2, SIGN_N],
      col('#ffffff'),
      uv.u0,
      uv.v0,
      uv.u1,
      uv.v1,
      [sc, yc, -1],
    );
  }
  if (ctx.avenue && chance(rs, 0.4)) bladeSign(ctx, seg, p[0], p[n], signIdx);

  // Pilasters.
  for (let k = 0; k <= n; k++) {
    const a = k === 0 ? p[0] : k === n ? p[n] - 0.14 : p[k] - 0.15;
    const b = k === 0 ? p[0] + 0.14 : k === n ? p[n] : p[k] + 0.15;
    m.b(shop, a, b, 0, gTop, -r, modern ? 0.02 : 0.07, NN | PY);
  }

  const doorIdx = seg.main || seg.side === 'back' ? Math.floor(n / 2) : -1;
  let entIdx = -1;
  if (seg.main && n >= 3 && !modern) entIdx = chance(rng, 0.5) ? 0 : n - 1;

  for (let k = 0; k < n; k++) {
    const a = p[k] + (k === 0 ? 0.14 : 0.15);
    const b = p[k + 1] - (k === n - 1 ? 0.14 : 0.15);
    if (b - a < 0.3) continue;
    const nG = -r + 0.03;
    if (k === entIdx) {
      // Building entrance to the flats above, in stone.
      skin(ctx, a, b, 0, gTop, { courses: look.rustic, plinth: false });
      const dw = Math.min(1.4, b - a - 0.3);
      const cu = (a + b) / 2;
      // The skin above already covers this bay; carve the door by drawing it proud of the skin.
      doorInSkin(ctx, cu - dw / 2, cu + dw / 2, 0, gTop - 0.25);
      continue;
    }
    if (k === doorIdx) {
      const dw = Math.min(1.1, b - a - 0.2);
      const cu = (a + b) / 2;
      const da = cu - dw / 2;
      const db = cu + dw / 2;
      const yD = Math.min(2.6, gTop - 0.5);
      // Glass door and side lights.
      pane(ctx, da, db, 0.02, yD, nG, { litChance: buildings.litWindowShareGround, dressing: false });
      frameBars(ctx, 'modern', da, db, 0.02, yD, nG, shop);
      m.b(shop, da + 0.06, db - 0.06, 0.0, 0.35, nG, nG + 0.06, NN);
      m.b(shop, a, b, yD, yD + 0.08, nG, nG + 0.08, NN);
      pane(ctx, a, b, yD + 0.08, gTop - 0.04, nG, { litChance: buildings.litWindowShareGround, dressing: false });
      for (const [sa, sb] of [
        [a, da - 0.02],
        [db + 0.02, b],
      ] as const) {
        if (sb - sa < 0.15) {
          m.b(shop, sa, sb, 0, yD, -r, -0.02, NN);
          continue;
        }
        m.b(shop, sa, sb, 0, 0.55, -r, -0.04, NN | NY);
        pane(ctx, sa, sb, 0.55, yD, nG, { litChance: buildings.litWindowShareGround, dressing: false });
      }
      m.b(shop, a, b, gTop - 0.08, gTop, nG, nG + 0.08, NN);
    } else {
      // Display window over a stall riser, with transom lights.
      m.b(shop, a, b, 0, 0.55, -r, -0.04, NN | NY);
      m.b(scale(shop, 1.25), a, b, 0.55, 0.6, -r, 0.0, NN);
      const lit = ctx.rngGlass() < buildings.litWindowShareGround;
      pane(ctx, a, b, 0.6, gTop, nG, { lit, dressing: false });
      frameBars(ctx, 'modern', a, b, 0.6, gTop, nG, shop);
      m.b(shop, a, b, gTop - 0.55, gTop - 0.48, nG, nG + 0.08, NN);
      if (b - a > 1.8) m.b(shop, (a + b) / 2 - 0.035, (a + b) / 2 + 0.035, 0.6, gTop - 0.55, nG, nG + 0.08, NN);
    }
    if (!terrace && k !== entIdx && (!modern || chance(rng, 0.5))) {
      awning(ctx, a - 0.04, b + 0.04, gTop - 0.02, 1.25, ctx.c.awning, !modern);
    }
  }

  if (terrace) {
    awning(ctx, p[0], p[n], gTop - 0.02, 1.38, ctx.c.awning, !modern);
    cafeTerrace(ctx, p[0], p[n]);
  }
}

/** Panelled door drawn in front of a solid skin bay (used for the flats entrance among shops). */
function doorInSkin(ctx: Ctx, a: number, b: number, y0: number, y1: number): void {
  const { m, c } = ctx;
  // Stone surround and a dark recess, then the door leaves pushed forward to the facade plane.
  m.b(c.trim, a - 0.16, b + 0.16, y0, y1 + 0.16, 0, 0.05, NN | NY);
  m.b(scale(c.door, 0.5), a, b, y0, y1, 0.05, 0.06, NN | NY);
  const color = c.door;
  const cu = (a + b) / 2;
  for (const [la, lb] of [
    [a + 0.06, cu - 0.01],
    [cu + 0.01, b - 0.06],
  ] as const) {
    m.b(color, la, lb, y0, y1 - 0.5, 0.06, 0.1, NN | NY);
    m.b(scale(color, 1.18), la + 0.08, lb - 0.08, y0 + 0.2, y1 - 0.7, 0.1, 0.12, NN | NY);
  }
  m.box(ctx.rngGlass() < 0.5 ? 'glassLit' : 'glass', ctx.c.glassTop, a + 0.06, b - 0.06, y1 - 0.45, y1 - 0.05, 0.06, 0.08);
  lantern(ctx, b + 0.35, 2.3);
}

/** Bistro tables and chairs on the sidewalk, within 1.5 m of the facade. */
function cafeTerrace(ctx: Ctx, a: number, b: number): void {
  const { m, rng } = ctx;
  const span = b - a;
  const max = Math.max(2, Math.min(4, Math.floor(span / 2.0)));
  const count = Math.max(2, int(rng, 2, max));
  const marble = col('#ece8e0');
  const chairCol = col(pick(rng, ['#b8894f', '#2f6b4f', '#8c2f2a', '#c9b48a', '#3a3a3a']));
  const iron = ctx.c.iron;
  for (let t = 0; t < count; t++) {
    const u = a + (span * (t + 0.5)) / count;
    const tn = 1.02;
    // Round-ish table top (octagon), pedestal and foot.
    const oct: [number, number][] = [];
    for (let k = 0; k < 8; k++) {
      const ang = (Math.PI * 2 * k) / 8 + Math.PI / 8;
      oct.push([u + Math.cos(ang) * 0.3, tn + Math.sin(ang) * 0.3]);
    }
    m.prismY(marble, oct, 0.72, 0.76, marble, marble);
    m.bar(iron, [u, 0.02, tn], [u, 0.72, tn], 0.05);
    m.b(iron, u - 0.2, u + 0.2, 0, 0.03, tn - 0.2, tn + 0.2, NY);
    // Two chairs facing the street, Paris style.
    for (const s of [-1, 1]) {
      const cu = u + s * 0.36;
      m.b(chairCol, cu - 0.19, cu + 0.19, 0.43, 0.47, 0.38, 0.74, 0);
      m.b(chairCol, cu - 0.19, cu + 0.19, 0.47, 0.9, 0.34, 0.38, 0);
      m.b(iron, cu - 0.19, cu - 0.16, 0, 0.43, 0.4, 0.72, PY | NY);
      m.b(iron, cu + 0.16, cu + 0.19, 0, 0.43, 0.4, 0.72, PY | NY);
    }
  }
  // Chalkboard menu at one end.
  const mu = chance(rng, 0.5) ? a + 0.25 : b - 0.25;
  m.b(col('#25292b'), mu - 0.28, mu + 0.28, 0.1, 0.95, 1.18, 1.24, 0);
  m.b(col('#6b4a2f'), mu - 0.3, mu + 0.3, 0.0, 0.1, 1.16, 1.26, NY);
}
