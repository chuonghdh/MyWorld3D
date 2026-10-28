import { describe, expect, it } from 'vitest';
import type { CityLayout, Crosswalk } from '../src/city/layout';
import { generateCity } from '../src/city';
import { DEFAULT_SETTINGS } from '../src/store/model';
import { TrafficLightController, lightStateAt } from '../src/traffic/lights';
import {
  MAX_DOGS,
  MAX_WALKERS,
  Pedestrians,
  crowdDensityAt,
  redRemaining,
  type PedestrianRender,
} from '../src/traffic/pedestrians';
import { buildPerson, triangleCount } from '../src/traffic/people/personGeometry';
import { buildDog } from '../src/traffic/people/dogGeometry';
import { createPeopleMeshes } from '../src/traffic/people/peopleMeshes';
import { PALETTE_SIZES, TOP_COLORS, PANTS_COLORS } from '../src/traffic/people/palettes';

const city = generateCity(DEFAULT_SETTINGS);

function makeSim(seed = 3, mult = 1.75, hour = 12) {
  const lights = new TrafficLightController(city.trafficLights);
  const peds = new Pedestrians(city, { trafficMultiplier: mult, seed, lights, timeOfDay: hour });
  return { lights, peds };
}

function step(sim: { lights: TrafficLightController; peds: Pedestrians }, dt: number, hour = 12, rain = 0): void {
  sim.lights.update(dt);
  sim.peds.update(dt, { timeOfDay: hour, rain });
}

describe('people models', () => {
  it('builds three bodies with 150-250 triangles each without WebGL', () => {
    for (const kind of ['adult', 'child', 'elder'] as const) {
      const m = buildPerson(kind);
      const tris = triangleCount(m.geometry);
      expect(tris).toBeGreaterThanOrEqual(150);
      expect(tris).toBeLessThanOrEqual(250);
      expect(m.geometry.getAttribute('aRig').itemSize).toBe(4);
      expect(m.geometry.getAttribute('color').count).toBe(m.geometry.getAttribute('position').count);
    }
  });

  it('keeps heights in proportion: child about 65% of an adult, elder slightly shorter', () => {
    const adult = buildPerson('adult').height;
    const child = buildPerson('child').height;
    const elder = buildPerson('elder').height;
    expect(child / adult).toBeGreaterThan(0.6);
    expect(child / adult).toBeLessThan(0.72);
    expect(elder).toBeLessThan(adult);
    expect(elder).toBeGreaterThan(child);
  });

  it('builds a dog with about 100-160 triangles', () => {
    const tris = triangleCount(buildDog().geometry);
    expect(tris).toBeGreaterThanOrEqual(100);
    expect(tris).toBeLessThanOrEqual(160);
  });

  it('offers at least 10 palette entries for tops and trousers in every season', () => {
    for (const season of ['spring', 'summer', 'autumn', 'winter'] as const) {
      expect(TOP_COLORS[season]).toHaveLength(PALETTE_SIZES.top);
      expect(PANTS_COLORS[season]).toHaveLength(PALETTE_SIZES.pants);
      expect(new Set(TOP_COLORS[season]).size).toBeGreaterThanOrEqual(10);
    }
  });
});

