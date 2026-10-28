// Ground floors: shopfronts with fascia and striped awnings, cafe terraces, rusticated
// residential bases with arched or transomed entrances, brownstone stoops, tower lobbies.

import { NN, NY, PY, col, scale, type Col, type P3 } from './mesh';
import type { Segment } from './layout';
import { bayColumns, frameBars, pane, railN, railU, skin, type Ctx } from './parts';
import { windowUnit } from './upper';
import { chance, int, pick, range } from './rng';
import { SIGNS, pickSign, signUv } from '../signs';

/** Fascia board front and the lettering quad 3.5 cm in front of it (no shared plane). */
const SIGN_BOARD_N = 0.12;
const SIGN_N = SIGN_BOARD_N + 0.035;

export function groundFacade(ctx: Ctx, seg: Segment): void {
  if (ctx.spec.kind === 'tower') {
    towerLobby(ctx, seg);
    return;
  }
  if (ctx.ground === 'residential') residentialGround(ctx, seg);
  else shopfront(ctx, seg, ctx.ground === 'cafe' && seg.main);
}

/** Fake lettering on a sign band: a row of small blocks of varying width. */
function signLetters(ctx: Ctx, a: number, b: number, y0: number, y1: number, n: number, color: Col): void {
  const m = ctx.m;
  const avail = b - a - 0.6;
  if (avail < 0.8) return;
  const count = Math.min(11, Math.max(3, Math.floor(avail * range(ctx.rng, 0.7, 1.1))));
  const widths: number[] = [];
  for (let i = 0; i < count; i++) widths.push(range(ctx.rng, 0.1, 0.2));
  const gap = 0.06;
  let total = widths.reduce((s, w) => s + w, 0) + gap * (count - 1);
  const k = total > avail ? avail / total : 1;
  total *= k;
  let u = (a + b) / 2 - total / 2;
  const h = (y1 - y0) * 0.55;
  const yc = (y0 + y1) / 2;
  for (const w0 of widths) {
    const w = w0 * k;
    m.b(color, u, u + w, yc - h / 2, yc + h / 2, n, n + 0.03, NN);
    u += w + gap * k;
  }
}

/** Striped (or plain) fabric awning from the wall at yTop sloping out to `depth`. */
export function awning(ctx: Ctx, a: number, b: number, yTop: number, depth: number, color: Col, striped: boolean): void {
  const m = ctx.m;
  const drop = 0.55;
  const yb = yTop - drop;
  const count = striped ? Math.max(2, Math.round((b - a) / 0.26)) : 1;
  const sw = (b - a) / count;
  const slopeLen = Math.hypot(depth - 0.05, drop);
  const dir: P3 = [0, -drop / slopeLen, (depth - 0.05) / slopeLen];
  const nrm: P3 = [0, (depth - 0.05) / slopeLen, drop / slopeLen];
  const white = col('#f1ece0');
  for (let k = 0; k < count; k++) {
    const s0 = a + k * sw;
    const c = striped && k % 2 === 1 ? white : color;
    const ctr: P3 = [s0 + sw / 2, (yTop + yb) / 2 + nrm[1] * 0.015, (0.05 + depth) / 2 + nrm[2] * 0.015];
    m.obox('body', c, ctr, [sw / 2, 0, 0], [dir[0] * slopeLen / 2, dir[1] * slopeLen / 2, dir[2] * slopeLen / 2], [0, nrm[1] * 0.015, nrm[2] * 0.015], k !== 0 && k !== count - 1);
    // Valance.
    m.b(c, s0, s0 + sw, yb - 0.24, yb, depth - 0.025, depth + 0.005, PY);
  }
  // Folding arms.
  const iron = ctx.c.iron;
  m.bar(iron, [a + 0.15, yTop - 0.95, 0.02], [a + 0.15, yb - 0.02, depth - 0.1], 0.035);
  m.bar(iron, [b - 0.15, yTop - 0.95, 0.02], [b - 0.15, yb - 0.02, depth - 0.1], 0.035);
}

/** Two-leaf panelled door with casing, set back in the reveal. */
function doorLeaves(ctx: Ctx, a: number, b: number, y0: number, y1: number, color: Col): void {
  const m = ctx.m;
  const r = ctx.look.r;
  const nD = -r + 0.02;
  const cu = (a + b) / 2;
  const casing = scale(color, 0.75);
  m.b(casing, a, a + 0.08, y0, y1, nD, nD + 0.09, NN | NY);
  m.b(casing, b - 0.08, b, y0, y1, nD, nD + 0.09, NN | NY);
  const twoLeaves = b - a > 1.15;
  const leaves: [number, number][] = twoLeaves ? [[a + 0.08, cu - 0.01], [cu + 0.01, b - 0.08]] : [[a + 0.08, b - 0.08]];
  for (const [la, lb] of leaves) {
    m.b(color, la, lb, y0, y1, nD, nD + 0.06, NN | NY);
    const h = y1 - y0;
    const lighter = scale(color, 1.18);
    m.b(lighter, la + 0.09, lb - 0.09, y0 + 0.15, y0 + h * 0.42, nD + 0.06, nD + 0.085, NN | NY);
    m.b(lighter, la + 0.09, lb - 0.09, y0 + h * 0.5, y1 - 0.15, nD + 0.06, nD + 0.085, NN | NY);
  }
  const brass = col('#c9a54a');
  const hu = twoLeaves ? cu : b - 0.2;
  m.b(brass, hu - 0.05, hu + 0.05, y0 + 1.0, y0 + 1.12, nD + 0.06, nD + 0.12, NN | NY);
}

