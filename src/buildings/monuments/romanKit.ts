// Roman-medieval (Romanesque) detail for monument builders: round-headed openings, corbel tables and
// crenellations. Geometry only; colours come from the caller. Local frame as Kit.at: the wall lies at z = 0,
// the outside is +z, and x runs along the wall.

import * as THREE from 'three';
import { type C, Kit } from './kitCore';

/** Outline of a round-headed opening: springs at y = 0, crown at y = h (h >= w / 2). */
export function archShape(w: number, h: number): THREE.Shape {
  const r = w / 2;
  const s = new THREE.Shape();
  s.moveTo(-r, 0);
  s.lineTo(r, 0);
  s.lineTo(r, h - r);
  s.absarc(0, h - r, r, 0, Math.PI, false);
  s.lineTo(-r, 0);
  return s;
}

/**
 * Round-headed window at local (x, y0) in a wall at z = 0: a stone surround standing proud of the wall,
 * a glass pane set inside it, and a sill. The pane is lit at night when `lit` is true.
 */
export function archWindow(k: Kit, x: number, y0: number, w: number, h: number, lit: boolean, surround: C, glass: C = '#2c3a48'): void {
  // Surround: z from -0.05 (sunk into the wall) to 0.14. Pane: z from 0.12 to 0.21, so no faces coincide.
  const frame = new THREE.ExtrudeGeometry(archShape(w + 0.3, h + 0.15), { depth: 0.19, bevelEnabled: false, curveSegments: 10 });
  k.add('body', frame, surround, [x, y0, -0.05]);
  const pane = new THREE.ExtrudeGeometry(archShape(w, h), { depth: 0.09, bevelEnabled: false, curveSegments: 10 });
  k.add(lit ? 'glassLit' : 'glass', pane, glass, [x, y0, 0.12]);
  k.box(surround, w + 0.6, 0.25, 0.3, x, y0 - 0.2, 0.12);
}

/** Corbel table: small brackets along local x from x0 to x1, bottoms at height y, standing proud of the wall. */
export function corbels(k: Kit, c: C, x0: number, x1: number, y: number, step = 0.9): void {
  const n = Math.max(1, Math.floor((x1 - x0) / step));
  const gap = (x1 - x0) / n;
  for (let i = 0; i < n; i++) k.box(c, 0.36, 0.46, 0.5, x0 + (i + 0.5) * gap, y, 0.28);
}

/**
 * Corner quoins: alternating long and short stone blocks standing proud of the wall at one corner.
 * `edge` is the local x of the corner (negative for the left corner); blocks run from y0 up to y1.
 */
export function quoins(k: Kit, c: C, edge: number, y0: number, y1: number): void {
  const rowH = 1.1;
  let j = 0;
  for (let y = y0; y + rowH <= y1; y += rowH, j++) {
    const wide = j % 2 === 0 ? 1.0 : 0.5;
    // Outer face 0.2 m past the corner: clear of the wall plane and of the string-course faces (0.3 m).
    const x = edge > 0 ? edge + 0.2 - wide / 2 : edge - 0.2 + wide / 2;
    k.box(c, wide, rowH - 0.14, 0.3, x, y, 0.1);
  }
}

/** Crenellation: merlons on a parapet whose top is at yTop, alternating with gaps, from local x0 to x1. */
export function merlons(k: Kit, c: C, x0: number, x1: number, yTop: number, h = 1.1): void {
  const n = Math.max(2, Math.floor((x1 - x0) / 1.8));
  const gap = (x1 - x0) / n;
  // Sunk 0.05 into the parapet so the bottom face is hidden; depth straddles the wall face.
  for (let i = 0; i < n; i += 2) k.box(c, gap, h + 0.05, 0.6, x0 + (i + 0.5) * gap, yTop - 0.05, 0.1);
}

