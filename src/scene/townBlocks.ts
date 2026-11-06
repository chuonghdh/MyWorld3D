// Block pieces of the town: types and pure helpers for placing, building parameters and picking.
import * as THREE from 'three';
import type { Block, CityLayout, Lot, Rect } from '../city';
import { defaultHouseParams, presetDefaultShutter, presetHasShutters, type HouseParams } from '../buildings';
import type { HouseOverride } from '../store';
import type { MonumentKind } from '../core/types';
import { blockPresetFor, lotStyle } from './cityStyle';
import { disposeMerged } from './mergeBlock';

/**
 * Monument a block shows before any override: the kind the layout chose for it (seeded, city/generate.ts).
 * A block without a kind (never a monument in the layout) falls back to the panel default.
 */
export function monumentBaseFor(block: Pick<Block, 'monument'> | undefined): MonumentKind {
  return block?.monument ?? 'hospital';
}

export interface LotHit {
  id: string;
  x: number;
  z: number;
  facing: number;
  width: number;
  depth: number;
  /** Height of the house, for the selection frame. */
  height?: number;
}

export interface BlockPiece {
  key: string;
  blockId: string;
  kind: 'houses' | 'monument';
  object: THREE.Object3D;
  lots: LotHit[];
  /** Chimney pot tops in world coordinates, for the smoke system. */
  chimneys: { x: number; y: number; z: number }[];
  /** Inputs the piece was built from; equal signatures reuse the built geometry. */
  signature: string;
}

export function centerOf(r: Rect): { x: number; z: number } {
  return { x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2 };
}

/**
 * Maps each content block to the slot it currently occupies.
 * Slots come from the base order; blockOrder says which content sits in each slot,
 * so a drag-swap moves the houses (or monument) of two blocks with it.
 */
export function placeBlocks(layout: CityLayout, order: string[], base: string[]) {
  const byId = new Map<string, Block>(layout.blocks.map((b) => [b.id, b]));
  const placed: { block: Block; offset: { x: number; z: number } }[] = [];
  order.forEach((contentId, i) => {
    const slot = byId.get(base[i] ?? contentId);
    const block = byId.get(contentId);
    if (!slot || !block) return;
    const s = centerOf(slot.bounds);
    const c = centerOf(block.bounds);
    placed.push({ block, offset: { x: s.x - c.x, z: s.z - c.z } });
  });
  return placed;
}

export function lotMatrix(lot: Lot, offset: { x: number; z: number }): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(lot.position.x + offset.x, 0, lot.position.z + offset.z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), lot.facing),
    new THREE.Vector3(1, 1, 1),
  );
}

export function houseParamsFor(lot: Lot, blockId: string, ov: HouseOverride): HouseParams {
  const style = lotStyle(lot, blockPresetFor(styleKeyFor(lot, blockId)));
  const preset = ov.preset && ov.preset !== 'as-block' ? ov.preset : style.preset;
  const defaults = defaultHouseParams(preset, ov.style ?? 'classic');
  // A type the user picked gets shutters when it can carry them, even on a lot whose style has none.
  // Untouched houses keep the lot's look.
  const pickedShutter = ov.preset && ov.preset !== 'as-block' && presetHasShutters(preset) ? presetDefaultShutter(preset) : null;
  return {
    ...defaults,
    preset,
    floors: ov.floors ?? lot.floors,
    roof: ov.roof ?? defaults.roof,
    style: ov.style ?? defaults.style,
    wallColor: ov.wallColor ?? style.wallColor,
    shutterColor: ov.shutterColor ?? style.shutterColor ?? pickedShutter,
    width: lot.width,
    depth: lot.depth,
    facades: lot.facades,
    groundFloor: lot.groundFloor,
    seed: lot.seed,
    ...(blockId.startsWith('merged-') ? { sharedCourtyard: true } : {}),
  };
}

/** Lots per style run along a merged block's perimeter (about one side of an original block). */
const MERGED_STYLE_RUN = 5;

/**
 * Key of the dominant style of a lot. A plain block has one style; a merged block (2 to 4 times the perimeter)
 * changes its dominant style every few lots along the ring, so long sides do not repeat one style all round.
 */
export function styleKeyFor(lot: Lot, blockId: string): string {
  if (!blockId.startsWith('merged-')) return blockId;
  const k = Number(/-lot-(\d+)$/.exec(lot.id)?.[1] ?? 0);
  return `${blockId}:run-${Math.floor(k / MERGED_STYLE_RUN)}`;
}

/** The lot under a world point, using each lot's rotated footprint plus its street-side protrusion zone. */
export function lotAt(lots: readonly LotHit[], p: THREE.Vector3): LotHit | null {
  let best: LotHit | null = null;
  let bestD = Infinity;
  for (const l of lots) {
    const dx = p.x - l.x;
    const dz = p.z - l.z;
    const c = Math.cos(l.facing);
    const s = Math.sin(l.facing);
    const lx = dx * c - dz * s;
    const lz = dx * s + dz * c;
    if (Math.abs(lx) > l.width / 2 + 0.3 || Math.abs(lz) > l.depth / 2 + 1.6) continue;
    const d = dx * dx + dz * dz;
    if (d < bestD) {
      bestD = d;
      best = l;
    }
  }
  return best;
}

export function disposePiece(piece: BlockPiece): void {
  if (piece.object instanceof THREE.Group) disposeMerged(piece.object);
}

/** The values a house has as its block gives them, before any override. Null when the house is not in the layout. */
export function houseBaseFor(layout: CityLayout, houseId: string) {
  const lot = layout.lots.find((l) => l.id === houseId);
  if (!lot) return null;
  const p = houseParamsFor(lot, lot.blockId, {});
  return {
    preset: p.preset,
    floors: p.floors,
    roof: p.roof,
    style: p.style,
    wallColor: p.wallColor,
    shutterColor: p.shutterColor,
  };
}
