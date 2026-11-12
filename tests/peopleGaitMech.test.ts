// Gait mechanics (T-0028): the TypeScript mirror in gaitMath.ts of the walking terms in the vertex shader. Bounded
// amplitudes, the foot chain through hip, knee and ankle (the planted foot does not slide more than without the ankle
// term), the ankle ring covered at the largest flexion, and the GLSL built from the same constants.
import { describe, expect, it } from 'vitest';
import { trafficLife } from '../src/config/tuning';
import { GAIT_FOOT, GAIT_MECH, gaitAnkle, gaitAnkleRel, gaitAnkleUnit, gaitAnkleY, gaitBob, gaitBody, gaitKnee, gaitGlsl, gaitLegSway, gaitProfile, gaitThighAmp, gaitTorsoWeight, type GaitAmps, type GaitLeg } from '../src/traffic/people/gaitMath';
import { PART, buildPerson, gaitOf, type BodyKind } from '../src/traffic/people/personGeometry';
import { PERSON_DECL } from '../src/traffic/people/rigShaderGlsl';

const AMPS: GaitAmps = {
  pelvisYawDeg: trafficLife.gaitPelvisYawDeg,
  pelvisSwayMm: trafficLife.gaitPelvisSwayMm,
  torsoTwistDeg: trafficLife.gaitTorsoTwistDeg,
  ankleDeg: trafficLife.gaitAnkleDeg,
  headStabilise: trafficLife.gaitHeadStabilise,
};
const KINDS: BodyKind[] = ['adult', 'child', 'elder', 'teen'];
const TWO_PI = Math.PI * 2;

describe('gait mechanics mirror', () => {
  it('stays inside the amplitude limits for every age group', () => {
    for (const kind of KINDS) {
      const spec = gaitOf(kind, 0);
      for (let a = 0; a < TWO_PI; a += 0.05) {
        const g = gaitBody(a, spec.amp, AMPS, 0.026 * spec.amp);
        expect(Math.abs(g.pelvisYaw)).toBeLessThanOrEqual(((AMPS.pelvisYawDeg * Math.PI) / 180) * spec.amp + 1e-9);
        expect(Math.abs(g.torsoYaw)).toBeLessThanOrEqual(((AMPS.torsoTwistDeg * Math.PI) / 180) * spec.amp + 1e-9);
        expect(Math.abs(g.swayX)).toBeLessThanOrEqual((AMPS.pelvisSwayMm / 1000) * spec.amp + 1e-9);
        // The head keeps a smaller twist than the torso and cancels part of the bob.
        expect(Math.abs(g.headYaw)).toBeLessThanOrEqual(Math.abs(g.torsoYaw) + 1e-12);
        expect(g.headDy).toBeLessThanOrEqual(0);
        // The pelvis and the torso turn in opposite directions.
        expect(g.pelvisYaw * g.torsoYaw).toBeLessThanOrEqual(0);
      }
    }
  });

  it('bends the ankle toe-up at heel strike and plantar at toe-off, flat at mid-stance', () => {
    expect(gaitAnkleUnit(1)).toBe(1);
    expect(gaitAnkleUnit(0)).toBeCloseTo(0, 12);
    expect(gaitAnkleUnit(-1)).toBeCloseTo(-GAIT_MECH.plantRatio, 6);
    expect(gaitAnkle(1, 1, AMPS)).toBeCloseTo((AMPS.ankleDeg * Math.PI) / 180, 6);
    expect(gaitAnkle(-1, 1, AMPS)).toBeLessThan(0);
  });

  it('lets the legs sway with the pelvis at the hip and not at the ankle', () => {
    const hip = 0.95;
    const a = Math.PI; // mid-stance of the left leg: largest sway toward it (+x)
    expect(gaitLegSway(a, 1, AMPS, hip, hip)).toBeCloseTo(gaitBody(a, 1, AMPS, 0).swayX, 9);
    expect(gaitBody(a, 1, AMPS, 0).swayX).toBeCloseTo(AMPS.pelvisSwayMm / 1000, 9);
    expect(gaitLegSway(a, 1, AMPS, gaitAnkleY(hip), hip)).toBe(0);
    expect(gaitLegSway(a, 1, AMPS, 0, hip)).toBe(0);
  });

  it('builds the shader functions from the same constants', () => {
    expect(PERSON_DECL).toContain(gaitGlsl());
    expect(gaitGlsl()).toContain(String(GAIT_MECH.plantRatio));
    expect(gaitGlsl()).toContain(String(GAIT_MECH.torsoBlend));
    expect(gaitGlsl()).toContain('uniform vec4 uGait');
  });
});

