import { describe, expect, it } from 'vitest';
import type { CityLayout, Crosswalk } from '../src/city/layout';
import { generateCity } from '../src/city';
import { DEFAULT_SETTINGS } from '../src/store/model';
import { trafficLife, uiCamera } from '../src/config/tuning';
import { TrafficLightController, lightStateAt } from '../src/traffic/lights';
import {
  MAX_DOGS,
  MAX_WALKERS,
  Pedestrians,
  crowdDensityAt,
  redRemaining,
  type PedestrianRender,
} from '../src/traffic/pedestrians';
import { PART, buildPerson, gaitOf, triangleCount } from '../src/traffic/people/personGeometry';
import { buildDog } from '../src/traffic/people/dogGeometry';
import { createPeopleMeshes } from '../src/traffic/people/peopleMeshes';
import { PALETTE_SIZES, TOP_COLORS, PANTS_COLORS } from '../src/traffic/people/palettes';
import { FLAG, outfitFlags } from '../src/traffic/people/outfit';
import {
  BODY_ADULT,
  BODY_CHILD,
  BODY_ELDER,
  BODY_TEEN,
  HAIR_STYLE_COUNT,
  TRAIT_BAG,
  TRAIT_CHECKS,
  TRAIT_DIAGONAL,
  TRAIT_DOTS,
  TRAIT_HAT,
  TRAIT_HEARTS,
  TRAIT_HSTRIPES,
  TRAIT_SCARF,
  TRAIT_SHORTS,
  TRAIT_SHORT_SLEEVES,
  TRAIT_VSTRIPES,
} from '../src/traffic/pedestrians';

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
  const KINDS = ['adult', 'teen', 'child', 'elder'] as const;

  it('builds four age groups with 350-480 triangles each at far detail (all parts; near detail is in peopleNear.test.ts) without WebGL', () => {
    for (const kind of KINDS) {
      const m = buildPerson(kind);
      const tris = triangleCount(m.geometry);
      expect(tris).toBeGreaterThanOrEqual(350);
      expect(tris).toBeLessThanOrEqual(480);
      expect(m.geometry.getAttribute('aRig').itemSize).toBe(4);
      expect(m.geometry.getAttribute('color').count).toBe(m.geometry.getAttribute('position').count);
      expect(m.geometry.getAttribute('aMorph').itemSize).toBe(3);
      expect(m.geometry.getAttribute('aMorphN').count).toBe(m.geometry.getAttribute('position').count);
    }
  });

  it('keeps heights in proportion: child about 65% of an adult, teen between, elder slightly shorter', () => {
    const adult = buildPerson('adult').headTop;
    const teen = buildPerson('teen').headTop;
    const child = buildPerson('child').headTop;
    const elder = buildPerson('elder').headTop;
    expect(child / adult).toBeGreaterThan(0.6);
    expect(child / adult).toBeLessThan(0.72);
    expect(teen).toBeGreaterThan(child);
    expect(teen).toBeLessThan(adult);
    expect(elder).toBeLessThan(adult);
    expect(elder).toBeGreaterThan(child);
  });

  it('morphs women only in width (x and z): no vertex changes height, and the morph is not empty', () => {
    for (const kind of KINDS) {
      const m = buildPerson(kind);
      const morph = m.geometry.getAttribute('aMorph').array as Float32Array;
      const pos = m.geometry.getAttribute('position').array as Float32Array;
      let maxDy = 0;
      let maxDx = 0;
      for (let i = 0; i < morph.length; i += 3) {
        maxDy = Math.max(maxDy, Math.abs(morph[i + 1]));
        maxDx = Math.max(maxDx, Math.abs(morph[i]));
      }
      expect(pos.length).toBe(morph.length);
      expect(maxDy).toBe(0);
      expect(maxDx).toBeGreaterThan(0.001);
    }
  });

  it('gives women a shorter, lighter stride than men, elders short steps and slow pace, children quick steps', () => {
    for (const kind of ['adult', 'teen', 'elder'] as const) {
      expect(gaitOf(kind, 1).cycle).toBeLessThan(gaitOf(kind, 0).cycle);
      expect(gaitOf(kind, 1).heightK).toBeLessThan(gaitOf(kind, 0).heightK);
    }
    expect(gaitOf('elder', 0).cycle).toBeLessThan(gaitOf('adult', 0).cycle);
    expect(gaitOf('elder', 0).amp).toBeLessThan(gaitOf('adult', 0).amp);
    expect(gaitOf('child', 0).cycle).toBeLessThan(gaitOf('adult', 0).cycle);
    expect(gaitOf('child', 0).amp).toBeLessThan(gaitOf('adult', 0).amp);
  });

  it('gives children a natural child cadence and swing defaults, adults the plain sine gait', () => {
    for (const female of [0, 1] as const) {
      const child = gaitOf('child', female);
      expect(child.cycle).toBe(1.425);
      expect(child.amp).toBe(0.9);
      expect(child.ease).toBe(0.35);
      expect(child.kneeK).toBe(1.3);
      expect(child.armK).toBe(0.8);
      expect(child.bobK).toBe(1.6);
    }
    for (const kind of ['adult', 'teen', 'elder'] as const) {
      for (const female of [0, 1] as const) {
        const g = gaitOf(kind, female);
        expect(g.ease).toBe(0);
        expect(g.kneeK).toBe(1);
        expect(g.armK).toBe(1);
        expect(g.bobK).toBe(1);
      }
    }
    expect(gaitOf('adult', 0).cycle).toBe(1.5);
    expect(gaitOf('adult', 0).amp).toBe(1);
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
  it('uses at most 11 instanced meshes (a near and a far one per age group, plus dogs, leashes, umbrellas) and respects the 600 instance cap', () => {
    const meshes = createPeopleMeshes(512, 256);
    expect(meshes.group.children.length).toBeLessThanOrEqual(11);
    expect(meshes.bodies).toHaveLength(4);
    expect(meshes.nearBodies).toHaveLength(4);
    expect(MAX_WALKERS + MAX_DOGS).toBeLessThanOrEqual(600);

    const sim = makeSim(2, 50); // far above the cap
    expect(sim.peds.capacity).toBeLessThanOrEqual(MAX_WALKERS);
    for (let i = 0; i < 100; i++) step(sim, 0.1);
    const list = sim.peds.getPedestrians();
    const dogs = list.filter((p) => p.dog).length;
    expect(list.length + dogs).toBeLessThanOrEqual(600);

    meshes.update(list, { time: 1, night: false, season: 'winter', rain: 0.5 });
    const counted = [...meshes.bodies, ...meshes.nearBodies].reduce((n, m) => n + m.count, 0);
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

describe('appearance, outfits and pace', () => {
  type Look = Pick<PedestrianRender, 'body' | 'female' | 'hairStyle' | 'traits' | 'hair'>;
  function collectLooks(seed: number, steps: number): Look[] {
    const sim = makeSim(seed, 40); // far above the cap: the full 480 walkers are in play
    const out: Look[] = [];
    for (let i = 0; i < steps; i++) {
      step(sim, 0.1);
      if (i % 5 !== 0) continue;
      for (const p of sim.peds.getPedestrians()) {
        out.push({ body: p.body, female: p.female, hairStyle: p.hairStyle, traits: p.traits, hair: p.hair });
      }
    }
    return out;
  }

  it('gives the crowd 8 or more hair styles and all four age groups, both sexes', () => {
    const looks = collectLooks(61, 400);
    const styles = new Set(looks.map((p) => p.hairStyle));
    const bodies = new Set(looks.map((p) => p.body));
    expect(HAIR_STYLE_COUNT).toBeGreaterThanOrEqual(8);
    expect(styles.size).toBeGreaterThanOrEqual(8);
    expect(bodies).toEqual(new Set([BODY_ADULT, BODY_CHILD, BODY_ELDER, BODY_TEEN]));
    expect(looks.some((p) => p.female === 1)).toBe(true);
    expect(looks.some((p) => p.female === 0)).toBe(true);
    for (const p of looks) expect(p.hairStyle).toBeLessThan(HAIR_STYLE_COUNT);
  });

  it('gives the same people for the same seed', () => {
    const key = (list: Look[]): string => list.map((p) => `${p.body}:${p.female}:${p.hairStyle}:${p.traits}:${p.hair}`).join('|');
    expect(key(collectLooks(9, 60))).toBe(key(collectLooks(9, 60)));
  });

  it('gives coats tails that stop above the knee, so trousers show below them', () => {
    // The coat part is the only garment shape left on the torso; its hem must sit between hip and knee.
    for (const kind of ['adult', 'teen', 'child', 'elder'] as const) {
      const m = buildPerson(kind);
      const rig = m.geometry.getAttribute('aRig').array as Float32Array;
      const pos = m.geometry.getAttribute('position').array as Float32Array;
      let minY = Infinity;
      let maxY = -Infinity;
      for (let v = 0; v < rig.length / 4; v++) {
        if (Math.round(rig[v * 4]) !== PART.COAT) continue;
        minY = Math.min(minY, pos[v * 3 + 1]);
        maxY = Math.max(maxY, pos[v * 3 + 1]);
      }
      expect(maxY - minY).toBeGreaterThan(0);
      // The knee is at 0.51 m (adult scale); the coat hem must be well above it.
      const knee = 0.51 * (kind === 'child' ? 0.64 : kind === 'teen' ? 0.87 : kind === 'elder' ? 0.95 : 1);
      expect(minY).toBeGreaterThan(knee + 0.1);
    }
  });

  it('gives 90 percent of women long hair (shoulder, waist, long bob or pigtails) and men their mixed styles', () => {
    const looks = collectLooks(83, 400);
    const long = new Set([4, 7, 8, 9]);
    // Children keep their own mix; women and girls from teens up follow the 90 percent rule.
    const women = looks.filter((p) => p.female === 1 && p.body !== BODY_CHILD);
    const longWomen = women.filter((p) => long.has(p.hairStyle));
    const share = longWomen.length / women.length;
    expect(share).toBeGreaterThan(0.85);
    expect(share).toBeLessThan(0.95);
    const men = looks.filter((p) => p.female === 0);
    expect(men.some((p) => long.has(p.hairStyle))).toBe(false);
    expect(new Set(men.map((p) => p.hairStyle)).size).toBeGreaterThanOrEqual(3);
  });

  it('gives 70 percent of walkers a patterned top, one of six patterns', () => {
    const looks = collectLooks(82, 400);
    const bits = [TRAIT_DOTS, TRAIT_HEARTS, TRAIT_HSTRIPES, TRAIT_VSTRIPES, TRAIT_CHECKS, TRAIT_DIAGONAL];
    const patterned = looks.filter((p) => bits.some((b) => (p.traits & b) !== 0));
    const share = patterned.length / looks.length;
    expect(share).toBeGreaterThan(0.65);
    expect(share).toBeLessThan(0.75);
    for (const bit of bits) {
      expect(patterned.some((p) => (p.traits & bit) !== 0)).toBe(true);
    }
    // A patterned walker has exactly one pattern.
    for (const p of patterned) expect(bits.filter((b) => (p.traits & b) !== 0).length).toBe(1);
  });

  it('gives each walker one consistent outfit per season: coats in winter, no coat in summer, shorts only in summer', () => {
    for (const season of ['spring', 'summer', 'autumn', 'winter'] as const) {
      for (let traits = 0; traits < 512; traits++) {
        for (const r2 of [0.05, 0.3, 0.7, 0.95]) {
          const rank = (traits % 7) / 7;
          const f = outfitFlags(season, traits, r2, rank);
          expect(outfitFlags(season, traits, r2, rank)).toBe(f);
          // Nobody wears a dress or an ao dai: no such flag is ever set.
          expect(f & 64).toBe(0);
          expect(f & 128).toBe(0);
          if (season === 'winter') expect(f & FLAG.COAT).toBeTruthy();
          if (season === 'summer') expect(f & FLAG.COAT).toBe(0);
          if (season === 'summer' && (traits & TRAIT_SHORTS) !== 0) expect(f & FLAG.BARE_SHINS).toBeTruthy();
          if (season !== 'summer') expect(f & FLAG.BARE_SHINS).toBe(0);
        }
      }
    }
    // Each pattern trait maps to its own flag, in any season.
    expect(outfitFlags('summer', TRAIT_DOTS, 0.5, 0.5) & FLAG.DOTS).toBeTruthy();
    expect(outfitFlags('autumn', TRAIT_HEARTS, 0.5, 0.5) & FLAG.HEARTS).toBeTruthy();
    expect(outfitFlags('spring', TRAIT_HSTRIPES, 0.5, 0.5) & FLAG.HSTRIPES).toBeTruthy();
    expect(outfitFlags('winter', TRAIT_VSTRIPES, 0.5, 0.5) & FLAG.VSTRIPES).toBeTruthy();
    expect(outfitFlags('summer', TRAIT_CHECKS, 0.5, 0.5) & FLAG.CHECKS).toBeTruthy();
    expect(outfitFlags('spring', TRAIT_DIAGONAL, 0.5, 0.5) & FLAG.DIAGONAL).toBeTruthy();
    // Summer sleeves follow the trait; hats and scarves only with their traits.
    expect(outfitFlags('summer', TRAIT_SHORT_SLEEVES, 0.5, 0.5) & FLAG.SHORT_SLEEVES).toBeTruthy();
    expect(outfitFlags('summer', 0, 0.5, 0.5) & (FLAG.HAT | FLAG.SCARF | FLAG.BAG)).toBe(0);
    expect(outfitFlags('winter', TRAIT_HAT | TRAIT_SCARF | TRAIT_BAG, 0.99, 0.99) & (FLAG.HAT | FLAG.SCARF | FLAG.BAG)).toBe(FLAG.HAT | FLAG.SCARF | FLAG.BAG);
  });

  it('paces teens quicker than adults, adults quicker than elders, and women a touch slower than men', () => {
    const sim = makeSim(71, 1.75);
    const sum = new Float64Array(8);
    const n = new Float64Array(8);
    for (let i = 0; i < 4000; i++) {
      step(sim, 0.1);
      if (i % 5 !== 0) continue;
      for (const p of sim.peds.getPedestrians()) {
        if (p.pose !== 0 || p.speed <= 0 || p.dog) continue;
        const key = p.body * 2 + p.female;
        sum[key] += p.speed;
        n[key] += 1;
      }
    }
    const mean = (body: number, female: number): number => sum[body * 2 + female] / n[body * 2 + female];
    expect(mean(BODY_TEEN, 0)).toBeGreaterThan(mean(BODY_ADULT, 0));
    expect(mean(BODY_ADULT, 0)).toBeGreaterThan(mean(BODY_ELDER, 0));
    expect(mean(BODY_ADULT, 1)).toBeLessThan(mean(BODY_ADULT, 0));
  });

  it('makes the adult walk at the child pace: the adult speed is steady, the child wobbles around it', () => {
    const sim = makeSim(72, 3);
    // Pairs get consecutive ids and a child is always the follower, so its adult is the walker with id - 1.
    let samples = 0;
    let wobbleSum = 0;
    let wobbleMin = Infinity;
    let wobbleMax = -Infinity;
    for (let i = 0; i < 6000; i++) {
      step(sim, 0.1);
      if (i % 3 !== 0) continue;
      const list = sim.peds.getPedestrians();
      const byId = new Map<number, (typeof list)[number]>();
      for (const p of list) byId.set(p.id, p);
      for (const c of list) {
        if (c.body !== BODY_CHILD || c.pose !== 0 || c.speed <= 0) continue;
        const adult = byId.get(c.id - 1);
        if (!adult || adult.body === BODY_CHILD || adult.pose !== 0 || adult.speed <= 0) continue;
        const ratio = c.speed / adult.speed;
        wobbleSum += ratio;
        wobbleMin = Math.min(wobbleMin, ratio);
        wobbleMax = Math.max(wobbleMax, ratio);
        samples++;
      }
    }
    expect(samples).toBeGreaterThan(200);
    // The child's speed is the adult's times the wobble (1 +- childCadenceWobble), so the average ratio is about 1.
    const mean = wobbleSum / samples;
    expect(mean).toBeGreaterThan(0.97);
    expect(mean).toBeLessThan(1.03);
    const w = trafficLife.childCadenceWobble;
    expect(wobbleMin).toBeGreaterThanOrEqual(1 - w - 0.01);
    expect(wobbleMax).toBeLessThanOrEqual(1 + w + 0.01);
  });
});

describe('crowd density', () => {
  it('peaks at 11:00 and 19:00 and sits at the quiet floor at night', () => {
    // Shared curve: see src/traffic/trafficDensity.ts and tests/trafficDensity.test.ts.
    expect(crowdDensityAt(11)).toBeGreaterThan(0.95);
    expect(crowdDensityAt(19)).toBeGreaterThan(0.95);
    expect(crowdDensityAt(3)).toBeLessThan(0.25);
    expect(crowdDensityAt(11)).toBeGreaterThan(crowdDensityAt(3) * 4);
    expect(crowdDensityAt(23)).toBeLessThan(0.25); // quiet by 23:00
    expect(crowdDensityAt(6)).toBeGreaterThan(crowdDensityAt(5)); // the morning build-up starts at 05:00
    expect(crowdDensityAt(-1)).toBeCloseTo(crowdDensityAt(23), 6);
  });

  it('shows many more walkers at 11:00 than at 03:00', () => {
    const rush = makeSim(5, 1.75, 11);
    const night = makeSim(5, 1.75, 3);
    for (let i = 0; i < 600; i++) {
      step(rush, 0.1, 11);
      step(night, 0.1, 3);
    }
    expect(rush.peds.count).toBeGreaterThan(night.peds.count * 4);
    // Night holds the 0.2 floor: about a fifth of the 11:00 crowd.
    expect(night.peds.count).toBeLessThan(rush.peds.count * 0.35);
  });

  it('thins out when the clock moves into the night and refills in the morning', () => {
    const sim = makeSim(6, 1.75, 12);
    for (let i = 0; i < 100; i++) step(sim, 0.1, 12);
    const noon = sim.peds.count;
    for (let i = 0; i < 4000; i++) step(sim, 0.1, 3);
    const night = sim.peds.count;
    for (let i = 0; i < 4000; i++) step(sim, 0.1, 11);
    const morning = sim.peds.count;
    expect(night).toBeLessThan(noon * 0.4);
    expect(morning).toBeGreaterThan(noon * 0.8);
  });

  it('busies avenues more than side streets', () => {
    // Averaged over six seeds: one seed alone is noisy (seed 8 reads about 1.08 after the look rules changed,
    // the others 1.2 to 1.4).
    const avenues = city.roads.filter((r) => r.streetClass === 'avenue');
    const streets = city.roads.filter((r) => r.streetClass !== 'avenue');
    const near = (x: number, z: number, roads: typeof avenues): boolean =>
      roads.some((r) => (r.orientation === 'vertical' ? Math.abs(x - r.start.x) < 8 : Math.abs(z - r.start.z) < 8));
    let a = 0;
    let s = 0;
    for (const seed of [8, 1, 2, 3, 4, 5]) {
      const sim = makeSim(seed, 1.75);
      for (let i = 0; i < 3000; i++) {
        step(sim, 0.2);
        if (i % 10 !== 0) continue;
        for (const p of sim.peds.getPedestrians()) {
          if (near(p.position.x, p.position.z, avenues)) a++;
          else if (near(p.position.x, p.position.z, streets)) s++;
        }
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

  it('simulates the default crowd fast enough (per-frame cost bound on a warm loop)', () => {
    // Scene-default density (slider default), not the 480-walker cap: the cap is a ceiling, not a target.
    const sim = makeSim(51, uiCamera.defaultTrafficMultiplier);
    expect(sim.peds.capacity).toBeGreaterThan(0);
    expect(sim.peds.capacity).toBeLessThan(MAX_WALKERS);
    for (let i = 0; i < 300; i++) step(sim, 0.016); // fixed warm-up: JIT and caches settle before timing
    // Nine timed batches; the median per-frame cost ignores batches hit by load or GC pauses.
    const batches = 9;
    const framesPerBatch = 200;
    const perFrame: number[] = [];
    for (let b = 0; b < batches; b++) {
      const t0 = performance.now();
      for (let i = 0; i < framesPerBatch; i++) {
        step(sim, 0.016);
        sim.peds.getPedestrians();
      }
      perFrame.push((performance.now() - t0) / framesPerBatch);
    }
    perFrame.sort((x, y) => x - y);
    const median = perFrame[Math.floor(batches / 2)] ?? Infinity;
    expect(median).toBeLessThan(0.5);
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
