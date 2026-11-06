// Orbit pivot choice for CameraRig: the point the camera rotates around. Pure, no Three.js and no DOM.
// Default and cleared selection: the centre of the town map. A selected block, house or tree: its centroid.
// Lives beside cameraMath.ts (which is at the 350-line cap); tests/orbitPivot.test.ts covers it.
import type { CityLayout } from '../city';
import {
  dirFromYaw,
  easeInOut,
  streetLookStep,
  yawFromDir,
  type Bounds,
  type StreetKeyAxes,
  type V3,
} from './cameraMath';

export interface GroundPoint {
  x: number;
  z: number;
}

/** A selected thing (same shape as the store's OverrideTarget). */
export interface PivotTarget {
  type: 'house' | 'block' | 'tree';
  id: string;
}

/** Ground data the pivot can move to, from getCityLayout: block bounds, house lot positions, street tree positions. */
export interface PivotSource {
  blocks: readonly { id: string; bounds: Bounds }[];
  lots: readonly { id: string; position: GroundPoint }[];
  trees: readonly { id: string; position: GroundPoint }[];
}

/** Pivot source from the layout (blocks, lots and street trees; the same data the scene draws). */
export function pivotSourceFrom(l: Pick<CityLayout, 'blocks' | 'lots' | 'streetTrees'>): PivotSource {
  return {
    blocks: l.blocks.map((b) => ({ id: b.id, bounds: b.bounds })),
    lots: l.lots.map((o) => ({ id: o.id, position: o.position })),
    trees: l.streetTrees.map((t) => ({ id: t.id, position: t.position })),
  };
}

/** Centre of a rectangle on the ground. For the town bounds this is the centre of the map diagonal. */
export function boundsCentre(b: Bounds): GroundPoint {
  return { x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2 };
}

/** True when two selections name the same thing (both null counts as the same). */
export function sameSelection(a: PivotTarget | null, b: PivotTarget | null): boolean {
  if (a === null || b === null) return a === b;
  return a.type === b.type && a.id === b.id;
}

/**
 * Centroid of a selected thing: a block's centre, a house lot's centre, a tree's position.
 * Null when the id is not in the source (layout regenerated, block swapped away).
 */
export function selectionCentroid(target: PivotTarget, src: PivotSource): GroundPoint | null {
  if (target.type === 'block') {
    const b = src.blocks.find((bl) => bl.id === target.id);
    return b ? boundsCentre(b.bounds) : null;
  }
  const list = target.type === 'house' ? src.lots : src.trees;
  const hit = list.find((e) => e.id === target.id);
  return hit ? { x: hit.position.x, z: hit.position.z } : null;
}

/** Orbit pivot for a selection: its centroid, or the map centre when nothing is selected or the id is gone. */
export function pivotForSelection(target: PivotTarget | null, src: PivotSource, map: Bounds): GroundPoint {
  if (!target) return boundsCentre(map);
  return selectionCentroid(target, src) ?? boundsCentre(map);
}

/**
 * A pivot glide in progress. `last` is the eased point already applied to the camera and the orbit target;
 * each frame moves both by the change since `last`, so the view keeps its offset and a user pan mid-glide survives.
 */
export interface PivotGlide {
  from: GroundPoint;
  to: GroundPoint;
  t: number;
  last: GroundPoint;
}

export function startPivotGlide(from: GroundPoint, to: GroundPoint): PivotGlide {
  return { from, to, t: 0, last: { x: from.x, z: from.z } };
}

/**
 * Advances a glide by `dt` seconds over `seconds` (ease in-out). Returns the change of the pivot since the last
 * step (to add to the orbit target and the camera) and whether the glide has arrived. `seconds` of 0 or less jumps.
 */
export function stepPivotGlide(g: PivotGlide, dt: number, seconds: number): { dx: number; dz: number; done: boolean } {
  g.t = seconds > 0 ? Math.min(1, g.t + Math.max(0, dt) / seconds) : 1;
  const k = easeInOut(g.t);
  const x = g.from.x + (g.to.x - g.from.x) * k;
  const z = g.from.z + (g.to.z - g.from.z) * k;
  const step = { dx: x - g.last.x, dz: z - g.last.z, done: g.t >= 1 };
  g.last = { x, z };
  return step;
}

