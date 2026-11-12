import { describe, expect, it } from 'vitest';
import { GaitPhase } from '../src/traffic/people/gaitPhase';
import { createPeopleMeshes } from '../src/traffic/people/peopleMeshes';
import type { PedestrianRender } from '../src/traffic/pedestrians';

const TWO_PI = Math.PI * 2;
/** Shortest angular distance on the circle. */
const circ = (a: number, b: number): number => {
  const d = Math.abs(a - b) % TWO_PI;
  return Math.min(d, TWO_PI - d);
};

describe('GaitPhase', () => {
  it('stays continuous through walk, stop, walk and speed changes', () => {
    const g = new GaitPhase(16);
    const dt = 1 / 60;
    const omegas = [6, 6, 6, 0, 0, 0, 6, 6, 9, 9, 3, 3, 12];
    let t = 100; // large time: the old uTime * omega form would jump here
    g.begin(t);
    let prev = g.step(5, omegas[0]);
    for (const omega of omegas) {
      for (let k = 0; k < 30; k++) {
        t += dt;
        g.begin(t);
        const a = g.step(5, omega);
        expect(circ(a, prev)).toBeLessThanOrEqual(omega * dt + 1e-4);
        expect(a).toBeGreaterThanOrEqual(0);
        expect(a).toBeLessThan(TWO_PI);
        prev = a;
      }
    }
  });

  it('holds the angle while stopped and resumes from it', () => {
    const g = new GaitPhase(4);
    g.begin(0);
    g.step(1, 5);
    g.begin(0.1);
    const before = g.step(1, 5);
    g.begin(5);
    const stopped = g.step(1, 0);
    g.begin(5.1);
    const still = g.step(1, 0);
    expect(stopped).toBeCloseTo(before + 0, 5);
    expect(still).toBeCloseTo(before, 5);
    g.begin(5.2);
    expect(circ(g.step(1, 5), before)).toBeCloseTo(0.5, 4);
  });

  it('resets a slot taken by another id', () => {
    const g = new GaitPhase(4);
    g.begin(0);
    g.step(2, 5);
    g.begin(0.1);
    expect(g.step(2, 5)).toBeGreaterThan(0.4);
    g.begin(0.2);
    expect(g.step(6, 5)).toBeCloseTo(5 * 0.1, 4); // 6 % 4 === 2: slot reused
  });

  it('does not jump on a backwards step, a huge dt or the first call', () => {
    const g = new GaitPhase(4);
    g.begin(50);
    expect(g.step(1, 8)).toBe(0);
    g.begin(40);
    expect(g.step(1, 8)).toBe(0);
    g.begin(40.1);
    const a = g.step(1, 8);
    g.begin(500);
    expect(circ(g.step(1, 8), a)).toBeLessThanOrEqual(8 * 0.25 + 1e-4);
  });
});

describe('dog trot angle (T-0033)', () => {
  function walkerWithDog(id: number, dogSpeed: number): PedestrianRender {
    return {
      id, position: { x: 3, z: 4 }, y: 0, heading: 0, body: 0, female: 0, hairStyle: 0, top: 0, pants: 0, hair: 0, skin: 0, accent: 0, traits: 0,
      pose: 0, speed: 1.2, phase: 1, umbrellaRank: 0.99, scale: 1,
      dog: { position: { x: 4, z: 4 }, heading: 0, phase: 2, speed: dogSpeed, coat: 0, leashHand: { x: 3, z: 4 } },
    };
  }

  it('keeps the angle in aDog.x continuous through trot, stop, trot and a speed change', () => {
    const m = createPeopleMeshes(16, 8);
    const attr = m.dogs.geometry.getAttribute('aDog').array as Float32Array;
    const omegaOf = (speed: number): number => (speed > 0.05 ? (TWO_PI * speed) / m.models.dog.cycleLength : 0);
    const speeds = [1.2, 1.2, 1.2, 0, 0, 1.2, 1.2, 2, 2, 0.6];
    const dt = 1 / 60;
    let t = 200; // a large time: the old uTime * omega form would jump here
    let prev = Number.NaN;
    for (const speed of speeds) {
      for (let k = 0; k < 20; k++) {
        t += dt;
        m.update([walkerWithDog(7, speed)], { time: t, night: false, season: 'summer', rain: 0 });
        const a = attr[0];
        if (!Number.isNaN(prev)) expect(circ(a, prev)).toBeLessThanOrEqual(omegaOf(speed) * dt + 1e-3);
        expect(a).toBeGreaterThanOrEqual(0);
        expect(a).toBeLessThan(TWO_PI + 1e-6);
        prev = a;
      }
    }
    m.dispose();
  });

  it('holds the angle while the dog stands, and keeps the phase offset in aDog.y', () => {
    const m = createPeopleMeshes(16, 8);
    const attr = m.dogs.geometry.getAttribute('aDog').array as Float32Array;
    const frame = (t: number, speed: number): number => {
      m.update([walkerWithDog(3, speed)], { time: t, night: false, season: 'summer', rain: 0 });
      return attr[0];
    };
    frame(1, 1.2);
    const before = frame(1.1, 1.2);
    const stopped = frame(1.2, 0);
    expect(frame(5, 0)).toBeCloseTo(stopped, 6);
    expect(circ(stopped, before)).toBeLessThan(0.1);
    expect(attr[1]).toBeCloseTo(2, 6);
    m.dispose();
  });
});
