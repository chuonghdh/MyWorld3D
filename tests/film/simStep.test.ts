// Fixed film-time simulation: one step per rendered frame (1/fps each) moves vehicles and pedestrians at their own
// speed in metres per film second. Over the 60 s film, the distance travelled equals the speed integral within 1%.
import { describe, expect, it } from 'vitest';
import { film } from '../../src/config/tuning';
import { generateCity } from '../../src/city';
import { DEFAULT_SETTINGS } from '../../src/store/model';
import { TrafficLightController } from '../../src/traffic/lights';
import { VehicleSystem } from '../../src/traffic/vehicles';
import { Pedestrians } from '../../src/traffic/pedestrians';
import { autoFrameCount } from '../../src/film/autoPath';

const city = generateCity({ ...DEFAULT_SETTINGS, seed: 4242 });
const DT = 1 / film.fps;
const FRAMES = autoFrameCount();

type Rec = { x: number; z: number; s: number };

describe('fixed film-time simulation (one step per frame)', () => {
  it('60 s of frames advance the world by exactly the film length', () => {
    expect(FRAMES * DT).toBeCloseTo(film.autoSeconds, 9);
  });

  it('vehicles move speed x dt per step over the film (within 1%)', () => {
    const sys = new VehicleSystem(city, { trafficMultiplier: 1.5, seed: 77 });
    let prev = new Map<number, Rec>();
    let dist = 0;
    let expected = 0;
    for (let i = 0; i < FRAMES; i++) {
      sys.update(DT, { timeOfDay: 12 });
      const cur = new Map<number, Rec>();
      for (const v of sys.getVehicles()) {
        cur.set(v.id, { x: v.position.x, z: v.position.z, s: v.speed });
        const p = prev.get(v.id);
        if (p) {
          dist += Math.hypot(v.position.x - p.x, v.position.z - p.z);
          expected += p.s * DT;
        }
      }
      prev = cur;
    }
    expect(expected).toBeGreaterThan(0);
    expect(Math.abs(dist / expected - 1)).toBeLessThan(0.01);
  });

  it('pedestrians move speed x dt per step over the film (within 1%)', () => {
    const lights = new TrafficLightController(city.trafficLights);
    const peds = new Pedestrians(city, { trafficMultiplier: 1.75, seed: 9, lights, timeOfDay: 12 });
    let prev = new Map<number, Rec>();
    let dist = 0;
    let expected = 0;
    for (let i = 0; i < FRAMES; i++) {
      lights.update(DT);
      peds.update(DT, { timeOfDay: 12, rain: 0 });
      const cur = new Map<number, Rec>();
      for (const w of peds.getPedestrians()) {
        cur.set(w.id, { x: w.position.x, z: w.position.z, s: w.speed });
        const p = prev.get(w.id);
        if (p) {
          dist += Math.hypot(w.position.x - p.x, w.position.z - p.z);
          expected += p.s * DT;
        }
      }
      prev = cur;
    }
    expect(expected).toBeGreaterThan(0);
    expect(Math.abs(dist / expected - 1)).toBeLessThan(0.01);
  });
});
