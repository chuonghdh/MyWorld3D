// Block editor state for the app shell: which house block is selected, its suggestions, and the merge, split
// and grow actions shared by the map icons and the block panel.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CityLayout } from '../city';
import { grownGroup, mergedBlockId, parseHouseBlockId } from '../city/merge';
import { useWorldStore, type OverrideTarget } from '../store';
import {
  blockById,
  cellSize,
  isHouseBlock,
  isMergedId,
  resolveBlockTap,
  suggestionsFor,
  unionOf,
  type BlockEditState,
  type EditRect,
} from '../scene/blockEditMath';

export interface BlockEdit {
  /** The selected house or merged block id, or null. */
  blockId: string | null;
  rect: EditRect | null;
  cols: number;
  rows: number;
  merged: boolean;
  suggestions: string[][];
  suggestionRects: (EditRect | null)[];
  /** Size each suggestion would give, e.g. "2×2". */
  suggestionLabels: string[];
  growing: boolean;
  /** A merge or split is being applied (the scene is rebuilding). */
  busy: boolean;
  toggleGrow: () => void;
  apply: (index: number) => void;
  split: () => void;
  tapGround: (x: number, z: number) => void;
}

const centre = (r: EditRect) => ({ x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2 });
export { centre as rectCentre };

export function useBlockEdit(
  layout: CityLayout,
  selected: OverrideTarget | null,
  select: (t: OverrideTarget | null) => void,
): BlockEdit {
  const order = useWorldStore((s) => s.blockOrder);
  const base = useWorldStore((s) => s.baseBlockOrder);
  const overrides = useWorldStore((s) => s.blockOverrides);
  const editMode = useWorldStore((s) => s.editMode);
  const [growing, setGrowing] = useState(false);
  const [busy, setBusy] = useState(false);

  const state: BlockEditState = useMemo(
    () => ({ layout: layout as unknown as BlockEditState['layout'], order, base, overrides }),
    [layout, order, base, overrides],
  );
  const blockId = selected?.type === 'block' && isHouseBlock(state, selected.id) ? selected.id : null;
  const block = blockId ? blockById(state.layout, blockId) : undefined;
  const suggestions = useMemo(() => (blockId ? suggestionsFor(state, blockId) : []), [state, blockId]);
  const suggestionRects = useMemo(
    () => (growing ? suggestions.map((s) => unionOf(state.layout, s)) : []),
    [growing, suggestions, state],
  );

  // A new selection starts with the suggestions hidden.
  useEffect(() => setGrowing(false), [blockId]);

  // Crossing the height threshold drops a selection that does not belong to the new mode.
  useEffect(() => {
    if (!selected) return;
    const houseBlock = selected.type === 'block' && isHouseBlock(state, selected.id);
    if (editMode === 'block' && (selected.type === 'house' || selected.type === 'tree')) select(null);
    if (editMode === 'house' && houseBlock) select(null);
    // Only the mode change should clear; the selection itself is checked at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode]);

  // The scene rebuild after a merge or split takes most of a second (streets and the merged block's houses), so
  // the edit runs after the next paint: the suggestions disappear and the mode chip says "Updating" first.
  const afterPaint = (f: () => void) => {
    setBusy(true);
    setGrowing(false);
    requestAnimationFrame(() =>
      setTimeout(() => {
        const t0 = performance.now();
        f();
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            setBusy(false);
            // Dev timing: store update plus the next painted frame (layout regeneration and scene rebuild).
            if (import.meta.env.DEV) console.info(`[block merge] ${(performance.now() - t0).toFixed(0)} ms`);
          }),
        );
      }, 0),
    );
  };

  const apply = (index: number) => {
    const added = suggestions[index];
    if (!blockId || !added || busy) return;
    const group = grownGroup(blockId, added);
    const g = group.map((id) => parseHouseBlockId(id)!);
    const id = mergedBlockId({
      c0: Math.min(...g.map((x) => x.c)),
      c1: Math.max(...g.map((x) => x.c)),
      r0: Math.min(...g.map((x) => x.r)),
      r1: Math.max(...g.map((x) => x.r)),
    });
    afterPaint(() => {
      useWorldStore.getState().mergeBlockGroup(group);
      select({ type: 'block', id });
    });
  };

  const split = () => {
    if (!blockId || !isMergedId(blockId) || busy) return;
    const target = blockId;
    afterPaint(() => {
      useWorldStore.getState().splitMergedBlock(target);
      select(null);
    });
  };

  const tapGround = useCallback(
    (x: number, z: number) => {
      const t = resolveBlockTap(state, x, z);
      select(t);
    },
    [state, select],
  );

  const size = blockId ? cellSize(blockId) : { cols: 0, rows: 0 };
  const suggestionLabels = useMemo(
    () =>
      blockId
        ? suggestions.map((s) => {
            const g = grownGroup(blockId, s).map((id) => parseHouseBlockId(id)!);
            return `${new Set(g.map((x) => x.c)).size}×${new Set(g.map((x) => x.r)).size}`;
          })
        : [],
    [blockId, suggestions],
  );
  return {
    busy,
    suggestionLabels,
    blockId,
    rect: block ? block.bounds : null,
    cols: size.cols,
    rows: size.rows,
    merged: blockId ? isMergedId(blockId) : false,
    suggestions,
    suggestionRects,
    growing: growing && suggestions.length > 0,
    toggleGrow: () => setGrowing((g) => !g),
    apply,
    split,
    tapGround,
  };
}