const STRIDE = { fit: trafficLife.gaitStrideFit, flat: trafficLife.gaitStanceFlat };
const OLD_STRIDE = { fit: 0, flat: 0 };
const WALK_SPEED = 1.3;

/**
 * The walking chain of the left leg as applyRig builds it (ankle, knee, hip, grounded bob), in world metres at 1.3 m/s.
 * Slip is in the WORLD frame: ground speed of the lowest sole point = body speed + its speed relative to the pelvis, averaged
 * over the stance half cycle (cos a < 0), divided by the walking speed; 0 is a perfectly planted foot, negative signed values
 * mean the foot slides backward. Also returns the lowest height of the swing foot and of the stance foot above the ground.
 */
function walkChain(kind: BodyKind, sex: number, amps: GaitAmps, stride: { fit: number; flat: number }) {
  const spec = gaitOf(kind, sex);
  const hipY = buildPerson(kind).hip[0];
  const k = hipY / 0.95;
  const kneeY = 0.51 * k;
  const ankleY = gaitAnkleY(hipY);
  const scale = 1.1 * spec.heightK; // PEOPLE_READ_SCALE times the sex height factor; the person scale jitter is 1 on average
  const omega = (TWO_PI * WALK_SPEED) / spec.cycle;
  const thighAmp = gaitThighAmp(spec.amp, spec.cycle, hipY, scale, stride);
  const leg: GaitLeg = { amp: spec.amp, ease: spec.ease, kneeK: spec.kneeK, hipModel: hipY, thighAmp };
  const rot = (p: [number, number], pivY: number, th: number): [number, number] => {
    const y = p[0] - pivY;
    return [pivY + Math.cos(th) * y + Math.sin(th) * p[1], -Math.sin(th) * y + Math.cos(th) * p[1]];
  };
  const point = (a: number, base: [number, number]): [number, number] => {
    const sa = Math.sin(a);
    const pr = gaitProfile(sa + spec.ease * 0.5 * (sa - sa ** 3), a, stride.flat);
    const knee = gaitKnee(a, spec.amp, spec.kneeK);
    let p = rot(base, ankleY, gaitAnkleRel(pr, spec.amp, amps, thighAmp * pr, knee));
    p = rot(p, kneeY, -knee);
    p = rot(p, hipY, thighAmp * pr);
    return [(p[0] + gaitBob(a, leg, amps, stride.flat)) * scale, p[1] * scale];
  };
  const heel: [number, number] = [0, GAIT_FOOT.heelZ * k];
  const toe: [number, number] = [0, GAIT_FOOT.toeZ * k];
  const dt = 0.002;
  let abs = 0;
  let signed = 0;
  let n = 0;
  let swingMin = Infinity;
  let swingMax = 0;
  let stanceMin = Infinity;
  let stanceMax = 0;
  for (let t = 0; t < TWO_PI / omega; t += dt) {
    const a = omega * t;
    const now = [point(a, heel), point(a, toe)];
    const nxt = [point(a + omega * dt, heel), point(a + omega * dt, toe)];
    const i = now[0][0] <= now[1][0] ? 0 : 1;
    if (Math.cos(a) < 0) {
      const g = WALK_SPEED + (nxt[i][1] - now[i][1]) / dt;
      abs += Math.abs(g);
      signed += g;
      n++;
      stanceMin = Math.min(stanceMin, now[i][0]);
      stanceMax = Math.max(stanceMax, now[i][0]);
    } else {
      swingMin = Math.min(swingMin, now[i][0]);
      swingMax = Math.max(swingMax, now[i][0]);
    }
  }
  return { slip: abs / n / WALK_SPEED, signed: signed / n / WALK_SPEED, swingMin, swingMax, stanceMin, stanceMax };
}