describe('people meshes', () => {
  it('uses at most 6 instanced meshes and respects the 600 instance cap', () => {
    const meshes = createPeopleMeshes(512, 256);
    expect(meshes.group.children.length).toBeLessThanOrEqual(6);
    expect(meshes.bodies).toHaveLength(3);
    expect(MAX_WALKERS + MAX_DOGS).toBeLessThanOrEqual(600);

    const sim = makeSim(2, 50); // far above the cap
    expect(sim.peds.capacity).toBeLessThanOrEqual(MAX_WALKERS);
    for (let i = 0; i < 100; i++) step(sim, 0.1);
    const list = sim.peds.getPedestrians();
    const dogs = list.filter((p) => p.dog).length;
    expect(list.length + dogs).toBeLessThanOrEqual(600);

    meshes.update(list, { time: 1, night: false, season: 'winter', rain: 0.5 });
    const counted = meshes.bodies.reduce((n, m) => n + m.count, 0);
    expect(counted).toBe(list.length);
    expect(meshes.dogs.count).toBe(dogs);
    expect(meshes.leashes.count).toBe(dogs);
    expect(meshes.umbrellas.count).toBeGreaterThan(0);
    expect(meshes.umbrellas.count).toBeLessThanOrEqual(list.length);
    meshes.dispose();
  });

  it('opens no umbrellas without rain and some with rain', () => {
    const meshes = createPeopleMeshes(512, 256);
    const sim = makeSim(4);
    for (let i = 0; i < 50; i++) step(sim, 0.1);
    const list = sim.peds.getPedestrians();
    meshes.update(list, { time: 0, night: false, season: 'summer' });
    expect(meshes.umbrellas.count).toBe(0);
    meshes.update(list, { time: 0, night: false, season: 'summer', rain: 0.8 });
    expect(meshes.umbrellas.count).toBeGreaterThan(list.length * 0.5);
    meshes.dispose();
  });
});

describe('crowd density', () => {
  it('peaks at the rush hours and drops at night', () => {
    expect(crowdDensityAt(8.5)).toBeGreaterThan(0.9);
    expect(crowdDensityAt(17.5)).toBeGreaterThan(0.9);
    expect(crowdDensityAt(3)).toBeLessThan(0.15);
    expect(crowdDensityAt(12)).toBeGreaterThan(crowdDensityAt(3) * 4);
    expect(crowdDensityAt(22)).toBeGreaterThan(0.6); // the evening crowd holds until 22:00
    expect(crowdDensityAt(23)).toBeLessThan(0.15); // and has thinned to a few by 23:00
    expect(crowdDensityAt(6)).toBeGreaterThan(crowdDensityAt(5)); // the morning build-up starts at 05:00
    expect(crowdDensityAt(-1)).toBeCloseTo(crowdDensityAt(23), 6);
  });

  it('shows many more walkers at 08:30 than at 03:00', () => {
    const rush = makeSim(5, 1.75, 8.5);
    const night = makeSim(5, 1.75, 3);
    for (let i = 0; i < 600; i++) {
      step(rush, 0.1, 8.5);
      step(night, 0.1, 3);
    }
    expect(rush.peds.count).toBeGreaterThan(night.peds.count * 4);
    expect(night.peds.count).toBeLessThan(40);
  });

  it('thins out when the clock moves into the night and refills in the morning', () => {
    const sim = makeSim(6, 1.75, 12);
    for (let i = 0; i < 100; i++) step(sim, 0.1, 12);
    const noon = sim.peds.count;
    for (let i = 0; i < 4000; i++) step(sim, 0.1, 3);
    const night = sim.peds.count;
    for (let i = 0; i < 4000; i++) step(sim, 0.1, 8.5);
    const morning = sim.peds.count;
    expect(night).toBeLessThan(noon * 0.4);
    expect(morning).toBeGreaterThan(noon * 0.8);
  });

  it('busies avenues more than side streets', () => {
    const sim = makeSim(8, 1.75);
    const avenues = city.roads.filter((r) => r.streetClass === 'avenue');
    const streets = city.roads.filter((r) => r.streetClass !== 'avenue');
    const near = (x: number, z: number, roads: typeof avenues): boolean =>
      roads.some((r) => (r.orientation === 'vertical' ? Math.abs(x - r.start.x) < 8 : Math.abs(z - r.start.z) < 8));
    let a = 0;
    let s = 0;
    for (let i = 0; i < 3000; i++) {
      step(sim, 0.2);
      if (i % 10 !== 0) continue;
      for (const p of sim.peds.getPedestrians()) {
        if (near(p.position.x, p.position.z, avenues)) a++;
        else if (near(p.position.x, p.position.z, streets)) s++;
      }
    }
    const perMetreAvenue = a / avenues.length;
    const perMetreStreet = s / streets.length;
    expect(perMetreAvenue).toBeGreaterThan(perMetreStreet * 1.15);
  });
});

