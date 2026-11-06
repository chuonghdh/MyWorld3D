// Civic monument: hospital (split from civic.ts).

import { ambulance, bench, crowd, flagpole, lamp, lettering, person, planter, tree, waterBasin, wing, type Kit, type Site } from './kit';
import { buildings } from '../../config/tuning';

export const PI = Math.PI;

// ---------------------------------------------------------------------------
// Hospital: Beaux-Arts white U-plan around a forecourt, portico, red cross, ambulance bay.
// ---------------------------------------------------------------------------
export function hospital(k: Kit, s: Site): void {
  const wall = k.jit('#f3efe7', 0.015);
  const trim = '#f7f3ea';
  const base = '#cbbfa8';
  const roof = k.pick(['#6f7a86', '#5d6773']);
  const mw = Math.min(26, s.W - 7);
  const md = 9;
  const mz = -s.hd + 3 + md / 2; // main block centre
  const front = mz + md / 2; // main block front face
  const wingW = 7;
  const wingX = mw / 2 - wingW / 2;
  const wingD = 10;
  const wingZ = front + wingD / 2;

  // Main block (4 floors) with entrance and doors behind the portico.
  const H = wing(k, {
    x: 0, z: mz, w: mw, d: md, floors: 4, groundH: 4.2, floorH: 3.4,
    wall, trim, base, faces: { front: true, back: true, left: true, right: true },
    skip: (f, u, fl) => f === 'front' && (Math.abs(u) > mw / 2 - wingW - 0.5 || (fl === 0 && Math.abs(u) < 3.2)),
  });
  // Rustication grooves sit in the gaps below the ground-floor sills and above the ground-floor headers, so no window is cut.
  for (const y of [0.92, 3.7]) k.box('#e4dccb', mw + 0.18, 0.06, md + 0.18, 0, y, mz);
  // Mansard with dormers.
  k.frust(roof, mw + 0.3, md + 0.3, mw - 2.6, md - 2.8, 2.8, 0, H, mz);
  const nd = Math.floor((mw - 4) / 2.8);
  for (let i = 0; i < nd; i++) {
    const x = (i - (nd - 1) / 2) * 2.8;
    if (Math.abs(x) < 2) continue;
    for (const side of [1, -1]) {
      k.at(x, mz + side * (md / 2 - 0.2), side > 0 ? 0 : PI, () => {
        k.box(trim, 1.1, 1.4, 1.0, 0, H + 0.3, -0.3);
        k.gableRoof(roof, 1.3, 0.6, 1.2, 0, H + 1.7, -0.3);
        k.glass(k.chance(buildings.hospitalDormerLitShare), 0.7, 0.9, 0.06, 0, H + 0.45, 0.22);
      });
    }
  }
  // Roof lantern with a patina dome and chimneys.
  k.box(trim, 3, 2.2, 3, 0, H + 2.8, mz);
  k.blob('#7fa69a', 1.9, 0, H + 5.0, mz, 1, 0.8, 1, 1);
  k.cyl('#e2b66c', 0.05, 0.12, 1.4, 0, H + 6.4, mz, 5);
  for (const x of [-mw / 2 + 2, mw / 2 - 2]) k.box('#c9714f', 0.9, 1.6, 0.6, x, H + 1.5, mz);

  // Red cross sign on the roof edge (lit panel at night).
  k.at(0, front + 0.2, 0, () => {
    k.glass(true, 3.2, 3.2, 0.2, 0, H + 0.3, 0, '#f7f7f2');
    k.box('#d0282a', 2.5, 0.85, 0.12, 0, H + 1.47, 0.14);
    k.box('#d0282a', 0.85, 2.5, 0.12, 0, H + 0.65, 0.14);
    k.box('#22262a', 0.2, 0.6, 0.2, -1.2, H - 0.3, -0.1);
    k.box('#22262a', 0.2, 0.6, 0.2, 1.2, H - 0.3, -0.1);
  });

  // Wings: 3 floors, framing the forecourt.
  for (const sx of [-1, 1]) {
    const Hw = wing(k, {
      x: sx * wingX, z: wingZ, w: wingW, d: wingD, floors: 3, groundH: 4.2, floorH: 3.4,
      wall, trim, base, faces: { front: true, left: true, right: true },
    });
    k.frust(roof, wingW + 0.3, wingD + 0.3, wingW - 2.6, wingD - 2.6, 2.2, sx * wingX, Hw, wingZ);
    k.box('#c9714f', 0.8, 1.4, 0.6, sx * wingX, Hw + 1.2, wingZ - 2.5);
    // Pilasters on the wing fronts.
    for (const u of [-wingW / 2 + 0.3, wingW / 2 - 0.3]) k.box(trim, 0.5, Hw - 0.9, 0.2, sx * wingX + u, 0.9, wingZ + wingD / 2);
  }

  // Portico: steps, four columns, entablature with lettering, pediment.
  const pz = front + 1.7;
  const stepW = Math.min(11.4, 2 * (wingX - wingW / 2) - 0.4);
  for (let i = 0; i < 3; i++) k.box(base, stepW - i * 0.6, 0.2, 4.6 - i * 0.5, 0, i * 0.2, pz + 0.3 - i * 0.25);
  for (const x of [-3.6, -1.2, 1.2, 3.6]) {
    k.box(trim, 0.9, 0.3, 0.9, x, 0.6, pz + 1.0);
    k.cyl(trim, 0.33, 0.38, 6.4, x, 0.9, pz + 1.0, 10);
    k.box(trim, 0.9, 0.3, 0.9, x, 7.3, pz + 1.0);
  }
  k.box(trim, 9.6, 1.2, 3.6, 0, 7.6, pz - 0.2);
  lettering(k, 0, 7.85, pz + 1.6, 6, 0.55, '#3b4048', false);
  k.gableRoof(trim, 9.8, 1.8, 3.8, 0, 8.8, pz - 0.2);
  k.glass(true, 3.2, 3.0, 0.08, 0, 0.6, front + 0.02, '#4a5a68');
  k.box('#3b4048', 3.6, 0.2, 0.2, 0, 3.6, front + 0.1);

  // Ambulance bay: canopy against the right wing, with an "urgences" fascia.
  const bx0 = 1.6;
  const bx1 = wingX - wingW / 2;
  const bz0 = front + 3.2;
  const bz1 = front + wingD;
  const bcx = (bx0 + bx1) / 2;
  const bcz = (bz0 + bz1) / 2;
  k.box('#e9e6df', bx1 - bx0 + 0.4, 0.4, bz1 - bz0, bcx, 4.0, bcz);
  k.box('#d0282a', bx1 - bx0 + 0.45, 0.45, 0.1, bcx, 3.98, bz1);
  lettering(k, bcx, 4.06, bz1 + 0.05, (bx1 - bx0) * 0.75, 0.3, '#f7f7f2', true);
  for (const z of [bz0 + 0.3, bz1 - 0.3]) k.cyl('#d8d8d4', 0.12, 0.12, 4.0, bx0 + 0.3, 0, z, 6);
  ambulance(k, bcx, bcz - 0.3, 0);
  ambulance(k, -bcx - 0.5, bz1 + 3.0, 0.35);

  // Forecourt fountain: stone plinth carrying a recessed water basin (origin at its deck top, y = 0.5).
  const fx = -bcx;
  const fcz = front + 6.5;
  const fr = 1.8; // half size of the square basin
  const fc = 0.35; // coping width
  k.box(base, 2 * fr, 0.05, 2 * fr, fx, 0, fcz);
  k.box(base, 2 * fr, 0.43, fc, fx, 0.05, fcz - (fr - fc / 2));
  k.box(base, 2 * fr, 0.43, fc, fx, 0.05, fcz + (fr - fc / 2));
  k.box(base, fc, 0.43, 2 * fr - 2 * fc, fx - (fr - fc / 2), 0.05, fcz);
  k.box(base, fc, 0.43, 2 * fr - 2 * fc, fx + (fr - fc / 2), 0.05, fcz);
  k.at(fx, fcz, 0, () => waterBasin(k, { w: 2 * fr, d: 2 * fr, coping: fc }, 0.4, '#5d8fa8'), 0.5);
  k.cyl(trim, 0.2, 0.28, 0.7, fx, 0.1, fcz, 8);

  // Plaza details.
  const fz = Math.min(s.hd - 2, bz1 + 6);
  for (const [i, x] of [-s.hw + 2.2, -s.hw + 3.6, -s.hw + 5.0].entries()) {
    flagpole(k, x, fz, 8, ['#24395c', '#efeee8', '#b03a2e'][i], i === 1 ? '#f2c14e' : undefined);
  }
  for (const sx of [-1, 1]) {
    planter(k, sx * 3.5, s.hd - 1.6, 2.4, 1.0, true);
    planter(k, sx * 8.5, s.hd - 1.6, 2.4, 1.0, true);
    lamp(k, sx * 6, bz1 + 1.2);
    tree(k, sx * (s.hw - 2.2), front + 1, 6);
    tree(k, sx * (s.hw - 2.2), front + 7.5, 6);
    tree(k, sx * (s.hw - 2.2), mz - 1, 6.5);
    bench(k, sx * (s.hw - 4.2), fz - 1.5, sx * -PI / 2);
  }
  for (const x of [-s.hw + 3, 0, s.hw - 3]) tree(k, x * 0.85, -s.hd + 2.2, 6);
  crowd(k, buildings.hospitalCrowd, -5, 5, front + 3, bz1 + 4);
  person(k, bcx + 1.6, bcz + 2, PI, '#3f8f8a');
  person(k, bcx - 1.6, bcz + 1.5, 0.4, '#3f8f8a');
}
