// Picks house presets and colours per block and lot, so streets read as one city
// with neighbours that still differ. Pure functions of ids, hence stable across reloads.
import type { HousePreset } from '../core/types';
import type { Lot } from '../city';
import { hashId } from './runtime';

type ConcretePreset = Exclude<HousePreset, 'as-block'>;

/** How common each preset is as a block's dominant style. Haussmann Paris dominates. */
const BLOCK_WEIGHTS: [ConcretePreset, number][] = [
  ['original-feuilles', 0.34],
  ['canal-amsterdam', 0.12],
  ['brownstone-ny', 0.1],
  ['mediterranean', 0.1],
  ['nordic-timber', 0.08],
  ['bauhaus', 0.08],
  ['shophouse-asia', 0.08],
  ['brutalist-concrete', 0.05],
  ['glass-tower', 0.05],
];

/** Share of lots in a block that follow the block's dominant preset. */
const BLOCK_COHESION = 0.72;

const WALLS: Record<ConcretePreset, string[]> = {
  'original-feuilles': ['#efe3c8', '#e3cfa5', '#f3efe7', '#c8c4bb', '#ead9b8', '#e6d3b3'],
  'canal-amsterdam': ['#9c4a36', '#8a4b33', '#a85a3e', '#5e3a2e', '#f3efe7', '#2f3d36'],
  'brownstone-ny': ['#8a4b33', '#9c4a36', '#7a4430', '#a85a3e'],
  mediterranean: ['#e2b66c', '#efc3a0', '#e8b4a8', '#c9714f', '#efe3c8', '#f3efe7'],
  'nordic-timber': ['#8f3b2b', '#d9a441', '#f3efe7', '#9fb1bf', '#6b7d5c'],
  bauhaus: ['#f3efe7', '#efe3c8', '#dcdcd6'],
  'shophouse-asia': ['#e8b4a8', '#b9cfdc', '#c9cfae', '#efc3a0', '#e2b66c'],
  'brutalist-concrete': ['#a5a29b', '#9d9b95', '#b3afa6'],
  'glass-tower': ['#8f9399', '#c8c4bb'],
};

const SHUTTERS = ['#5f7d63', '#3f6e8f', '#7a2e2a', '#e9dcc0', '#6c7378'];
/** Presets whose classic look has painted shutters. */
const SHUTTERED: ReadonlySet<ConcretePreset> = new Set(['mediterranean', 'shophouse-asia', 'nordic-timber']);

function weighted(r: number): ConcretePreset {
  let acc = 0;
  for (const [preset, w] of BLOCK_WEIGHTS) {
    acc += w;
    if (r < acc) return preset;
  }
  return BLOCK_WEIGHTS[0][0];
}

function pick<T>(list: readonly T[], r: number): T {
  return list[Math.floor(r * list.length) % list.length];
}

export function blockPresetFor(blockId: string): ConcretePreset {
  return weighted(hashId(blockId + ':preset'));
}

export interface LotStyle {
  preset: ConcretePreset;
  wallColor: string;
  shutterColor: string | null;
}

export function lotStyle(lot: Lot, blockPreset: ConcretePreset): LotStyle {
  const follows = hashId(lot.id + ':follow') < BLOCK_COHESION;
  let preset = follows ? blockPreset : weighted(hashId(lot.id + ':preset'));
  // Towers belong on wide lots only; elsewhere fall back to the block style.
  if (preset === 'glass-tower' && lot.width < 10) preset = blockPreset === 'glass-tower' ? 'bauhaus' : blockPreset;
  const wallColor = pick(WALLS[preset], hashId(lot.id + ':wall'));
  const shutterColor = SHUTTERED.has(preset)
    ? pick(SHUTTERS, hashId(lot.id + ':shutter'))
    : preset === 'original-feuilles' && hashId(lot.id + ':persienne') < 0.4
      ? pick(['#e9dcc0', '#6c7378'], hashId(lot.id + ':pc'))
      : null;
  return { preset, wallColor, shutterColor };
}
