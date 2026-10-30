// Block merging: groups of 2 to 4 house blocks that form a full rectangle of grid cells become one block.
// Pure TypeScript, no React or Three.js.
//
// Block ids: a house block is `block-<c>-<r>`, where c indexes the vertical grid lines (west to east) and r the
// horizontal ones (south to north). A merged block is `merged-<c0>-<r0>-<c1>-<r1>` from the inclusive cell range it
// covers, so the same merge always gets the same id. The merge groups are the input: splitting a merged block is
// removing its group from the settings, which brings its member blocks back.

import type { Rect } from './layout';

export const MERGE_MIN_BLOCKS = 2;
export const MERGE_MAX_BLOCKS = 4;

/** Inclusive range of grid cells covered by a merge. */
export interface MergeRect {
  c0: number;
  c1: number;
  r0: number;
  r1: number;
}

export interface MergeRejection {
  group: readonly string[];
  reason: string;
}

const HOUSE_ID = /^block-(\d+)-(\d+)$/;

export function houseBlockId(c: number, r: number): string {
  return `block-${c}-${r}`;
}

export function mergedBlockId(m: MergeRect): string {
  return `merged-${m.c0}-${m.r0}-${m.c1}-${m.r1}`;
}

/** Grid cell of a house block id, or null for any other id. */
export function parseHouseBlockId(id: string): { c: number; r: number } | null {
  const m = HOUSE_ID.exec(id);
  return m ? { c: Number(m[1]), r: Number(m[2]) } : null;
}

/** Ids of the house blocks inside a merge, west to east then south to north. */
export function memberIds(m: MergeRect): string[] {
  const out: string[] = [];
  for (let r = m.r0; r <= m.r1; r++) for (let c = m.c0; c <= m.c1; c++) out.push(houseBlockId(c, r));
  return out;
}

/**
 * Checks each group against the house blocks that exist. A group is accepted when it has 2 to 4 distinct ids,
 * every id is an existing house block, and the ids are exactly the cells of one rectangle of the grid (so the
 * members share full edges and are edge-connected). Groups that touch an already accepted group are rejected,
 * so no block is merged twice. Accepted groups keep their input order.
 */
export function resolveBlockMerges(
  groups: readonly (readonly string[])[],
  houseIds: ReadonlySet<string>,
): { accepted: MergeRect[]; rejected: MergeRejection[] } {
  const accepted: MergeRect[] = [];
  const rejected: MergeRejection[] = [];
  const used = new Set<string>();
  for (const group of groups) {
    const reject = (reason: string) => rejected.push({ group, reason });
    if (group.length < MERGE_MIN_BLOCKS || group.length > MERGE_MAX_BLOCKS) {
      reject(`a merge has ${MERGE_MIN_BLOCKS} to ${MERGE_MAX_BLOCKS} blocks, got ${group.length}`);
      continue;
    }
    if (new Set(group).size !== group.length) {
      reject('a block appears twice in the group');
      continue;
    }
    if (group.some((id) => used.has(id))) {
      reject('a block is already in another merge');
      continue;
    }
    const cells = group.map((id) => parseHouseBlockId(id));
    if (cells.some((cell, i) => cell === null || !houseIds.has(group[i]))) {
      reject('a merge may only contain existing house blocks');
      continue;
    }
    const cs = cells as { c: number; r: number }[];
    const m: MergeRect = {
      c0: Math.min(...cs.map((x) => x.c)),
      c1: Math.max(...cs.map((x) => x.c)),
      r0: Math.min(...cs.map((x) => x.r)),
      r1: Math.max(...cs.map((x) => x.r)),
    };
    if ((m.c1 - m.c0 + 1) * (m.r1 - m.r0 + 1) !== group.length) {
      reject('the blocks must form one rectangle of neighbours (full shared edges, no gaps)');
      continue;
    }
    accepted.push(m);
    for (const id of group) used.add(id);
  }
  return { accepted, rejected };
}