describe('planted foot (T-0034)', () => {
  it('keeps the mean world slip of the stance foot under 0.15 of the walking speed for every age group and sex', () => {
    for (const kind of KINDS) {
      for (const sex of [0, 1]) {
        const now = walkChain(kind, sex, AMPS, STRIDE);
        // Before T-0034 (old thigh swing, sine profile) the same chain slipped 0.5 to 1.1.
        expect(now.slip, `${kind} sex ${sex}`).toBeLessThan(0.15);
      }
    }
  });

  it('measures the old thigh swing as clearly worse (so the test can fail)', () => {
    for (const kind of KINDS) expect(walkChain(kind, 0, AMPS, OLD_STRIDE).slip).toBeGreaterThan(0.3);
  });

  it('keeps the ankle roll from costing more than 12 percent of slip against a stiff ankle', () => {
    for (const kind of KINDS) {
      const stiff = walkChain(kind, 0, { ...AMPS, ankleDeg: 0 }, STRIDE).slip;
      expect(walkChain(kind, 0, AMPS, STRIDE).slip).toBeLessThanOrEqual(stiff * 1.12);
    }
  });

  it('never puts a foot more than 5 mm below the ground, and keeps the stance foot within 30 mm of it', () => {
    for (const kind of KINDS) {
      for (const sex of [0, 1]) {
        const w = walkChain(kind, sex, AMPS, STRIDE);
        // The lowest point of the swing foot reaches the ground (heel strike, toe-off) but does not go through it.
        expect(w.swingMin, `${kind} ${sex} swing`).toBeGreaterThan(-0.005);
        expect(w.stanceMin, `${kind} ${sex} stance`).toBeGreaterThan(-0.005);
        // The stance foot may float a little at the end of stance (documented in the handbook, T-0034).
        expect(w.stanceMax, `${kind} ${sex} float`).toBeLessThan(0.03);
      }
    }
  });

  it('lifts the swing foot clear of the ground in mid-swing', () => {
    for (const kind of KINDS) {
      for (const sex of [0, 1]) expect(walkChain(kind, sex, AMPS, STRIDE).swingMax, `${kind} ${sex}`).toBeGreaterThan(0.04);
    }
  });

  it('puts the body highest at mid-stance and lowest at double support', () => {
    for (const kind of KINDS) {
      const spec = gaitOf(kind, 0);
      const hipY = buildPerson(kind).hip[0];
      const leg: GaitLeg = { amp: spec.amp, ease: spec.ease, kneeK: spec.kneeK, hipModel: hipY, thighAmp: gaitThighAmp(spec.amp, spec.cycle, hipY, 1.1 * spec.heightK, STRIDE) };
      const bob = (a: number): number => gaitBob(a, leg, AMPS, STRIDE.flat);
      let hi = -Infinity;
      let lo = Infinity;
      let aHi = 0;
      let aLo = 0;
      for (let a = 0; a < Math.PI; a += 0.01) {
        const b = bob(a);
        if (b > hi) { hi = b; aHi = a; }
        if (b < lo) { lo = b; aLo = a; }
      }
      // Mid-stance of a leg is at a = 0 or pi (the legs together), double support at a = pi / 2. The heel-to-toe roll of the foot
      // moves the extremes a little (adult: highest 0.19 rad before pi, lowest 0.3 rad after pi / 2), so the limit is 0.35 rad
      // (20 degrees), against the old bob that peaked at a = pi / 2, a quarter cycle (1.57 rad) away.
      expect(Math.min(Math.abs(aHi), Math.abs(aHi - Math.PI))).toBeLessThan(0.35);
      expect(Math.abs(aLo - Math.PI / 2)).toBeLessThan(0.35);
      expect(hi - lo).toBeGreaterThan(0.003);
    }
  });
});

