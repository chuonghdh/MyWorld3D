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
  /** Plantar flexion at toe-off relative to the toe-up angle at heel strike. 0.41 makes the ankle height equal for a leading heel and a trailing toe (ankle 0.08, heel -0.07, toe +0.17: 0.08 + 0.07 phiH = 0.08 + 0.17 phiT), so both feet reach the ground at double support; the 20 degrees of T-0028 would need a bent knee. */
  plantRatio: 0.41,
  /** Ankle height as a fraction of the hip height 0.95 (personDims.ts: ankle 0.08, hip 0.95). */
  ankleFrac: 0.08,
  hipFrac: 0.95,
  /** The head leads the body into a turn by up to this many radians (10 degrees) at the fastest visible turn. */
  headLead: (10 * Math.PI) / 180,
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

/** Knee flexion of the leg with phase x (rad). */
export const gaitKnee = (x: number, amp: number, kneeK: number): number => amp * 0.85 * kneeK * Math.max(0, Math.cos(x));

/** Absolute foot pitch target (rad, toe up positive) from the thigh profile: toe up at heel strike, plantar flexion at toe-off, 0 at mid-stance. */
export const gaitAnkle = (ss: number, amp: number, amps: GaitAmps): number => amps.ankleDeg * RAD * amp * gaitAnkleUnit(ss);

/** Share of the knee flexion the ankle takes back in swing, so the toe clears the ground. */
export const GAIT_KNEE_COMP = 0.8;

/** Largest ankle rotation relative to the shin (rad, about 29 degrees): the shoe upper covers the shin end only that far. */
export const GAIT_ANKLE_LIMIT = 0.5;

/**
 * Ankle rotation relative to the shin (rad). The foot is turned back by the thigh angle (and part of the knee flexion), so its
 * pitch in the world is the target curve above: flat in mid-stance, heel first at heel strike, toe last at toe-off. Without
 * this the foot is tilted by the whole leg angle (23 degrees or more) and the trailing toe digs in below the ground.
 */
export const gaitAnkleRel = (pr: number, amp: number, amps: GaitAmps, thighAng: number, knee: number): number =>
  Math.min(GAIT_ANKLE_LIMIT, Math.max(-GAIT_ANKLE_LIMIT, gaitAnkle(pr, amp, amps) - thighAng + GAIT_KNEE_COMP * knee));

/** Stride fit (T-0034): `fit` mixes the old thigh swing amplitude (0.55 amp) with the one that makes the backward foot sweep over stance, 2 L sin(theta), equal to the step length cycle / 2; `flat` blends the sine swing with a triangle wave so the stance foot moves backward at a constant speed. */
export interface GaitStride {
  fit: number;
  flat: number;
}

/** Triangle wave of x with the sine's phase and range: asin(sin x) * 2 / pi. */
export const gaitTri = (x: number): number => (Math.asin(Math.sin(x)) * 2) / Math.PI;

/** Thigh swing profile in [-1, 1]: the (eased) sine swing ss against the triangle wave of the same phase x. */
export const gaitProfile = (ss: number, x: number, flat: number): number => ss + (gaitTri(x) - ss) * flat;

/**
 * Thigh amplitude in radians. ampOld is the person's swing amplitude (aGait.w), cycle the metres per gait cycle (men or women),
 * hipModel the model hip height and scale the instance scale (so hipModel * scale is the leg length in the world).
 */
export const gaitThighAmp = (ampOld: number, cycle: number, hipModel: number, scale: number, stride: GaitStride): number => {
  const old = ampOld * 0.55;
  const fitted = Math.asin(Math.min(0.99, cycle / (4 * hipModel * scale)));
  return old + (fitted - old) * stride.fit;
};

/** Sole points (y, z in model units at hip height 0.95): heel and toe of the shoe, relative to the leg's scale k = hipModel / 0.95. */
export const GAIT_FOOT = { heelZ: -0.07, toeZ: 0.17 } as const;

/** Everything the grounded bob needs for one person (model units). */
export interface GaitLeg {
  amp: number;
  ease: number;
  kneeK: number;
  hipModel: number;
  thighAmp: number;
}

