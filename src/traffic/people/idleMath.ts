// Idle micro-animation of standing, chatting and seated people (T-0027): breathing, weight shift, head glances, arm
// settling and a rare hand fidget. The GLSL in rigShaderGlsl.ts (applyRig) computes these terms in the vertex shader,
// so they cost no CPU. THIS FILE IS THE SINGLE SOURCE of the constants: idleGlsl() builds the GLSL helper functions
// from them, and idleOffsets() is the TypeScript mirror used by tests/peopleIdle.test.ts. If you change a formula in
// one place, change it in the other (the helper functions below and in idleGlsl() have the same shape on purpose).
//
// Everything depends on the sim time and the walker phase only (two people at the same spot are out of sync), and is
// exactly zero for walking people (pose 0). Amplitudes come from designer knobs (trafficLife.idle*), periods are here.

export const IDLE = {
  /** Breathing: period 4 s (0.25 Hz), +/- 20 percent per person. */
  breathPeriodS: 4,
  breathJitter: 0.2,
  /** Weight shift (the leg the body shifts away from relaxes): a half cycle lasts 4 to 8 s, so the weight changes legs every 4 to 8 s. */
  shiftHalfMinS: 4,
  shiftHalfSpanS: 4,
  /** Relaxed leg: thigh forward radians per metre of pelvis shift (5 = 0.005 rad per mm), and the knee flexion per thigh radian that keeps the foot planted (about (thigh + shin) / shin). */
  relaxRadPerM: 5,
  kneePerThigh: 2,
  /** Head glance: yaw is 0.7 sin(0.35 t + 7 ph) + 0.3 sin(0.13 t + 3 ph), pitch 0.4 of the glance amplitude, 0.27 rad/s. */
  glanceRateA: 0.35,
  glanceRateB: 0.13,
  pitchRate: 0.27,
  pitchShare: 0.4,
  /** Arm drift rate (rad/s) and fidget: every 9 to 15 s one forearm bends 0.1 rad for 1 s. */
  armRate: 0.45,
  fidgetMinS: 9,
  fidgetSpanS: 6,
  fidgetLenS: 1,
  fidgetElbowRad: 0.1,
} as const;

export interface IdleAmps {
  breathMm: number;
  shiftMm: number;
  glanceDeg: number;
  armRad: number;
}

export interface IdleOffsets {
  /** Upper body rise in metres (0 to breathMm). */
  breathY: number;
  /** Sideways shift of everything above the legs, metres. */
  shiftX: number;
  /** Thigh swing (rad, positive forward) and knee flexion (rad) of each leg. */
  thighL: number;
  thighR: number;
  kneeL: number;
  kneeR: number;
  /** Head yaw about the vertical axis and pitch (rad). */
  yaw: number;
  pitch: number;
  /** Arm swing drift (rad) and the elbow fidget (rad). */
  armL: number;
  armR: number;
  elbowL: number;
  elbowR: number;
}

const TWO_PI = Math.PI * 2;
const fract = (x: number): number => x - Math.floor(x);
/** Same hash as the shader. */
export const idleHash = (x: number): number => fract(Math.sin(x * 12.9898 + 4.1414) * 43758.5453);

export const idleBreath = (t: number, ph: number): number => {
  const period = IDLE.breathPeriodS * (1 - IDLE.breathJitter + 2 * IDLE.breathJitter * idleHash(ph));
  return 0.5 + 0.5 * Math.sin((TWO_PI * t) / period + ph);
};
export const idleShift = (t: number, ph: number): number => {
  const half = IDLE.shiftHalfMinS + IDLE.shiftHalfSpanS * idleHash(ph + 7.3);
  return Math.sin((Math.PI * t) / half + ph * 1.3);
};
export const idleYaw = (t: number, ph: number): number => 0.7 * Math.sin(IDLE.glanceRateA * t + 7 * ph) + 0.3 * Math.sin(IDLE.glanceRateB * t + 3 * ph);
export const idlePitch = (t: number, ph: number): number => Math.sin(IDLE.pitchRate * t + 5 * ph);
export const idleArm = (t: number, ph: number, side: number): number => Math.sin(IDLE.armRate * t + 4 * ph + 1.7 * side);
export const idleFidget = (t: number, ph: number): number => {
  const period = IDLE.fidgetMinS + IDLE.fidgetSpanS * idleHash(ph + 13.1);
  const tt = (t + idleHash(ph + 21.7) * period) % period;
  return tt < IDLE.fidgetLenS ? Math.pow(Math.sin((Math.PI * tt) / IDLE.fidgetLenS), 2) : 0;
};
/** Which arm fidgets: 1 right, 0 left. */
export const idleFidgetSide = (ph: number): number => (idleHash(ph + 21.7) > 0.5 ? 1 : 0);

