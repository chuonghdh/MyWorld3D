// Block id scheme shared by the layers below the city: a house block is `block-<c>-<r>` (grid column and row),
// a merged block is `merged-<c0>-<r0>-<c1>-<r1>` from its inclusive cell range. Same scheme as city/merge.ts,
// which the city generator owns; a test checks that both agree. Pure, no imports.

/** Inclusive range of grid cells covered by a merge. */
export interface MergeRect {
  c0: number;
  c1: number;
  r0: number;
  r1: number;
}

const HOUSE_ID = /^block-(\d+)-(\d+)$/;
const MERGED_ID = /^merged-(\d+)-(\d+)-(\d+)-(\d+)$/;

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

/** Cell range of a merged block id, or null for any other id. */
export function parseMergedBlockId(id: string): MergeRect | null {
  const m = MERGED_ID.exec(id);
  return m ? { c0: Number(m[1]), r0: Number(m[2]), c1: Number(m[3]), r1: Number(m[4]) } : null;
}
