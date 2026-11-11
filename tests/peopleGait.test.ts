import { describe, expect, it } from 'vitest';
import { GaitPhase } from '../src/traffic/people/gaitPhase';

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
