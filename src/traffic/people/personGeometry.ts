// Stylised people: four age groups (child, teen, adult, elder with a slight stoop). One geometry per age group
// serves both sexes: the male and female shapes are built from the same call sequence (so both have the same
// vertices in the same order) and the difference is stored as two morph attributes, aMorph (position) and aMorphN
// (normal). The shader adds them scaled by the instance's sex (aLook2.z, 0 man or 1 woman), so women get narrower
// shoulders and wider hips without an extra draw call.
//
// Every model holds all of its parts: head with ears, eyes, brows, nose, mouth and moustache, hair styles (cap,
// fringe, long, bob, ponytail, bun, pigtails, waist-length), beard, coat tails, torso, pelvis,
// two-segment legs with shoes, two-segment arms with hands, hat, scarf and backpack. The shader shows only the
// parts a person wears (see partShows in rigShader.ts); hidden parts are still drawn but collapse to a point.
// Vertex attribute aRig = (part id, colour region, pivotY, pivotZ) drives the walk cycle and the per-instance
// clothing colours. Models face +Z, feet at y = 0, left side is +X.

import * as THREE from 'three';
import { trafficLife } from '../../config/tuning';
import { buildShape } from './personShape';
import { buildShapeNear } from './personShapeNear';
import type { BodyKind, GaitSpec } from './personSpec';

export { PART, REGION } from './personParts';
export type { BodyKind, GaitSpec } from './personSpec';

export interface PersonModel {
  /** Male shape with the morph attributes aMorph and aMorphN for the female shape. */
  geometry: THREE.BufferGeometry;
  /** (y, z) of the hip, shoulder and neck pivots after any stoop shift. */
  hip: [number, number];
  shoulder: [number, number];
  neck: [number, number];
  /** How far the body drops when seated (hip height minus bench seat height). */
  seatDrop: number;
  /** Height of the top of the head (standing, without hat), used to place umbrellas. */
  headTop: number;
  /** Head ellipsoid centre and radii (model space, stoop included), for the near face shader. */
  head: { c: [number, number, number]; r: [number, number, number] };
}

/** Adult defaults: plain sine swing, no extra knee, arm or bob (neutral multipliers). */
const PLAIN: Pick<GaitSpec, 'ease' | 'kneeK' | 'armK' | 'bobK'> = { ease: 0, kneeK: 1, armK: 1, bobK: 1 };

/** Gait per age group: [male, female]. Women take slightly shorter steps; elders take short, slow steps.
 *  Children use the eased, knee-bending, bobbing gait from `trafficLife` (designer knobs). */
const GAIT: Record<BodyKind, [GaitSpec, GaitSpec]> = {
  adult: [
    { cycle: 1.5, amp: 1, heightK: 1, ...PLAIN },
    { cycle: 1.38, amp: 0.93, heightK: 0.95, ...PLAIN },
  ],
  teen: [
    { cycle: 1.22, amp: 1.1, heightK: 1, ...PLAIN },
    { cycle: 1.14, amp: 1.02, heightK: 0.97, ...PLAIN },
  ],
  child: [
    childGait(1),
    childGait(1),
  ],
  elder: [
    { cycle: 1.0, amp: 0.66, heightK: 0.94, ...PLAIN },
    { cycle: 0.94, amp: 0.6, heightK: 0.92, ...PLAIN },
  ],
};

function childGait(heightK: number): GaitSpec {
  return {
    cycle: trafficLife.childStrideCycleM,
    amp: trafficLife.childSwingAmp,
    heightK,
    ease: trafficLife.childSwingEase,
    kneeK: trafficLife.childKneeK,
    armK: trafficLife.childArmK,
    bobK: trafficLife.childBobK,
  };
}

export function gaitOf(kind: BodyKind, female: number): GaitSpec {
  return GAIT[kind][female ? 1 : 0];
}

const SEAT_HEIGHT = 0.47;

/**
 * Builds the model of one age group at a detail level ('far' is the original low-poly model, 'near' the smooth one): the male shape, plus the morph deltas to the female shape. Both shapes come
 * from the same primitives in the same order, so the vertex counts match (checked here).
 */
export type PersonDetail = 'far' | 'near';

export function buildPerson(kind: BodyKind, detail: PersonDetail = 'far'): PersonModel {
  const build = detail === 'near' ? buildShapeNear : buildShape;
  const male = build(kind, 0);
  const female = build(kind, 1);
  const pm = male.geometry.getAttribute('position').array as Float32Array;
  const pf = female.geometry.getAttribute('position').array as Float32Array;
  if (pm.length !== pf.length) throw new Error(`people: ${kind} male and female shapes differ in vertex count`);
  const nm = male.geometry.getAttribute('normal').array as Float32Array;
  const nf = female.geometry.getAttribute('normal').array as Float32Array;
  const dP = new Float32Array(pm.length);
  const dN = new Float32Array(nm.length);
  for (let i = 0; i < pm.length; i++) {
    dP[i] = pf[i] - pm[i];
    dN[i] = nf[i] - nm[i];
  }
  const geometry = male.geometry;
  geometry.setAttribute('aMorph', new THREE.Float32BufferAttribute(dP, 3));
  geometry.setAttribute('aMorphN', new THREE.Float32BufferAttribute(dN, 3));
  const seatDrop = Math.max(0, male.hip[0] - SEAT_HEIGHT);
  return {
    geometry,
    hip: male.hip,
    shoulder: male.shoulder,
    neck: male.neck,
    seatDrop,
    headTop: male.headTop,
    head: male.head,
  };
}

export function triangleCount(geo: THREE.BufferGeometry): number {
  const n = geo.index ? geo.index.count : geo.getAttribute('position').count;
  return n / 3;
}
