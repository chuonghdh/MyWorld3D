// Leisure monuments: stadium, funfair, swimming pool (lido), circus.

import * as THREE from 'three';
import type { V3 } from '../geometry';
import { WIND, anchorWeight } from '../facade/polish';
import {
  Shell,
  bench,
  bulbs,
  bunting,
  crowd,
  cypress,
  flagpole,
  lamp,
  lettering,
  person,
  planter,
  signBoard,
  tiers,
  tint,
  tree,
  waterBasin,
  windowAt,
  type C,
  type Kit,
  type Site,
} from './kit';
import { buildings } from '../../config/tuning';

const PI = Math.PI;
const TAU = Math.PI * 2;

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

// ---------------------------------------------------------------------------
// Funfair: Ferris wheel, carousel, helter-skelter, stalls, bunting, entrance arch.
// ---------------------------------------------------------------------------
const FAIR = ['#d7263d', '#f2c14e', '#2f6b8f', '#2f8f4f', '#e07a1f', '#9b59b6', '#efeee8'];

function stall(k: Kit, x: number, z: number, ry: number, stripe: C): void {
  k.at(x, z, ry, () => {
    k.box('#e9dcc0', 3.6, 2.6, 0.2, 0, 0, -1.1);
    k.box('#e9dcc0', 0.2, 2.6, 2.4, -1.7, 0, 0);
    k.box('#e9dcc0', 0.2, 2.6, 2.4, 1.7, 0, 0);
    k.box(stripe, 3.4, 1.0, 0.5, 0, 0, 0.9);
    k.box('#8a6a45', 3.6, 0.1, 0.7, 0, 1.0, 0.9);
    k.glass(true, 3.2, 1.2, 1.5, 0, 1.1, -0.3, '#5a4a3a');
    // striped awning, sloping down to the front
    // Fabric: fixed at the wall side (z 0.35), free at the front edge.
    // Slat centre 2.5 m: its back edge (rises ~0.29 m under the 0.35 rad tilt) ends inside the roof slab (2.6-2.8 m).
    k.withWind(WIND.AWNING, (_x, _y, z) => anchorWeight(z, 0.35, 2.05), () => {
      for (let i = 0; i < 8; i++) {
        k.boxR('body', i % 2 === 0 ? stripe : '#ffffff', 0.46, 0.06, 1.7, [-1.61 + i * 0.46, 2.5, 1.2], [0.35, 0, 0]);
      }
    });
    k.box('#e9dcc0', 3.6, 0.2, 2.4, 0, 2.6, 0);
    signBoard(k, 0, 2.8, -0.6, 3.0, 0.8, stripe, '#fff3c4');
  });
}

