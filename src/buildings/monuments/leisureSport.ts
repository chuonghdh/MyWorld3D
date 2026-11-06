// Leisure monument: stadium (split from leisure.ts).

import * as THREE from 'three';
import { Shell, crowd, flagpole, lamp, lettering, person, tiers, tint, type Kit, type Site } from './kit';
import { buildings } from '../../config/tuning';

export const PI = Math.PI;
export const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// Stadium: oval bowl, two team colours, canopy ring, floodlights, striped pitch.
// ---------------------------------------------------------------------------
export function stadium(k: Kit, s: Site): void {
  const teamA = k.pick(['#b03a2e', '#c8231e', '#e07a1f']);
  const teamB = k.pick(['#24395c', '#2f6b8f', '#2f6b4f']);
  const concrete = '#c8c4bb';
  const white = '#f4f2ec';
  const cz = -1.5;
  const a1 = s.hw - 1.6;
  const b1 = s.hd - 4.6;
  const rows = 8;
  const step = 0.55;
  const rise = 0.95; // shape constant: bowl height per row (a stadium, not a dish)
  const a0 = a1 - rows * step;
  const b0 = b1 - rows * step;
  const segs = 48;
  const A2 = tint(teamA, 0.06);
  const B2 = tint(teamB, 0.06);
  const H = tiers(k, {
    cx: 0, cz, a0, b0, step, rise, rows, th0: 0, th1: TAU, segs,
    seat: (i, r) => {
      if (i % 6 === 0) return '#d9d4c7';
      const th = ((i + 0.5) / segs) * TAU;
      const home = Math.cos(th) < 0;
      return r % 2 === 0 ? (home ? teamA : teamB) : home ? A2 : B2;
    },
    riser: '#8f8a80',
    outer: concrete,
  });
  const ell = (r: number, th: number): [number, number] => [(a0 + r * step) * Math.cos(th), cz + (b0 + r * step) * Math.sin(th)];

  // Parapet ring on top of the bowl and team-coloured fins on the facade.
  for (let i = 0; i < segs; i++) {
    const th = (i / segs) * TAU;
    const [x, z] = ell(rows + 0.15, th);
    const ry = Math.atan2(Math.cos(th) / (a0 + rows * step), Math.sin(th) / (b0 + rows * step));
    k.at(x, z, ry, () => {
      if (i % 2 === 0) k.box(Math.cos(th) < 0 ? teamA : teamB, 0.35, H + 0.4, 0.3, 0, 0, 0);
      k.box(white, 2.2, 0.5, 0.35, 0, H, -0.1);
    });
  }

  // Canopy ring (left open above the main entrance), on columns.
  const sh = new Shell();
  const cIn = rows - 2.6;
  const cOut = rows + 0.6;
  const yIn = H + 4.4;
  const yOut = H + 3.7;
  const gap = 0.5;
  const cs0 = PI / 2 + gap;
  const cs1 = PI / 2 + TAU - gap;
  const cn = 40;
  for (let i = 0; i < cn; i++) {
    const ta = cs0 + ((cs1 - cs0) * i) / cn;
    const tb = cs0 + ((cs1 - cs0) * (i + 1)) / cn;
    const [xa, za] = ell(cIn, ta);
    const [xb, zb] = ell(cIn, tb);
    const [xc, zc] = ell(cOut, tb);
    const [xd, zd] = ell(cOut, ta);
    sh.quad(white, [xa, yIn, za], [xb, yIn, zb], [xc, yOut, zc], [xd, yOut, zd], [0, 1, 0]);
    sh.quad('#a9a69e', [xa, yIn - 0.25, za], [xb, yIn - 0.25, zb], [xc, yOut - 0.25, zc], [xd, yOut - 0.25, zd], [0, -1, 0]);
    const tm = (ta + tb) / 2;
    sh.quad(teamB, [xa, yIn, za], [xb, yIn, zb], [xb, yIn - 0.25, zb], [xa, yIn - 0.25, za], [-Math.cos(tm), 0, -Math.sin(tm)]);
    if (i % 4 === 0) {
      const [px, pz] = ell(rows + 0.3, ta);
      k.cyl('#e9e6df', 0.18, 0.22, yOut - H, px, H, pz, 6);
    }
  }
  sh.flush(k);

  // Pitch: apron, mowing stripes, lines, goals.
  k.add('body', new THREE.CylinderGeometry(1, 1, 0.05, 32), '#3f7f3c', [0, 0.025, cz], [0, 0, 0], [a0 + 0.1, 1, b0 + 0.1]);
  const px = a0 * 0.68;
  const pz = b0 * 0.68;
  const ns = 10;
  for (let i = 0; i < ns; i++) {
    k.box(i % 2 === 0 ? '#4f9d4a' : '#5cab55', (2 * px) / ns, 0.06, 2 * pz, -px + ((i + 0.5) * 2 * px) / ns, 0, cz);
  }
  const line = (w: number, d: number, x: number, z: number): void => {
    k.box(white, w, 0.02, d, x, 0.06, z);
  };
  line(2 * px, 0.1, 0, cz - pz);
  line(2 * px, 0.1, 0, cz + pz);
  line(0.1, 2 * pz, -px, cz);
  line(0.1, 2 * pz, px, cz);
  line(0.1, 2 * pz, 0, cz);
  k.add('body', new THREE.RingGeometry(1.6, 1.72, 24), white, [0, 0.081, cz], [-PI / 2, 0, 0]);
  for (const sx of [-1, 1]) {
    const bx = sx * (px - 1.3);
    line(0.1, 5.6, bx, cz);
    line(1.3, 0.1, sx * (px - 0.65), cz - 2.8);
    line(1.3, 0.1, sx * (px - 0.65), cz + 2.8);
    // goal
    k.box(white, 0.1, 1.2, 0.1, sx * px, 0.06, cz - 1.5);
    k.box(white, 0.1, 1.2, 0.1, sx * px, 0.06, cz + 1.5);
    k.box(white, 0.1, 0.1, 3.1, sx * px, 1.26, cz);
    k.box('#d9d9d4', 0.6, 0.05, 3.0, sx * (px + 0.3), 1.0, cz);
  }
  // Players.
  for (let i = 0; i < 10; i++) {
    const side = i < 5 ? -1 : 1;
    person(k, side * k.range(0.8, px - 1), cz + k.range(-pz + 0.8, pz - 0.8), side > 0 ? -PI / 2 : PI / 2, side < 0 ? teamA : teamB);
  }

  // Scoreboard above the open end, facing the pitch.
  const [sx0, sz0] = ell(rows - 1.5, PI / 2);
  k.at(sx0, sz0, PI, () => {
    k.box('#22262a', 0.3, 2.4, 0.3, -2.6, H - 1, 0.3);
    k.box('#22262a', 0.3, 2.4, 0.3, 2.6, H - 1, 0.3);
    k.box('#22262a', 7, 2.8, 0.4, 0, H + 1.2, 0);
    k.glass(true, 6.4, 2.2, 0.06, 0, H + 1.5, 0.21, '#1b2a3a');
  });

  // Main entrance building at +z with crest and lettering.
  const fz = cz + b1;
  k.at(0, fz, 0, () => {
    k.box(concrete, 13, H + 1.6, 2.6, 0, 0, 0.6);
    k.box(white, 13.4, 0.4, 2.9, 0, H + 1.6, 0.6);
    for (let i = 0; i < 5; i++) k.glass(true, 1.8, 2.6, 0.06, -4.8 + i * 2.4, 0.1, 1.92, '#3a4a58');
    for (let i = 0; i <= 5; i++) k.box(teamA, 0.3, 3.0, 0.3, -6 + i * 2.4, 0, 2.0);
    k.box(teamA, 12.4, 0.5, 0.4, 0, 3.0, 2.0);
    lettering(k, 0, 3.9, 1.9, 8.5, 0.9, '#ffffff', true);
    // Crest sits on the entrance face: its back is inside the block (z 1.9), so it is attached.
    k.add('body', new THREE.CylinderGeometry(0.9, 0.9, 0.15, 16), teamB, [0, H + 1.2, 1.95], [PI / 2, 0, 0]);
    k.add('body', new THREE.CylinderGeometry(0.6, 0.6, 0.16, 16), '#f2c14e', [0, H + 1.2, 1.95], [PI / 2, 0, 0]);
    for (const x of [-5.5, -2, 2, 5.5]) {
      k.cyl('#d8d8d4', 0.04, 0.05, 2.6, x, H + 2.0, 0.6, 5);
      k.box(x < 0 ? teamA : teamB, 1.1, 0.7, 0.04, x + 0.57, H + 3.8, 0.6);
    }
  });

  // Floodlight masts at the corners.
  for (const mx of [-1, 1]) {
    for (const mz of [-1, 1]) {
      const x = mx * (s.hw - 1.4);
      const z = mz > 0 ? s.hd - 4.5 : -s.hd + 1.4;
      const ry = Math.atan2(-x, cz - z);
      const mh = 20;
      k.at(x, z, ry, () => {
        k.box('#8f969c', 1.2, 0.4, 1.2, 0, 0, 0);
        k.cyl('#8f969c', 0.18, 0.35, mh, 0, 0.4, 0, 6);
        k.box('#5a5f66', 3.4, 2.2, 0.4, 0, mh, 0.2);
        for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) k.glass(true, 0.9, 0.8, 0.12, -1.1 + c * 1.1, mh + 0.2 + r * 1.0, 0.45, '#f7f4e8');
      });
    }
  }

  // Forecourt: fans, kiosks, flags, lamps.
  const front = fz + 2;
  crowd(k, buildings.stadiumCrowd, -8, 8, front + 0.5, s.hd - 0.8);
  for (const sx of [-1, 1]) {
    k.at(sx * 9.5, front + 2.5, 0, () => {
      k.box(sx < 0 ? teamA : teamB, 2.4, 2.4, 1.8, 0, 0, 0);
      k.box(white, 2.8, 0.15, 2.4, 0, 2.4, 0.2);
      k.glass(true, 1.6, 0.9, 0.06, 0, 1.1, 0.91, '#3a4a58');
    });
    lamp(k, sx * 5.5, front + 1.5);
    flagpole(k, sx * 13, s.hd - 1.0, 7, sx < 0 ? teamA : teamB);
  }
}
