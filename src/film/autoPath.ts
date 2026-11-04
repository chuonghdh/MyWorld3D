/**
 * Auto film path (P2): pure fixed-step helpers for the dry run. Plain TypeScript, no React, no rendering,
 * no wall-clock time and no Math.random, so two runs with the same input give the same hash.
 * Placeholder route: one full turn around the town centre at the whole-map overview height (P5 replaces it).
 */
import { film } from '../config/tuning';
import type { Rect } from '../city/layout';
import { wholeMapFraming } from '../scene/cameraMath';

export interface AutoPose {
  x: number;
  y: number;
  z: number;
  tx: number;
  ty: number;
  tz: number;
}

/** One dry-run sample: metres (rounded x1000 in the hash) and optional angles in radians (rounded x10000). */
export interface DrySample {
  metres: readonly number[];
  angles?: readonly number[];
}

export interface DryRunResult {
  count: number;
  hash: number;
}

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** Number of rendered frames in an auto film. */
export function autoFrameCount(): number {
  return Math.round(film.autoSeconds * film.fps);
}

/** Game minutes advanced per auto frame; summed over all frames it gives autoVirtualMinutes. */
export function gameMinutesPerFrame(): number {
  return film.autoVirtualMinutes / autoFrameCount();
}

/** Camera pose at film time `t` (seconds). One full orbit lasts autoSeconds; the camera looks at the centre. */
export function autoPoseAt(t: number, town: Rect, fovDeg: number): AutoPose {
  const size = Math.max(town.maxX - town.minX, town.maxZ - town.minZ);
  const cx = (town.minX + town.maxX) / 2;
  const cz = (town.minZ + town.maxZ) / 2;
  const frame = wholeMapFraming({
    townSize: size,
    fovDeg,
    viewW: film.width1080,
    viewH: film.height1080,
    rightInset: 0,
  });
  const phase = (2 * Math.PI * t) / film.autoSeconds;
  const c = Math.cos(phase);
  const s = Math.sin(phase);
  const ox = frame.position[0] - frame.target[0];
  const oz = frame.position[2] - frame.target[2];
  const tx = cx + frame.target[0];
  const tz = cz + frame.target[2];
  return {
    x: tx + ox * c - oz * s,
    y: frame.position[1],
    z: tz + ox * s + oz * c,
    tx,
    ty: frame.target[1],
    tz,
  };
}

function fnvInt(h: number, v: number): number {
  const u = v >>> 0;
  let out = h;
  for (let shift = 0; shift < 32; shift += 8) {
    out ^= (u >>> shift) & 0xff;
    out = Math.imul(out, FNV_PRIME);
  }
  return out;
}

function finite(v: number): number {
  if (!Number.isFinite(v)) throw new Error(`autoPath: non-finite value ${v}`);
  return v;
}

/**
 * Fixed-step dry run: calls `sample(i / fps)` for i in [0, frames) and hashes the rounded values
 * (FNV-1a 32-bit). Throws on a non-finite value so a NaN can never hash silently.
 */
export function dryRun(frames: number, sample: (t: number) => DrySample): DryRunResult {
  let h = FNV_OFFSET;
  for (let i = 0; i < frames; i++) {
    const s = sample(i / film.fps);
    for (const m of s.metres) h = fnvInt(h, Math.round(finite(m) * 1000));
    for (const a of s.angles ?? []) h = fnvInt(h, Math.round(finite(a) * 10000));
  }
  return { count: frames, hash: h >>> 0 };
}
