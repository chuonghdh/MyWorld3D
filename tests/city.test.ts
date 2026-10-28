import { describe, expect, it } from 'vitest';
import type { Vec2, WorldSettings } from '../src/core/types';
import { generateCity, type CityLayout, type Lot, type Rect } from '../src/city';

function settings(overrides: Partial<WorldSettings> = {}): WorldSettings {
  return {
    seed: 1234,
    timeOfDay: 12,
    season: 'summer',
    windSpeed: 2,
    windDirection: 0,
    townWidth: 400,
    townDepth: 400,
    trafficMultiplier: 1,
    streetTreeMultiplier: 1,
    leafAmount: 0.5,
    leafSize: 1,
    soundEnabled: false,
    ...overrides,
  };
}

const EPS = 1e-6;
const SEEDS = [1, 7, 1234, 98765];
const SIZES = [
  { townWidth: 400, townDepth: 400 },
  { townWidth: 217, townDepth: 217 },
  { townWidth: 300, townDepth: 180 },
];

function cities(): CityLayout[] {
  const out: CityLayout[] = [];
  for (const seed of SEEDS) for (const size of SIZES) out.push(generateCity(settings({ seed, ...size })));
  return out;
}

/** Axis-aligned footprint of a lot (facings are multiples of 90 degrees). */
function box(lot: Lot): Rect {
  const alongZ = Math.abs(Math.round(Math.sin(lot.facing))) === 0;
  const ex = alongZ ? lot.width : lot.depth;
  const ez = alongZ ? lot.depth : lot.width;
  return {
    minX: lot.position.x - ex / 2,
    maxX: lot.position.x + ex / 2,
    minZ: lot.position.z - ez / 2,
    maxZ: lot.position.z + ez / 2,
  };
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.minX < b.maxX - EPS && b.minX < a.maxX - EPS && a.minZ < b.maxZ - EPS && b.minZ < a.maxZ - EPS;
}

/** World direction of each facade side, as in Three.js rotation about Y by facing. */
function sideDirs(lot: Lot): Record<'front' | 'back' | 'left' | 'right', Vec2> {
  const s = Math.round(Math.sin(lot.facing));
  const c = Math.round(Math.cos(lot.facing));
  return {
    front: { x: s, z: c },
    back: { x: -s, z: -c },
    right: { x: c, z: -s },
    left: { x: -c, z: s },
  };
}

/** True if p lies on a road or one of its sidewalks. */
function onStreet(city: CityLayout, p: Vec2, tolerance = 0.01): boolean {
  return city.roads.some((r) => {
    const reach = r.width / 2 + r.sidewalkWidth + tolerance;
    if (r.orientation === 'vertical') {
      return Math.abs(p.x - r.start.x) <= reach && p.z >= r.start.z - reach && p.z <= r.end.z + reach;
    }
    return Math.abs(p.z - r.start.z) <= reach && p.x >= r.start.x - reach && p.x <= r.end.x + reach;
  });
}