export function funfair(k: Kit, s: Site): void {
  // Ferris wheel (in the xy plane, facing the street).
  const R = 8;
  const wx = -s.hw + R + 1.6;
  const wy = R + 2.1;
  const wz = -s.hd + 9;
  const N = 16;
  const rim = '#efeee8';
  const frame = '#e2e2dc';
  const pts: [number, number][] = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU;
    pts.push([wx + R * Math.cos(a), wy + R * Math.sin(a)]);
  }
  for (const dz of [-0.8, 0.8]) {
    for (let i = 0; i < N; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[(i + 1) % N];
      k.beam(rim, [x0, y0, wz + dz], [x1, y1, wz + dz], 0.22);
      k.beam(frame, [wx, wy, wz + dz * 1.2], [x0, y0, wz + dz], 0.09);
      if (dz > 0) k.glass(true, 0.2, 0.2, 0.2, x0, y0 - 0.1, wz + dz + 0.15, '#fff1c4');
    }
  }
  for (let i = 0; i < N; i++) {
    const [x, y] = pts[i];
    k.beam(frame, [x, y, wz - 0.8], [x, y, wz + 0.8], 0.1);
    const col = FAIR[i % FAIR.length];
    k.beam('#5a5f66', [x, y, wz], [x, y - 0.6, wz], 0.06);
    k.box(col, 1.1, 0.85, 1.1, x, y - 1.45, wz);
    k.glass(i % 3 === 0, 1.14, 0.35, 0.9, x, y - 1.05, wz, '#3a4a58');
    k.cone(col, 0.78, 0.35, x, y - 0.65, wz, 4, PI / 4);
  }
  k.add('body', new THREE.CylinderGeometry(0.7, 0.7, 2.4, 10), '#d7263d', [wx, wy, wz], [PI / 2, 0, 0]);
  for (const dz of [-1.2, 1.2]) {
    for (const dx of [-1, 1]) k.beam('#f2f0ea', [wx, wy, wz + dz], [wx + dx * 4.6, 0, wz + dz * 1.8], 0.36);
    k.beam('#f2f0ea', [wx - 3.0, 3.2, wz + dz * 1.4], [wx + 3.0, 3.2, wz + dz * 1.4], 0.2);
  }
  k.box('#8a6a45', 6, 0.5, 3.4, wx, 0, wz + 0.0);
  k.box('#c9c6bf', 2.0, 0.25, 1.2, wx, 0.5, wz + 2.1);
  // ticket hut
  k.box('#2f6b8f', 1.6, 2.3, 1.4, wx + 4.2, 0, wz + 3.2);
  k.cone('#d7263d', 1.2, 0.8, wx + 4.2, 2.3, wz + 3.2, 4, PI / 4);
  k.glass(true, 1.0, 0.7, 0.06, wx + 4.2, 1.1, wz + 3.91, '#5a4a3a');

  // Carousel with a striped conical roof.
  const cx = s.hw - 7;
  const cz = -s.hd + 10;
  const cr = 5;
  const red = '#d7263d';
  k.cyl('#efeee8', cr, cr + 0.1, 0.6, cx, 0, cz, 20);
  k.cyl(red, cr + 0.12, cr + 0.12, 0.2, cx, 0.2, cz, 20);
  k.cyl('#f2c14e', 0.9, 0.9, 4.0, cx, 0.6, cz, 10); // top 4.6 m: meets the canopy band (bottom 4.55 m)
  const nw = 16;
  for (let i = 0; i < nw; i++) {
    const t0 = (i / nw) * TAU;
    const col = i % 2 === 0 ? red : '#ffffff';
    k.add('body', new THREE.ConeGeometry(cr + 0.6, 2.8, 2, 1, true, t0, TAU / nw), col, [cx, 4.4 + 1.4 + 0.5, cz]);
    k.add('body', new THREE.CylinderGeometry(cr + 0.6, cr + 0.6, 0.7, 2, 1, true, t0, TAU / nw), i % 2 === 0 ? '#f2c14e' : red, [cx, 4.4 + 0.35 + 0.15, cz]);
  }
  k.cyl('#f2c14e', 0.1, 0.25, 1.0, cx, 7.7, cz, 6);
  k.box(red, 0.8, 0.5, 0.03, cx + 0.4, 8.2, cz);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.2;
    k.cyl('#f2c14e', 0.07, 0.07, 3.8, cx + (cr - 0.2) * Math.cos(a), 0.6, cz + (cr - 0.2) * Math.sin(a), 5);
  }
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU;
    k.glass(true, 0.18, 0.18, 0.18, cx + (cr + 0.62) * Math.cos(a), 4.6, cz + (cr + 0.62) * Math.sin(a), '#fff1c4');
  }
  // Horses on poles.
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    const hx = cx + 3.4 * Math.cos(a);
    const hz = cz + 3.4 * Math.sin(a);
    const hy = 1.4 + (i % 2) * 0.4;
    k.cyl('#f2c14e', 0.04, 0.04, 3.8, hx, 0.6, hz, 4);
    k.at(hx, hz, -a, () => {
      const col = k.pick(['#ffffff', '#e9dcc0', '#6b4a2e', '#22262a']);
      k.box(col, 0.35, 0.45, 1.1, 0, hy, 0);
      k.boxR('body', col, 0.25, 0.6, 0.3, [0, hy + 0.65, 0.55], [0.5, 0, 0]);
      for (const lz of [-0.4, 0.4]) k.box(col, 0.25, 0.5, 0.1, 0, hy - 0.45, lz);
      k.box(FAIR[i % FAIR.length], 0.38, 0.1, 0.4, 0, hy + 0.45, 0);
    });
  }

  // Helter-skelter.
  const hx = s.hw - 3.4;
  const hz = s.hd - 4.2;
  for (let i = 0; i < 6; i++) k.cyl(i % 2 === 0 ? red : '#ffffff', 1.4, 1.5, 1.3, hx, i * 1.3, hz, 10);
  k.cone(red, 1.9, 2.4, hx, 7.8, hz, 10);
  k.box('#f2c14e', 0.06, 0.8, 0.5, hx, 10.2, hz);
  for (let i = 0; i < 30; i++) {
    const a0 = i * 0.42;
    const a1 = (i + 1) * 0.42;
    const y0 = 7.4 - i * 0.24;
    const y1 = 7.4 - (i + 1) * 0.24;
    k.beam('#f2c14e', [hx + 2.0 * Math.cos(a0), y0, hz + 2.0 * Math.sin(a0)], [hx + 2.0 * Math.cos(a1), y1, hz + 2.0 * Math.sin(a1)], 0.7, 'body', 0.12);
  }

  // Stalls in a row, entrance arch with lights.
  const sz = 4.5;
  const stallXs = [-s.hw + 3, -s.hw + 7.2, s.hw - 7.2, s.hw - 3];
  stallXs.forEach((x, i) => stall(k, x, sz, 0, FAIR[(i * 2 + Math.floor(k.rng() * 2)) % 5]));
  const az = s.hd - 1.6;
  k.at(0, az, 0, () => {
    for (const sx of [-1, 1]) {
      k.box('#efeee8', 0.8, 5.6, 0.8, sx * 3.6, 0, 0);
      k.cone(red, 0.7, 1.2, sx * 3.6, 5.6, 0, 4, PI / 4);
      k.blob('#f2c14e', 0.18, sx * 3.6, 6.9, 0);
    }
    k.box(red, 7.6, 1.3, 0.4, 0, 4.2, 0);
    k.box('#f2c14e', 7.8, 0.15, 0.45, 0, 4.15, 0);
    k.box('#f2c14e', 7.8, 0.15, 0.45, 0, 5.4, 0);
    lettering(k, 0, 4.45, 0.2, 5.6, 0.8, '#fff3c4', true);
    bulbs(k, [-3.2, 4.1, 0.25], [3.2, 4.1, 0.25], 10, 0.0);
  });
  // Bunting poles and lines.
  const poleY = 4.8;
  const poles: V3[] = [
    [-9, poleY, 11],
    [9, poleY, 11],
    [-3, poleY, 1.5],
    [3, poleY, 1.5],
  ];
  for (const p of poles) k.cyl('#efeee8', 0.07, 0.09, poleY, p[0], 0, p[2], 5);
  bunting(k, [-3.6, 5.4, az], poles[0], FAIR);
  bunting(k, [3.6, 5.4, az], poles[1], FAIR);
  bunting(k, poles[0], poles[2], FAIR);
  bunting(k, poles[1], poles[3], FAIR);
  bunting(k, poles[2], poles[3], FAIR, 0.4);
  bunting(k, poles[2], [wx + 4.6, 3.2, wz + 2.2], FAIR);
  bunting(k, poles[3], [cx, 4.6, cz + cr + 0.5], FAIR);

  // Popcorn cart, balloons, visitors, lamps, benches.
  k.at(-1.5, 8, 0.3, () => {
    k.box('#d7263d', 1.4, 1.0, 0.9, 0, 0.3, 0);
    k.glass(true, 1.2, 0.7, 0.8, 0, 1.3, 0, '#fff1c4');
    k.cone('#ffffff', 0.9, 0.5, 0, 2.3, 0, 6);
    k.cyl('#22262a', 0.3, 0.3, 0.08, -0.5, 0, 0.5, 8);
  });
  // Balloons tied to the pole top with short strings (the pole top is at 2.9 m).
  for (let i = 0; i < 6; i++) {
    const bx = 2.2 + k.range(-0.5, 0.5);
    const by = 2.8 + k.range(0, 0.8);
    const bz = 9 + k.range(-0.5, 0.5);
    k.blob(FAIR[i], 0.28, bx, by, bz, 1, 1.2, 1);
    k.beam('#3a3d42', [2.2, 2.9, 9], [bx, by - 0.3, bz], 0.015);
  }
  k.cyl('#3a3d42', 0.02, 0.02, 2.5, 2.2, 0.4, 9, 3);
  crowd(k, buildings.funfairCrowd, -s.hw + 3, s.hw - 5, 7, s.hd - 3);
  for (const x of [-6.5, 6.5]) lamp(k, x, s.hd - 3);
  bench(k, -s.hw + 1.6, 1.5, PI / 2);
  bench(k, s.hw - 1.6, 1.5, -PI / 2);
}

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

