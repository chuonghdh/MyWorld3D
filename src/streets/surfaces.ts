// Ground-level streetscape: grass and town edge, sidewalk and plaza slabs, courtyards, crosswalks, tree pits.
// Roads, markings and junctions live in surfaceRoads.ts; rounded kerbs and sidewalks in surfaceKerbs.ts;
// heights and colours in surfaceLevels.ts. This file keeps the barrel and the remaining surfaces.

import type { Block, CityLayout, Crosswalk } from '../city/layout';
import { MeshBuilder } from './builder';
import { COLORS, GROUND_Y, PAINT_Y, SIDEWALK_OVERLAY_Y, SIDEWALK_TOP, TREE_PIT_SIZE } from './surfaceLevels';
import { buildIntersection, buildRoad } from './surfaceRoads';
import { buildSidewalks } from './surfaceKerbs';

export * from './surfaceLevels';
export * from './surfaceRoads';
export * from './surfaceKerbs';

const OUTSIDE_GRASS = 150;
const EDGE_WIDTH = 0.8;

/** Zebra crossing: stripes run along the traffic, repeated across the road. */
function buildCrosswalk(cw: Crosswalk, overlay: MeshBuilder): void {
  const stripe = 0.5;
  const gap = 0.5;
  const usable = cw.length - 0.6;
  const n = Math.max(1, Math.floor((usable + gap) / (stripe + gap)));
  const total = n * stripe + (n - 1) * gap;
  const walkX = cw.orientation === 'horizontal';
  const y = PAINT_Y + 0.004;
  for (let i = 0; i < n; i++) {
    const s = -total / 2 + i * (stripe + gap) + stripe / 2;
    if (walkX) {
      overlay.rect(y, cw.center.x + s - stripe / 2, cw.center.x + s + stripe / 2, cw.center.z - cw.width / 2, cw.center.z + cw.width / 2, COLORS.paint);
    } else {
      overlay.rect(y, cw.center.x - cw.width / 2, cw.center.x + cw.width / 2, cw.center.z + s - stripe / 2, cw.center.z + s + stripe / 2, COLORS.paint);
    }
  }
}

/** Grass courtyard with gravel paths (a cross, plus a loop in large courtyards). */
function buildCourtyard(block: Block, surf: MeshBuilder, overlay: MeshBuilder): void {
  const b = block.bounds;
  const c = block.courtyard;
  if (!c) {
    surf.box(b.minX, b.maxX, GROUND_Y, SIDEWALK_TOP, b.minZ, b.maxZ, COLORS.sidewalk);
    return;
  }
  // Paved ring under the houses (abutting, not overlapping, the courtyard).
  surf.box(b.minX, b.maxX, GROUND_Y, SIDEWALK_TOP, b.minZ, c.minZ, COLORS.sidewalk);
  surf.box(b.minX, b.maxX, GROUND_Y, SIDEWALK_TOP, c.maxZ, b.maxZ, COLORS.sidewalk);
  surf.box(b.minX, c.minX, GROUND_Y, SIDEWALK_TOP, c.minZ, c.maxZ, COLORS.sidewalk);
  surf.box(c.maxX, b.maxX, GROUND_Y, SIDEWALK_TOP, c.minZ, c.maxZ, COLORS.sidewalk);
  surf.box(c.minX, c.maxX, GROUND_Y, SIDEWALK_TOP, c.minZ, c.maxZ, COLORS.courtyardGrass);

  const w = c.maxX - c.minX;
  const d = c.maxZ - c.minZ;
  if (w < 4 || d < 4) return;
  const cx = (c.minX + c.maxX) / 2;
  const cz = (c.minZ + c.maxZ) / 2;
  const pw = Math.min(1.4, Math.min(w, d) * 0.12);
  const y = SIDEWALK_OVERLAY_Y;
  // Cross.
  overlay.rect(y, c.minX, c.maxX, cz - pw / 2, cz + pw / 2, COLORS.gravel);
  overlay.rect(y, cx - pw / 2, cx + pw / 2, c.minZ, cz - pw / 2, COLORS.gravel);
  overlay.rect(y, cx - pw / 2, cx + pw / 2, cz + pw / 2, c.maxZ, COLORS.gravel);
  // Loop in larger courtyards, leaving lawn beds for hedges and trees on both sides.
  if (w >= 14 && d >= 14) {
    const ix = w * 0.27, iz = d * 0.27;
    const x0 = c.minX + ix, x1 = c.maxX - ix, z0 = c.minZ + iz, z1 = c.maxZ - iz;
    overlay.rect(y, x0, x1, z0, z0 + pw, COLORS.gravel);
    overlay.rect(y, x0, x1, z1 - pw, z1, COLORS.gravel);
    overlay.rect(y, x0, x0 + pw, z0 + pw, z1 - pw, COLORS.gravel);
    overlay.rect(y, x1 - pw, x1, z0 + pw, z1 - pw, COLORS.gravel);
  }
}

