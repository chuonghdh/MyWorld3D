// Education monument: two-storey brick school with a cupola, a playground court and a row of trees.

import { bench, flagpole, lamp, planter, tree, wing, type Kit, type Site } from './kit';
import { buildings } from '../../config/tuning';

const PI = Math.PI;

export function school(k: Kit, s: Site): void {
  const brick = k.pick(['#b5533c', '#9c4a36', '#a85a3e']);
  const trim = '#efe6d4';
  const base = '#8a8580';
  const roof = '#6f7a86';
  const mw = Math.min(20, s.W - 10);
  const md = 11;
  const mz = -s.hd + 2 + md / 2;
  const front = mz + md / 2;

  // Main classroom block with a central entrance skipped from the window grid.
  const H = wing(k, {
    x: 0, z: mz, w: mw, d: md, floors: 2, groundH: 4.0, floorH: 3.4,
    wall: brick, trim, base, faces: { front: true, back: true, left: true, right: true },
    skip: (f, u, fl) => f === 'front' && fl === 0 && Math.abs(u) < 2.5,
  });

  // Hipped roof and a small cupola with a bell.
  k.frust(roof, mw + 0.6, md + 0.6, mw - 3, md - 3, 2.4, 0, H, mz);
  k.box(trim, 2.6, 1.8, 2.6, 0, H + 2.4, mz);
  k.cone(roof, 1.9, 2.2, 0, H + 4.2, mz, 6);

  // Entrance canopy on two slim columns, lit door.
  k.box(trim, 6, 0.25, 2.4, 0, 3.0, front + 1.2);
  for (const x of [-2.6, 2.6]) k.cyl(trim, 0.15, 0.15, 3.0, x, 0, front + 2.2, 6);
  k.glass(true, 2.2, 2.6, 0.08, 0, 0, front + 0.04, '#4a5a68');

  // Playground: asphalt court in front, painted lines and a climbing frame.
  const pg0 = front + 2.5;
  const pg1 = s.hd - 1.5;
  const pgW = 2 * s.hw - 8;
  k.box('#9aa0a6', pgW, 0.03, pg1 - pg0, 0, 0, (pg0 + pg1) / 2);
  for (const z of [pg0 + 2, pg1 - 2]) k.box('#f7f3ea', pgW * 0.7, 0.02, 0.12, 0, 0.03, z);
  k.box('#c9a06a', 4, 0.5, 0.12, -pgW / 4, 0.03, pg0 + 4);
  k.box('#c9a06a', 4, 0.5, 0.12, -pgW / 4, 0.03, pg0 + 6);
  k.box('#c8231e', 3, 2.4, 0.12, pgW / 4, 0.03, pg0 + 3);
  k.box('#c8231e', 0.12, 2.4, 2.0, pgW / 4 - 1.5, 0.03, pg0 + 4);

  // Greenery: a row of trees along the far edge of the court, count from config.
  const n = buildings.schoolTreeCount;
  for (let i = 0; i < n; i++) {
    const x = -s.hw + 4 + ((i + 0.5) * (2 * s.hw - 8)) / n;
    tree(k, x, s.hd - 2.2, 6);
  }
  // Planters along the building side and a bench.
  for (const sx of [-1, 1]) planter(k, sx * (mw / 2 + 2.2), front + 1.2, 1.6, 1.0, true);
  bench(k, -mw / 3, pg0 + 1, PI);

  // Flag and lamps at the court edge.
  flagpole(k, -s.hw + 2, front + 2, 7, '#24395c', '#efeee8');
  lamp(k, s.hw - 3, front + 3);
}
