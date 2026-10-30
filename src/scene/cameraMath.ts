// Pure camera math for CameraRig: clip planes, framing, bounds, easing, street start.
// No Three.js and no DOM, so every function is unit-tested in tests/cameraRig.test.ts.

export type V3 = [number, number, number];

export interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface StreetSegment {
  start: { x: number; z: number };
  end: { x: number; z: number };
  width: number;
  sidewalkWidth: number;
}

/** Camera presets a UI can request through runtime.cameraPresetRequests. */
export type CameraPresetId = 'overview' | 'street';

export const MIN_DISTANCE = 4;
export const MAX_DISTANCE = 600;
export const EYE_HEIGHT = 1.7;
export const TWEEN_SECONDS = 1;
/** Pan limit: the orbit target may leave the town bounds by this many metres. */
export const PAN_MARGIN = 40;
/**
 * Block editing height: with the camera higher than this above the ground (y = 0), a tap selects a whole block
 * (merge and split); at or below it, a tap selects a house. The only place this threshold is defined.
 */
export const BLOCK_EDIT_HEIGHT_M = 200;

/** Tap mode for a camera at height `y` (metres above the ground). */
export function editModeForHeight(y: number): 'house' | 'block' {
  return y > BLOCK_EDIT_HEIGHT_M ? 'block' : 'house';
}

/**
 * Near and far clip planes for a camera at distance `dist` from the orbit target.
 * A fixed 1 m near plane leaves millimetres of depth resolution at 300 m, so the planes scale with
 * the distance: near = 5% of it (0.1 m at street level, 30 m at most), far at least 1200 m.
 */
export function clipPlanes(dist: number): { near: number; far: number } {
  const d = Math.max(0, dist);
  return {
    near: Math.min(30, Math.max(0.1, d * 0.05)),
    far: Math.max(1200, d * 4),
  };
}

