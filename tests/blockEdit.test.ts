// Block merge UI (phase 2): suggestion rules, edit mode by camera height, tap picking and the store actions.
import { beforeEach, describe, expect, it } from 'vitest';
import { generateCity, getCityLayout } from '../src/city';
import { grownGroup, houseBlockId, mergeSuggestions, parseHouseBlockId, parseMergedBlockId } from '../src/city/merge';
import { BLOCK_EDIT_HEIGHT_M, editModeForHeight } from '../src/scene/cameraMath';
import { canMerge, cellSize, resolveBlockTap, suggestionsFor, type BlockEditState } from '../src/scene/blockEditMath';
import { useWorldStore } from '../src/store';
import { createEmptyLayout, DEFAULT_SETTINGS, DEFAULT_TOGGLES } from '../src/store/model';
import { remapBlockOrder, withMergeGroup, withoutMergeGroup } from '../src/store/merges';

type Kind = 'houses' | 'monument';

/** A grid of blocks, 50 m cells with 10 m streets; `kinds[r][c]` ('h', 'm' or '.' for no block), row 0 is south. */
function grid(kinds: string[], merged: string[] = []) {
  const blocks: { id: string; kind: Kind; bounds: { minX: number; maxX: number; minZ: number; maxZ: number } }[] = [];
  kinds.forEach((row, r) =>
    [...row].forEach((k, c) => {
      if (k === '.') return;
      blocks.push({ id: houseBlockId(c, r), kind: k === 'm' ? 'monument' : 'houses', bounds: { minX: c * 60, maxX: c * 60 + 50, minZ: r * 60, maxZ: r * 60 + 50 } });
    }),
  );
  // Merged blocks replace their members, like generateCity does.
  for (const id of merged) {
    const m = parseMergedBlockId(id)!;
    const inside = (b: { id: string }) => {
      const p = parseHouseBlockId(b.id);
      return p !== null && p.c >= m.c0 && p.c <= m.c1 && p.r >= m.r0 && p.r <= m.r1;
    };
    for (let i = blocks.length - 1; i >= 0; i--) if (inside(blocks[i])) blocks.splice(i, 1);
    blocks.push({ id, kind: 'houses', bounds: { minX: m.c0 * 60, maxX: m.c1 * 60 + 50, minZ: m.r0 * 60, maxZ: m.r1 * 60 + 50 } });
  }
  return { blocks };
}

const sorted = (x: string[][]) => x.map((g) => [...g].sort()).sort();

describe('mergeSuggestions', () => {
  const all = grid(['hhhhh', 'hhhhh', 'hhhhh', 'hhhhh', 'hhhhh']);

  it('offers each edge neighbour of a single block, never a corner one', () => {
    expect(sorted(mergeSuggestions(all, 'block-2-2'))).toEqual(sorted([['block-1-2'], ['block-3-2'], ['block-2-1'], ['block-2-3']]));
  });

  it('offers the end blocks and the side pairs of a horizontal 1x2', () => {
    const l = grid(['hhhhh', 'hhhhh', 'hhhhh', 'hhhhh', 'hhhhh'], ['merged-1-2-2-2']);
    expect(sorted(mergeSuggestions(l, 'merged-1-2-2-2'))).toEqual(
      sorted([['block-0-2'], ['block-3-2'], ['block-1-1', 'block-2-1'], ['block-1-3', 'block-2-3']]),
    );
  });

  it('offers only the end blocks of a 1x3 and nothing for a 2x2 or a 1x4', () => {
    const l = grid(['hhhhh', 'hhhhh', 'hhhhh', 'hhhhh', 'hhhhh'], ['merged-1-2-3-2', 'merged-0-0-1-1', 'merged-0-4-3-4']);
    expect(sorted(mergeSuggestions(l, 'merged-1-2-3-2'))).toEqual(sorted([['block-0-2'], ['block-4-2']]));
    expect(mergeSuggestions(l, 'merged-0-0-1-1')).toEqual([]);
    expect(mergeSuggestions(l, 'merged-0-4-3-4')).toEqual([]);
  });

  it('leaves out monuments, missing cells, merged neighbours and blocks the filter rejects', () => {
    const l = grid(['hhh', 'mh.', 'hhh'], ['merged-0-2-1-2']);
    // block-1-1: west is a monument, east is missing, north is part of a merge, south is free.
    expect(mergeSuggestions(l, 'block-1-1')).toEqual([['block-1-0']]);
    expect(mergeSuggestions(l, 'block-1-1', (id) => id !== 'block-1-0')).toEqual([]);
    // A pair is offered only when both of its blocks are free.
    expect(mergeSuggestions(l, 'merged-0-2-1-2')).toEqual([['block-2-2']]);
  });

  it('never yields an L or T shape and always a valid rectangle of at most 4 blocks', () => {
    const l = grid(['hhhh', 'hhhh', 'hhhh', 'hhhh'], ['merged-1-1-1-2']);
    for (const s of mergeSuggestions(l, 'merged-1-1-1-2')) {
      const g = grownGroup('merged-1-1-1-2', s).map((id) => parseHouseBlockId(id)!);
      const cols = new Set(g.map((x) => x.c)).size;
      const rows = new Set(g.map((x) => x.r)).size;
      expect(cols * rows).toBe(g.length);
      expect(g.length).toBeLessThanOrEqual(4);
    }
  });

  it('returns nothing for monuments and unknown ids', () => {
    const l = grid(['hm']);
    expect(mergeSuggestions(l, 'block-1-0')).toEqual([]);
    expect(mergeSuggestions(l, 'block-9-9')).toEqual([]);
  });

  it('gives suggestions that generateCity accepts', () => {
    const layout = generateCity({ ...DEFAULT_SETTINGS, blockMerges: [] });
    const house = layout.blocks.find((b) => b.kind === 'houses' && mergeSuggestions(layout, b.id).length > 0)!;
    for (const s of mergeSuggestions(layout, house.id)) {
      const group = grownGroup(house.id, s);
      const merged = generateCity({ ...DEFAULT_SETTINGS, blockMerges: [group] });
      expect(merged.merges?.length).toBe(1);
    }
  });
});