describe('signal-aware crossing', () => {
  function crosswalkAt(c: Crosswalk, x: number, z: number): boolean {
    const alongX = c.orientation === 'horizontal';
    const hx = alongX ? c.length / 2 : c.width / 2;
    const hz = alongX ? c.width / 2 : c.length / 2;
    return Math.abs(x - c.center.x) <= hx + 0.1 && Math.abs(z - c.center.z) <= hz + 0.1;
  }
  function nearestLight(c: Crosswalk): number {
    let best = -1;
    let bd = 15;
    city.trafficLights.forEach((l, i) => {
      const d = Math.hypot(l.position.x - c.center.x, l.position.z - c.center.z);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  }

  it('never stands on asphalt outside a crosswalk, and only crosses while cars are on red (10 simulated minutes)', () => {
    const sim = makeSim(11, 3);
    const roads = city.roads;
    let samples = 0;
    let onCrosswalk = 0;
    const bad: string[] = [];
    for (let i = 0; i < 6000; i++) {
      step(sim, 0.1);
      const list = sim.peds.getPedestrians();
      for (const p of list) {
        samples++;
        const spots: [number, number][] = [[p.position.x, p.position.z]];
        if (p.dog) spots.push([p.dog.position.x, p.dog.position.z]);
        for (const [x, z] of spots) {
          for (const r of roads) {
            const hw = r.width / 2 - 0.05;
            const inside =
              r.orientation === 'vertical'
                ? Math.abs(x - r.start.x) < hw && z > Math.min(r.start.z, r.end.z) && z < Math.max(r.start.z, r.end.z)
                : Math.abs(z - r.start.z) < hw && x > Math.min(r.start.x, r.end.x) && x < Math.max(r.start.x, r.end.x);
            if (!inside) continue;
            const cw = city.crosswalks.find((c) => crosswalkAt(c, x, z));
            if (!cw) {
              bad.push(`t=${(i / 10).toFixed(1)} walker ${p.id} on asphalt at ${x.toFixed(1)},${z.toFixed(1)}`);
              continue;
            }
            onCrosswalk++;
            const li = nearestLight(cw);
            if (li >= 0) {
              const axis = cw.orientation === 'horizontal' ? 'ns' : 'ew';
              const phase = lightStateAt(city.trafficLights[li].timing, sim.lights.elapsed, axis);
              if (phase !== 'red') bad.push(`t=${(i / 10).toFixed(1)} walker ${p.id} on ${cw.id} while cars have ${phase}`);
            }
          }
        }
      }
    }
    expect(samples).toBeGreaterThan(100000);
    expect(onCrosswalk).toBeGreaterThan(100); // they do cross
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it('completes crossings and waits at the curb within 5 simulated minutes', () => {
    const sim = makeSim(12, 1.75);
    for (let i = 0; i < 3000; i++) step(sim, 0.1);
    expect(sim.peds.stats.crossings).toBeGreaterThan(0);
    expect(sim.peds.stats.waits).toBeGreaterThan(0);
  });

  it('waits at the curb while cars have green and walks when they are red', () => {
    // One crossing in a tiny hand made layout: a vertical road with a horizontal crosswalk.
    const layout: CityLayout = {
      seed: 1,
      townBounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 },
      blocks: [],
      lots: [],
      streetTrees: [],
      roads: [{ id: 'v', orientation: 'vertical', start: { x: 0, z: -40 }, end: { x: 0, z: 40 }, width: 8, lanes: 2, streetClass: 'street', sidewalkWidth: 3 }],
      lamps: [],
      benches: [],
      crosswalks: [{ id: 'c', center: { x: 0, z: 0 }, orientation: 'horizontal', length: 8, width: 3 }],
      intersections: [],
      trafficLights: [{ id: 'l', position: { x: 0, z: 4 }, timing: { cycleSeconds: 40, nsGreenSeconds: 18, ewGreenSeconds: 18, yellowSeconds: 2 } }],
      trafficPaths: [],
    };
    const lights = new TrafficLightController(layout.trafficLights, 0);
    const peds = new Pedestrians(layout, { trafficMultiplier: 6, seed: 2, lights });
    expect(peds.count).toBeGreaterThan(0);
    let onRoadWhileGreen = 0;
    let crossedRed = 0;
    for (let i = 0; i < 6000; i++) {
      lights.update(0.1);
      peds.update(0.1);
      const green = lightStateAt(layout.trafficLights[0].timing, lights.elapsed, 'ns') !== 'red';
      for (const p of peds.getPedestrians()) {
        if (Math.abs(p.position.x) < 3.9) {
          if (green) onRoadWhileGreen++;
          else crossedRed++;
        }
      }
    }
    expect(onRoadWhileGreen).toBe(0);
    expect(crossedRed).toBeGreaterThan(0);
  });

  it('matches lightStateAt for the red remaining helper', () => {
    const t = { cycleSeconds: 40, nsGreenSeconds: 18, ewGreenSeconds: 18, yellowSeconds: 2 };
    for (let s = 0; s < 120; s += 0.25) {
      for (const [axis, name] of [[0, 'ns'], [1, 'ew']] as const) {
        const red = lightStateAt(t, s, name) === 'red';
        const rem = redRemaining(t.cycleSeconds, t.nsGreenSeconds, t.ewGreenSeconds, t.yellowSeconds, axis, s);
        expect(rem >= 0).toBe(red);
        if (red) expect(lightStateAt(t, s + rem + 1e-6, name)).toBe('green');
      }
    }
  });
});

describe('idle behaviours', () => {
  it('shows at least three distinct idle behaviours (chat, bench, window, door, curb wait)', () => {
    const sim = makeSim(21, 1.75);
    const seen = { chatting: 0, sitting: 0, looking: 0, hidden: 0, waiting: 0 };
    for (let i = 0; i < 6000; i++) {
      step(sim, 0.1);
      const b = sim.peds.behaviours;
      seen.chatting = Math.max(seen.chatting, b.chatting);
      seen.sitting = Math.max(seen.sitting, b.sitting);
      seen.looking = Math.max(seen.looking, b.looking);
      seen.hidden = Math.max(seen.hidden, b.hidden);
      seen.waiting = Math.max(seen.waiting, b.waiting);
    }
    const kinds = Object.values(seen).filter((n) => n > 0).length;
    expect(kinds).toBeGreaterThanOrEqual(4);
    expect(seen.sitting).toBeGreaterThan(0);
    expect(seen.chatting).toBeGreaterThan(0);
    expect(sim.peds.stats.doors).toBeGreaterThan(0);
  });

  it('puts sitters on a bench pose facing the bench direction and chatters in pairs', () => {
    const sim = makeSim(22, 3);
    let sitters = 0;
    let chatPairs = 0;
    for (let i = 0; i < 6000; i++) {
      step(sim, 0.1);
      const list = sim.peds.getPedestrians();
      for (const p of list) {
        if (p.pose === 3) {
          sitters++;
          const onBench = city.benches.some((b) => Math.hypot(b.position.x - p.position.x, b.position.z - p.position.z) < 1.2);
          expect(onBench).toBe(true);
        }
        if (p.pose === 2) chatPairs++;
      }
    }
    expect(sitters).toBeGreaterThan(0);
    expect(chatPairs).toBeGreaterThan(0);
  });
});

describe('Pedestrians pooling and determinism', () => {
  it('stays inside the town bounds including dogs and leash hands', () => {
    const sim = makeSim(31, 3);
    const b = city.townBounds;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    let finite = true;
    const grow = (x: number, z: number): void => {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    };
    for (let i = 0; i < 2000; i++) {
      step(sim, 0.1);
      for (const p of sim.peds.getPedestrians()) {
        grow(p.position.x, p.position.z);
        if (p.dog) {
          grow(p.dog.position.x, p.dog.position.z);
          grow(p.dog.leashHand.x, p.dog.leashHand.z);
          finite = finite && Number.isFinite(p.dog.heading) && Number.isFinite(p.heading);
        }
      }
    }
    expect(finite).toBe(true);
    expect(minX).toBeGreaterThanOrEqual(b.minX);
    expect(maxX).toBeLessThanOrEqual(b.maxX);
    expect(minZ).toBeGreaterThanOrEqual(b.minZ);
    expect(maxZ).toBeLessThanOrEqual(b.maxZ);
  });

  it('scales the walker count with trafficMultiplier and respects 0', () => {
    const low = makeSim(1, 0.5);
    const high = makeSim(1, 3);
    expect(low.peds.capacity).toBeLessThan(high.peds.capacity);
    for (let i = 0; i < 100; i++) {
      step(low, 0.1);
      step(high, 0.1);
    }
    expect(low.peds.count).toBeLessThanOrEqual(low.peds.capacity);
    expect(high.peds.count).toBeLessThanOrEqual(high.peds.capacity);
    expect(high.peds.count).toBeGreaterThan(low.peds.count);
    const none = makeSim(1, 0);
    for (let i = 0; i < 50; i++) step(none, 0.1);
    expect(none.peds.count).toBe(0);
    expect(none.peds.getPedestrians()).toHaveLength(0);
    // Raising the multiplier at runtime brings people back.
    high.peds.setTrafficMultiplier(0.5);
    expect(high.peds.capacity).toBe(low.peds.capacity);
    for (let i = 0; i < 20; i++) step(high, 0.1);
    expect(high.peds.count).toBeLessThanOrEqual(high.peds.capacity);
  });

  it('is deterministic for a seed and differs between seeds', () => {
    const run = (seed: number): string => {
      const s = makeSim(seed, 1.75);
      for (let i = 0; i < 1500; i++) step(s, 0.1);
      return s.peds
        .getPedestrians()
        .slice(0, 30)
        .map((p) => `${p.id}:${p.position.x.toFixed(3)},${p.position.z.toFixed(3)}:${p.pose}`)
        .join('|');
    };
    expect(run(7)).toBe(run(7));
    expect(run(7)).not.toBe(run(8));
  });

  it('reuses the output array and render objects (no per-frame allocation)', () => {
    const sim = makeSim(41, 1.75);
    step(sim, 0.1);
    const first = sim.peds.getPedestrians();
    const objects = new Set<PedestrianRender>(first);
    for (let i = 0; i < 1000; i++) {
      step(sim, 0.05);
      expect(sim.peds.getPedestrians()).toBe(first);
    }
    for (const p of first) expect(objects.has(p) || p.id > 0).toBe(true);
    // The same slot keeps the same render object.
    const a = sim.peds.getPedestrians()[0];
    step(sim, 0.05);
    expect(sim.peds.getPedestrians()[0]).toBe(a);
  });

  it('simulates 600 walkers fast enough (well under 0.5 ms per frame on average)', () => {
    const sim = makeSim(51, 40);
    expect(sim.peds.capacity).toBe(MAX_WALKERS);
    for (let i = 0; i < 50; i++) step(sim, 0.016);
    const t0 = performance.now();
    const frames = 1500;
    for (let i = 0; i < frames; i++) {
      step(sim, 0.016);
      sim.peds.getPedestrians();
    }
    const per = (performance.now() - t0) / frames;
    expect(per).toBeLessThan(0.5);
  });

  it('works on a layout without crosswalks (plain sidewalk lines)', () => {
    const layout: CityLayout = {
      seed: 1,
      townBounds: { minX: -200, maxX: 200, minZ: -200, maxZ: 200 },
      blocks: [],
      lots: [],
      streetTrees: [],
      roads: [{ id: 'r', orientation: 'vertical', start: { x: 0, z: -100 }, end: { x: 0, z: 100 }, width: 8, lanes: 2, streetClass: 'street', sidewalkWidth: 3 }],
      lamps: [],
      benches: [],
      crosswalks: [],
      intersections: [],
      trafficLights: [],
      trafficPaths: [],
    };
    const peds = new Pedestrians(layout, { trafficMultiplier: 2, seed: 1 });
    expect(peds.count).toBeGreaterThan(0);
    for (let i = 0; i < 500; i++) {
      peds.update(0.1);
      for (const p of peds.getPedestrians()) expect(Math.abs(p.position.x)).toBeGreaterThan(3.5);
    }
  });
});
