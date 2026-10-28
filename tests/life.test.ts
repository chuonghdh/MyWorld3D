import { describe, expect, it } from 'vitest';
import { generateCity } from '../src/city';
import type { WorldSettings } from '../src/core/types';
import { clearLifeEvents, createLife, getLifeEvents } from '../src/life';
import type { Disturber, LifeContext, LifeEvent, LifeQuality } from '../src/life';
import { PIGEON_STATE } from '../src/life/birds';

function settings(): WorldSettings {
  return {
    seed: 4242, timeOfDay: 12, season: 'summer', windSpeed: 2, windDirection: 0, townWidth: 300, townDepth: 300,
    trafficMultiplier: 1, streetTreeMultiplier: 1, leafAmount: 0.5, leafSize: 1, soundEnabled: false,
  };
}

const layout = generateCity(settings());
const NONE: readonly Disturber[] = [];

function ctx(time: number, over: Partial<LifeContext> = {}): LifeContext {
  return {
    time, timeOfDay: 12, season: 'summer', night: false, wind: { x: 1, z: 0.5 }, vehicles: NONE, pedestrians: NONE,
    ...over,
  };
}

function run(life: ReturnType<typeof createLife>, seconds: number, make: (t: number) => Partial<LifeContext> = () => ({}), dt = 0.05, t0 = 0): number {
  let t = t0;
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) {
    t += dt;
    life.update(dt, ctx(t, make(t)));
  }
  return t;
}

function allFinite(a: ArrayLike<number>): boolean {
  for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) return false;
  return true;
}

describe('life: determinism and counts', () => {
  it('same seed gives the same animals and the same motion', () => {
    const a = createLife(layout, { seed: 7 });
    const b = createLife(layout, { seed: 7 });
    const c = createLife(layout, { seed: 8 });
    expect(Array.from(a.pigeons.x)).toEqual(Array.from(b.pigeons.x));
    expect(Array.from(a.cats.z)).toEqual(Array.from(b.cats.z));
    expect(Array.from(a.pigeons.x)).not.toEqual(Array.from(c.pigeons.x));
    run(a, 20);
    run(b, 20);
    expect(Array.from(a.pigeons.z)).toEqual(Array.from(b.pigeons.z));
    expect(Array.from(a.flocks.x)).toEqual(Array.from(b.flocks.x));
    expect(Array.from(a.flocks.mesh.instanceMatrix.array)).toEqual(Array.from(b.flocks.mesh.instanceMatrix.array));
    a.dispose();
    b.dispose();
    c.dispose();
  });

  it('scales counts with quality (low is about 40 percent)', () => {
    const caps = (q: LifeQuality) => {
      const l = createLife(layout, { seed: 1, quality: q });
      const r = {
        pigeons: l.pigeons.capacity,
        flocks: l.flocks.capacity,
        cats: l.cats.capacity,
        squirrels: l.squirrels.capacity,
        butterflies: l.butterflies.capacity,
      };
      l.dispose();
      return r;
    };
    const hi = caps('high');
    const mid = caps('medium');
    const lo = caps('low');
    expect(hi.pigeons).toBe(80);
    expect(hi.flocks).toBe(77);
    expect(hi.cats).toBeGreaterThanOrEqual(10);
    expect(hi.cats).toBeLessThanOrEqual(16);
    expect(hi.squirrels).toBe(10);
    expect(hi.butterflies).toBe(30);
    for (const k of Object.keys(hi) as Array<keyof typeof hi>) {
      expect(lo[k]).toBeLessThan(mid[k]);
      expect(mid[k]).toBeLessThanOrEqual(hi[k]);
    }
    expect(lo.pigeons / hi.pigeons).toBeCloseTo(0.4, 1);
  });
});

