// Pure geometry and priority rules for the selection and hover highlight (REVIEW-01 C-3, task 4.2).
// No Three.js here: Selection.tsx turns these numbers into line segments and a decal mesh.

/** Same shape as an OverrideTarget in the store, redeclared so this file has no imports. */
export interface SelectionTarget {
  type: 'house' | 'block' | 'tree';
  id: string;
}

/** A rotated rectangle on the ground. facing is the Y rotation (radians) used by the lot matrix. */
export interface FootprintRect {
  x: number;
  z: number;
  facing: number;
  width: number;
  depth: number;
}

export interface SelectionLot extends FootprintRect {
  id: string;
  /** Height of the built house in metres, for the bounding frame. Optional. */
  height?: number;
}

export interface SelectionBlock {
  blockId: string;
  kind: 'houses' | 'monument';
  /** Houses: one entry per lot. Monument: one entry holding the monument footprint. */
  lots: readonly SelectionLot[];
}

export interface SelectionTree {
  id: string;
  position: { x: number; z: number };
  /** Final instance scale, as given to the tree field. */
  scale: number;
}

export type HighlightShape =
  | { kind: 'rect'; rect: FootprintRect; height: number }
  | { kind: 'ring'; x: number; z: number; radius: number };

export const DEFAULT_HOUSE_HEIGHT = 9;
/** Ring radius per unit of tree scale, and its lower bound. */
export const TREE_RING_PER_SCALE = 1.4;
export const TREE_RING_MIN = 1.2;
/** Width of the soft ring decal band (m). */
export const RING_BAND = 0.5;

export function sameTarget(a: SelectionTarget | null, b: SelectionTarget | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.type === b.type && a.id === b.id;
}

/**
 * Which targets to draw. Selected wins: a hover on the selected thing adds nothing,
 * so the strong highlight is never doubled up by the light one.
 */
export function resolveHighlights(
  selected: SelectionTarget | null,
  hovered: SelectionTarget | null,
): { selected: SelectionTarget | null; hovered: SelectionTarget | null } {
  return { selected, hovered: sameTarget(selected, hovered) ? null : hovered };
}

/** Corner points (x, z) of the footprint, counter-clockwise from -x/-z, optionally grown by pad on every side. */
export function footprintCorners(rect: FootprintRect, pad = 0): [number, number][] {
  const c = Math.cos(rect.facing);
  const s = Math.sin(rect.facing);
  const hw = rect.width / 2 + pad;
  const hd = rect.depth / 2 + pad;
  // Local (lx, lz) to world: the inverse of the rotation lotAt uses.
  const at = (lx: number, lz: number): [number, number] => [rect.x + lx * c + lz * s, rect.z - lx * s + lz * c];
  return [at(-hw, -hd), at(hw, -hd), at(hw, hd), at(-hw, hd)];
}

/** Points (x, z) on a circle, without repeating the first point. */
export function ringPoints(cx: number, cz: number, radius: number, segments = 32): [number, number][] {
  const n = Math.max(3, Math.floor(segments));
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push([cx + Math.cos(a) * radius, cz + Math.sin(a) * radius]);
  }
  return out;
}

export function treeRingRadius(scale: number): number {
  return Math.max(TREE_RING_MIN, scale * TREE_RING_PER_SCALE);
}

/** The shape to draw for a target, or null when the target no longer exists (layout regenerated, block swapped away). */
export function shapeFor(
  target: SelectionTarget | null,
  blocks: readonly SelectionBlock[],
  trees: readonly SelectionTree[],
): HighlightShape | null {
  if (!target) return null;
  if (target.type === 'tree') {
    const t = trees.find((tr) => tr.id === target.id);
    return t ? { kind: 'ring', x: t.position.x, z: t.position.z, radius: treeRingRadius(t.scale) } : null;
  }
  if (target.type === 'block') {
    const b = blocks.find((bl) => bl.blockId === target.id);
    const lot = b?.lots[0];
    return lot ? { kind: 'rect', rect: lot, height: 0 } : null;
  }
  for (const b of blocks) {
    const lot = b.lots.find((l) => l.id === target.id);
    if (lot) return { kind: 'rect', rect: lot, height: lot.height ?? DEFAULT_HOUSE_HEIGHT };
  }
  return null;
}

/** Closed loop as line-segment pairs: [x0,y,z0, x1,y,z1, ...], one segment per edge. */
export function loopSegments(points: readonly [number, number][], y: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    out.push(a[0], y, a[1], b[0], y, b[1]);
  }
  return out;
}

/** Bounding frame: a loop at y0, a loop at y1 and four verticals (12 segments). */
export function frameSegments(corners: readonly [number, number][], y0: number, y1: number): number[] {
  const out = [...loopSegments(corners, y0), ...loopSegments(corners, y1)];
  for (const [x, z] of corners) out.push(x, y0, z, x, y1, z);
  return out;
}

/** Two triangles covering the rectangle at height y: positions and indices. */
export function rectFill(corners: readonly [number, number][], y: number): { positions: number[]; indices: number[] } {
  const positions: number[] = [];
  for (const [x, z] of corners) positions.push(x, y, z);
  return { positions, indices: [0, 2, 1, 0, 3, 2] };
}

/** Flat annulus between inner and outer radius at height y. */
export function annulusFill(
  cx: number,
  cz: number,
  inner: number,
  outer: number,
  y: number,
  segments = 32,
): { positions: number[]; indices: number[] } {
  const a = ringPoints(cx, cz, inner, segments);
  const b = ringPoints(cx, cz, outer, segments);
  const n = a.length;
  const positions: number[] = [];
  for (const [x, z] of a) positions.push(x, y, z);
  for (const [x, z] of b) positions.push(x, y, z);
  const indices: number[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    // Wound so the face points up (+y).
    indices.push(i, n + j, n + i, i, j, n + j);
  }
  return { positions, indices };
}

/** Everything the renderer needs for one shape, as plain arrays. */
export function buildHighlightGeometry(
  shape: HighlightShape,
  y: number,
): { lines: number[]; fill: { positions: number[]; indices: number[] } } {
  if (shape.kind === 'ring') {
    const { x, z, radius } = shape;
    return {
      lines: loopSegments(ringPoints(x, z, radius, 48), y + 0.01),
      fill: annulusFill(x, z, Math.max(0, radius - RING_BAND), radius, y, 48),
    };
  }
  const corners = footprintCorners(shape.rect);
  const lines = loopSegments(corners, y + 0.01);
  if (shape.height > 0) lines.push(...frameSegments(footprintCorners(shape.rect, 0.1), y + 0.01, y + shape.height));
  return { lines, fill: rectFill(corners, y) };
}
