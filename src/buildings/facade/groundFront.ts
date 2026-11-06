// Ground floor parts (split from ground.ts): sign lettering, awnings, doors, lanterns, entrances, blade signs.

import { NN, NY, PY, col, scale, type Col, type P3 } from './mesh';
import type { Segment } from './layout';
import { frameBars, pane, type Ctx } from './parts';
import { chance, range } from './rng';
import { signUv } from '../signs';
import { WIND, anchorWeight } from './polish';
import { shopfront } from './groundShopfront';
import { residentialGround, towerLobby } from './groundResidential';

/** Fascia board front and the lettering quad 3.5 cm in front of it (no shared plane). */
export const SIGN_BOARD_N = 0.12;
export const SIGN_N = SIGN_BOARD_N + 0.035;

export function groundFacade(ctx: Ctx, seg: Segment): void {
  if (ctx.spec.kind === 'tower') {
    towerLobby(ctx, seg);
    return;
  }
  if (ctx.ground === 'residential') residentialGround(ctx, seg);
  else shopfront(ctx, seg, ctx.ground === 'cafe' && seg.main);
}

/** Fake lettering on a sign band: a row of small blocks of varying width. */
export function signLetters(ctx: Ctx, a: number, b: number, y0: number, y1: number, n: number, color: Col): void {
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
  // The fabric flutters in the wind: fixed at the wall (n = 0.05), free at the front edge.
  m.withWind(WIND.AWNING, (_u, _y, n) => anchorWeight(n, 0.05, depth), () => {
  for (let k = 0; k < count; k++) {
    const s0 = a + k * sw;
    const c = striped && k % 2 === 1 ? white : color;
    const ctr: P3 = [s0 + sw / 2, (yTop + yb) / 2 + nrm[1] * 0.015, (0.05 + depth) / 2 + nrm[2] * 0.015];
    m.obox('body', c, ctr, [sw / 2, 0, 0], [dir[0] * slopeLen / 2, dir[1] * slopeLen / 2, dir[2] * slopeLen / 2], [0, nrm[1] * 0.015, nrm[2] * 0.015], k !== 0 && k !== count - 1);
    // Valance.
    m.b(c, s0, s0 + sw, yb - 0.24, yb, depth - 0.025, depth + 0.005, PY);
  }
  });
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
export function lantern(ctx: Ctx, u: number, y: number): void {
  const m = ctx.m;
  m.b(ctx.c.iron, u - 0.03, u + 0.03, y - 0.05, y + 0.05, 0, 0.18, NN);
  m.b(ctx.c.iron, u - 0.11, u + 0.11, y + 0.24, y + 0.3, 0.06, 0.3);
  m.box('glassLit', col('#f3d9a0'), u - 0.08, u + 0.08, y - 0.05, y + 0.24, 0.09, 0.27);
}

/** Entrance door of the requested style in an opening a..b from y0 to yTop. */
export function entrance(ctx: Ctx, a: number, b: number, y0: number, yTop: number, style: 'arch' | 'transom' | 'stoop' | 'modern'): void {
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
export function bladeSign(ctx: Ctx, seg: Segment, pa: number, pb: number, signIdx: number): void {
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
  const t = 0.05;
  const nm = (nNear + nFar) / 2;
  const yc = y0 + bh / 2;
  // Rods, board and both sign faces swing together: fixed under the arm, free at the bottom edge.
  m.withWind(WIND.BLADE, (_u, y) => anchorWeight(y, y0 + bh + 0.2, y0), () => {
  m.bar(iron, [ub, y0 + bh + 0.2, nFar - 0.1], [ub, y0 + bh, nFar - 0.1], 0.015);
  m.bar(iron, [ub, y0 + bh + 0.2, nNear + 0.1], [ub, y0 + bh, nNear + 0.1], 0.015);
  m.b(scale(iron, 1.2), ub - 0.025, ub + 0.025, y0, y0 + bh, nNear, nFar, 0);
  m.uvQuad('sign', [ub + t, y0, nFar], [ub + t, y0, nNear], [ub + t, y0 + bh, nNear], [ub + t, y0 + bh, nFar], white, uv.u0, uv.v0, uv.u1, uv.v1, [ub - 1, yc, nm]);
  m.uvQuad('sign', [ub - t, y0, nNear], [ub - t, y0, nFar], [ub - t, y0 + bh, nFar], [ub - t, y0 + bh, nNear], white, uv.u0, uv.v0, uv.u1, uv.v1, [ub + 1, yc, nm]);
  });
}
