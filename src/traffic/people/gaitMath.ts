// Gait mechanics for WALKING people (T-0028), on top of the thigh, knee, arm and elbow rotation and the vertical bob of
// applyRig (rigShaderGlsl.ts): pelvis yaw and side sway, torso counter-twist, ankle flexion (toe up at heel strike,
// plantar flexion at toe-off) and head stabilisation. THIS FILE IS THE SINGLE SOURCE of the formulas and constants:
// gaitGlsl() builds the GLSL functions from them, and the functions below are the TypeScript mirror used by
// tests/peopleGaitMech.test.ts. If a formula changes here, change the template in gaitGlsl() with it.
//
// All terms use the single gait phase a = aGait.x + aGait.y (T-0021), scale with the per-person swing amplitude `amp`
// (aGait.w: elders smaller, teens larger) and are exactly zero for every pose but walking. Conventions: +x is the
// person's left, +z forward. A positive thigh angle swings the foot forward; a positive ankle angle lifts the toe.

export const GAIT_MECH = {
  /** Plantar flexion at toe-off relative to the toe-up angle at heel strike (about 20 degrees against 12). */
  plantRatio: 1.667,
  /** Ankle height as a fraction of the hip height 0.95 (personDims.ts: ankle 0.08, hip 0.95). */
  ankleFrac: 0.08,
  hipFrac: 0.95,
  /** The torso twist is full from this share of the way from the hip to the shoulder up (the arms hang from the shoulder, so the torso beside them must turn with them). */
  torsoBlend: 0.6,
} as const;

export interface GaitAmps {
  pelvisYawDeg: number;
  pelvisSwayMm: number;
  torsoTwistDeg: number;
  ankleDeg: number;
  /** 0 to 1: share of the bob and the torso twist the head cancels. */
  headStabilise: number;
}

export interface GaitBody {
  /** Yaw about the vertical axis (rad, positive turns +x points back): pelvis, and torso, arms and head group. */
  pelvisYaw: number;
  torsoYaw: number;
  /** Yaw of the head parts (the torso twist less the stabilised share). */
  headYaw: number;
  /** Sideways sway of everything above the legs, metres: toward the stance leg, largest at mid-stance (-cos a). */
  swayX: number;
  /** Share of the bob the head cancels: it moves by -headBob (metres, pass the bob). */
  headDy: number;
}

const RAD = Math.PI / 180;

/**
 * The left leg is forward when sin(a) > 0, so the left hip is forward: the pelvis turns by -sin(a). The left leg is in stance
 * when cos(a) < 0 (mid-stance at a = pi), and the pelvis sways farthest toward the stance leg there: swayX = -sway cos(a).
 */
export function gaitBody(a: number, amp: number, amps: GaitAmps, bob: number): GaitBody {
  const s = Math.sin(a);
  const pelvisYaw = -amps.pelvisYawDeg * RAD * amp * s;
  const torsoYaw = amps.torsoTwistDeg * RAD * amp * s;
  return {
    pelvisYaw,
    torsoYaw,
    headYaw: torsoYaw * (1 - amps.headStabilise),
    swayX: (-amps.pelvisSwayMm / 1000) * amp * Math.cos(a),
    headDy: -amps.headStabilise * bob,
  };
}

const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** The legs sway with the pelvis at the hip and not at all at the ankle (planted foot): the sway fades with height between the ankle and the hip. */
export const gaitLegSway = (a: number, amp: number, amps: GaitAmps, y: number, hipY: number): number =>
  ((-amps.pelvisSwayMm / 1000) * amp * Math.cos(a)) * smoothstep(gaitAnkleY(hipY), hipY, y);

/** Weight of the torso twist (against the pelvis yaw) for a part-0 vertex at height y: 0 at the hip, 1 from 60 percent of the way to the shoulder. */
export const gaitTorsoWeight = (y: number, hipY: number, shoulderY: number): number => smoothstep(hipY, hipY + GAIT_MECH.torsoBlend * (shoulderY - hipY), y);

/** Unit ankle curve from the eased leg swing ss (+1 leg forward at heel strike, -1 leg back at toe-off): toe up, then plantar flexion. */
export const gaitAnkleUnit = (ss: number): number => (ss > 0 ? ss : -GAIT_MECH.plantRatio * ss * ss);

export const gaitAnkle = (ss: number, amp: number, amps: GaitAmps): number => amps.ankleDeg * RAD * amp * gaitAnkleUnit(ss);

/** Ankle pivot height for a person whose hip is at hipY. */
export const gaitAnkleY = (hipY: number): number => (GAIT_MECH.ankleFrac / GAIT_MECH.hipFrac) * hipY;

const f = (n: number): string => (Number.isInteger(n) ? n.toFixed(1) : String(n));

/** GLSL: uniforms and functions (included in PERSON_DECL after the idle helpers, which provide rotHeadYaw). */
export function gaitGlsl(): string {
  return /* glsl */ `
uniform vec4 uGait; // pelvis yaw (rad), sway (m), torso twist (rad), ankle (rad); see gaitMath.ts
uniform float uGaitHead; // share of bob and twist the head cancels
float gaitAnkleUnit(float ss) { return ss > 0.0 ? ss : -${f(GAIT_MECH.plantRatio)} * ss * ss; }
float gaitAnkleY() { return ${f(GAIT_MECH.ankleFrac / GAIT_MECH.hipFrac)} * uHip.x; }
void gaitBody(inout vec3 p, inout vec3 n, int part, float a, float amp, float bob) {
  float s = sin(a);
  if (part >= 1 && part <= 4) {
    p.x -= uGait.y * amp * cos(a) * smoothstep(gaitAnkleY(), uHip.x, p.y);
    return;
  }
  float th = uGait.z * amp * s;
  if (part == 0) th = mix(-uGait.x * amp * s, th, smoothstep(uHip.x, mix(uHip.x, uShoulder.x, ${f(GAIT_MECH.torsoBlend)}), p.y));
  else if (part == 13) th = -uGait.x * amp * s;
  if (part == 9 || part == 10 || (part >= 14 && part <= 22) || part == 24) {
    th *= 1.0 - uGaitHead;
    p.y -= uGaitHead * bob;
  }
  rotHeadYaw(p, n, uNeck.y, th);
  p.x -= uGait.y * amp * cos(a);
}
`;
}