/** Wall lantern beside an entrance (always lit at night). */
function lantern(ctx: Ctx, u: number, y: number): void {
  const m = ctx.m;
  m.b(ctx.c.iron, u - 0.03, u + 0.03, y - 0.05, y + 0.05, 0, 0.18, NN);
  m.b(ctx.c.iron, u - 0.11, u + 0.11, y + 0.24, y + 0.3, 0.06, 0.3);
  m.box('glassLit', col('#f3d9a0'), u - 0.08, u + 0.08, y - 0.05, y + 0.24, 0.09, 0.27);
}

/** Entrance door of the requested style in an opening a..b from y0 to yTop. */
function entrance(ctx: Ctx, a: number, b: number, y0: number, yTop: number, style: 'arch' | 'transom' | 'stoop' | 'modern'): void {
  const { m, c, look } = ctx;
  const r = look.r;
  const cu = (a + b) / 2;
  const door = c.door;
  if (style === 'arch') {
    const R = (b - a) / 2;
    const yS = yTop - R;
    const K = 8;
    const infill = look.rustic ? scale(c.wall, 0.98) : c.wall;
    for (let k = 0; k < K; k++) {
      const t0 = Math.PI - (Math.PI * k) / K;
      const t1 = Math.PI - (Math.PI * (k + 1)) / K;
      const u0 = cu + Math.cos(t0) * R;
      const u1 = cu + Math.cos(t1) * R;
      m.prismUY(infill, [[u0, yS + Math.sin(t0) * R], [u1, yS + Math.sin(t1) * R], [u1, yTop + 0.001], [u0, yTop + 0.001]], -r, 0);
    }
    pane(ctx, a, b, yS, yTop, -r + 0.02, { dressing: false });
    // The three fan bars meet at the hub; each sits at its own depth (2.5 cm steps) so they never share a face plane.
    [Math.PI * 0.25, Math.PI * 0.5, Math.PI * 0.75].forEach((t, k) => {
      const nb = -r + 0.05 + k * 0.025;
      m.bar(c.iron, [cu, yS, nb], [cu + Math.cos(t) * (R - 0.03), yS + Math.sin(t) * (R - 0.03), nb], 0.035);
    });
    m.b(c.iron, a, b, yS - 0.06, yS, -r + 0.02, -r + 0.1, NN);
    doorLeaves(ctx, a, b, y0, yS - 0.06, door);
    m.b(c.trim, cu - 0.15, cu + 0.15, yTop - 0.28, yTop + 0.14, 0, 0.09, NN);
    if (!look.rustic) {
      // Arch surround (archivolt) for plain walls.
      for (let k = 0; k < K; k++) {
        const t0 = Math.PI - (Math.PI * k) / K;
        const t1 = Math.PI - (Math.PI * (k + 1)) / K;
        const R2 = R + 0.14;
        m.prismUY(
          c.trim,
          [
            [cu + Math.cos(t0) * R, yS + Math.sin(t0) * R],
            [cu + Math.cos(t0) * R2, yS + Math.sin(t0) * R2],
            [cu + Math.cos(t1) * R2, yS + Math.sin(t1) * R2],
            [cu + Math.cos(t1) * R, yS + Math.sin(t1) * R],
          ],
          0,
          0.035,
        );
      }
    }
    return;
  }
  if (style === 'modern') {
    const nG = -r + 0.03;
    pane(ctx, a, b, y0, yTop, nG, { dressing: false });
    frameBars(ctx, 'modern', a, b, y0, yTop, nG);
    m.b(c.frame, cu - 0.025, cu + 0.025, y0, yTop, nG, nG + 0.05, NN);
    m.b(scale(c.white, 0.9), a - 0.45, b + 0.45, yTop + 0.25, yTop + 0.37, -0.05, 1.15, NN);
    return;
  }
  // Transom door (also used on the stoop).
  const yT = yTop - 0.6;
  doorLeaves(ctx, a, b, y0, yT, door);
  m.b(scale(door, 0.75), a, b, yT, yT + 0.08, -r + 0.02, -r + 0.11, NN);
  pane(ctx, a + 0.06, b - 0.06, yT + 0.08, yTop - 0.04, -r + 0.02, { dressing: false });
  for (const t of [1 / 3, 2 / 3]) {
    const u = a + (b - a) * t;
    m.b(scale(door, 0.75), u - 0.02, u + 0.02, yT + 0.08, yTop - 0.04, -r + 0.02, -r + 0.07, NN);
  }
  if (!ctx.modern) {
    // Hood on two consoles.
    m.b(c.cornice, a - 0.3, b + 0.3, yTop + 0.12, yTop + 0.26, 0, 0.32, NN);
    for (const u of [a - 0.18, b + 0.18]) m.b(c.trim, u - 0.08, u + 0.08, yTop - 0.35, yTop + 0.12, 0, 0.22, NN);
  }
}

