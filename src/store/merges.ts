// Block merge edits on the saved layout data (phase 2, block editor). Pure functions; the store wraps them so
// a merge or split is one undoable step together with the block order it implies.
import { parseHouseBlockId, parseMergedBlockId } from '../core/blockIds';

/** Merge groups after adding `group`: groups that share a block with it are absorbed (it grows from them). */
export function withMergeGroup(merges: readonly string[][], group: readonly string[]): string[][] {
  const ids = new Set(group);
  return merges.filter((g) => !g.some((id) => ids.has(id))).concat([[...group]]);
}

/** Merge groups after splitting the merged block `mergedId` (its group is removed; other groups stay). */
export function withoutMergeGroup(merges: readonly string[][], mergedId: string): string[][] {
  const rect = parseMergedBlockId(mergedId);
  if (!rect) return merges.map((g) => [...g]);
  const inside = (id: string) => {
    const cell = parseHouseBlockId(id);
    return cell !== null && cell.c >= rect.c0 && cell.c <= rect.c1 && cell.r >= rect.r0 && cell.r <= rect.r1;
  };
  return merges.filter((g) => !(g.length > 0 && g.every(inside))).map((g) => [...g]);
}

/**
 * Block order for a layout whose block ids changed from `oldBase` to `fresh` (a merge or a split).
 * Swaps between blocks that still exist are kept; a slot whose content left (or that is new) shows its own block.
 * If keeping the swaps would not give a valid order (a swap cycle touched a changed block), every slot shows its
 * own block again.
 */
export function remapBlockOrder(oldOrder: readonly string[], oldBase: readonly string[], fresh: readonly string[]): string[] {
  const freshSet = new Set(fresh);
  const oldSet = new Set(oldBase);
  const changed = (id: string) => !freshSet.has(id) || !oldSet.has(id);
  const next = fresh.map((slot) => {
    if (changed(slot)) return slot;
    const i = oldBase.indexOf(slot);
    const content = oldOrder[i] ?? slot;
    return changed(content) ? slot : content;
  });
  return new Set(next).size === fresh.length ? next : [...fresh];
}
