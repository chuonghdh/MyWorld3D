// Municipal monument: a neo-Renaissance city hall: a symmetrical, palace-like block of warm sandstone with
// corner quoins, pilasters and pedimented windows with lintels and sills, a projecting central pavilion with a
// four-column ground-floor portico, a balcony and a pediment, a deep cornice, and a hipped slate roof with a
// copper cupola. Surfaces are the project's procedural patterns (STONE, STONE_AGED, TILE_SLATE, ZINC, TRIM_AGED),
// not image textures (docs/DESIGN-3D.md 8.1). Designed on a square about 30 m wide and fitted to the block by the
// monument scaler.

import { SURFACE } from '../surface';
import { flagpole, type Kit, type Site } from './kit';
import { onFace, windowAt } from './kitStructures';
import { archWindow, corbels, quoins } from './romanKit';
import { buildings } from '../../config/tuning';

export function cityHall(k: Kit, s: Site): void {
  const stone = '#d8c8a4';
  const plinthStone = '#9c8c72';
  const quoinStone = '#cbb993';
  const trim = '#efe6d0';
  const roof = '#4f5560';
  const slateB = '#5f6774';
  const copper = '#5d8a7a';
  const flagC = '#24395c';
  const litP = buildings.cityHallWindowLitShare;

  // Design square: half sizes kept a metre inside the block edge.
  const hw = s.hw - 1;
  const hd = s.hd - 1;
  const W = 2 * hw;
  const D = 22;
  const zc = -hd + D / 2;
  const front = zc + D / 2;
  const H1 = 5.0; // top of the ground floor
  const H2 = 9.4; // top of the piano nobile
  const H3 = 13.6; // top of the second floor, under the cornice
  const pav = { w: 10, z: front + 1.0, top: 17.6 }; // central pavilion

  const kb = k.batch;
  // Plinth and walls: weathered cut stone on the body, a darker plinth.
  kb.withSurface(SURFACE.STONE, () => k.box(plinthStone, W + 0.4, 0.8, D + 0.4, 0, 0, zc));
  kb.withSurface(SURFACE.STONE_AGED, () => k.box(stone, W, H3 - 0.4, D, 0, 0.4, zc));
  kb.withSurface(SURFACE.TRIM_AGED, () => {
    // String courses at each floor, standing 0.3 m proud of the wall.
    for (const y of [H1, H2]) k.box(trim, W + 0.6, 0.3, D + 0.6, 0, y - 0.15, zc);
    // Cornice ring, so the roof stays open at the top.
    for (const z of [front, -hd]) k.box(trim, W + 0.9, 0.55, 0.55, 0, H3 - 0.1, z);
    for (const x of [-W / 2, W / 2]) k.box(trim, 0.55, 0.55, D + 0.2, x, H3 - 0.1, zc);
  });

  // Hipped roof: five stepped slate courses with alternating tones, then a copper cupola with standing seams.
  const w0 = W + 0.4;
  const d0 = D + 0.4;
  kb.withSurface(SURFACE.TILE_SLATE, () => {
    for (let i = 0; i < 5; i++) {
      const wa = w0 + ((12 - w0) * i) / 5;
      const wb = w0 + ((12 - w0) * (i + 1)) / 5;
      const da = d0 + ((6 - d0) * i) / 5;
      const db = d0 + ((6 - d0) * (i + 1)) / 5;
      k.frust(k.jit(i % 2 ? roof : slateB, 0.03), wa, da, wb, db, 1, 0, H3 + 0.45 + i, zc);
    }
  });
  kb.withSurface(SURFACE.ZINC, () => {
    k.cyl(copper, 1.5, 1.6, 2.2, 0, H3 + 5.45, zc, 12);
    k.cone(copper, 1.8, 2.6, 0, H3 + 7.65, zc, 12);
  });

  // Central pavilion: a projecting stone block with a pediment.
  kb.withSurface(SURFACE.STONE_AGED, () => k.box(stone, pav.w, pav.top - H3 + 0.2, 2.4, 0, H3 - 0.2, pav.z));
  kb.withSurface(SURFACE.TRIM_AGED, () => {
    k.box(trim, pav.w + 0.4, 0.45, 2.7, 0, pav.top - 0.2, pav.z);
    k.gableRoof(trim, pav.w + 0.6, 2.6, 2.6, 0, pav.top + 0.25, pav.z);
  });

  // Facade rhythm: the same on the front and back, shorter on the sides.
  for (const f of ['front', 'back', 'left', 'right'] as const) {
    onFace(k, f, 0, zc, W, D, (span) => {
      const sideways = f === 'left' || f === 'right';
      const us = sideways ? [-6.0, 0, 6.0] : [-8.5, -3.5, 3.5, 8.5];
      for (const u of us) {
        if (!sideways && Math.abs(u) < pav.w / 2 + 1.0) continue;
        kb.withSurface(SURFACE.TRIM_AGED, () => {
          archWindow(k, u, 0.6, 2.2, 3.4, k.chance(litP), trim);
          k.gableRoof(trim, 2.3, 0.6, 0.3, u, H1 + 3.9, 0.2);
        });
        mullionWindow(k, u, H1 + 0.9, 1.8, 2.9, k.chance(litP), trim);
        mullionWindow(k, u, H2 + 0.9, 1.6, 2.6, k.chance(litP), trim);
      }
      if (!sideways) archWindow(k, 0, 0.25, 3.2, 4.4, false, trim, '#4a5a68');
      // Pilasters with a moulded capital between the bays, standing proud of the stone.
      const pil = sideways ? [-D / 2 + 3.5, 0, D / 2 - 3.5] : [-10.6, -6.0, 6.0, 10.6];
      kb.withSurface(SURFACE.TRIM_AGED, () => {
        for (const u of pil) {
          if (!sideways && Math.abs(u) < pav.w / 2 + 0.6) continue;
          k.box(trim, 0.8, H3 - 0.55, 0.5, u, 0, 0.25);
          k.box(trim, 1.0, 0.35, 0.7, u, H3 - 0.55, 0.35);
        }
        corbels(k, trim, -span / 2 + 0.5, span / 2 - 0.5, H3 - 0.6, 1.0);
      });
      // Corner quoins on the long facades only (each corner is built once), alternating long and short blocks.
      if (!sideways) {
        kb.withSurface(SURFACE.STONE_AGED, () => {
          quoins(k, quoinStone, span / 2, 0.8, H3 - 0.5);
          quoins(k, quoinStone, -span / 2, 0.8, H3 - 0.5);
        });
      }
    });
  }

  // Ground-floor portico in front of the door: four columns carry an entablature, which carries the balcony.
  const porch = front + 1.5;
  kb.withSurface(SURFACE.TRIM_AGED, () => portico(k, trim, porch, [-4.6, -2.4, 2.4, 4.6]));

  // Balcony at the piano nobile with a railing, and its centre window above.
  const balcony = pav.z + 1.6;
  kb.withSurface(SURFACE.TRIM_AGED, () => {
    k.box(trim, 6.0, 0.35, 1.8, 0, H1, balcony);
    for (let i = 0; i <= 6; i++) k.box(trim, 0.12, 1.0, 0.12, -2.7 + i * 0.9, H1 + 0.35, balcony + 0.8);
    k.box(trim, 6.0, 0.12, 0.12, 0, H1 + 1.23, balcony + 0.8);
  });
  mullionWindow(k, 0, H1 + 0.9, 2.2, 3.0, k.chance(litP), trim);
  kb.withSurface(SURFACE.TRIM_AGED, () => k.gableRoof(trim, 2.6, 0.7, 0.3, 0, H1 + 4.2, pav.z + 1.2));

  // Two flagpoles on the forecourt.
  for (const sx of [-1, 1]) flagpole(k, sx * 12.4, front + 4.6, 12, flagC, sx > 0 ? '#c8231e' : undefined);
}

