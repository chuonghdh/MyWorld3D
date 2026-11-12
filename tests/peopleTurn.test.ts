// Smooth turns, starts and stops (T-0029): the render state in bodyMotion.ts and the lean terms of gaitMath.ts (TypeScript mirror
// of the generated GLSL). The simulation heading is not touched by any of this.
import { describe, expect, it } from 'vitest';
import { trafficLife } from '../src/config/tuning';
import { BodyMotion, shortestAngle } from '../src/traffic/people/bodyMotion';
import { GAIT_MECH, gaitGlsl, gaitLean, gaitRamp, gaitRoll } from '../src/traffic/people/gaitMath';
import { PERSON_DECL } from '../src/traffic/people/rigShaderGlsl';

const RATE = trafficLife.walkTurnRateRad;
const RAMP = trafficLife.walkRampS;
const DT = 1 / 60;

function run(m: BodyMotion, id: number, sim: number, walking: boolean, from: number, seconds: number): number {
  let t = from;
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    t += DT;
    m.begin(t);
    m.step(id, sim, walking);
  }
  return t;
}

describe('BodyMotion heading', () => {
  it('converges to the sim heading in delta / rate seconds for turns up to pi, without overshoot', () => {
    for (const delta of [0.3, 1, 2, Math.PI - 0.01]) {
      const m = new BodyMotion(8, RATE, RAMP);
      m.begin(0);
      m.step(1, 0, true); // first sight: starts at the sim heading
      let t = 0;
      let prev = 0;
      for (let i = 0; i < Math.ceil((delta / RATE + 0.1) / DT); i++) {
        t += DT;
        m.begin(t);
        m.step(1, delta, true);
        expect(m.heading).toBeGreaterThanOrEqual(prev - 1e-6);
        expect(m.heading).toBeLessThanOrEqual(delta + 1e-6);
        prev = m.heading;
      }
      expect(Math.abs(shortestAngle(m.heading, delta))).toBeLessThan(1e-3);
    }
  });

  it('takes the shortest way round across +-pi', () => {
    const m = new BodyMotion(4, RATE, RAMP);
    m.begin(0);
    m.step(1, 3.0, false);
    const t = run(m, 1, -3.0, false, 0, 0.05);
    // From 3.0 to -3.0 the short way is +0.283 rad through pi, not -6 rad: the heading goes up, past 3.0.
    const moved = shortestAngle(3.0, m.heading);
    expect(moved).toBeGreaterThan(0);
    expect(moved).toBeLessThanOrEqual(RATE * 0.06);
    run(m, 1, -3.0, false, t, 0.3);
    expect(Math.abs(shortestAngle(m.heading, -3.0))).toBeLessThan(1e-3);
    expect(shortestAngle(0.5, 0.5 + 2 * Math.PI)).toBeCloseTo(0, 9);
    expect(shortestAngle(-3, 3)).toBeLessThan(0);
  });

  it('resets a reused slot, keeps still on a pause and clamps a huge time step', () => {
    const m = new BodyMotion(4, RATE, RAMP);
    m.begin(0);
    m.step(1, 0, true);
    const t = run(m, 1, 2, true, 0, 0.2);
    const h = m.heading;
    m.begin(t); // same time again: a pause, dt 0
    m.step(1, 2, true);
    expect(m.heading).toBe(h);
    m.begin(t + 100); // a huge step moves by at most 0.25 s of turning
    m.step(1, 2, true);
    expect(Math.abs(shortestAngle(h, m.heading))).toBeLessThanOrEqual(RATE * 0.25 + 1e-6);
    m.begin(t + 100.01);
    m.step(5, -1, false); // id 5 reuses slot 1 (5 % 4): it starts at its own sim heading
    expect(m.heading).toBeCloseTo(-1, 6);
    expect(m.turnUnit).toBe(0);
    expect(m.ramp).toBe(0);
  });

  it('is a plain state update: no return value, results in fields', () => {
    const m = new BodyMotion(4, RATE, RAMP);
    m.begin(0);
    expect(m.step(1, 0.5, true)).toBeUndefined();
  });
});

