// Idle micro-animation (T-0027): the TypeScript mirror in idleMath.ts of the vertex shader terms. Bounded amplitudes,
// zero for walking people, people out of sync, feet planted by the relaxed leg, and the GLSL built from the same constants.
import { describe, expect, it } from 'vitest';
import { trafficLife } from '../src/config/tuning';
import { IDLE, idleGlsl, idleOffsets, type IdleAmps } from '../src/traffic/people/idleMath';
import { PERSON_DECL } from '../src/traffic/people/rigShaderGlsl';

const DEFAULT: IdleAmps = { breathMm: trafficLife.idleBreathMm, shiftMm: trafficLife.idleShiftMm, glanceDeg: trafficLife.idleGlanceDeg, armRad: trafficLife.idleArmRad };
// The top of the meaningful range of each knob (docs/TUNING.md).
const MAX: IdleAmps = { breathMm: 8, shiftMm: 10, glanceDeg: 15, armRad: 0.1 };

function sweep(amps: IdleAmps, pose: number, visit: (o: ReturnType<typeof idleOffsets>) => void): void {
  for (let ph = 0; ph < Math.PI * 2; ph += 0.37) for (let t = 0; t < 120; t += 0.5) visit(idleOffsets(t, ph, pose, amps));
}

describe('idle micro-animation', () => {
  it('stays inside the amplitude limits at the largest knob values', () => {
    for (const amps of [DEFAULT, MAX]) {
      sweep(amps, 1, (o) => {
        expect(o.breathY).toBeGreaterThanOrEqual(0);
        expect(o.breathY).toBeLessThan(0.008);
        expect(Math.abs(o.shiftX)).toBeLessThan(0.0101);
        expect(Math.abs(o.yaw)).toBeLessThan((15 * Math.PI) / 180 + 1e-9);
        expect(Math.abs(o.pitch)).toBeLessThan((15 * Math.PI) / 180);
        expect(Math.abs(o.armL)).toBeLessThanOrEqual(0.1 + 1e-9);
        expect(Math.abs(o.armR)).toBeLessThanOrEqual(0.1 + 1e-9);
        expect(Math.max(o.elbowL, o.elbowR)).toBeLessThanOrEqual(IDLE.fidgetElbowRad + 1e-9);
        expect(o.thighL).toBeGreaterThanOrEqual(0);
        expect(o.thighL).toBeLessThan(0.06);
        expect(o.kneeL).toBeLessThan(0.12);
      });
    }
  });

  it('gives walking people exactly zero, and chatting and seated people only breathing', () => {
    sweep(MAX, 0, (o) => expect(Object.values(o).every((v) => v === 0)).toBe(true));
    for (const pose of [2, 3]) {
      sweep(MAX, pose, (o) => {
        expect(o.breathY).toBeGreaterThanOrEqual(0);
        expect({ ...o, breathY: 0 }).toEqual({ breathY: 0, shiftX: 0, thighL: 0, thighR: 0, kneeL: 0, kneeR: 0, yaw: 0, pitch: 0, armL: 0, armR: 0, elbowL: 0, elbowR: 0 });
      });
    }
  });

  it('keeps two people at the same spot out of sync', () => {
    let different = 0;
    let total = 0;
    for (let t = 0; t < 60; t += 0.5) {
      const a = idleOffsets(t, 0.4, 1, DEFAULT);
      const b = idleOffsets(t, 2.9, 1, DEFAULT);
      total++;
      if (Math.abs(a.breathY - b.breathY) > 1e-4 && Math.abs(a.yaw - b.yaw) > 1e-3) different++;
    }
    expect(different / total).toBeGreaterThan(0.8);
  });

  it('relaxes the leg the body shifts away from (left parts are at +x)', () => {
    let seenLeft = 0;
    let seenRight = 0;
    sweep(MAX, 1, (o) => {
      if (o.shiftX > 0.002) {
        // Shifted toward the left leg: the right leg relaxes, the left carries the weight.
        expect(o.thighR).toBeGreaterThan(0);
        expect(o.thighL).toBe(0);
        seenRight++;
      } else if (o.shiftX < -0.002) {
        expect(o.thighL).toBeGreaterThan(0);
        expect(o.thighR).toBe(0);
        seenLeft++;
      }
    });
    expect(seenLeft).toBeGreaterThan(50);
    expect(seenRight).toBeGreaterThan(50);
  });

  it('keeps the foot of a relaxed leg planted (the knee flexes with the thigh)', () => {
    // Adult leg: thigh 0.44 m and shin 0.43 m. Positive thigh swings the foot forward, positive knee pulls it back.
    const l1 = 0.44;
    const l2 = 0.43;
    sweep(MAX, 1, (o) => {
      for (const [a, k] of [[o.thighL, o.kneeL], [o.thighR, o.kneeR]]) {
        const z = l1 * Math.sin(a) + l2 * Math.sin(a - k);
        const rise = l1 + l2 - (l1 * Math.cos(a) + l2 * Math.cos(a - k));
        expect(Math.abs(z)).toBeLessThan(0.004);
        expect(rise).toBeLessThan(0.003);
      }
    });
  });

  it('builds the shader helpers from the same constants', () => {
    const glsl = idleGlsl();
    expect(PERSON_DECL).toContain(glsl);
    for (const n of [IDLE.breathPeriodS, IDLE.shiftHalfMinS, IDLE.glanceRateA, IDLE.armRate, IDLE.fidgetMinS]) {
      expect(glsl).toContain(Number.isInteger(n) ? n.toFixed(1) : String(n));
    }
    expect(PERSON_DECL).toContain('uniform vec4 uIdle');
  });
});