/** Monument block: paved plaza with a border band and a two-tone checker of stone slabs. */
function buildPlaza(block: Block, surf: MeshBuilder, overlay: MeshBuilder): void {
  const b = block.bounds;
  surf.box(b.minX, b.maxX, GROUND_Y, SIDEWALK_TOP, b.minZ, b.maxZ, COLORS.plazaLight);
  const w = b.maxX - b.minX;
  const d = b.maxZ - b.minZ;
  const border = Math.min(1, Math.min(w, d) * 0.06);
  const y = SIDEWALK_OVERLAY_Y;
  overlay.rect(y, b.minX, b.maxX, b.minZ, b.minZ + border, COLORS.plazaBorder);
  overlay.rect(y, b.minX, b.maxX, b.maxZ - border, b.maxZ, COLORS.plazaBorder);
  overlay.rect(y, b.minX, b.minX + border, b.minZ + border, b.maxZ - border, COLORS.plazaBorder);
  overlay.rect(y, b.maxX - border, b.maxX, b.minZ + border, b.maxZ - border, COLORS.plazaBorder);

  const x0 = b.minX + border, x1 = b.maxX - border, z0 = b.minZ + border, z1 = b.maxZ - border;
  const tile = 3;
  const nx = Math.max(1, Math.round((x1 - x0) / tile));
  const nz = Math.max(1, Math.round((z1 - z0) / tile));
  const tx = (x1 - x0) / nx, tz = (z1 - z0) / nz;
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      if ((i + j) % 2 === 0) continue;
      overlay.rect(y, x0 + i * tx, x0 + (i + 1) * tx, z0 + j * tz, z0 + (j + 1) * tz, COLORS.plazaDark);
    }
  }
}

/** Grass around the town, a stone edge on the town boundary and a paved base inside it. */
function buildGround(layout: CityLayout, surf: MeshBuilder): void {
  const t = layout.townBounds;
  const e = EDGE_WIDTH;
  const g = OUTSIDE_GRASS;
  // Paved base for any gap not covered by roads, sidewalks or blocks.
  surf.rect(GROUND_Y, t.minX, t.maxX, t.minZ, t.maxZ, COLORS.townBase);
  // Stone edge.
  surf.box(t.minX - e, t.maxX + e, -0.1, 0.12, t.minZ - e, t.minZ, COLORS.townEdge);
  surf.box(t.minX - e, t.maxX + e, -0.1, 0.12, t.maxZ, t.maxZ + e, COLORS.townEdge);
  surf.box(t.minX - e, t.minX, -0.1, 0.12, t.minZ, t.maxZ, COLORS.townEdge);
  surf.box(t.maxX, t.maxX + e, -0.1, 0.12, t.minZ, t.maxZ, COLORS.townEdge);
  // Grass ring (no overlap with the town, so nothing fights).
  const ox0 = t.minX - e, ox1 = t.maxX + e, oz0 = t.minZ - e, oz1 = t.maxZ + e;
  surf.rect(GROUND_Y, ox0 - g, ox1 + g, oz1, oz1 + g, COLORS.grass);
  surf.rect(GROUND_Y, ox0 - g, ox1 + g, oz0 - g, oz0, COLORS.grass);
  surf.rect(GROUND_Y, ox0 - g, ox0, oz0, oz1, COLORS.grass);
  surf.rect(GROUND_Y, ox1, ox1 + g, oz0, oz1, COLORS.grass);
}

function buildTreePits(layout: CityLayout, overlay: MeshBuilder): void {
  const rim = 0.1;
  for (const tree of layout.streetTrees) {
    if (tree.setting !== 'street') continue;
    const { x, z } = tree.position;
    const h = TREE_PIT_SIZE / 2;
    const y = SIDEWALK_OVERLAY_Y;
    overlay.rect(y, x - h, x + h, z - h, z - h + rim, COLORS.treePitEdge);
    overlay.rect(y, x - h, x + h, z + h - rim, z + h, COLORS.treePitEdge);
    overlay.rect(y, x - h, x - h + rim, z - h + rim, z + h - rim, COLORS.treePitEdge);
    overlay.rect(y, x + h - rim, x + h, z - h + rim, z + h - rim, COLORS.treePitEdge);
    overlay.rect(y, x - h + rim, x + h - rim, z - h + rim, z + h - rim, COLORS.treePit);
  }
}

/** Fills `surf` (opaque ground surfaces) and `overlay` (paint and decals) for the whole layout. */
export function buildSurfaces(layout: CityLayout, surf: MeshBuilder, overlay: MeshBuilder): void {
  buildGround(layout, surf);
  for (const it of layout.intersections) buildIntersection(it, surf);
  for (const road of layout.roads) {
    buildRoad(road, layout, surf, overlay);
    buildSidewalks(road, layout, surf);
  }
  for (const cw of layout.crosswalks) buildCrosswalk(cw, overlay);
  for (const block of layout.blocks) {
    if (block.kind === 'monument') buildPlaza(block, surf, overlay);
    else buildCourtyard(block, surf, overlay);
  }
  buildTreePits(layout, overlay);
}