describe('edit mode by camera height', () => {
  it('switches to block editing strictly above the threshold', () => {
    expect(BLOCK_EDIT_HEIGHT_M).toBe(200);
    expect(editModeForHeight(200)).toBe('house');
    expect(editModeForHeight(200.01)).toBe('block');
    expect(editModeForHeight(1.7)).toBe('house');
  });
});

describe('block editor picking', () => {
  const layout = grid(['hhm']);
  const state = (order: string[] = [], base: string[] = [], overrides: BlockEditState['overrides'] = {}): BlockEditState => ({
    layout,
    order,
    base,
    overrides,
  });

  it('selects the house block slot under a tap, the monument by its content, nothing on a street', () => {
    expect(resolveBlockTap(state(), 25, 25)).toEqual({ type: 'block', id: 'block-0-0' });
    expect(resolveBlockTap(state(), 145, 25)).toEqual({ type: 'block', id: 'block-2-0' });
    expect(resolveBlockTap(state(), 55, 25)).toBeNull();
  });

  it('does not merge swapped blocks or blocks turned into monuments', () => {
    const base = ['block-0-0', 'block-1-0', 'block-2-0'];
    expect(canMerge(state(base, base), 'block-0-0')).toBe(true);
    const swapped = state(['block-1-0', 'block-0-0', 'block-2-0'], base);
    expect(canMerge(swapped, 'block-0-0')).toBe(false);
    expect(suggestionsFor(swapped, 'block-0-0')).toEqual([]);
    expect(canMerge(state(base, base, { 'block-1-0': { kind: 'monument' } }), 'block-1-0')).toBe(false);
  });

  it('reports the cell size of house and merged blocks', () => {
    expect(cellSize('block-3-4')).toEqual({ cols: 1, rows: 1 });
    expect(cellSize('merged-1-2-3-2')).toEqual({ cols: 3, rows: 1 });
    expect(cellSize('merged-0-0-1-1')).toEqual({ cols: 2, rows: 2 });
  });
});

describe('merge groups and block order', () => {
  it('a grown group replaces the group it grew from; a split removes only its group', () => {
    const merges = [['block-1-1', 'block-2-1'], ['block-5-5', 'block-5-6']];
    const grown = withMergeGroup(merges, ['block-1-1', 'block-2-1', 'block-3-1']);
    expect(grown).toEqual([['block-5-5', 'block-5-6'], ['block-1-1', 'block-2-1', 'block-3-1']]);
    expect(withoutMergeGroup(grown, 'merged-1-1-3-1')).toEqual([['block-5-5', 'block-5-6']]);
    expect(withoutMergeGroup(grown, 'block-1-1')).toEqual(grown);
  });

  it('keeps swaps between untouched blocks and resets the slots that changed', () => {
    const oldBase = ['a', 'b', 'c', 'd'];
    const oldOrder = ['d', 'b', 'c', 'a'];
    expect(remapBlockOrder(oldOrder, oldBase, ['a', 'd', 'm'])).toEqual(['d', 'a', 'm']);
    // A swap cycle through a removed block cannot be kept: every slot shows its own block.
    expect(remapBlockOrder(['b', 'a', 'c'], ['a', 'b', 'c'], ['a', 'c', 'm'])).toEqual(['a', 'c', 'm']);
  });
});

const idsFor = (blockMerges: string[][]) => generateCity({ ...DEFAULT_SETTINGS, blockMerges }).blocks.map((b) => b.id);

describe('store merge and split', () => {
  beforeEach(() => {
    useWorldStore.setState({ ...createEmptyLayout(1), toggles: { ...DEFAULT_TOGGLES } });
    const ids = getCityLayout(useWorldStore.getState().settings).blocks.map((b) => b.id);
    useWorldStore.setState({ blockOrder: ids, baseBlockOrder: ids });
  });

  it('merges and splits with a matching block order', () => {
    const s = useWorldStore.getState;
    const layout = getCityLayout(s().settings);
    const house = layout.blocks.find((b) => b.kind === 'houses' && mergeSuggestions(layout, b.id).length > 0)!;
    const group = grownGroup(house.id, mergeSuggestions(layout, house.id)[0]);
    const before = [...s().baseBlockOrder];

    s().mergeBlockGroup(group, idsFor);
    expect(s().settings.blockMerges).toEqual([group]);
    const fresh = getCityLayout(s().settings).blocks.map((b) => b.id);
    expect([...s().baseBlockOrder].sort()).toEqual([...fresh].sort());
    const mergedId = fresh.find((id) => id.startsWith('merged-'))!;
    expect(s().blockOrder).toContain(mergedId);
    for (const id of group) expect(s().blockOrder).not.toContain(id);

    s().splitMergedBlock(mergedId, idsFor);
    expect(s().settings.blockMerges).toEqual([]);
    expect([...s().baseBlockOrder].sort()).toEqual([...before].sort());
  });

  it('does not swap a merged block with a block of another size', () => {
    const s = useWorldStore.getState;
    useWorldStore.setState({ blockOrder: ['merged-0-0-1-0', 'block-3-3'], baseBlockOrder: ['merged-0-0-1-0', 'block-3-3'] });
    s().swapBlocks('merged-0-0-1-0', 'block-3-3');
    expect(s().blockOrder).toEqual(['merged-0-0-1-0', 'block-3-3']);
  });
});