describe('BodyMotion turn and ramp', () => {
  it('gives a signed turn unit that is zero when not turning and bounded by 1', () => {
    const m = new BodyMotion(4, RATE, RAMP);
    m.begin(0);
    m.step(1, 0, true);
    let t = run(m, 1, 0, true, 0, 0.5);
    expect(m.turnUnit).toBe(0);
    t = run(m, 1, 3, true, t, 0.5);
    expect(m.turnUnit).toBeGreaterThan(0.5);
    expect(m.turnUnit).toBeLessThanOrEqual(1);
    run(m, 1, -3, true, t, 3);
    expect(m.turnUnit).toBeGreaterThanOrEqual(-1);
  });

  it('rises and falls monotonically within walkRampS', () => {
    const m = new BodyMotion(4, RATE, RAMP);
    m.begin(0);
    m.step(1, 0, false);
    expect(m.ramp).toBe(0);
    let t = 0;
    let prev = 0;
    for (let i = 0; i < Math.ceil(RAMP / DT) + 1; i++) {
      t += DT;
      m.begin(t);
      m.step(1, 0, true);
      expect(m.ramp).toBeGreaterThanOrEqual(prev);
      prev = m.ramp;
    }
    expect(m.ramp).toBe(1);
    for (let i = 0; i < Math.ceil(RAMP / DT) + 1; i++) {
      t += DT;
      m.begin(t);
      m.step(1, 0, false);
      expect(m.ramp).toBeLessThanOrEqual(prev);
      prev = m.ramp;
    }
    expect(m.ramp).toBe(0);
  });
});

describe('turn lean mirror', () => {
  it('is exactly zero at turn 0, bounded, and leans the top toward the turn', () => {
    expect(gaitLean(0, trafficLife.walkLeanRad)).toEqual({ roll: -0, headYaw: 0 });
    for (const u of [-1, -0.5, 0.5, 1]) {
      const l = gaitLean(u, trafficLife.walkLeanRad);
      expect(Math.abs(l.roll)).toBeLessThanOrEqual(trafficLife.walkLeanRad + 1e-12);
      expect(Math.abs(l.headYaw)).toBeLessThanOrEqual((10 * Math.PI) / 180 + 1e-12);
      // A positive turn is toward +x: the roll carries a point above the hip toward +x, and the head yaw has the same sign as the turn.
      const [x] = gaitRoll(0, 1.4, 0.95, l.roll);
      expect(Math.sign(x)).toBe(Math.sign(u));
      expect(Math.sign(l.headYaw)).toBe(Math.sign(u));
    }
    expect(gaitRoll(0.3, 0.95, 0.95, 0)[0]).toBeCloseTo(0.3, 12);
  });

  it('reads the ramp from the walking pose value and leaves other poses at 1', () => {
    expect(gaitRamp(-0.4)).toBeCloseTo(0.4, 9);
    expect(gaitRamp(-1)).toBe(1);
    expect(gaitRamp(0)).toBe(0);
    for (const pose of [1, 2, 3]) expect(gaitRamp(pose)).toBe(1);
  });

  it('is in the generated shader with the same constants', () => {
    const glsl = gaitGlsl();
    expect(PERSON_DECL).toContain(glsl);
    expect(glsl).toContain('rotXY');
    expect(glsl).toContain('uniform float uLean');
    expect(glsl).toContain(String(GAIT_MECH.headLead));
    expect(glsl).toContain('-uLean * turnU');
    expect(PERSON_DECL).toContain('clamp(-pose, 0.0, 1.0)');
    expect(PERSON_DECL).toContain('gaitBody(p, n, part, a, amp, bob, aGait2.w)');
  });
});