describe('life: pigeons', () => {
  it('scatter when a pedestrian comes within 4 m, fire an event, and return to ground or perch', () => {
    const events: LifeEvent[] = [];
    const life = createLife(layout, { seed: 3, onEvent: (e) => events.push({ ...e }) });
    clearLifeEvents();
    const p = life.pigeons;
    let t = run(life, 1);
    let idx = -1;
    for (let i = 0; i < p.capacity; i++) {
      if (p.state[i] === PIGEON_STATE.PECK && p.y[i] < 1) {
        idx = i;
        break;
      }
    }
    expect(idx).toBeGreaterThanOrEqual(0);
    const walker: Disturber = { position: { x: p.x[idx] + 2, z: p.z[idx] } };
    const far: Disturber = { position: { x: p.x[idx] + 30, z: p.z[idx] } };
    t = run(life, 0.5, () => ({ pedestrians: [far] }), 0.05, t);
    expect([PIGEON_STATE.PECK, PIGEON_STATE.WALK]).toContain(p.state[idx]);
    t = run(life, 0.5, () => ({ pedestrians: [walker] }), 0.05, t);
    expect([PIGEON_STATE.SCARED, PIGEON_STATE.CLIMB, PIGEON_STATE.CIRCLE]).toContain(p.state[idx]);
    expect(events.some((e) => e.type === 'pigeon-scatter')).toBe(true);
    expect(getLifeEvents().some((e) => e.type === 'pigeon-scatter')).toBe(true);
    clearLifeEvents();
    expect(getLifeEvents()).toHaveLength(0);
    t = run(life, 3, () => ({}), 0.05, t);
    expect(p.y[idx]).toBeGreaterThan(3);
    t = run(life, 40, () => ({}), 0.05, t);
    expect([PIGEON_STATE.PECK, PIGEON_STATE.PERCH, PIGEON_STATE.WALK]).toContain(p.state[idx]);
    life.dispose();
  });

  it('a passing vehicle scatters pigeons too', () => {
    const life = createLife(layout, { seed: 5 });
    const p = life.pigeons;
    let idx = -1;
    for (let i = 0; i < p.capacity; i++) {
      if (p.state[i] === PIGEON_STATE.PECK && p.y[i] < 1) {
        idx = i;
        break;
      }
    }
    expect(idx).toBeGreaterThanOrEqual(0);
    const car: Disturber = { position: { x: p.x[idx], z: p.z[idx] + 3 } };
    run(life, 0.5, () => ({ vehicles: [car] }));
    expect(p.state[idx]).not.toBe(PIGEON_STATE.PECK);
    life.dispose();
  });

  it('roof pigeons are not scared by people on the street below', () => {
    const life = createLife(layout, { seed: 9 });
    const p = life.pigeons;
    let idx = -1;
    for (let i = 0; i < p.capacity; i++) {
      if (p.state[i] === PIGEON_STATE.PERCH) {
        idx = i;
        break;
      }
    }
    expect(idx).toBeGreaterThanOrEqual(0);
    const below: Disturber = { position: { x: p.x[idx], z: p.z[idx] } };
    run(life, 0.5, () => ({ pedestrians: [below] }));
    expect(p.state[idx]).toBe(PIGEON_STATE.PERCH);
    life.dispose();
  });

  it('perch on rooftops at the estimated building height', () => {
    const life = createLife(layout, { seed: 11 });
    const p = life.pigeons;
    let roofs = 0;
    for (let i = 0; i < p.capacity; i++) {
      if (p.state[i] === PIGEON_STATE.PERCH) {
        roofs++;
        expect(p.y[i]).toBeGreaterThan(3);
      }
    }
    expect(roofs).toBeGreaterThan(10);
    life.dispose();
  });
});