const rotYZ = (y: number, z: number, pivY: number, th: number): [number, number] => {
  const dy = y - pivY;
  return [pivY + Math.cos(th) * dy + Math.sin(th) * z, -Math.sin(th) * dy + Math.cos(th) * z];
};

/** Height (y) of the lowest sole point of the leg with phase x (left leg x = a, right leg x = a + pi), through ankle, knee and hip as applyRig turns them. */
export function gaitFootLow(x: number, leg: GaitLeg, amps: GaitAmps, flat: number): number {
  const k = leg.hipModel / GAIT_MECH.hipFrac;
  const sa = Math.sin(x);
  const pr = gaitProfile(sa + leg.ease * 0.5 * (sa - sa * sa * sa), x, flat);
  const knee = gaitKnee(x, leg.amp, leg.kneeK);
  const ankleAng = gaitAnkleRel(pr, leg.amp, amps, leg.thighAmp * pr, knee);
  let low = Infinity;
  for (const z of [GAIT_FOOT.heelZ * k, GAIT_FOOT.toeZ * k]) {
    let p = rotYZ(0, z, gaitAnkleY(leg.hipModel), ankleAng);
    p = rotYZ(p[0], p[1], 0.51 * k, -knee);
    p = rotYZ(p[0], p[1], leg.hipModel, leg.thighAmp * pr);
    low = Math.min(low, p[0]);
  }
  return low;
}

/**
 * Vertical body offset (model units): the body is moved so that the lower of the two feet touches the ground (y = 0): in
 * mid-stance that is the flat stance foot, around double support the foot that reaches farthest down. Highest at mid-stance
 * (leg vertical), lowest at double support, and neither foot is ever below the ground. A stance foot can float a few cm at the
 * end of stance (children up to about 25 mm) when the leading foot reaches farther down than the trailing one.
 */
export const gaitBob = (a: number, leg: GaitLeg, amps: GaitAmps, flat: number): number => -Math.min(gaitFootLow(a, leg, amps, flat), gaitFootLow(a + Math.PI, leg, amps, flat));

/** Gait ramp 0..1 carried by the walking pose value (aGait.z = -ramp for walkers, see peopleSets.ts); 1 for any other pose. */
export const gaitRamp = (pose: number): number => (pose < 0.5 ? Math.min(1, Math.max(0, -pose)) : 1);

/**
 * Turn lean (T-0029). turnUnit is the smoothed turn in -1..1, positive toward +x (the left). Torso, arms and head roll about the
 * forward axis through the hip by -leanRad * turnUnit (the top moves toward the turn), and the head yaws ahead by headLead * turnUnit.
 * Both are exactly zero at turn 0.
 */
export const gaitLean = (turnUnit: number, leanRad: number): { roll: number; headYaw: number } => ({ roll: -leanRad * turnUnit, headYaw: GAIT_MECH.headLead * turnUnit });

/** Rotation of the point (x, y) about the z axis through height pv (the lean), as the GLSL rotXY does it. */
export const gaitRoll = (x: number, y: number, pv: number, th: number): [number, number] => [Math.cos(th) * x - Math.sin(th) * (y - pv), pv + Math.sin(th) * x + Math.cos(th) * (y - pv)];

/** Ankle pivot height for a person whose hip is at hipY. */
export const gaitAnkleY = (hipY: number): number => (GAIT_MECH.ankleFrac / GAIT_MECH.hipFrac) * hipY;

const f = (n: number): string => (Number.isInteger(n) ? n.toFixed(1) : String(n));