/** Map move speed curve: low below lowHeight, high above highHeight, linear in between (metres, metres per second). */
export interface MoveSpeedCurve {
  low: number;
  high: number;
  lowHeight: number;
  highHeight: number;
}

/** Map move speed (m/s) for a camera height above ground. */
export function mapMoveSpeedAt(height: number, c: MoveSpeedCurve): number {
  if (height <= c.lowHeight) return c.low;
  if (height >= c.highHeight) return c.high;
  return c.low + ((c.high - c.low) * (height - c.lowHeight)) / (c.highHeight - c.lowHeight);
}

/** Map-view move keys: Up forward (+1), Down back (-1), 0 when neither or both are held. */
export function mapMoveAxis(keys: ReadonlySet<string>): number {
  return (keys.has('ArrowUp') ? 1 : 0) - (keys.has('ArrowDown') ? 1 : 0);
}

/** Largest |s| in [0, want] that keeps v + sign * dv * s inside [lo, hi]. */
function axisLimit(v: number, dv: number, sign: number, lo: number, hi: number, want: number): number {
  const d = sign * dv;
  if (Math.abs(d) < 1e-12) return want;
  const room = d > 0 ? (hi - v) / d : (v - lo) / -d;
  return Math.min(want, Math.max(0, room));
}

export interface ViewMoveLimits {
  /** Lowest height of either point, metres (ground). */
  groundY: number;
  bounds: Bounds;
  /** Grow (negative) or shrink (positive) the bounds on each side, as clampToBounds does. */
  margin: number;
}

/**
 * Map Up/Down: moves only the camera by `step` metres along `forward` (unit view direction; negative = back). The
 * orbit target is not an input and is not changed. The step is shortened so the camera stays at or above groundY and
 * inside the bounds (grown by margin).
 */
export function moveCameraAlong(cam: V3, forward: V3, step: number, lim: ViewMoveLimits): V3 {
  const sign = step < 0 ? -1 : 1;
  let s = Math.abs(step);
  const b = lim.bounds;
  s = axisLimit(cam[0], forward[0], sign, b.minX + lim.margin, b.maxX - lim.margin, s);
  s = axisLimit(cam[2], forward[2], sign, b.minZ + lim.margin, b.maxZ - lim.margin, s);
  s = axisLimit(cam[1], forward[1], sign, lim.groundY, Infinity, s);
  const k = sign * s;
  return [cam[0] + forward[0] * k, cam[1] + forward[1] * k, cam[2] + forward[2] * k];
}

/** Map-view look keys as street-style axes: turn (+1 right: Right arrow or D), look (+1 up, W). Arrows, A/D and W/S only. */
export function mapLookAxes(keys: ReadonlySet<string>): StreetKeyAxes {
  const held = (...codes: string[]) => (codes.some((c) => keys.has(c)) ? 1 : 0);
  return { walk: 0, turn: held('ArrowRight', 'KeyD') - held('ArrowLeft', 'KeyA'), look: held('KeyW') - held('KeyS') };
}

/**
 * Turns a unit view direction by the map look axes, reusing the street look step (streetTurnSpeed, streetPitchSpeed,
 * pitchLimit). Yaw is about the vertical axis, so the camera position is not an input and the pivot is not used.
 */
export function mapLookStep(dir: V3, axes: StreetKeyAxes, dt: number): V3 {
  if (!axes.turn && !axes.look) return dir;
  const yaw = yawFromDir(dir[0], dir[2]);
  const pitch = Math.asin(Math.max(-1, Math.min(1, dir[1])));
  const look = streetLookStep(yaw, pitch, axes, dt);
  const f = dirFromYaw(look.yaw);
  const c = Math.cos(look.pitch);
  return [f.x * c, Math.sin(look.pitch), f.z * c];
}
