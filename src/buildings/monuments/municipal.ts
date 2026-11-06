// Municipal monument: stone city hall with a central clock tower, a front colonnade and a flag.

import { WIND, anchorWeight } from '../facade/polish';
import { bench, flagpole, lamp, person, planter, tree, wing, type Kit, type Site } from './kit';
import { buildings } from '../../config/tuning';

const PI = Math.PI;

export function cityHall(k: Kit, s: Site): void {
  const stone = k.jit('#e8dfcc', 0.015);
  const trim = '#f4efe3';
  const base = '#b9ae98';
  const copper = '#5d8a7a';
  const flagC = '#24395c';
  const mw = Math.min(24, s.W - 6);
  const md = 12;
  const mz = -s.hd + 2 + md / 2; // hall centre
  const front = mz + md / 2; // front face

  // Main hall: three floors, pilasters and framed windows. Ground and first floor are hidden behind the colonnade.
  const H = wing(k, {
    x: 0, z: mz, w: mw, d: md, floors: 3, groundH: 4.6, floorH: 3.6,
    wall: stone, trim, base, faces: { front: true, back: true, left: true, right: true },
    litP: buildings.cityHallWindowLitShare,
    skip: (f, u, fl) => f === 'front' && Math.abs(u) < 6 && fl <= 1,
  });

  // Central clock tower rising from the roof.
  const tw = 5.6;
  k.box(stone, tw, 6.5, tw, 0, H, mz);
  k.box(trim, tw + 0.4, 0.35, tw + 0.4, 0, H + 6.5, mz);
  for (const ry of [0, PI / 2, PI, -PI / 2]) {
    k.at(0, mz, ry, () => {
      k.glass(true, 2.2, 2.2, 0.08, 0, H + 3.4, tw / 2 + 0.04, '#f6f1e0');
      k.box('#3b4048', 0.1, 1.0, 0.06, 0, H + 3.9, tw / 2 + 0.1);
      k.box('#3b4048', 0.7, 0.1, 0.06, 0.35, H + 3.4, tw / 2 + 0.1);
    });
  }
  k.box(stone, 4.6, 4.2, 4.6, 0, H + 6.85, mz);
  k.box(trim, 5.0, 0.3, 5.0, 0, H + 11.05, mz);
  k.frust(copper, 4.8, 4.8, 1.2, 1.2, 4.5, 0, H + 11.35, mz);
  k.cone(copper, 0.9, 4, 0, H + 15.85, mz, 6);

  // Tower flag: the cloth streams from a rigid pole.
  k.cyl('#d8d8d4', 0.04, 0.05, 2.2, 0, H + 19.85, mz, 5);
  k.withWind(WIND.FLAG, (px) => anchorWeight(px, 0.03, 1.23), () => {
    k.box(flagC, 1.2, 0.8, 0.04, 0.62, H + 21.0, mz);
  });

  // Colonnade: four columns, entablature and pediment on the front.
  const pz = front + 1.6;
  for (const x of [-4.5, -1.5, 1.5, 4.5]) {
    k.cyl(trim, 0.33, 0.38, 6.4, x, 0, pz, 10);
    k.box(trim, 0.9, 0.3, 0.9, x, 6.4, pz);
  }
  k.box(trim, 12.4, 0.9, 2.0, 0, 6.7, pz);
  k.gableRoof(trim, 12.6, 1.8, 2.0, 0, 7.6, pz);
  // Steps: three treads, each lower and further out.
  for (let i = 0; i < 3; i++) k.box(base, 12, (3 - i) * 0.22, 1.2, 0, 0, front + 0.6 + i * 1.2);
  // Entrance doors behind the colonnade.
  k.glass(true, 3.0, 3.4, 0.08, 0, 0.0, front + 0.04, '#4a5a68');
  k.box('#3b4048', 3.3, 0.2, 0.2, 0, 3.4, front + 0.1);

  // Plaza: flagpoles, lamps, planters, trees and benches.
  const fz = front + 6;
  for (const x of [-7.5, 7.5]) flagpole(k, x, fz, 9, flagC, x > 0 ? '#c8231e' : undefined);
  for (const sx of [-1, 1]) {
    planter(k, sx * 6.5, fz + 4.5, 2.2, 1.0, true);
    lamp(k, sx * 4.5, fz + 1.5);
    tree(k, sx * (s.hw - 2.2), front + 2, 6.5);
    tree(k, sx * (s.hw - 2.2), front + 8, 6.5);
    bench(k, sx * 3.2, fz + 6, PI);
  }
  person(k, -1.6, fz + 2.5, PI, '#3f6e8f');
  person(k, 1.8, fz + 3.0, PI, '#8a6a45');
}
