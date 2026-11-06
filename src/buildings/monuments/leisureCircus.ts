// Leisure monument: circus (split from leisure.ts).

import * as THREE from 'three';
import type { V3 } from '../geometry';
import { WIND, anchorWeight } from '../facade/polish';
import { bulbs, bunting, crowd, lamp, person, signBoard, tree, windowAt, type C, type Kit, type Site } from './kit';
import { buildings } from '../../config/tuning';
import { PI, TAU } from './leisureSport';

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