/** Union of the member bounds (the members are edge-neighbours, so the union is one rectangle). */
export function unionBounds(bounds: readonly Rect[]): Rect {
  return {
    minX: Math.min(...bounds.map((b) => b.minX)),
    maxX: Math.max(...bounds.map((b) => b.maxX)),
    minZ: Math.min(...bounds.map((b) => b.minZ)),
    maxZ: Math.max(...bounds.map((b) => b.maxZ)),
  };
}

const MERGED_ID = /^merged-(\d+)-(\d+)-(\d+)-(\d+)$/;

/** Cell range of a merged block id, or null for any other id. */
export function parseMergedBlockId(id: string): MergeRect | null {
  const m = MERGED_ID.exec(id);
  return m ? { c0: Number(m[1]), r0: Number(m[2]), c1: Number(m[3]), r1: Number(m[4]) } : null;
}

/**
 * Ready-made merge suggestions for the block editor (added for the UI, phase 2).
 * `id` is a free house block or a merged block of `layout`. Each suggestion is the list of house block ids that,
 * added to that block, give a valid merge: the current rectangle grown by one full row or column on one side
 * (west, east, south, north, in that order), with at most MERGE_MAX_BLOCKS cells. So a single block gets each
 * edge-adjacent block, a 1x2 gets the single block at each end and the pair along each long side, a 1x3 gets the
 * end blocks, and a 2x2 or 1x4 gets nothing. L and T shapes cannot appear because only whole strips are added.
 * Every added block must be a free house block of the layout (not a monument, not in another merge) and pass
 * `eligible` when given (the UI uses it to leave out blocks it cannot merge, e.g. swapped ones).
 */
export function mergeSuggestions(
  layout: { blocks: readonly { id: string; kind: string }[] },
  id: string,
  eligible: (blockId: string) => boolean = () => true,
): string[][] {
  const free = new Set(layout.blocks.filter((b) => b.kind === 'houses' && HOUSE_ID.test(b.id)).map((b) => b.id));
  let rect: MergeRect | null = null;
  const cell = parseHouseBlockId(id);
  if (cell && free.has(id)) rect = { c0: cell.c, c1: cell.c, r0: cell.r, r1: cell.r };
  else if (layout.blocks.some((b) => b.id === id)) rect = parseMergedBlockId(id);
  if (!rect || !eligible(id)) return [];
  const { c0, c1, r0, r1 } = rect;
  const strips: MergeRect[] = [
    { c0: c0 - 1, c1: c0 - 1, r0, r1 },
    { c0: c1 + 1, c1: c1 + 1, r0, r1 },
    { c0, c1, r0: r0 - 1, r1: r0 - 1 },
    { c0, c1, r0: r1 + 1, r1: r1 + 1 },
  ];
  const area = (c1 - c0 + 1) * (r1 - r0 + 1);
  const out: string[][] = [];
  for (const s of strips) {
    if (s.c0 < 0 || s.r0 < 0) continue;
    const added = memberIds(s);
    if (area + added.length > MERGE_MAX_BLOCKS) continue;
    if (added.every((a) => free.has(a) && eligible(a))) out.push(added);
  }
  return out;
}

/** The merge group (all member ids) that results from adding `added` to the block `id` (house or merged). */
export function grownGroup(id: string, added: readonly string[]): string[] {
  const merged = parseMergedBlockId(id);
  const cells = (merged ? memberIds(merged) : [id]).concat(added).map((x) => parseHouseBlockId(x)!);
  return memberIds({
    c0: Math.min(...cells.map((x) => x.c)),
    c1: Math.max(...cells.map((x) => x.c)),
    r0: Math.min(...cells.map((x) => x.r)),
    r1: Math.max(...cells.map((x) => x.r)),
  });
}

/** Deterministic 32-bit hash of a string, used to seed per-merge random streams. */
export function hashId(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