// ---------------------------------------------------------------------------
// Circus: red/white big top with porch and pennants, trailers, ticket booth.
// ---------------------------------------------------------------------------
export function circus(k: Kit, s: Site): void {
  const red = k.pick(['#c8231e', '#d7263d']);
  const white = '#f6f2ea';
  const gold = '#f2c14e';
  const cz = -1.5;
  const R = Math.min(10.5, s.hw - 3, s.hd - 5.5);
  const N = 20;
  const wallH = 3;
  const midR = R * 0.43;
  const midY = 8;
  const topY = 12.2;

  for (let i = 0; i < N; i++) {
    const t0 = (i / N) * TAU;
    const col = i % 2 === 0 ? red : white;
    k.add('body', new THREE.CylinderGeometry(R, R, wallH, 2, 1, true, t0, TAU / N), col, [0, wallH / 2, cz]);
    k.add('body', new THREE.CylinderGeometry(midR, R + 0.35, midY - wallH, 2, 1, true, t0, TAU / N), col, [0, (wallH + midY) / 2, cz]);
    k.add('body', new THREE.ConeGeometry(midR, topY - midY, 2, 1, true, t0, TAU / N), col, [0, (midY + topY) / 2, cz]);
  }
  // Scalloped skirt at the wall base: tops stay on the wall top, alternate scallops hang deeper (sag rhythm).
  for (let i = 0; i < N * 2; i++) {
    const a = ((i + 0.5) / (N * 2)) * TAU;
    const hang = i % 2 === 0 ? 0.95 : 0.7;
    k.add('body', new THREE.ConeGeometry(0.5, hang, 3), i % 2 === 0 ? gold : red, [(R + 0.4) * Math.sin(a), wallH - hang / 2, cz + (R + 0.4) * Math.cos(a)], [PI, -a, 0], [1, 1, 0.3]);
  }
  k.cyl(gold, 0.6, 0.8, 0.3, 0, midY - 0.15, cz, 10);
  // King pole, pennant, bunting to the rim poles.
  k.cyl('#d8d8d4', 0.08, 0.12, 3, 0, topY - 0.2, cz, 6);
  k.withWind(WIND.FLAG, (px) => anchorWeight(px, 0.02, 1.42), () => k.box(red, 1.4, 0.7, 0.04, 0.72, topY + 2.0, cz));
  k.blob(gold, 0.2, 0, topY + 2.85, cz);
  const flags = [red, gold, '#2f6b8f', white, '#2f8f4f'];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + PI / 8;
    const x = (R + 0.9) * Math.sin(a);
    const z = cz + (R + 0.9) * Math.cos(a);
    k.cyl('#d8d8d4', 0.05, 0.07, 5.8, x, 0, z, 5);
    k.withWind(WIND.FLAG, (px) => anchorWeight(px, x + 0.02, x + 0.92), () => k.box(flags[i % flags.length], 0.9, 0.5, 0.04, x + 0.47, 5.2, z));
    bunting(k, [0, topY + 1.2, cz], [x, 5.6, z], flags, 0.8, 12);
  }

  // Entrance porch with sign and bulbs.
  const pz = cz + R - 0.4;
  k.at(0, pz, 0, () => {
    for (const sx of [-1, 1]) k.box(white, 0.3, 3.2, 3.6, sx * 2.0, 0, 1.8);
    for (let i = 0; i < 6; i++) k.box(i % 2 === 0 ? red : white, 0.06, 3.2, 0.6, 2.18, 0, 0.3 + i * 0.6);
    for (let i = 0; i < 6; i++) k.box(i % 2 === 0 ? red : white, 0.06, 3.2, 0.6, -2.18, 0, 0.3 + i * 0.6);
    k.gableRoof(red, 4.8, 1.6, 4.0, 0, 3.2, 1.8);
    k.gableRoof(white, 2.4, 0.8, 4.02, 0, 3.2, 1.8);
    k.glass(true, 3.6, 3.0, 0.06, 0, 0, 0.6, '#3a2a20');
    signBoard(k, 0, 4.9, 3.85, 5.0, 1.3, red, '#fff3c4');
    k.box(gold, 5.2, 0.14, 0.3, 0, 4.85, 3.75);
    bulbs(k, [-2.4, 3.2, 3.95], [2.4, 3.2, 3.95], 9, 0);
    for (const sx of [-1, 1]) k.cyl(gold, 0.1, 0.1, 4.9, sx * 2.4, 0, 3.8, 6);
  });

  // Trailers / circus wagons at the back.
  const wagon = (x: number, z: number, ry: number, c: C): void => {
    k.at(x, z, ry, () => {
      k.box(c, 6, 2.2, 2.3, 0, 0.6, 0);
      k.add('body', new THREE.CylinderGeometry(1.15, 1.15, 6, 8, 1, false, 0, PI), white, [0, 2.8, 0], [0, 0, PI / 2], [0.45, 1, 1]);
      k.box(gold, 6.05, 0.15, 2.35, 0, 1.4, 0);
      for (const wx of [-1.8, 0, 1.8]) windowAt(k, wx, 1.7, 0.8, 0.6, k.chance(buildings.circusWagonLitShare), { frame: white, depth: 0.08, sill: false });
      k.add('glass', new THREE.BoxGeometry(0.06, 1.0, 0.8), '#3a4a58', [3.0, 1.8, 0]);
      for (const wx of [-2, 2]) for (const wz of [-1.0, 1.0]) k.add('body', new THREE.CylinderGeometry(0.45, 0.45, 0.2, 8), '#22262a', [wx, 0.45, wz], [PI / 2, 0, 0]);
      k.box('#8a6a45', 1.0, 0.1, 0.8, -3.6, 0.3, 0);
    });
  };
  const wz = -s.hd + 2.2;
  wagon(-s.hw + 5, wz, 0, '#2f6b8f');
  wagon(1.0, wz, 0, gold);
  wagon(s.hw - 2.2, cz - 3, PI / 2, '#2f8f4f');
  wagon(-s.hw + 2.2, cz - 4, -PI / 2, '#7a2e2a');

  // Ticket booth and popcorn cart near the front.
  k.at(-s.hw + 4.5, s.hd - 3.2, 0.3, () => {
    k.box(white, 2.0, 2.4, 1.8, 0, 0, 0);
    for (let i = 0; i < 4; i++) k.box(red, 0.3, 2.4, 0.04, -0.75 + i * 0.5, 0, 0.92);
    k.glass(true, 1.2, 0.8, 0.08, 0, 1.2, 0.95, '#fff1c4');
    for (let i = 0; i < 8; i++) {
      k.add('body', new THREE.ConeGeometry(1.6, 1.2, 2, 1, true, (i / 8) * TAU, TAU / 8), i % 2 === 0 ? red : white, [0, 3.0, 0], [0, 0, 0]);
    }
    k.blob(gold, 0.15, 0, 3.7, 0);
    signBoard(k, 0, 2.45, 1.1, 1.8, 0.5, gold, red, true);
  });
  k.at(s.hw - 4.5, s.hd - 3.4, -0.4, () => {
    k.box(red, 1.4, 1.0, 0.9, 0, 0.3, 0);
    k.glass(true, 1.2, 0.7, 0.8, 0, 1.3, 0, '#fff1c4');
    k.cone(white, 0.9, 0.5, 0, 2.3, 0, 6);
  });
  // Queue and visitors, lamps, bunting along the front.
  for (let i = 0; i < 6; i++) person(k, -0.4 + (i % 2) * 0.8, pz + 4.6 + i * 0.55, PI);
  crowd(k, buildings.circusCrowd, -s.hw + 2, s.hw - 2, pz + 4, s.hd - 1);
  const fy = 4.2;
  const fl: V3 = [-s.hw + 1.2, fy, s.hd - 1.2];
  const fr: V3 = [s.hw - 1.2, fy, s.hd - 1.2];
  k.cyl('#efeee8', 0.07, 0.09, fy, fl[0], 0, fl[2], 5);
  k.cyl('#efeee8', 0.07, 0.09, fy, fr[0], 0, fr[2], 5);
  bunting(k, fl, [-2.4, 4.9, pz + 3.8], flags, 0.6);
  bunting(k, [2.4, 4.9, pz + 3.8], fr, flags, 0.6);
  for (const sx of [-1, 1]) {
    lamp(k, sx * 6, s.hd - 1.2);
    tree(k, sx * (s.hw - 2.2), -s.hd + 7.5, 6);
  }
}
