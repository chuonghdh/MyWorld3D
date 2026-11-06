// Rooftop items: AC units, tanks, skylights, huts, vents, antennas and solar (split from roof.ts).

import { NN, NY, col, scale, type P3 } from './mesh';
import { type Ctx } from './parts';
import { chance, int, pick, range } from './rng';
import { WIND, anchorWeight } from './polish';
import { Rect, parasol } from './roofFlat';

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

export function rooftopItems(ctx: Ctx, y: number, rect: Rect, count: number, placed: Rect[]): void {
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
export function rooftopExtras(ctx: Ctx, y: number, rect: Rect, placed: Rect[]): void {
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
