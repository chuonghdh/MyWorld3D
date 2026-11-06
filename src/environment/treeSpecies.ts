// Species shapes for the procedural trees: trunk, branch and crown blob layouts per species, and the range helper.

import type { TreeSpecies } from '../core/types';

// ---------------------------------------------------------------------------
// Species shapes
// ---------------------------------------------------------------------------

interface Blob {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
}

interface SpeciesShape {
  trunkHeight: number;
  trunkRadius: number;
  /** Main branch direction: angle from vertical in radians. */
  branchTilt: number;
  branchLength: number;
  /** Where the crown starts and ends (for bare winter branches). */
  crownBottom: number;
  crownTop: number;
  crownRadius: number;
  bark: string;
  barkDark: string;
  crown(rng: () => number): Blob[];
}

export const range = (rng: () => number, lo: number, hi: number) => lo + (hi - lo) * rng();

export const SHAPES: Record<TreeSpecies, SpeciesShape> = {
  // Rounded crown, centre ~5 m, radius ~2.7 m, top ~7.6 m.
  maple: {
    trunkHeight: 3.6,
    trunkRadius: 0.2,
    branchTilt: 0.65,
    branchLength: 2.0,
    crownBottom: 3.0,
    crownTop: 7.4,
    crownRadius: 2.4,
    bark: '#5e4a3a',
    barkDark: '#45352a',
    crown(rng) {
      const blobs: Blob[] = [];
      const cy = 5.0;
      const core = range(rng, 1.55, 1.75);
      blobs.push({ x: 0, y: cy, z: 0, rx: core, ry: core * 0.92, rz: core });
      const n = 6 + Math.floor(rng() * 3); // 6-8 around the core
      for (let i = 0; i < n; i++) {
        const az = (i / n) * Math.PI * 2 + range(rng, -0.35, 0.35);
        const el = range(rng, -0.45, 0.95);
        const d = range(rng, 1.15, 1.45);
        const r = range(rng, 0.95, 1.3);
        blobs.push({
          x: Math.cos(az) * Math.cos(el) * d,
          y: cy + Math.sin(el) * d * 0.9,
          z: Math.sin(az) * Math.cos(el) * d,
          rx: r,
          ry: r * range(rng, 0.85, 1.0),
          rz: r,
        });
      }
      return blobs;
    },
  },
  // Wide, irregular, low crown: centre ~4.4 m, radius ~3.3 m, top ~6.7 m.
  oak: {
    trunkHeight: 3.0,
    trunkRadius: 0.27,
    branchTilt: 0.95,
    branchLength: 2.4,
    crownBottom: 2.7,
    crownTop: 6.4,
    crownRadius: 2.9,
    bark: '#4f4033',
    barkDark: '#3a2f26',
    crown(rng) {
      const blobs: Blob[] = [];
      const cy = 4.4;
      const n = 7 + Math.floor(rng() * 3); // 7-9
      const stretch = range(rng, 0.8, 1.15);
      for (let i = 0; i < n; i++) {
        const az = (i / n) * Math.PI * 2 + range(rng, -0.5, 0.5);
        const d = i === 0 ? 0 : range(rng, 0.9, 2.0);
        const r = range(rng, 1.1, 1.55);
        blobs.push({
          x: Math.cos(az) * d * stretch,
          y: cy + range(rng, -0.55, 0.75) - d * 0.12,
          z: (Math.sin(az) * d) / stretch,
          rx: r,
          ry: r * range(rng, 0.68, 0.85),
          rz: r * range(rng, 0.9, 1.1),
        });
      }
      return blobs;
    },
  },
  // Narrow oval crown on a tall white trunk: radius ~1.7 m, top ~8.5 m.
  birch: {
    trunkHeight: 6.4,
    trunkRadius: 0.15,
    branchTilt: 0.45,
    branchLength: 1.5,
    crownBottom: 3.6,
    crownTop: 8.3,
    crownRadius: 1.5,
    bark: '#ece8df',
    barkDark: '#2a2624',
    crown(rng) {
      const blobs: Blob[] = [];
      const n = 5 + Math.floor(rng() * 3); // 5-7
      const lo = 4.4;
      const hi = 7.6;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const bulge = Math.sin(Math.PI * (0.15 + 0.75 * t)); // widest a little below the middle
        const r = (0.75 + 0.4 * bulge) * range(rng, 0.9, 1.1);
        const az = rng() * Math.PI * 2;
        const off = range(rng, 0.15, 0.55) * bulge;
        blobs.push({
          x: Math.cos(az) * off,
          y: lo + (hi - lo) * t + range(rng, -0.2, 0.2),
          z: Math.sin(az) * off,
          rx: r,
          ry: r * range(rng, 1.15, 1.35),
          rz: r,
        });
      }
      return blobs;
    },
  },
  // Conical, upright crown: base radius ~2.3 m at 3.6 m, tip ~8.6 m.
  ginkgo: {
    trunkHeight: 6.8,
    trunkRadius: 0.19,
    branchTilt: 0.5,
    branchLength: 1.8,
    crownBottom: 3.0,
    crownTop: 8.4,
    crownRadius: 2.0,
    bark: '#5a4b3e',
    barkDark: '#423629',
    crown(rng) {
      const blobs: Blob[] = [];
      const n = 6 + Math.floor(rng() * 3); // 6-8
      const lo = 3.9;
      const hi = 7.9;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const r = (1.35 * (1 - 0.68 * t) + 0.3) * range(rng, 0.9, 1.1);
        const az = rng() * Math.PI * 2;
        const off = range(rng, 0.2, 0.75) * (1 - t) * 1.2;
        blobs.push({
          x: Math.cos(az) * off,
          y: lo + (hi - lo) * Math.pow(t, 0.9),
          z: Math.sin(az) * off,
          rx: r,
          ry: r * range(rng, 0.8, 1.0),
          rz: r,
        });
      }
      return blobs;
    },
  },
};