/** GLSL: uniforms and functions (included in PERSON_DECL after the idle helpers, which provide rotHeadYaw). */
export function gaitGlsl(): string {
  return /* glsl */ `
uniform vec4 uGait; // pelvis yaw (rad), sway (m), torso twist (rad), ankle (rad); see gaitMath.ts
uniform float uGaitHead; // share of bob and twist the head cancels
uniform float uLean; // walkLeanRad, see gaitLean
uniform vec4 uStride; // stride fit, stance flatness, cycle men (m), cycle women (m); see gaitThighAmp
float gaitProfile(float ss, float x) { return mix(ss, asin(sin(x)) * 0.63661977, uStride.y); }
// Thigh amplitude (rad): the old 0.55 amp mixed with the fitted one, from the instance scale (leg length in the world) and the cycle length.
float gaitThighAmp(float amp) {
  float cycle = mix(uStride.z, uStride.w, aLook2.z);
  float fitted = asin(min(0.99, cycle / (4.0 * uHip.x * length(instanceMatrix[0].xyz))));
  return mix(amp * 0.55, fitted, uStride.x);
}
float gaitAnkleUnit(float ss) { return ss > 0.0 ? ss : -${f(GAIT_MECH.plantRatio)} * ss * ss; }
float gaitKnee(float x, float amp, float kneeK) { return amp * 0.85 * kneeK * max(0.0, cos(x)); }
float gaitAnkleRel(float pr, float amp, float thighAng, float knee) { return clamp(uGait.w * amp * gaitAnkleUnit(pr) - thighAng + ${f(GAIT_KNEE_COMP)} * knee, -${f(GAIT_ANKLE_LIMIT)}, ${f(GAIT_ANKLE_LIMIT)}); }
float gaitAnkleY() { return ${f(GAIT_MECH.ankleFrac / GAIT_MECH.hipFrac)} * uHip.x; }
// Lowest sole point (y) of the leg with phase x through ankle, knee and hip, as applyRig turns them (mirror: gaitFootLow).
float gaitFootLow(float x, float amp, float eased, float kneeK, float thighAmp) {
  float k = uHip.x / ${f(GAIT_MECH.hipFrac)};
  float sa = sin(x);
  float pr = gaitProfile(sa + eased * 0.5 * (sa - sa * sa * sa), x);
  float knee = gaitKnee(x, amp, kneeK);
  float ankle = gaitAnkleRel(pr, amp, thighAmp * pr, knee);
  float low = 1e9;
  for (int i = 0; i < 2; i++) {
    vec3 q = vec3(0.0, 0.0, (i == 0 ? ${f(GAIT_FOOT.heelZ)} : ${f(GAIT_FOOT.toeZ)}) * k);
    vec3 nn = vec3(0.0);
    rotYZ(q, nn, vec2(gaitAnkleY(), 0.0), ankle);
    rotYZ(q, nn, vec2(0.51 * k, 0.0), -knee);
    rotYZ(q, nn, vec2(uHip.x, 0.0), thighAmp * pr);
    low = min(low, q.y);
  }
  return low;
}
// The body is lowered so that the lower of the two feet touches the ground (mirror: gaitBob).
float gaitBobOf(float a, float amp, float eased, float kneeK, float thighAmp) {
  return -min(gaitFootLow(a, amp, eased, kneeK, thighAmp), gaitFootLow(a + 3.14159265, amp, eased, kneeK, thighAmp));
}
// Roll about the z (forward) axis through height pv (mirror: gaitRoll).
void rotXY(inout vec3 p, inout vec3 n, float pv, float th) {
  float c = cos(th);
  float s = sin(th);
  float y = p.y - pv;
  float x = p.x;
  p.x = c * x - s * y;
  p.y = pv + s * x + c * y;
  float nx = n.x;
  n.x = c * nx - s * n.y;
  n.y = s * nx + c * n.y;
}
void gaitBody(inout vec3 p, inout vec3 n, int part, float a, float amp, float bob, float turnU) {
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
  if (part == 9 || part == 10 || (part >= 14 && part <= 22) || part == 24) th += ${f(GAIT_MECH.headLead)} * turnU;
  rotHeadYaw(p, n, uNeck.y, th);
  if (part != 13) {
    // Lean into the turn: the torso (fading in from the hip), arms, head and carried items roll about the forward axis through the hip.
    float lw = part == 0 ? smoothstep(uHip.x, mix(uHip.x, uShoulder.x, ${f(GAIT_MECH.torsoBlend)}), p.y) : 1.0;
    rotXY(p, n, uHip.x, -uLean * turnU * lw);
  }
  p.x -= uGait.y * amp * cos(a);
}
`;
}