describe('generateCity', () => {
  it('gives identical layouts for the same seed', () => {
    const a = generateCity(settings({ seed: 99 }));
    const b = generateCity(settings({ seed: 99 }));
    expect(a).toEqual(b);
  });

  it('gives different layouts for different seeds', () => {
    const a = generateCity(settings({ seed: 1 }));
    const b = generateCity(settings({ seed: 2 }));
    expect(JSON.stringify(a.streetTrees)).not.toBe(JSON.stringify(b.streetTrees));
    expect(JSON.stringify(a.lots)).not.toBe(JSON.stringify(b.lots));
    expect(a.blocks.map((blk) => blk.kind)).not.toEqual(b.blocks.map((blk) => blk.kind));
  });

  it('scales the street tree count with streetTreeMultiplier', () => {
    const none = generateCity(settings({ streetTreeMultiplier: 0 }));
    const half = generateCity(settings({ streetTreeMultiplier: 0.5 }));
    const full = generateCity(settings({ streetTreeMultiplier: 1 }));
    const double = generateCity(settings({ streetTreeMultiplier: 2 }));

    expect(none.streetTrees.length).toBe(0);
    expect(half.streetTrees.length).toBeGreaterThan(0);
    expect(full.streetTrees.length).toBeGreaterThan(half.streetTrees.length);
    expect(double.streetTrees.length).toBeGreaterThan(full.streetTrees.length);

    // Higher multipliers give a superset of positions.
    const key = (p: Vec2) => `${p.x.toFixed(4)},${p.z.toFixed(4)}`;
    const fullSet = new Set(full.streetTrees.map((t) => key(t.position)));
    for (const t of half.streetTrees) expect(fullSet.has(key(t.position))).toBe(true);
  });

  it('plants trees in every setting', () => {
    const settingsSeen = new Set<string>();
    for (const city of cities()) for (const t of city.streetTrees) settingsSeen.add(t.setting);
    expect(settingsSeen).toEqual(new Set(['street', 'courtyard', 'plaza']));
  });

  it('does not change buildings when streetTreeMultiplier changes', () => {
    const a = generateCity(settings({ streetTreeMultiplier: 0.3 }));
    const b = generateCity(settings({ streetTreeMultiplier: 2 }));
    expect(a.lots).toEqual(b.lots);
    expect(a.blocks).toEqual(b.blocks);
    expect(a.lamps).toEqual(b.lamps);
  });

  it('gives every block at least one lot', () => {
    for (const city of cities()) {
      expect(city.blocks.length).toBeGreaterThan(0);
      for (const block of city.blocks) {
        const lotCount = city.lots.filter((lot) => lot.blockId === block.id).length;
        expect(lotCount, block.id).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('never overlaps two lots and keeps every lot inside its block', () => {
    for (const city of cities()) {
      const boxes = city.lots.map(box);
      const clashes: string[] = [];
      for (let i = 0; i < boxes.length; i++) {
        for (let k = i + 1; k < boxes.length; k++) {
          if (overlaps(boxes[i], boxes[k])) clashes.push(`${city.lots[i].id} vs ${city.lots[k].id}`);
        }
      }
      expect(clashes).toEqual([]);
      const byId = new Map(city.blocks.map((b) => [b.id, b]));
      city.lots.forEach((lot, i) => {
        const b = byId.get(lot.blockId)!.bounds;
        const r = boxes[i];
        expect(r.minX).toBeGreaterThanOrEqual(b.minX - EPS);
        expect(r.maxX).toBeLessThanOrEqual(b.maxX + EPS);
        expect(r.minZ).toBeGreaterThanOrEqual(b.minZ - EPS);
        expect(r.maxZ).toBeLessThanOrEqual(b.maxZ + EPS);
      });
    }
  });

  it('keeps frontages within 6-14 m and depths sensible', () => {
    for (const city of cities()) {
      const monumentIds = new Set(city.blocks.filter((b) => b.kind === 'monument').map((b) => b.id));
      for (const lot of city.lots) {
        if (monumentIds.has(lot.blockId) || lot.corner) continue;
        expect(lot.width, lot.id).toBeGreaterThanOrEqual(6 - EPS);
        expect(lot.width, lot.id).toBeLessThanOrEqual(14 + EPS);
        expect(lot.depth, lot.id).toBeLessThanOrEqual(14 + EPS);
      }
    }
  });

  it('gives corner lots exactly two facades, all facing streets the lot touches', () => {
    for (const city of cities()) {
      const byId = new Map(city.blocks.map((b) => [b.id, b]));
      let corners = 0;
      for (const lot of city.lots) {
        const block = byId.get(lot.blockId)!;
        if (block.kind === 'monument') continue;
        const r = box(lot);
        const b = block.bounds;
        const touches = (d: Vec2) =>
          (d.x < 0 && Math.abs(r.minX - b.minX) < EPS) ||
          (d.x > 0 && Math.abs(r.maxX - b.maxX) < EPS) ||
          (d.z < 0 && Math.abs(r.minZ - b.minZ) < EPS) ||
          (d.z > 0 && Math.abs(r.maxZ - b.maxZ) < EPS);
        const dirs = sideDirs(lot);
        expect(lot.facades.front, lot.id).toBe(true);
        for (const side of ['front', 'back', 'left', 'right'] as const) {
          if (lot.facades[side]) expect(touches(dirs[side]), `${lot.id} ${side}`).toBe(true);
        }
        const count = Object.values(lot.facades).filter(Boolean).length;
        if (lot.corner) {
          corners++;
          expect(count, lot.id).toBe(2);
          expect(lot.facades.left || lot.facades.right, lot.id).toBe(true);
        }
        // Facing points to the street: the front side touches the block edge.
        expect(Math.abs(lot.facing - Math.atan2(dirs.front.x, dirs.front.z)) < EPS).toBe(true);
      }
      expect(corners).toBeGreaterThan(0);
    }
  });

  it('builds continuous street walls along every block edge', () => {
    for (const city of cities()) {
      for (const block of city.blocks) {
        if (block.kind === 'monument') continue;
        const b = block.bounds;
        const boxes = city.lots.filter((l) => l.blockId === block.id).map(box);
        const edges: { on: (r: Rect) => boolean; lo: (r: Rect) => number; hi: (r: Rect) => number; from: number; to: number }[] = [
          { on: (r) => Math.abs(r.minZ - b.minZ) < EPS, lo: (r) => r.minX, hi: (r) => r.maxX, from: b.minX, to: b.maxX },
          { on: (r) => Math.abs(r.maxZ - b.maxZ) < EPS, lo: (r) => r.minX, hi: (r) => r.maxX, from: b.minX, to: b.maxX },
          { on: (r) => Math.abs(r.minX - b.minX) < EPS, lo: (r) => r.minZ, hi: (r) => r.maxZ, from: b.minZ, to: b.maxZ },
          { on: (r) => Math.abs(r.maxX - b.maxX) < EPS, lo: (r) => r.minZ, hi: (r) => r.maxZ, from: b.minZ, to: b.maxZ },
        ];
        for (const e of edges) {
          const along = boxes.filter(e.on).sort((p, q) => e.lo(p) - e.lo(q));
          expect(along.length, block.id).toBeGreaterThan(0);
          expect(Math.abs(e.lo(along[0]) - e.from)).toBeLessThanOrEqual(0.05);
          expect(Math.abs(e.hi(along[along.length - 1]) - e.to)).toBeLessThanOrEqual(0.05);
          for (let k = 1; k < along.length; k++) {
            expect(e.lo(along[k]) - e.hi(along[k - 1]), block.id).toBeLessThanOrEqual(0.05);
          }
        }
      }
    }
  });

  it('keeps courtyards open inside their blocks and monuments without one', () => {
    let withCourtyard = 0;
    for (const city of cities()) {
      for (const block of city.blocks) {
        if (block.kind === 'monument') {
          expect(block.courtyard).toBeNull();
          continue;
        }
        if (!block.courtyard) continue;
        withCourtyard++;
        const c = block.courtyard;
        expect(c.minX).toBeGreaterThan(block.bounds.minX);
        expect(c.maxX).toBeLessThan(block.bounds.maxX);
        for (const lot of city.lots.filter((l) => l.blockId === block.id)) {
          expect(overlaps(box(lot), c), lot.id).toBe(false);
        }
      }
    }
    expect(withCourtyard).toBeGreaterThan(0);
  });

  it('sets lot attributes from the street hierarchy', () => {
    const city = generateCity(settings());
    for (const lot of city.lots) {
      expect(lot.floors).toBeGreaterThanOrEqual(2);
      expect(lot.floors).toBeLessThanOrEqual(8);
      expect(Number.isInteger(lot.seed)).toBe(true);
    }
    const houses = city.lots.filter((l) => city.blocks.find((b) => b.id === l.blockId)!.kind === 'houses');
    const corners = houses.filter((l) => l.corner);
    const shopsAtCorners = corners.filter((l) => l.groundFloor !== 'residential').length;
    expect(shopsAtCorners / corners.length).toBeGreaterThan(0.6);
    expect(houses.some((l) => l.groundFloor === 'cafe')).toBe(true);
    expect(new Set(houses.map((l) => l.seed)).size).toBe(houses.length);

    // Neighbours along a block rarely share a height.
    let same = 0;
    let pairs = 0;
    for (const block of city.blocks) {
      const ring = houses.filter((l) => l.blockId === block.id);
      for (let k = 1; k < ring.length; k++) {
        pairs++;
        if (ring[k].floors === ring[k - 1].floors) same++;
      }
    }
    expect(same / pairs).toBeLessThan(0.1);
  });

  it('has wider avenues with taller buildings', () => {
    const city = generateCity(settings());
    const avenues = city.roads.filter((r) => r.streetClass === 'avenue');
    const streets = city.roads.filter((r) => r.streetClass === 'street');
    expect(avenues.some((r) => r.orientation === 'horizontal')).toBe(true);
    expect(avenues.some((r) => r.orientation === 'vertical')).toBe(true);
    for (const a of avenues) {
      for (const s of streets) {
        expect(a.width).toBeGreaterThan(s.width);
        expect(a.sidewalkWidth).toBeGreaterThan(s.sidewalkWidth);
      }
    }
    // Grid spacing is jittered within 40-60 m.
    const xs = city.roads.filter((r) => r.orientation === 'vertical').map((r) => r.start.x);
    const gaps = xs.slice(1).map((x, k) => x - xs[k]);
    for (const g of gaps) {
      expect(g).toBeGreaterThanOrEqual(40 - EPS);
      expect(g).toBeLessThanOrEqual(60 + EPS);
    }
    expect(new Set(gaps.map((g) => g.toFixed(2))).size).toBeGreaterThan(1);
  });

  it('places lamps, benches, crosswalks and intersections on streets', () => {
    for (const city of cities()) {
      expect(city.lamps.length).toBeGreaterThan(0);
      expect(city.crosswalks.length).toBeGreaterThan(0);
      expect(city.intersections.length).toBeGreaterThan(0);
      for (const lamp of city.lamps) expect(onStreet(city, lamp.position), lamp.id).toBe(true);
      for (const cw of city.crosswalks) {
        expect(onStreet(city, cw.center), cw.id).toBe(true);
        expect(cw.length === 8 || cw.length === 11).toBe(true);
      }
      for (const it of city.intersections) expect(onStreet(city, it.center), it.id).toBe(true);
      for (const t of city.streetTrees.filter((tr) => tr.setting === 'street')) {
        expect(onStreet(city, t.position), t.id).toBe(true);
      }
      const v = city.roads.filter((r) => r.orientation === 'vertical').length;
      const h = city.roads.filter((r) => r.orientation === 'horizontal').length;
      expect(city.intersections.length).toBe(v * h);
    }
    const city = generateCity(settings());
    expect(city.benches.length).toBeGreaterThan(0);
  });

  it('keeps street trees clear of lamps, crosswalks and intersections', () => {
    const city = generateCity(settings({ streetTreeMultiplier: 3 }));
    const streetTrees = city.streetTrees.filter((t) => t.setting === 'street');
    expect(streetTrees.length).toBeGreaterThan(0);
    const problems: string[] = [];
    for (const t of streetTrees) {
      for (const lamp of city.lamps) {
        if (Math.hypot(t.position.x - lamp.position.x, t.position.z - lamp.position.z) <= 2) {
          problems.push(`${t.id} near ${lamp.id}`);
        }
      }
      for (const cw of city.crosswalks) {
        const dx = Math.abs(t.position.x - cw.center.x);
        const dz = Math.abs(t.position.z - cw.center.z);
        // The band extended over both sidewalks.
        const [hx, hz] = cw.orientation === 'horizontal' ? [cw.length / 2 + 4.5, cw.width / 2] : [cw.width / 2, cw.length / 2 + 4.5];
        if (dx <= hx && dz <= hz) problems.push(`${t.id} on ${cw.id}`);
      }
      for (const it of city.intersections) {
        // Junction square widened by the corner sidewalks.
        if (Math.abs(t.position.x - it.center.x) < it.sizeX / 2 + 3 && Math.abs(t.position.z - it.center.z) < it.sizeZ / 2 + 3) {
          problems.push(`${t.id} in ${it.id}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('keeps every traffic waypoint inside town bounds', () => {
    const city = generateCity(settings({ trafficMultiplier: 2 }));
    const { minX, maxX, minZ, maxZ } = city.townBounds;
    expect(city.trafficPaths.length).toBeGreaterThan(0);
    for (const path of city.trafficPaths) {
      for (const p of [...path.waypoints, ...path.spawnPoints]) {
        expect(p.x).toBeGreaterThanOrEqual(minX);
        expect(p.x).toBeLessThanOrEqual(maxX);
        expect(p.z).toBeGreaterThanOrEqual(minZ);
        expect(p.z).toBeLessThanOrEqual(maxZ);
      }
    }
  });

  it('puts lanes at a quarter of the road width on streets and clear of the parking strip on avenues', () => {
    const city = generateCity(settings());
    const roads = new Map(city.roads.map((r) => [r.id, r]));
    for (const path of city.trafficPaths) {
      const road = roads.get(path.roadId)!;
      const lateral = road.orientation === 'vertical' ? path.waypoints[0].x - road.start.x : path.waypoints[0].z - road.start.z;
      const expected = road.streetClass === 'avenue' ? road.width / 2 - 3.75 : road.width / 4;
      expect(lateral).toBeCloseTo(path.direction * expected, 9);
    }
  });

  it('scales spawn points with trafficMultiplier', () => {
    const low = generateCity(settings({ trafficMultiplier: 0 }));
    const high = generateCity(settings({ trafficMultiplier: 2 }));
    const count = (c: ReturnType<typeof generateCity>) =>
      c.trafficPaths.reduce((sum, p) => sum + p.spawnPoints.length, 0);
    expect(count(low)).toBe(0);
    expect(count(high)).toBeGreaterThan(0);
  });
});