/** Four-column portico in front of the door at local z: plinth blocks, round shafts, capitals and an entablature. */
function portico(k: Kit, c: string, z: number, columnX: number[]): void {
  for (const x of columnX) {
    k.box(c, 0.9, 0.3, 0.9, x, 0.8, z);
    k.cyl(c, 0.36, 0.42, 3.15, x, 1.1, z, 14);
    k.box(c, 0.9, 0.25, 0.9, x, 4.25, z);
  }
  k.box(c, 11.0, 0.5, 1.0, 0, 4.5, z);
}

/**
 * Rectangular window with a stone frame, a central mullion, a transom, a projecting sill and a lintel,
 * so each light reads as glass in a frame. The mullion and transom run through the frame into the wall
 * (no coplanar faces with the glass or the frame).
 */
function mullionWindow(k: Kit, x: number, y0: number, w: number, h: number, lit: boolean, frame: string): void {
  windowAt(k, x, y0, w, h, lit, { frame });
  k.batch.withSurface(SURFACE.TRIM_AGED, () => {
    k.box(frame, 0.09, h, 0.25, x, y0, 0.1);
    k.box(frame, w, 0.09, 0.25, x, y0 + h * 0.55, 0.1);
    // Projecting stone sill under the opening.
    k.box(frame, w + 0.5, 0.14, 0.4, x, y0 - 0.07, 0.2);
  });
}
