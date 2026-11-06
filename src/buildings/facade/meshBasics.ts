// Mesh primitives shared by the house builders: colours, frames, face flags, trace and caster rules (split from mesh.ts).

import * as THREE from 'three';
import { type LayerBox } from './layers';

export type Target = 'body' | 'glass' | 'glassLit' | 'sign';
/** Texture coordinates of one quad corner (sign atlas cell). */
export type UV = readonly [number, number];
/** Linear RGB colour. */
export type Col = readonly [number, number, number];
/** Point in frame coordinates [u, y, n]. */
export type P3 = readonly [number, number, number];

const tmpColor = new THREE.Color();
const colorCache = new Map<string, Col>();

/** Converts a hex / CSS colour to linear RGB (the same conversion ColorBatch uses). */
export function col(hex: string): Col {
  let c = colorCache.get(hex);
  if (!c) {
    tmpColor.set(hex);
    c = [tmpColor.r, tmpColor.g, tmpColor.b];
    colorCache.set(hex, c);
  }
  return c;
}

/** Shifts the HSL lightness of a hex colour (delta in 0..1 units) and returns linear RGB. */
export function shiftLightness(hex: string, delta: number, satDelta = 0): Col {
  tmpColor.set(hex).offsetHSL(0, satDelta, delta);
  return [tmpColor.r, tmpColor.g, tmpColor.b];
}

export function scale(c: Col, k: number): Col {
  return [c[0] * k, c[1] * k, c[2] * k];
}

export function mix(a: Col, b: Col, t: number): Col {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Maps frame coordinates (u, y, n) to house coordinates (x, y, z). */
export interface Frame {
  ox: number;
  oz: number;
  ux: number;
  uz: number;
  nx: number;
  nz: number;
}

export const HOUSE_FRAME: Frame = { ox: 0, oz: 0, ux: 1, uz: 0, nx: 0, nz: 1 };

/** Face flags for box(): skip the given faces (+u, -u, +y, -y, +n, -n). */
export const PU = 1;
export const NU = 2;
export const PY = 4;
export const NY = 8;
export const PN = 16;
export const NN = 32;

/**
 * Debug trace of where primitives come from (tests only): when `on`, every box() and poly() records
 * the triangle range it wrote and the two nearest caller frames, so an audit hit can be traced back
 * to the line of code that emitted it.
 */
export const trace = {
  on: false,
  log: [] as { t: Target; start: number; count: number; src: string }[],
  /** The boxes of the last flush (resolved), for re-verification in tests. */
  boxes: [] as (LayerBox & { src: string })[],
};

export function traceSource(): string {
  const lines = (new Error().stack ?? '').split('\n').slice(1);
  const out: string[] = [];
  for (const l of lines) {
    if (/mesh\.ts/.test(l)) continue;
    const m = /([\w.]+\.ts):(\d+):\d+/.exec(l);
    if (m) out.push(`${m[1]}:${m[2]}`);
    if (out.length >= 3) break;
  }
  return out.join(' < ');
}

/** Name of the per-vertex attribute (body only) that is 1 when a triangle belongs in the shadow pass, 0 for small detail. */
export const CASTER_ATTRIBUTE = 'aCaster';

/**
 * Shadow-caster classification (see src/scene/mergeBlock.ts, which splits a block's body into a caster and a
 * detail mesh). A box casts unless it is tiny (longest side under 0.4 m), a thin bar (second side under
 * 0.15 m: window frames, railings, rails, pots) or a thin plate (under 8 cm thick and under 1.2 m wide:
 * shutters, doors, sign boards). Everything else, walls, roofs, parapets, slabs, chimney stacks,
 * cornices, keeps casting. The shadow of the excluded parts is a few centimetres wide and invisible.
 */
export function boxCasts(du: number, dy: number, dn: number): boolean {
  let s0 = du;
  let s1 = dy;
  let s2 = dn;
  if (s0 > s1) [s0, s1] = [s1, s0];
  if (s1 > s2) [s1, s2] = [s2, s1];
  if (s0 > s1) [s0, s1] = [s1, s0];
  if (s2 < 0.4 || s1 < 0.15) return false;
  if (s0 < 0.08 && s1 < 1.2) return false;
  return true;
}

/** A free polygon casts when its area is at least 0.16 m2 (a 0.4 x 0.4 m patch). */
export const POLY_CAST_AREA = 0.16;
