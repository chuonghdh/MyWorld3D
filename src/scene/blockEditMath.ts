// Pure rules for the block editor (merge and split from the map). No Three.js, no React.
// Ids: slots are the layout's block positions (base order); contents are the blocks shown in them (block order),
// so a drag-swap can put one block's houses in another block's slot. Merging works on slots that show themselves.
import { mergeSuggestions, parseHouseBlockId, parseMergedBlockId } from '../city/merge';

export interface EditRect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface EditBlock {
  id: string;
  kind: 'houses' | 'monument';
  bounds: EditRect;
}

export interface EditLayout {
  blocks: readonly EditBlock[];
}

export interface BlockEditState {
  layout: EditLayout;
  /** Content id per slot (store blockOrder). */
  order: readonly string[];
  /** Slot ids (store baseBlockOrder). */
  base: readonly string[];
  /** Per-block kind overrides (store blockOverrides). */
  overrides: Readonly<Record<string, { kind?: 'houses' | 'monument' }>>;
}

export function blockById(layout: EditLayout, id: string): EditBlock | undefined {
  return layout.blocks.find((b) => b.id === id);
}

/** The block whose bounds hold the ground point (x, z), or null on a street or outside the town. */
export function blockAt(layout: EditLayout, x: number, z: number): EditBlock | null {
  for (const b of layout.blocks) {
    const r = b.bounds;
    if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) return b;
  }
  return null;
}

/** The block shown in a slot (itself unless swapped). */
export function contentAt(s: BlockEditState, slot: string): string {
  const i = s.base.indexOf(slot);
  return i >= 0 ? (s.order[i] ?? slot) : slot;
}

/** Kind a block has once its override is applied. */
export function effectiveKind(s: BlockEditState, id: string): 'houses' | 'monument' | null {
  const b = blockById(s.layout, id);
  if (!b) return null;
  return s.overrides[id]?.kind ?? b.kind;
}

/**
 * What a tap at ground point (x, z) selects in block mode: a monument (by its content id, like house mode does)
 * or a house block slot. Null on a street, outside the town, or where a swap put a monument and a house block in
 * each other's slot (no sensible block to edit there).
 */
export function resolveBlockTap(s: BlockEditState, x: number, z: number): { type: 'block'; id: string } | null {
  const slot = blockAt(s.layout, x, z);
  if (!slot) return null;
  const content = contentAt(s, slot.id);
  const contentKind = effectiveKind(s, content);
  if (contentKind === 'monument') return { type: 'block', id: content };
  if (effectiveKind(s, slot.id) !== 'houses') return null;
  return { type: 'block', id: slot.id };
}

/** True when a block selection is a house block (or merged block) handled by the block editor. */
export function isHouseBlock(s: BlockEditState, id: string): boolean {
  return effectiveKind(s, id) === 'houses';
}

/** A block may take part in a merge: a house block in the layout, not turned into a monument, not swapped. */
export function canMerge(s: BlockEditState, id: string): boolean {
  if (effectiveKind(s, id) !== 'houses') return false;
  if (s.base.length > 0 && contentAt(s, id) !== id) return false;
  // The slot must not show some other block, and the block must not be shown somewhere else.
  return s.order.length === 0 || s.order.indexOf(id) === s.base.indexOf(id);
}

/** Merge suggestions for a selected house or merged block (lists of block ids to add). */
export function suggestionsFor(s: BlockEditState, id: string): string[][] {
  return mergeSuggestions(s.layout, id, (b) => canMerge(s, b));
}

/** Size of a block in grid cells (columns x rows). */
export function cellSize(id: string): { cols: number; rows: number } {
  const m = parseMergedBlockId(id);
  if (m) return { cols: m.c1 - m.c0 + 1, rows: m.r1 - m.r0 + 1 };
  return parseHouseBlockId(id) ? { cols: 1, rows: 1 } : { cols: 0, rows: 0 };
}

export function isMergedId(id: string): boolean {
  return parseMergedBlockId(id) !== null;
}

/** Union of the bounds of some blocks (a suggestion box), or null if none of them exists. */
export function unionOf(layout: EditLayout, ids: readonly string[]): EditRect | null {
  let r: EditRect | null = null;
  for (const id of ids) {
    const b = blockById(layout, id);
    if (!b) continue;
    r = r
      ? { minX: Math.min(r.minX, b.bounds.minX), maxX: Math.max(r.maxX, b.bounds.maxX), minZ: Math.min(r.minZ, b.bounds.minZ), maxZ: Math.max(r.maxZ, b.bounds.maxZ) }
      : { ...b.bounds };
  }
  return r;
}

/** Index of the first rectangle holding the point, or -1. */
export function rectIndexAt(rects: readonly (EditRect | null)[], x: number, z: number): number {
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    if (r && x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) return i;
  }
  return -1;
}