/** True when the planes differ enough from the current ones to justify a projection update. */
export function clipPlanesStale(near: number, far: number, want: { near: number; far: number }): boolean {
  return Math.abs(near - want.near) > near * 0.05 || Math.abs(far - want.far) > far * 0.05;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Smooth ease in-out (cubic), 0 -> 0 and 1 -> 1 with zero slope at both ends. */
export function easeInOut(k: number): number {
  const t = clamp(k, 0, 1);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function lerp3(a: V3, b: V3, k: number): V3 {
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

/** Clamps a ground position into the bounds shrunk by `margin` (negative margin grows them). */
export function clampToBounds(x: number, z: number, b: Bounds, margin = 0): { x: number; z: number } {
  const loX = b.minX + margin;
  const hiX = b.maxX - margin;
  const loZ = b.minZ + margin;
  const hiZ = b.maxZ - margin;
  return {
    x: loX > hiX ? (b.minX + b.maxX) / 2 : clamp(x, loX, hiX),
    z: loZ > hiZ ? (b.minZ + b.maxZ) / 2 : clamp(z, loZ, hiZ),
  };
}

export interface FramingInput {
  /** Longest town side in metres. */
  townSize: number;
  /** Vertical field of view in degrees. */
  fovDeg: number;
  /** Viewport width and height in pixels. */
  viewW: number;
  viewH: number;
  /** Pixels at the right edge hidden under the settings panel (0 when collapsed or absent). */
  rightInset: number;
}

export interface Framing {
  position: V3;
  target: V3;
  distance: number;
}

/**
 * Whole-map framing. Same viewing direction as the old Whole map button (camera at 1.75 x size high and
 * 0.45 x size back, looking at the origin), then two panel-aware corrections:
 * - the distance grows if the town would not fit into the free width left of the panel;
 * - camera and target shift along +X so the town centre sits in the middle of the free area.
 */
export function wholeMapFraming(input: FramingInput): Framing {
  const { townSize, fovDeg, viewW, viewH, rightInset } = input;
  const inset = clamp(rightInset, 0, viewW * 0.5);
  const freeW = Math.max(1, viewW - inset);
  const dir: V3 = [0, 1.75, 0.45];
  const baseDist = Math.hypot(dir[1], dir[2]) * townSize;
  const tanV = Math.tan((fovDeg * Math.PI) / 360);
  const tanH = tanV * (viewW / Math.max(1, viewH));
  // Width the town needs at the target distance, with a 6% margin; the free area is freeW of viewW pixels.
  const fitDist = (townSize * 1.06) / (2 * tanH * (freeW / viewW));
  const distance = Math.max(baseDist, fitDist);
  const k = distance / Math.hypot(dir[1], dir[2]);
  // World metres per pixel across the target plane, then half the inset in metres.
  const metresPerPx = (2 * distance * tanH) / viewW;
  const shift = (inset / 2) * metresPerPx;
  return {
    position: [shift, dir[1] * k, dir[2] * k],
    target: [shift, 0, 0],
    distance,
  };
}

/** Camera position for an orbit around `target` at a compass azimuth, polar angle (from +Y) and distance. */
export function orbitPosition(target: V3, azimuth: number, polar: number, distance: number): V3 {
  return [
    target[0] + distance * Math.sin(polar) * Math.sin(azimuth),
    target[1] + distance * Math.cos(polar),
    target[2] + distance * Math.sin(polar) * Math.cos(azimuth),
  ];
}

/** Yaw of a horizontal direction for a camera looking along -Z at yaw 0 (rotation order YXZ). */
export function yawFromDir(dx: number, dz: number): number {
  return Math.atan2(-dx, -dz);
}

export function dirFromYaw(yaw: number): { x: number; z: number } {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}

function nearestOnSegment(
  px: number,
  pz: number,
  s: StreetSegment,
): { x: number; z: number; dist: number; t: number } {
  const dx = s.end.x - s.start.x;
  const dz = s.end.z - s.start.z;
  const len2 = dx * dx + dz * dz;
  const t = len2 === 0 ? 0 : clamp(((px - s.start.x) * dx + (pz - s.start.z) * dz) / len2, 0, 1);
  const x = s.start.x + dx * t;
  const z = s.start.z + dz * t;
  return { x, z, dist: Math.hypot(px - x, pz - z), t };
}

export interface StreetStart {
  x: number;
  z: number;
  yaw: number;
}

/**
 * Where the Street walk preset puts the eye: on the sidewalk of the road nearest to (px, pz), looking
 * along the road toward its longer remaining part. The side is the one the point lies on.
 */
export function streetStart(roads: readonly StreetSegment[], px: number, pz: number): StreetStart {
  let best: { seg: StreetSegment; hit: ReturnType<typeof nearestOnSegment> } | null = null;
  for (const seg of roads) {
    const hit = nearestOnSegment(px, pz, seg);
    if (!best || hit.dist < best.hit.dist) best = { seg, hit };
  }
  if (!best) return { x: 0, z: 0, yaw: 0 };
  const { seg, hit } = best;
  const dx = seg.end.x - seg.start.x;
  const dz = seg.end.z - seg.start.z;
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len;
  const uz = dz / len;
  // Walk toward the end with more road left.
  const sign = hit.t > 0.5 ? -1 : 1;
  // Sidewalk centre: half road width plus half the sidewalk, on the side of the query point.
  const nx = -uz;
  const nz = ux;
  const side = (px - hit.x) * nx + (pz - hit.z) * nz >= 0 ? 1 : -1;
  const off = seg.width / 2 + seg.sidewalkWidth / 2;
  return {
    x: hit.x + nx * side * off,
    z: hit.z + nz * side * off,
    yaw: yawFromDir(ux * sign, uz * sign),
  };
}

/**
 * Street walk step. `forward`/`strafe` are in [-1, 1]; returns the new position clamped inside the town
 * bounds (shrunk by `margin`). Run multiplies the speed.
 */
export function walkStep(
  x: number,
  z: number,
  yaw: number,
  forward: number,
  strafe: number,
  dt: number,
  run: boolean,
  bounds: Bounds,
  margin = 2,
): { x: number; z: number } {
  const speed = run ? 6 : 2.5;
  const f = dirFromYaw(yaw);
  // Right vector of the forward direction on the ground plane.
  const rx = -f.z;
  const rz = f.x;
  const len = Math.hypot(forward, strafe);
  const norm = len > 1 ? 1 / len : 1;
  const nx = x + (f.x * forward + rx * strafe) * norm * speed * dt;
  const nz = z + (f.z * forward + rz * strafe) * norm * speed * dt;
  return clampToBounds(nx, nz, bounds, margin);
}

/**
 * Pixels the right-hand panel occupies, from its DOM rectangle. 0 when the panel is collapsed or missing;
 * capped at half the viewport so a bottom sheet on a phone never pushes the framing off screen.
 */
export function panelInset(rectLeft: number | null, viewW: number, collapsed: boolean): number {
  if (rectLeft === null || collapsed) return 0;
  return clamp(viewW - rectLeft + 8, 0, viewW * 0.5);
}