type V = [number, number, number];

function farthestHit(tris: V[], o: V, d: V): number {
  let best = 0;
  for (let i = 0; i < tris.length; i += 3) {
    const a = tris[i];
    const e1: V = [tris[i + 1][0] - a[0], tris[i + 1][1] - a[1], tris[i + 1][2] - a[2]];
    const e2: V = [tris[i + 2][0] - a[0], tris[i + 2][1] - a[1], tris[i + 2][2] - a[2]];
    const p: V = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
    const det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2];
    if (Math.abs(det) < 1e-12) continue;
    const s: V = [o[0] - a[0], o[1] - a[1], o[2] - a[2]];
    const u = (s[0] * p[0] + s[1] * p[1] + s[2] * p[2]) / det;
    if (u < -1e-7 || u > 1 + 1e-7) continue;
    const q: V = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]];
    const w = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) / det;
    if (w < -1e-7 || u + w > 1 + 1e-7) continue;
    const t = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) / det;
    if (t > best) best = t;
  }
  return best;
}

describe('ankle joint coverage', () => {
  for (const detail of ['far', 'near'] as const) {
    it(`keeps the open bottom of the shin covered by the shoe at the largest flexion (${detail})`, () => {
      const failures: string[] = [];
      for (const kind of KINDS) {
        const model = buildPerson(kind, detail);
        const pos = model.geometry.getAttribute('position').array as Float32Array;
        const rig = model.geometry.getAttribute('aRig').array as Float32Array;
        const shin: V[] = [];
        const foot: V[] = [];
        for (let v = 0; v < rig.length / 4; v++) {
          if (Math.round(rig[v * 4]) !== PART.SHIN_L) continue;
          const pt: V = [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]];
          (Math.round(rig[v * 4 + 1]) === 0 ? foot : shin).push(pt);
        }
        const minY = Math.min(...shin.map((q) => q[1]));
        const rim = shin.filter((q) => Math.abs(q[1] - minY) < 1e-5);
        const cx = rim.reduce((s, q) => s + q[0], 0) / rim.length;
        const ankleY = gaitAnkleY(model.hip[0]);
        const spec = gaitOf(kind, 0);
        // The real ankle range: the walking ankle angle relative to the shin, over a whole cycle (T-0034: the foot is turned back
        // by the leg angles), for both sexes' strides at the largest amplitude of the age group.
        let lo = 0;
        let hi = 0;
        const hipM = model.hip[0];
        const thighAmp = gaitThighAmp(spec.amp, spec.cycle, hipM, 1.1 * spec.heightK, STRIDE);
        for (let a = 0; a < TWO_PI; a += 0.02) {
          const sa = Math.sin(a);
          const pr = gaitProfile(sa + spec.ease * 0.5 * (sa - sa ** 3), a, STRIDE.flat);
          const ang = gaitAnkleRel(pr, spec.amp, AMPS, thighAmp * pr, gaitKnee(a, spec.amp, spec.kneeK));
          lo = Math.min(lo, ang);
          hi = Math.max(hi, ang);
        }
        for (const th of [lo, lo / 2, hi / 3, hi * 0.6, hi]) {
          for (const r of rim) {
            // The foot turns by th about the ankle; in the foot's frame the rim turns by -th.
            const dy = r[1] - ankleY;
            const p: V = [r[0] - cx, Math.cos(-th) * dy + Math.sin(-th) * r[2], -Math.sin(-th) * dy + Math.cos(-th) * r[2]];
            const dist = Math.hypot(...p);
            if (dist < 1e-6) continue;
            const reach = farthestHit(foot, [cx, ankleY, 0], [p[0] / dist, p[1] / dist, p[2] / dist]);
            if (reach < dist - 0.002) failures.push(`${kind} angle ${th.toFixed(2)} reach ${reach.toFixed(4)} need ${dist.toFixed(4)}`);
          }
        }
      }
      expect([...new Set(failures)]).toEqual([]);
    });
  }
});