/** Projecting blade sign on an iron bracket near a corner of the shopfront; double sided. */
function bladeSign(ctx: Ctx, seg: Segment, pa: number, pb: number, signIdx: number): void {
  const { m, c } = ctx;
  const rs = ctx.rngSign;
  const left = seg.startTurn === null && seg.endTurn !== null ? true : seg.endTurn === null && seg.startTurn !== null ? false : chance(rs, 0.5);
  const ub = left ? pa - 0.27 : pb + 0.27;
  const y0 = 3.05;
  const bh = 0.38;
  const bw = 1.1;
  const nNear = 0.2;
  const nFar = nNear + bw;
  const iron = c.iron;
  const uv = signUv(signIdx);
  const white = col('#ffffff');
  m.bar(iron, [ub, y0 + bh + 0.22, 0.0], [ub, y0 + bh + 0.22, nFar + 0.05], 0.04);
  // Rods hang from the underside of the arm (they stop at its bottom face, not inside it).
  m.bar(iron, [ub, y0 + bh + 0.2, nFar - 0.1], [ub, y0 + bh, nFar - 0.1], 0.015);
  m.bar(iron, [ub, y0 + bh + 0.2, nNear + 0.1], [ub, y0 + bh, nNear + 0.1], 0.015);
  m.b(scale(iron, 1.2), ub - 0.025, ub + 0.025, y0, y0 + bh, nNear, nFar, 0);
  const t = 0.05;
  const nm = (nNear + nFar) / 2;
  const yc = y0 + bh / 2;
  m.uvQuad('sign', [ub + t, y0, nFar], [ub + t, y0, nNear], [ub + t, y0 + bh, nNear], [ub + t, y0 + bh, nFar], white, uv.u0, uv.v0, uv.u1, uv.v1, [ub - 1, yc, nm]);
  m.uvQuad('sign', [ub - t, y0, nNear], [ub - t, y0, nFar], [ub - t, y0 + bh, nFar], [ub - t, y0 + bh, nNear], white, uv.u0, uv.v0, uv.u1, uv.v1, [ub + 1, yc, nm]);
}

/** Shopfront ground floor; with `terrace`, a cafe with tables on the sidewalk. */
function shopfront(ctx: Ctx, seg: Segment, terrace: boolean): void {
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
      pane(ctx, da, db, 0.02, yD, nG, { litChance: 0.55, dressing: false });
      frameBars(ctx, 'modern', da, db, 0.02, yD, nG, shop);
      m.b(shop, da + 0.06, db - 0.06, 0.0, 0.35, nG, nG + 0.06, NN);
      m.b(shop, a, b, yD, yD + 0.08, nG, nG + 0.08, NN);
      pane(ctx, a, b, yD + 0.08, gTop - 0.04, nG, { litChance: 0.55, dressing: false });
      for (const [sa, sb] of [
        [a, da - 0.02],
        [db + 0.02, b],
      ] as const) {
        if (sb - sa < 0.15) {
          m.b(shop, sa, sb, 0, yD, -r, -0.02, NN);
          continue;
        }
        m.b(shop, sa, sb, 0, 0.55, -r, -0.04, NN | NY);
        pane(ctx, sa, sb, 0.55, yD, nG, { litChance: 0.55, dressing: false });
      }
      m.b(shop, a, b, gTop - 0.08, gTop, nG, nG + 0.08, NN);
    } else {
      // Display window over a stall riser, with transom lights.
      m.b(shop, a, b, 0, 0.55, -r, -0.04, NN | NY);
      m.b(scale(shop, 1.25), a, b, 0.55, 0.6, -r, 0.0, NN);
      const lit = ctx.rngGlass() < 0.55;
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

/** Residential ground floor: rusticated base, entrance, barred windows, stoop or steps. */
function residentialGround(ctx: Ctx, seg: Segment): void {
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
function towerLobby(ctx: Ctx, seg: Segment): void {
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
    pane(ctx, a + k * pw, a + (k + 1) * pw, 0.05, glassTop, nG, { litChance: 0.6, dressing: false });
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

