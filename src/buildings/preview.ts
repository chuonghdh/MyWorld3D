// Single free-standing house for UI thumbnails (House panel type carousel).
//
// Uses the same builder and preset defaults as the town (buildHouse + defaultHouseParams), so the picture
// matches what the user gets. The meshes keep the shared building materials (body, glass, glassLit, sign):
// their shader patches read module-level uniforms (wind, weather, cloud shade, glass sky), so they render
// outside the town without extra setup. Only the per-preview geometries are owned by the group.

import * as THREE from 'three';
import type { HousePreset } from '../core/types';
import {
  buildHouse,
  defaultHouseParams,
  houseFootprint,
  presetDefaultShutter,
  presetHasShutters,
  resolvePreset,
  MAX_FLOORS,
  MIN_FLOORS,
} from './house';

/** Storeys of a preview house when the caller passes none (contract with the House panel carousel). */
export const PREVIEW_FLOORS = 3;
/** Fixed detail seed so thumbnails are stable between runs. */
export const PREVIEW_SEED = 1;

/**
 * Builds one free-standing house of the preset: its default roof, wall and shutter colours (classic style;
 * presets without a classic shutter use presetDefaultShutter, matching a type picked on a bare town lot),
 * default lot width and depth, default ground floor use, and street facades on all four sides.
 * Base at y = 0, lot centred on the origin, front facade facing +Z.
 */
export function buildHousePreview(preset: HousePreset, floors: number = PREVIEW_FLOORS): THREE.Group {
  const p = resolvePreset(preset);
  const { width, depth } = houseFootprint(p);
  const n = Number.isFinite(floors) ? Math.min(MAX_FLOORS, Math.max(MIN_FLOORS, Math.round(floors))) : PREVIEW_FLOORS;
  const defaults = defaultHouseParams(p, 'classic');
  // Presets without a classic shutter (canal, brownstone, nordic) get their fill shutter, as a type picked in town does.
  const shutterColor = defaults.shutterColor ?? (presetHasShutters(p) ? presetDefaultShutter(p) : null);
  const group = buildHouse({
    ...defaults,
    shutterColor,
    floors: n,
    width,
    depth,
    facades: { front: true, back: true, left: true, right: true },
    seed: PREVIEW_SEED,
  });
  group.name = `house-preview-${p}`;
  group.userData.preview = true;
  return group;
}

/** World-space bounds of a preview (includes projecting balconies, awnings and chimneys). */
export function housePreviewBounds(g: THREE.Group): THREE.Box3 {
  g.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(g);
}

/**
 * Frees the geometries created for the preview. Materials are the shared building materials (also used by
 * the town) and are never disposed here.
 */
export function disposeHousePreview(g: THREE.Group): void {
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) o.geometry.dispose();
  });
  g.clear();
}