// Clearance at the largest gait offsets (T-0028): the legs sway together with the pelvis, and the arms turn with the
// torso. Vertices are moved as applyRig and gaitBody do (rest pose plus the mirror's offsets), both sexes.
const yawAbout = (p: V, pz: number, th: number): V => [Math.cos(th) * p[0] + Math.sin(th) * (p[2] - pz), p[1], pz - Math.sin(th) * p[0] + Math.cos(th) * (p[2] - pz)];

function partPoints(kind: BodyKind, detail: 'far' | 'near', sex: number, part: number): { pts: V[]; model: ReturnType<typeof buildPerson> } {
  const model = buildPerson(kind, detail);
  const pos = model.geometry.getAttribute('position').array as Float32Array;
  const rig = model.geometry.getAttribute('aRig').array as Float32Array;
  const morph = model.geometry.getAttribute('aMorph').array as Float32Array;
  const pts: V[] = [];
  for (let v = 0; v < rig.length / 4; v++) {
    if (Math.round(rig[v * 4]) !== part) continue;
    pts.push([pos[v * 3] + morph[v * 3] * sex, pos[v * 3 + 1] + morph[v * 3 + 1] * sex, pos[v * 3 + 2] + morph[v * 3 + 2] * sex]);
  }
  return { pts, model };
}

/** Outer (max) or inner (min, positive x only) x edge of a part at height y, interpolated between the vertex rows below and above. */
function edgeAt(rows: { key: number; x: number }[], y: number, mode: 'min' | 'max'): number {
  const byRow = new Map<number, number>();
  for (const r of rows) {
    if (r.x <= 0) continue;
    const key = Math.round(r.key * 1e5);
    const cur = byRow.get(key);
    byRow.set(key, cur === undefined ? r.x : mode === 'min' ? Math.min(cur, r.x) : Math.max(cur, r.x));
  }
  const ys = [...byRow.keys()].map((k) => k / 1e5).sort((a, b) => a - b);
  const lo = [...ys].reverse().find((v) => v <= y);
  const hi = ys.find((v) => v >= y);
  if (lo === undefined || hi === undefined) return NaN;
  const xl = byRow.get(Math.round(lo * 1e5)) as number;
  const xh = byRow.get(Math.round(hi * 1e5)) as number;
  return hi === lo ? xl : xl + ((xh - xl) * (y - lo)) / (hi - lo);
}

