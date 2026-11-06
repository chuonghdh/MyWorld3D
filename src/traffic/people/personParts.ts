// Part ids (aRig.x) and colour regions (aRig.y) of the person rig. Read by personShape.ts and the shader.

/** Part ids (aRig.x). The shader swings limbs by part and shows or hides parts per person. */
export const PART = {
  BODY: 0,
  THIGH_L: 1,
  THIGH_R: 2,
  SHIN_L: 3,
  SHIN_R: 4,
  ARM_L: 5,
  ARM_R: 6,
  FORE_L: 7,
  FORE_R: 8,
  HEAD: 9,
  HAT: 10,
  SCARF: 11,
  BAG: 12,
  /** Coat tails over the hips and upper thighs (shown only with the coat flag); trousers show below. */
  COAT: 13,
  /** Hair cap. Curly hair is the same cap, widened in the shader. */
  HAIR_CAP: 14,
  HAIR_FRINGE: 15,
  /** Hair to the shoulders. */
  HAIR_LONG: 16,
  HAIR_BOB: 17,
  HAIR_PONY: 18,
  HAIR_BUN: 19,
  HAIR_PIGTAILS: 20,
  BEARD: 21,
  MOUSTACHE: 22,
  /** Hair to the waist. */
  HAIR_WAIST: 24,
} as const;

/** Colour regions (aRig.y). Region 0 keeps the fixed vertex colour. */
export const REGION = {
  FIXED: 0,
  SKIN: 1,
  HAIR: 2,
  TOP: 3,
  PANTS: 4,
  ACCENT: 5,
  /** Lower leg: trousers, or skin when the person wears shorts (flag bit 8). */
  SHIN: 6,
  /** Forearm: top, or skin with short sleeves (flag bit 16). */
  SLEEVE: 7,
} as const;
