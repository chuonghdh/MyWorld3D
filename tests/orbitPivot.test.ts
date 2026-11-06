import { describe, expect, it } from 'vitest';
import {
  boundsCentre,
  pivotForSelection,
  sameSelection,
  selectionCentroid,
  startPivotGlide,
  stepPivotGlide,
  type PivotSource,
} from '../src/scene/pivotMath';

const MAP = { minX: -100, maxX: 300, minZ: -40, maxZ: 60 };

const SRC: PivotSource = {
  blocks: [
    { id: 'b1', bounds: { minX: 0, maxX: 40, minZ: 10, maxZ: 30 } },
    { id: 'b2', bounds: { minX: 100, maxX: 110, minZ: -20, maxZ: -10 } },
  ],
  lots: [{ id: 'h1', position: { x: 7, z: 13 } }],
  trees: [{ id: 't1', position: { x: -55, z: 21 } }],
};

describe('boundsCentre', () => {
  it('is the centre of the map diagonal, at ground level', () => {
    expect(boundsCentre(MAP)).toEqual({ x: 100, z: 10 });
  });
  it('is the centre of a block rectangle', () => {
    expect(boundsCentre(SRC.blocks[0].bounds)).toEqual({ x: 20, z: 20 });
  });
});

describe('selectionCentroid', () => {
  it('uses the block centre for a block', () => {
    expect(selectionCentroid({ type: 'block', id: 'b2' }, SRC)).toEqual({ x: 105, z: -15 });
  });
  it('uses the lot position for a house', () => {
    expect(selectionCentroid({ type: 'house', id: 'h1' }, SRC)).toEqual({ x: 7, z: 13 });
  });
  it('uses the position for a tree', () => {
    expect(selectionCentroid({ type: 'tree', id: 't1' }, SRC)).toEqual({ x: -55, z: 21 });
  });
  it('returns null for an id that is not in the layout', () => {
    expect(selectionCentroid({ type: 'house', id: 'gone' }, SRC)).toBeNull();
    expect(selectionCentroid({ type: 'tree', id: 'h1' }, SRC)).toBeNull();
  });
});

describe('pivotForSelection', () => {
  it('is the map centre when nothing is selected', () => {
    expect(pivotForSelection(null, SRC, MAP)).toEqual({ x: 100, z: 10 });
  });
  it('moves to the centroid of the selected block, house or tree', () => {
    expect(pivotForSelection({ type: 'block', id: 'b1' }, SRC, MAP)).toEqual({ x: 20, z: 20 });
    expect(pivotForSelection({ type: 'house', id: 'h1' }, SRC, MAP)).toEqual({ x: 7, z: 13 });
    expect(pivotForSelection({ type: 'tree', id: 't1' }, SRC, MAP)).toEqual({ x: -55, z: 21 });
  });
  it('falls back to the map centre when the selected id is gone', () => {
    expect(pivotForSelection({ type: 'tree', id: 'gone' }, SRC, MAP)).toEqual({ x: 100, z: 10 });
  });
});

describe('sameSelection', () => {
  it('compares type and id, and two nulls are the same', () => {
    expect(sameSelection(null, null)).toBe(true);
    expect(sameSelection({ type: 'house', id: 'h1' }, { type: 'house', id: 'h1' })).toBe(true);
    expect(sameSelection({ type: 'house', id: 'h1' }, { type: 'block', id: 'h1' })).toBe(false);
    expect(sameSelection({ type: 'house', id: 'h1' }, null)).toBe(false);
  });
});

describe('stepPivotGlide', () => {
  it('eases from the start to the end point and reports done at the end', () => {
    const g = startPivotGlide({ x: 0, z: 0 }, { x: 10, z: -4 });
    const mid = stepPivotGlide(g, 0.4, 0.8);
    expect(mid.done).toBe(false);
    expect(mid.dx).toBeCloseTo(5, 6);
    expect(mid.dz).toBeCloseTo(-2, 6);
    const end = stepPivotGlide(g, 0.4, 0.8);
    expect(end.done).toBe(true);
    // The steps add up to the full move: the pivot arrives exactly.
    expect(mid.dx + end.dx).toBeCloseTo(10, 6);
    expect(mid.dz + end.dz).toBeCloseTo(-4, 6);
  });
  it('jumps to the end for zero seconds', () => {
    const r = stepPivotGlide(startPivotGlide({ x: 1, z: 1 }, { x: 9, z: 9 }), 0.01, 0);
    expect(r.done).toBe(true);
    expect(r.dx).toBe(8);
    expect(r.dz).toBe(8);
  });
});
