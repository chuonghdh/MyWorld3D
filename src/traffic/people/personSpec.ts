// Gait and build specs per age group and sex. Read by personShape.ts (build) and personGeometry.ts (gait).

export type BodyKind = 'adult' | 'child' | 'elder' | 'teen';


/** Gait and build of one age group and sex. Read per instance by peopleMeshes.ts. */
export interface GaitSpec {
  /** Metres per full gait cycle (two steps). Short for children and elders: short, quick steps. */
  cycle: number;
  /** Swing amplitude multiplier. */
  amp: number;
  /** Height multiplier applied to the instance scale (women a little shorter than men). */
  heightK: number;
  /** Swing ease 0-1: 0 is a plain sine (adults), higher flattens the turnaround (rigShader.ts). */
  ease: number;
  /** Knee bend multiplier in the swing phase. */
  kneeK: number;
  /** Arm counter-swing multiplier. */
  armK: number;
  /** Body bob multiplier at step rate. */
  bobK: number;
}

export interface Spec {
  k: number;
  w: number;
  headK: number;
  stoop: number;
  bagK: number;
}

export const SPECS: Record<BodyKind, Spec> = {
  adult: { k: 1, w: 1, headK: 1.08, stoop: 0, bagK: 1 },
  teen: { k: 0.87, w: 0.98, headK: 1.1, stoop: 0, bagK: 1.1 },
  child: { k: 0.64, w: 1.05, headK: 1.3, stoop: 0, bagK: 1.3 },
  elder: { k: 0.95, w: 0.97, headK: 1.05, stoop: 0.2, bagK: 0.9 },
};
