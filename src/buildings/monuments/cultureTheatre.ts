// Culture monument: open-air theatre (split from culture.ts).

import type { V3 } from '../geometry';
import { bulbs, cypress, lamp, lettering, planter, tiers, tint, type Kit, type Site } from './kit';
import { buildings } from '../../config/tuning';
import { PI } from './culturePrehistoric';

// ---------------------------------------------------------------------------
// Open-air theatre: semicircular stone cavea, stage with columned backdrop, lights.
// ---------------------------------------------------------------------------
export function openAirTheatre(k: Kit, s: Site): void {
  const stone = k.pick(['#d8cdb5', '#d9c9a8', '#cfc7b6']);
  const stone2 = tint(stone, -0.04);
  const aisle = tint(stone, -0.1);
  const cz = -s.hd + 9;
  const a0 = 5.5;
  const rows = 10;
  const step = Math.min(0.95, (Math.min(s.hw - 1.2, s.hd - 1.5 - cz) - a0) / rows);
  const rise = 0.42;
  const segs = 30;
  const H = tiers(k, {
    cx: 0, cz, a0, b0: a0, step, rise, rows, th0: 0, th1: PI, segs, caps: true,
    seat: (i, r) => (i % 6 === 3 ? aisle : r === 5 ? tint(stone, -0.07) : r % 2 === 0 ? stone : stone2),
    riser: tint(stone, -0.12),
    outer: tint(stone, -0.05),
  });
  const R1 = a0 + rows * step;

  // Colonnade along the top of the cavea, with lights strung between columns.
  const nc = 15;
  let prev: V3 | null = null;
  for (let i = 0; i <= nc; i++) {
    const th = (i / nc) * PI;
    const x = (R1 - 0.4) * Math.cos(th);
    const z = cz + (R1 - 0.4) * Math.sin(th);
    k.cyl(stone, 0.26, 0.3, 3.6, x, H, z, 8);
    k.box(stone2, 0.7, 0.25, 0.7, x, H + 3.6, z);
    const top: V3 = [x, H + 3.98, z];
    if (prev) {
      k.beam(stone, prev, top, 0.55, 'body', 0.75);
      if (i % 2 === 0) bulbs(k, [prev[0], H + 3.6, prev[2]], [x, H + 3.6, z], 4, 0.35);
    }
    prev = top;
  }
  // Orchestra floor and main gate at the back of the cavea.
  k.cyl(tint(stone, 0.05), a0, a0, 0.05, 0, 0, cz, 24);
  k.at(0, cz + R1, 0, () => {
    k.box(stone2, 4.2, H + 1.2, 0.8, 0, 0, 0.3);
    k.glass(false, 2.0, 2.8, 0.06, 0, 0, 0.72, '#2a2420');
    k.box(stone, 2.6, 0.4, 0.3, 0, 2.8, 0.75);
    lettering(k, 0, H - 0.6, 0.72, 3.2, 0.5, '#5a4a3a', false);
  });

  // Stage.
  const sw = Math.min(18, 2 * s.hw - 8);
  const sz1 = cz - 0.6;
  const sz0 = Math.max(-s.hd + 2.8, cz - 6.5);
  const sd = sz1 - sz0;
  k.box(stone2, sw, 1.1, sd, 0, 0, (sz0 + sz1) / 2);
  k.box('#8a6a45', sw - 0.2, 0.08, sd - 0.1, 0, 1.1, (sz0 + sz1) / 2);
  for (let i = 0; i < 3; i++) k.box(stone, 4 - i * 0.4, 0.37, 0.4, 0, i * 0.37, sz1 + 0.6 - i * 0.4);
  for (let i = 0; i < 12; i++) k.glass(true, 0.25, 0.12, 0.2, -sw / 2 + 0.8 + i * ((sw - 1.6) / 11), 1.1, sz1 - 0.15, '#fff1c4');

  // Scaenae frons: backdrop wall with two storeys of columns, doors and a pediment.
  const bw = sw + 2;
  const bz = sz0 - 0.5;
  k.box(stone, bw, 10, 1.0, 0, 0, bz);
  k.box(stone2, bw + 0.4, 0.5, 1.4, 0, 10, bz);
  // Plinth course on the wings (the stage hides the centre) and a shadow course under the cornice.
  for (const sx of [-1, 1]) k.box(stone2, 1.2, 1.1, 1.4, sx * (sw / 2 + 0.6), 0, bz);
  k.box(stone, bw + 0.2, 0.25, 1.2, 0, 9.75, bz);
  k.at(0, bz + 0.5, 0, () => {
    for (const [x, w, h] of [[-5.5, 1.8, 3.2], [0, 2.6, 3.8], [5.5, 1.8, 3.2]] as const) {
      k.glass(x === 0 && k.chance(buildings.theatreDoorLitShare), w, h, 0.06, x, 1.1, 0.0, '#2a2420');
      k.box(stone2, w + 0.6, 0.4, 0.3, x, 1.1 + h, 0.15);
    }
    const nCol = 8;
    for (const [y0, h] of [[1.1, 4.0], [5.6, 3.4]] as const) {
      for (let i = 0; i < nCol; i++) {
        const x = -bw / 2 + 1.2 + (i * (bw - 2.4)) / (nCol - 1);
        k.box(stone2, 0.7, 0.25, 0.7, x, y0, 1.0);
        k.cyl(stone, 0.24, 0.28, h - 0.5, x, y0 + 0.25, 1.0, 8);
        k.box(stone2, 0.7, 0.25, 0.7, x, y0 + h - 0.25, 1.0);
      }
      k.box(stone, bw - 1.2, 0.45, 1.6, 0, y0 + h, 0.7);
    }
    for (const x of [-5.5, 5.5, -2.5, 2.5]) k.glass(false, 0.9, 1.9, 0.06, x, 6.3, 0.0, '#3a3430');
    k.gableRoof(stone, 4.6, 1.3, 1.6, 0, 5.55, 0.8);
    k.gableRoof(stone2, bw * 0.45, 1.8, 1.4, 0, 10.5, 0.2);
  });

  // Lighting towers either side of the stage.
  for (const sx of [-1, 1]) {
    const x = sx * (sw / 2 + 1.5);
    const z = cz - 1.5;
    k.box('#3a3d42', 0.4, 9, 0.4, x, 0, z);
    k.box('#3a3d42', 1.6, 0.2, 0.6, x, 9, z);
    k.at(x, z, sx > 0 ? -PI / 2 - 0.6 : PI / 2 + 0.6, () => {
      for (let i = 0; i < 3; i++) {
        k.box('#22262a', 0.45, 0.45, 0.5, -0.5 + i * 0.5, 8.4, 0.3);
        k.glass(true, 0.32, 0.32, 0.06, -0.5 + i * 0.5, 8.47, 0.56, '#fff7dc');
      }
    });
  }

  // Cypresses, planters, audience, lamps.
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) cypress(k, x * (s.hw - 1.5), z > 0 ? s.hd - 1.8 : -s.hd + 1.5, 8.5);
  // Seated audience on the rows, facing the stage.
  for (let i = 0; i < buildings.theatreAudienceCount; i++) {
    const r = Math.floor(k.range(0, rows - 1));
    const th = k.range(0.15, PI - 0.15);
    const rr = a0 + (r + 0.5) * step;
    const y = (r + 1) * rise;
    k.at(rr * Math.cos(th), cz + rr * Math.sin(th), Math.atan2(-Math.cos(th), -Math.sin(th)), () => {
      k.box(k.pick(['#b03a2e', '#24395c', '#2f6b4f', '#e2b66c', '#efeee8']), 0.44, 0.6, 0.3, 0, y, 0);
      k.box('#e8c4a0', 0.22, 0.24, 0.22, 0, y + 0.6, 0);
    });
  }
  for (const sx of [-1, 1]) {
    planter(k, sx * 6, s.hd - 1.2, 1.8, 1.0, true);
    lamp(k, sx * 3.2, s.hd - 1.4);
  }
}