/**
 * The offsets of one person. pose: 0 walking (all zero), 1 standing (everything), 2 chatting and 3 sitting (breathing
 * only). Mirrors the GLSL term by term.
 */
export function idleOffsets(time: number, phase: number, pose: number, amps: IdleAmps): IdleOffsets {
  const out: IdleOffsets = { breathY: 0, shiftX: 0, thighL: 0, thighR: 0, kneeL: 0, kneeR: 0, yaw: 0, pitch: 0, armL: 0, armR: 0, elbowL: 0, elbowR: 0 };
  if (pose === 0) return out;
  out.breathY = (amps.breathMm / 1000) * idleBreath(time, phase);
  if (pose !== 1) return out;
  const shiftM = amps.shiftMm / 1000;
  const s = idleShift(time, phase);
  out.shiftX = shiftM * s;
  const relax = IDLE.relaxRadPerM * shiftM;
  // The body shifts toward +x (the left leg carries the weight when s > 0), so the RIGHT leg relaxes; left parts are at +x.
  out.thighL = relax * Math.max(0, -s);
  out.thighR = relax * Math.max(0, s);
  out.kneeL = IDLE.kneePerThigh * out.thighL;
  out.kneeR = IDLE.kneePerThigh * out.thighR;
  const glance = (amps.glanceDeg * Math.PI) / 180;
  out.yaw = glance * idleYaw(time, phase);
  out.pitch = glance * IDLE.pitchShare * idlePitch(time, phase);
  out.armL = amps.armRad * idleArm(time, phase, 0);
  out.armR = amps.armRad * idleArm(time, phase, 1);
  const fid = IDLE.fidgetElbowRad * idleFidget(time, phase);
  if (idleFidgetSide(phase) > 0.5) out.elbowR = fid;
  else out.elbowL = fid;
  return out;
}

const f = (n: number): string => (Number.isInteger(n) ? n.toFixed(1) : String(n));

/** GLSL helper functions with the same formulas and constants as above (included in PERSON_DECL). */
export function idleGlsl(): string {
  return /* glsl */ `
float idleHash(float x) { return fract(sin(x * 12.9898 + 4.1414) * 43758.5453); }
float idleBreath(float t, float ph) {
  float period = ${f(IDLE.breathPeriodS)} * (${f(1 - IDLE.breathJitter)} + ${f(2 * IDLE.breathJitter)} * idleHash(ph));
  return 0.5 + 0.5 * sin(6.28318531 * t / period + ph);
}
float idleShift(float t, float ph) {
  float halfT = ${f(IDLE.shiftHalfMinS)} + ${f(IDLE.shiftHalfSpanS)} * idleHash(ph + 7.3);
  return sin(3.14159265 * t / halfT + ph * 1.3);
}
float idleYaw(float t, float ph) { return 0.7 * sin(${f(IDLE.glanceRateA)} * t + 7.0 * ph) + 0.3 * sin(${f(IDLE.glanceRateB)} * t + 3.0 * ph); }
float idlePitch(float t, float ph) { return sin(${f(IDLE.pitchRate)} * t + 5.0 * ph); }
float idleArm(float t, float ph, float side) { return sin(${f(IDLE.armRate)} * t + 4.0 * ph + 1.7 * side); }
float idleFidget(float t, float ph) {
  float period = ${f(IDLE.fidgetMinS)} + ${f(IDLE.fidgetSpanS)} * idleHash(ph + 13.1);
  float tt = mod(t + idleHash(ph + 21.7) * period, period);
  float s = sin(3.14159265 * tt / ${f(IDLE.fidgetLenS)});
  return tt < ${f(IDLE.fidgetLenS)} ? s * s : 0.0;
}
float idleFidgetSide(float ph) { return idleHash(ph + 21.7) > 0.5 ? 1.0 : 0.0; }
`;
}