describe('life: bounds, seasons, perf', () => {
  it('birds stay inside the town plus a margin', () => {
    const life = createLife(layout, { seed: 2 });
    const b = layout.townBounds;
    const margin = 60;
    const walker = (t: number): Disturber[] => [{ position: { x: Math.sin(t) * 80, z: Math.cos(t * 0.7) * 80 } }];
    let t = 0;
    for (let s = 0; s < 120; s++) {
      t = run(life, 1, (tt) => ({ pedestrians: walker(tt), wind: { x: 4, z: 3 } }), 0.05, t);
      for (const sys of [life.pigeons, life.flocks]) {
        for (let i = 0; i < sys.x.length; i++) {
          expect(sys.x[i]).toBeGreaterThan(b.minX - margin);
          expect(sys.x[i]).toBeLessThan(b.maxX + margin);
          expect(sys.z[i]).toBeGreaterThan(b.minZ - margin);
          expect(sys.z[i]).toBeLessThan(b.maxZ + margin);
        }
      }
    }
    life.dispose();
  });

  it('squirrels are hidden in winter, visible in spring and autumn', () => {
    const life = createLife(layout, { seed: 4 });
    let t = run(life, 6, () => ({ season: 'spring' }));
    expect(life.squirrels.visibleCount).toBeGreaterThan(0);
    t = run(life, 6, () => ({ season: 'winter' }), 0.05, t);
    expect(life.squirrels.visibleCount).toBe(0);
    t = run(life, 6, () => ({ season: 'autumn' }), 0.05, t);
    expect(life.squirrels.visibleCount).toBe(life.squirrels.capacity);
    life.dispose();
  });

  it('butterflies are hidden at night and in autumn, visible on summer days', () => {
    const life = createLife(layout, { seed: 4 });
    let t = run(life, 6, () => ({ season: 'summer', timeOfDay: 13 }));
    expect(life.butterflies.visibleCount).toBeGreaterThan(0);
    t = run(life, 6, () => ({ season: 'summer', timeOfDay: 23, night: true }), 0.05, t);
    expect(life.butterflies.visibleCount).toBe(0);
    t = run(life, 6, () => ({ season: 'autumn', timeOfDay: 13 }), 0.05, t);
    expect(life.butterflies.visibleCount).toBe(0);
    t = run(life, 6, () => ({ season: 'spring', timeOfDay: 13, rain: 0.8 }), 0.05, t);
    expect(life.butterflies.visibleCount).toBe(0);
    life.dispose();
  });

  it('flocks thin out at night; cats hide in heavy rain', () => {
    const life = createLife(layout, { seed: 4 });
    let t = run(life, 5);
    const day = life.flocks.visibleCount;
    t = run(life, 20, () => ({ night: true, timeOfDay: 23 }), 0.05, t);
    expect(life.flocks.visibleCount).toBeLessThan(day);
    expect(life.cats.visibleCount).toBeGreaterThan(0);
    t = run(life, 8, () => ({ rain: 0.9 }), 0.05, t);
    expect(life.cats.visibleCount).toBe(0);
    life.dispose();
  });

  it('stays within 6 draw calls and 40k triangles', () => {
    const life = createLife(layout, { seed: 1, quality: 'high' });
    run(life, 2);
    const s = life.stats();
    expect(s.drawCalls).toBeLessThanOrEqual(6);
    expect(s.maxTriangles).toBeLessThanOrEqual(40000);
    expect(life.pigeons.triangles).toBeGreaterThanOrEqual(150);
    expect(life.pigeons.triangles).toBeLessThanOrEqual(250);
    let meshes = 0;
    life.group.traverse((o) => {
      if ((o as { isInstancedMesh?: boolean }).isInstancedMesh) meshes++;
    });
    expect(meshes).toBeLessThanOrEqual(6);
    life.dispose();
  });
});

describe('life: robustness', () => {
  it('update with dt = 0 and empty arrays is safe and keeps everything finite', () => {
    const life = createLife(layout, { seed: 6 });
    life.update(0, ctx(0));
    life.update(0, ctx(1, { rain: 1, night: true }));
    life.update(0.016, ctx(2, { camera: { x: 0, y: 50, z: 0 } }));
    run(life, 30, () => ({ camera: { x: 10, y: 40, z: -10 } }));
    const arrays = [
      life.pigeons.x, life.pigeons.y, life.pigeons.z, life.pigeons.hd, life.flocks.x, life.flocks.y, life.flocks.z,
      life.cats.x, life.cats.z, life.squirrels.x, life.squirrels.z, life.butterflies.x, life.butterflies.y,
      life.pigeons.mesh.instanceMatrix.array, life.flocks.mesh.instanceMatrix.array, life.cats.mesh.instanceMatrix.array,
      life.squirrels.mesh.instanceMatrix.array, life.butterflies.mesh.instanceMatrix.array,
    ];
    for (const arr of arrays) expect(allFinite(arr)).toBe(true);
    life.dispose();
  });

  it('works on an empty layout and disposes without throwing', () => {
    const empty = { ...layout, lots: [], roads: [], streetTrees: [], benches: [], blocks: [], lamps: [], crosswalks: [], intersections: [] };
    const life = createLife(empty, { seed: 1, quality: 'low' });
    run(life, 5);
    expect(allFinite(life.pigeons.x)).toBe(true);
    expect(() => life.dispose()).not.toThrow();
    expect(() => life.dispose()).not.toThrow();
    const life2 = createLife(layout);
    expect(() => life2.dispose()).not.toThrow();
    expect(() => life2.update(0.1, ctx(1))).not.toThrow();
  });
});
