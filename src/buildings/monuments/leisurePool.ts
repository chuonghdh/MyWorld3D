// Leisure monument: swimming pool (split from leisure.ts).

import * as THREE from 'three';
import { WIND, anchorWeight } from '../facade/polish';
import { cypress, flagpole, lamp, lettering, person, planter, waterBasin, windowAt, type C, type Kit, type Site } from './kit';
import { buildings } from '../../config/tuning';
import { PI, TAU } from './leisureSport';

// ---------------------------------------------------------------------------
// Swimming pool: Art Deco lido with pools, lane ropes, diving tower, cabins, loungers.
// ---------------------------------------------------------------------------
export function swimmingPool(k: Kit, s: Site): void {
  const white = '#f3efe7';
  const deco = k.pick(['#2f6b8f', '#3f8f8a', '#24395c']);
  const accent = k.pick(['#e2b66c', '#e8b4a8', '#c9cfae']);
  const water = '#3fc1c9';
  const deckC = '#e8dfcc';
  const bd = 4.5;
  const bz1 = s.hd - 1.8;
  const bz0 = bz1 - bd;
  const dz0 = -s.hd + 1;
  const dx = s.hw - 1;
  const deckY = 0.45;

  // Pools are recessed basins (waterBasin): the deck is cut open under each outer footprint.
  const poolCoping = 0.45; // coping width
  const POOL_DEPTH = 0.4; // pit depth below deck top; the water surface sits at 0.6 of it
  const waterTop = deckY - POOL_DEPTH * 0.6;
  const pool = (x0: number, x1: number, z0: number, z1: number, c: string): void => {
    const w = x1 - x0 + 2 * poolCoping;
    const d = z1 - z0 + 2 * poolCoping;
    k.at((x0 + x1) / 2, (z0 + z1) / 2, 0, () => waterBasin(k, { w, d, coping: poolCoping }, POOL_DEPTH, c), deckY);
  };
  // Main pool with lanes.
  const px = Math.min(10, s.hw - 6);
  const pz0 = -5;
  const lanes = 6;
  const lw = 1.5;
  const pz1 = pz0 + lanes * lw;
  // Diving pool and paddling pool (square basin, inner half-size padR).
  const dpx0 = -px - 1;
  const dpx1 = -2.5;
  const dpz0 = dz0 + 2.6;
  const dpz1 = pz0 - 2.2;
  const ppx = s.hw - 7;
  const ppz = (dpz0 + dpz1) / 2;
  const padR = 2.55;
  const holes: [number, number, number, number][] = [
    [-px - poolCoping, px + poolCoping, pz0 - poolCoping, pz1 + poolCoping],
    [dpx0 - poolCoping, dpx1 + poolCoping, dpz0 - poolCoping, dpz1 + poolCoping],
    [ppx - padR - poolCoping, ppx + padR + poolCoping, ppz - padR - poolCoping, ppz + padR + poolCoping],
  ];
  const xs = [...new Set([-dx, dx, ...holes.flatMap((h) => [h[0], h[1]])])].sort((a, b) => a - b);
  const zs = [...new Set([dz0, bz0, ...holes.flatMap((h) => [h[2], h[3]])])].sort((a, b) => a - b);
  for (let i = 0; i + 1 < xs.length; i++) {
    for (let j = 0; j + 1 < zs.length; j++) {
      const mx = (xs[i] + xs[i + 1]) / 2;
      const mz = (zs[j] + zs[j + 1]) / 2;
      if (holes.some((h) => mx > h[0] && mx < h[1] && mz > h[2] && mz < h[3])) continue;
      k.box(deckC, xs[i + 1] - xs[i], deckY, zs[j + 1] - zs[j], mx, 0, mz);
    }
  }
  // Back wall.
  k.box(white, 2 * dx, 1.8, 0.3, 0, 0, dz0 - 0.15);
  k.box(deco, 2 * dx + 0.1, 0.15, 0.4, 0, 1.8, dz0 - 0.15);

  pool(-px, px, pz0, pz1, water);
  const segN = Math.round(px);
  for (let l = 1; l < lanes; l++) {
    const z = pz0 + l * lw;
    for (let i = 0; i < segN; i++) {
      k.box(i % 2 === 0 ? '#d7263d' : '#ffffff', (2 * px) / segN - 0.05, 0.08, 0.1, -px + ((i + 0.5) * 2 * px) / segN, waterTop + 0.01, z);
    }
  }
  for (let l = 0; l < lanes; l++) {
    const z = pz0 + (l + 0.5) * lw;
    k.box(white, 0.6, 0.4, 0.6, px + 0.75, deckY, z);
    k.box(deco, 0.62, 0.1, 0.62, px + 0.75, deckY + 0.4, z);
    k.box('#24395c', 2 * px - 2, 0.01, 0.2, 0, deckY - POOL_DEPTH + 0.002, z);
  }
  for (const x of [-px + 1.5, px - 1.5]) {
    for (const dzz of [-0.3, 0.3]) k.beam('#c9ccd0', [x + dzz, deckY, pz1 + 0.15], [x + dzz, deckY + 0.9, pz1 + 0.35], 0.06);
  }

  // Diving pool and Art Deco diving tower.
  pool(dpx0, dpx1, dpz0, dpz1, '#2a9fb0');
  const tx = (dpx0 + dpx1) / 2;
  const tz = dz0 + 0.9;
  for (const lx of [-1.2, 1.2]) k.box(white, 0.6, 6.2, 0.9, tx + lx, deckY, tz);
  for (const [h, len] of [
    [1.6, 2.2],
    [3.6, 2.6],
    [5.6, 3.0],
  ] as const) {
    k.box(white, 2.8, 0.25, len, tx, deckY + h, tz + len / 2 - 0.3);
    k.box(deco, 2.85, 0.08, len, tx, deckY + h - 0.05, tz + len / 2 - 0.3);
    for (const lx of [-1.35, 1.35]) k.box('#c9ccd0', 0.05, 0.9, len - 0.4, tx + lx, deckY + h + 0.25, tz + len / 2 - 0.5);
  }
  k.box(deco, 3.2, 0.5, 1.0, tx, deckY + 6.2, tz);
  k.beam('#c9ccd0', [tx + 2.0, deckY, tz + 0.5], [tx + 1.5, deckY + 5.6, tz], 0.5, 'body', 0.1);
  // Paddling pool (square basin) with a mushroom fountain standing on the pit floor.
  pool(ppx - padR, ppx + padR, ppz - padR, ppz + padR, '#7fd6dc');
  k.cyl(white, 0.15, 0.2, 1.4 + POOL_DEPTH, ppx, deckY - POOL_DEPTH, ppz, 6);
  k.cone(deco, 1.0, 0.4, ppx, deckY + 1.3, ppz, 10);

  // Loungers and parasols.
  const lounger = (x: number, z: number, ry: number): void => {
    k.at(x, z, ry, () => {
      k.box('#ffffff', 0.7, 0.3, 1.3, 0, deckY, -0.2);
      k.boxR('body', '#ffffff', 0.7, 0.08, 0.8, [0, deckY + 0.55, 0.65], [0.6, 0, 0]);
      k.box(k.pick(['#2f6b8f', '#e2b66c', '#e8b4a8', '#efeee8']), 0.62, 0.06, 1.2, 0, deckY + 0.3, -0.2);
    });
  };
  const parasol = (x: number, z: number, c: C): void => {
    k.cyl('#efeee8', 0.04, 0.04, 2.3, x, deckY, z, 4);
    const nn = 8;
    // Canopy rim flutters; the pole is rigid.
    k.withWind(WIND.PARASOL, (_x, y) => anchorWeight(y, deckY + 2.8, deckY + 2.3), () => {
      for (let i = 0; i < nn; i++) {
        k.add('body', new THREE.ConeGeometry(1.3, 0.5, 2, 1, true, (i / nn) * TAU, TAU / nn), i % 2 === 0 ? c : '#ffffff', [x, deckY + 2.3 + 0.25, z]);
      }
    });
  };
  const lz = pz1 + 2.2;
  for (let i = 0; i < 8; i++) {
    const x = -px + 1 + i * ((2 * px - 2) / 7);
    lounger(x, lz, PI);
    if (i % 2 === 1) parasol(x + 1.2, lz + 0.4, k.pick([deco, '#d7263d', accent]));
    if (k.chance(buildings.poolLoungerPersonShare)) person(k, x + 0.5, lz - 1.3, k.range(0, TAU));
  }
  for (let i = 0; i < 3; i++) {
    lounger(ppx - 5, ppz - 1.5 + i * 1.4, PI / 2);
  }
  parasol(ppx - 5, ppz + 2.9, deco);

  // Changing cabins along both sides, facing the pools.
  const cabinColors = ['#e8b4a8', '#b9cfdc', '#c9cfae', '#efc3a0', '#f2e3a0'];
  const cw = 1.6;
  const cn = Math.floor((bz0 - 0.5 - (dz0 + 0.5)) / cw);
  for (const side of [-1, 1]) {
    const x = side * (dx - 0.9);
    for (let i = 0; i < cn; i++) {
      const z = dz0 + 0.5 + (i + 0.5) * cw;
      k.at(x, z, -side * PI / 2, () => {
        k.box(white, cw - 0.06, 2.3, 1.6, 0, deckY, -0.1);
        k.box(cabinColors[i % cabinColors.length], 0.9, 1.9, 0.08, 0, deckY, 0.72);
        k.box(white, cw + 0.02, 0.15, 2.0, 0, deckY + 2.3, 0.1);
        k.box(deco, cw + 0.02, 0.08, 2.02, 0, deckY + 2.2, 0.1);
      });
    }
    // swimmers walking on the deck
    person(k, side * (px + 2.2), k.range(pz0, pz1), k.range(0, TAU), '#2f6b8f');
  }
  // Swimmers in the water (heads and shoulders).
  for (let i = 0; i < 5; i++) {
    const z = pz0 + (Math.floor(k.rng() * lanes) + 0.5) * lw;
    k.blob('#e8c4a0', 0.12, k.range(-px + 1, px - 1), waterTop + 0.03, z);
  }

  // Entrance pavilion, Art Deco, with a stepped central tower.
  const bw = Math.min(22, s.W - 8);
  const bh = 5;
  const bcz = (bz0 + bz1) / 2;
  k.box(white, bw, bh, bd, 0, 0, bcz);
  for (const y of [1.0, bh - 0.4]) k.box(deco, bw + 0.1, 0.22, bd + 0.1, 0, y, bcz);
  k.box(white, bw + 0.4, 0.3, bd + 0.4, 0, bh, bcz);
  for (const face of [1, -1]) {
    k.at(0, bcz + (face * bd) / 2, face > 0 ? 0 : PI, () => {
      for (const sx of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          k.glass(k.chance(buildings.poolFacadeLitShare), 2.4, 1.1, 0.06, sx * (4.2 + i * 2.7), 2.4, 0.0, '#3a4a58');
          k.box(white, 2.6, 0.12, 0.25, sx * (4.2 + i * 2.7), 2.3, 0.12);
        }
      }
    });
  }
  // Railing on the roof terrace.
  k.box('#c9ccd0', bw, 0.06, 0.06, 0, bh + 1.1, bz1 - 0.1);
  k.box('#c9ccd0', bw, 0.06, 0.06, 0, bh + 1.1, bz0 + 0.1);
  // Tower: stepped, with fins, portholes and lit lettering.
  const tw = 5;
  k.box(white, tw, 9, tw, 0, 0, bcz + 0.4);
  k.box(white, tw - 0.8, 1.4, tw - 0.8, 0, 9, bcz + 0.4);
  k.box(white, tw - 1.8, 1.0, tw - 1.8, 0, 10.4, bcz + 0.4);
  k.box(deco, 0.4, 2.0, 0.4, 0, 11.4, bcz + 0.4);
  k.at(0, bcz + 0.4 + tw / 2, 0, () => {
    for (const x of [-1.4, 0, 1.4]) k.box(deco, 0.3, 4.2, 0.3, x, 3.9, 0.15);
    k.glass(true, 2.6, 2.8, 0.06, 0, 0, 0.0, '#4a6a7a');
    k.box(deco, 3.2, 0.3, 0.6, 0, 2.8, 0.3);
    lettering(k, 0, 8.3, 0.0, 3.4, 0.55, '#ffffff', true);
    for (const x of [-0.8, 0.8]) k.add('glass', new THREE.CylinderGeometry(0.32, 0.32, 0.08, 12), '#3a4a58', [x, 3.6 + 0.3, 0.02], [PI / 2, 0, 0]);
    windowAt(k, 0, 5.0, 0.9, 1.2, true, { frame: white });
  });
  // Plaza: palms in planters, lamps, flags, queue.
  for (const sx of [-1, 1]) {
    planter(k, sx * 4.2, s.hd - 0.9, 1.2, 1.2, true);
    cypress(k, sx * (bw / 2 + 1.0), s.hd - 1.5, 7);
    lamp(k, sx * 6.5, s.hd - 1.0);
    flagpole(k, sx * (bw / 2 - 1), bz0 - 0.6, bh + 3, sx < 0 ? deco : accent);
  }
  for (let i = 0; i < 4; i++) person(k, -1.6 + i * 0.75, s.hd - 0.8, PI);
}