describe('clearance at the largest gait offsets', () => {
  for (const detail of ['far', 'near'] as const) {
    it(`keeps the thighs apart at the widest pelvis sway (${detail})`, () => {
      for (const kind of KINDS) {
        const spec = gaitOf(kind, 0);
        for (const sex of [0, 1]) {
          const left = partPoints(kind, detail, sex, PART.THIGH_L);
          const right = partPoints(kind, detail, sex, PART.THIGH_R);
          const hip = left.model.hip[0];
          for (let a = 0; a < TWO_PI; a += 0.1) {
            // WEAK GUARD, by construction: both legs sway by the same amount and the thigh swing is in the YZ plane, so the gap
            // cannot change with the sway; this only checks that the legs never get pushed through each other by a future change
            // (for example a sway that differs per leg or a yaw of the legs).
            // Both legs sway with the pelvis; the legs themselves only swing forward and back (no x change).
            const lx = Math.min(...left.pts.map((p) => p[0] + gaitLegSway(a, spec.amp, AMPS, p[1], hip)));
            const rx = Math.max(...right.pts.map((p) => p[0] + gaitLegSway(a, spec.amp, AMPS, p[1], hip)));
            expect(lx - rx).toBeGreaterThan(0.01 * (hip / 0.95));
          }
        }
      }
    });

    it(`keeps the upper arm clear of the torso with the torso twist and the arm swing (${detail})`, () => {
      // Far is not covered: its torso is one box with vertices only at the corners, and the sheared corner extents say nothing
      // about the flat side the arm hangs beside (a corner shifts by +/- z sin(twist) while the side centre does not).
      if (detail === 'far') return;
      for (const kind of KINDS) {
        const spec = gaitOf(kind, 0);
        for (const sex of [0, 1]) {
          const arm = partPoints(kind, detail, sex, PART.ARM_L);
          const torso = partPoints(kind, detail, sex, PART.BODY);
          const { shoulder, neck } = arm.model;
          const hip = arm.model.hip[0];
          const k = hip / 0.95;
          const elbowY = 1.14 * k;
          const bandTop = elbowY + 0.5 * (shoulder[0] - elbowY);
          // Gap between the arm's inner edge and the torso's outer edge at the top of the lower half of the upper arm, where the
          // arm is closest (both widen upward). Rows are interpolated because boxes have vertices at the ends only.
          const gapFor = (g: ReturnType<typeof gaitBody>, swing: number): number => {
            const armRows = arm.pts.map((p) => {
              const y = p[1] - shoulder[0];
              const z = p[2] - shoulder[1];
              const q: V = [p[0], shoulder[0] + Math.cos(swing) * y + Math.sin(swing) * z, shoulder[1] - Math.sin(swing) * y + Math.cos(swing) * z];
              return { key: p[1], x: q[0] };
            });
            // Only torso vertices at the arm's side (z near 0): the ring vertex at angle 0 of every torso ring.
            const torsoRows = torso.pts.filter((p) => Math.abs(p[2]) < 0.02 * k).map((p) => {
              const w = gaitTorsoWeight(p[1], hip, shoulder[0]);
              // Compared in the frame that turns with the torso and arms: the arm does not move, the torso part turns by what it differs by.
              return { key: p[1], x: yawAbout(p, neck[1], (g.pelvisYaw - g.torsoYaw) * (1 - w))[0] };
            });
            return edgeAt(armRows, bandTop, 'min') - edgeAt(torsoRows, bandTop, 'max');
          };
          // The near gap must stay positive, at least 3 mm. The metric is the x gap only, so it is conservative for an arm swung
          // ahead of or behind the torso.
          // Direct guards on the blend (the x-gap below cannot see a wrong blend, because the arm and the torso beside it turn
          // together once the weight is 1): (1) the torso beside the arms turns with them, weight at least 0.99 where the arm is
          // sampled; (2) the change from pelvis yaw to torso twist is not a tear at the waist: the largest shear strain
          // (yaw difference x torso half-width x slope of the weight) stays under 0.2. A blend that is too short fails (2),
          // one that is too long fails (1) (checked by setting torsoBlend to 0.05 and to 1.0, T-0028 review).
          expect(gaitTorsoWeight(bandTop, hip, shoulder[0])).toBeGreaterThanOrEqual(0.99);
          const maxDiff = (((AMPS.pelvisYawDeg + AMPS.torsoTwistDeg) * Math.PI) / 180) * spec.amp;
          let slope = 0;
          for (let y = hip; y < shoulder[0]; y += 0.002 * k) slope = Math.max(slope, Math.abs(gaitTorsoWeight(y + 0.002 * k, hip, shoulder[0]) - gaitTorsoWeight(y, hip, shoulder[0])) / (0.002 * k));
          expect(maxDiff * 0.2 * k * slope).toBeLessThan(0.2);
          const rest = gapFor({ pelvisYaw: 0, torsoYaw: 0, headYaw: 0, swayX: 0, headDy: 0 }, 0);
          expect(Number.isFinite(rest)).toBe(true);
          const limit = 0.003 * k;
          for (let a = 0; a < TWO_PI; a += 0.1) {
            const g = gaitBody(a, spec.amp, AMPS, 0);
            const sa = Math.sin(a);
            const swing = -spec.amp * 0.5 * spec.armK * (sa + spec.ease * 0.5 * (sa - sa ** 3));
            expect(gapFor(g, swing)).toBeGreaterThan(limit);
          }
        }
      }
    });
  }
});
