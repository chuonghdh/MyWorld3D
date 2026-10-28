import { describe, expect, it } from 'vitest';
import {
  annulusFill,
  buildHighlightGeometry,
  footprintCorners,
  frameSegments,
  resolveHighlights,
  ringPoints,
  sameTarget,
  shapeFor,
  treeRingRadius,
  TREE_RING_MIN,
  type SelectionBlock,
  type SelectionTree,
} from '../src/scene/selectionMath';

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe('footprintCorners', () => {
  it('is axis aligned when facing is 0', () => {
    const c = footprintCorners({ x: 10, z: 20, facing: 0, width: 6, depth: 4 });
    expect(c).toEqual([
      [7, 18],
      [13, 18],
      [13, 22],
      [7, 22],
    ]);
  });

  it('rotates a quarter turn the way lotAt inverts it', () => {
    const rect = { x: 0, z: 0, facing: Math.PI / 2, width: 6, depth: 4 };
    const c = footprintCorners(rect);
    // Every corner maps back to the local half extents under lotAt's transform.
    for (const [x, z] of c) {
      const lx = x * Math.cos(rect.facing) - z * Math.sin(rect.facing);
      const lz = x * Math.sin(rect.facing) + z * Math.cos(rect.facing);
      close(Math.abs(lx), 3);
      close(Math.abs(lz), 2);
    }
  });

  it('keeps side lengths and grows with padding', () => {
    const c = footprintCorners({ x: 5, z: -3, facing: 0.7, width: 8, depth: 5 }, 0.5);
    const d = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    close(d(c[0], c[1]), 9);
    close(d(c[1], c[2]), 6);
  });
});

describe('ringPoints', () => {
  it('lies on the circle with the requested count', () => {
    const p = ringPoints(3, -2, 2, 16);
    expect(p).toHaveLength(16);
    for (const [x, z] of p) close(Math.hypot(x - 3, z + 2), 2);
  });
  it('clamps tiny segment counts', () => {
    expect(ringPoints(0, 0, 1, 1)).toHaveLength(3);
  });
});

describe('geometry builders', () => {
  it('frame has 12 segments', () => {
    const corners = footprintCorners({ x: 0, z: 0, facing: 0, width: 2, depth: 2 });
    expect(frameSegments(corners, 0, 5)).toHaveLength(12 * 6);
  });
  it('annulus indices stay in range and face up', () => {
    const { positions, indices } = annulusFill(0, 0, 1, 2, 0.2, 8);
    expect(positions).toHaveLength(16 * 3);
    expect(Math.max(...indices)).toBeLessThan(16);
    const v = (i: number) => [positions[i * 3], positions[i * 3 + 2]];
    for (let t = 0; t < indices.length; t += 3) {
      const [a, b, c] = [v(indices[t]), v(indices[t + 1]), v(indices[t + 2])];
      // Cross product y component in (x, z): negative means counter-clockwise seen from +y.
      const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      expect(cross).toBeLessThan(0);
    }
  });
  it('house shape adds the frame, monument does not', () => {
    const rect = { x: 0, z: 0, facing: 0, width: 4, depth: 4 };
    const house = buildHighlightGeometry({ kind: 'rect', rect, height: 8 }, 0.18);
    const mon = buildHighlightGeometry({ kind: 'rect', rect, height: 0 }, 0.18);
    expect(house.lines.length).toBe(mon.lines.length + 12 * 6);
    expect(mon.lines.length).toBe(4 * 6);
    expect(house.fill.indices).toHaveLength(6);
  });
});

describe('resolveHighlights', () => {
  const a = { type: 'house', id: 'h1' } as const;
  const b = { type: 'tree', id: 't1' } as const;
  it('hover on the selected thing is dropped', () => {
    expect(resolveHighlights(a, { ...a })).toEqual({ selected: a, hovered: null });
  });
  it('hover elsewhere is kept alongside the selection', () => {
    expect(resolveHighlights(a, b)).toEqual({ selected: a, hovered: b });
  });
  it('same id with a different type is different', () => {
    expect(sameTarget({ type: 'house', id: 'x' }, { type: 'block', id: 'x' })).toBe(false);
    expect(sameTarget(null, null)).toBe(true);
  });
});

describe('shapeFor', () => {
  const blocks: SelectionBlock[] = [
    { blockId: 'b1', kind: 'houses', lots: [{ id: 'l1', x: 1, z: 2, facing: 0, width: 5, depth: 6, height: 12 }, { id: 'l2', x: 9, z: 2, facing: 0, width: 5, depth: 6 }] },
    { blockId: 'b2', kind: 'monument', lots: [{ id: 'm', x: 50, z: 50, facing: 0, width: 20, depth: 20 }] },
  ];
  const trees: SelectionTree[] = [{ id: 't1', position: { x: 4, z: 4 }, scale: 1.5 }];

  it('finds a house lot with its height or the default', () => {
    expect(shapeFor({ type: 'house', id: 'l1' }, blocks, trees)).toMatchObject({ kind: 'rect', height: 12 });
    expect(shapeFor({ type: 'house', id: 'l2' }, blocks, trees)).toMatchObject({ kind: 'rect', height: 9 });
  });
  it('finds a monument block footprint without a frame', () => {
    expect(shapeFor({ type: 'block', id: 'b2' }, blocks, trees)).toMatchObject({ kind: 'rect', height: 0 });
  });
  it('finds a tree ring', () => {
    const s = shapeFor({ type: 'tree', id: 't1' }, blocks, trees);
    expect(s).toEqual({ kind: 'ring', x: 4, z: 4, radius: treeRingRadius(1.5) });
    expect(treeRingRadius(0.1)).toBe(TREE_RING_MIN);
  });
  it('returns null for stale targets after regeneration', () => {
    expect(shapeFor({ type: 'house', id: 'gone' }, blocks, trees)).toBeNull();
    expect(shapeFor({ type: 'tree', id: 'gone' }, blocks, trees)).toBeNull();
    expect(shapeFor({ type: 'block', id: 'gone' }, blocks, trees)).toBeNull();
    expect(shapeFor(null, blocks, trees)).toBeNull();
  });
  it('follows a block swap because it reads current lot positions', () => {
    const swapped: SelectionBlock[] = [{ ...blocks[0], lots: blocks[0].lots.map((l) => ({ ...l, x: l.x + 100 })) }, blocks[1]];
    const s = shapeFor({ type: 'house', id: 'l1' }, swapped, trees);
    expect(s && s.kind === 'rect' && s.rect.x).toBe(101);
  });
});
