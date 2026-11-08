// Camera presets and limits, derived from layout.ts (pure). Layout edits move the presets with them.
import type { AgentId } from '../model/types';
import type { Insets, PresetId } from '../ui/uiStore';
import { DISCUSS, ROOM, SPECIALISTS, WALL_SCREEN, deskPose } from './layout';

export type V3 = [number, number, number];
export interface CameraPose {
  pos: V3;
  target: V3;
}

/** Overview direction (unit-ish, up and back) and its length factor on viewDistance. */
const OVERVIEW_DIR: V3 = [0.42, 0.66, 0.72]; // high three-quarter view
const OVERVIEW_K = 1.0;
const DESK_UP = 3.8;
const PANTRY_MID_Z = 5;
const DESK_BACK = 5.5;

export const PRESET_ORDER: readonly PresetId[] = ['overview', 'hub', 'wall', ...SPECIALISTS];

export const LIMITS = {
  minDistance: 3.5,
  maxDistance: 60, // narrow windows need the overview this far to fit the whole office
  minPolar: 0.18,
  maxPolar: 1.36,
  x: [-ROOM.halfW + 1, ROOM.halfW - 1] as const,
  y: [0, 3] as const,
  z: [-ROOM.halfD + 1, ROOM.halfD - 1] as const,
};

/** Mean z of the desks: the overview looks at the middle of the desk arc. */
export function deskCentroidZ(): number {
  return SPECIALISTS.reduce((s, id) => s + deskPose(id).pos.z, 0) / SPECIALISTS.length;
}

function norm(v: V3): V3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

export function presetPose(id: PresetId, viewDistance: number, focusDistance: number): CameraPose {
  if (id === 'overview') {
    // Whole office: desks, board, pantry and door; aim between the desk arc and the front zones.
    const t: V3 = [0.6, 0.4, (deskCentroidZ() + PANTRY_MID_Z) / 2];
    const d = norm(OVERVIEW_DIR);
    const k = viewDistance * OVERVIEW_K;
    return { target: t, pos: [t[0] + d[0] * k, t[1] + d[1] * k, t[2] + d[2] * k] };
  }
  if (id === 'hub') return { target: [DISCUSS.x, 0.9, DISCUSS.z], pos: [DISCUSS.x + 1.5, 6.0, DISCUSS.z + 7.0] };
  // Target stays inside the clamp (1 m in front of the wall); the view still centres on the screen.
  if (id === 'wall') return { target: [WALL_SCREEN.x, WALL_SCREEN.y, LIMITS.z[0]], pos: [WALL_SCREEN.x, 3.0, 0.5] };
  if (id === 'lead' || id === 'guest') return presetPose('hub', viewDistance, focusDistance);
  const { pos } = deskPose(id as AgentId);
  const t: V3 = [pos.x, 0.9, pos.z];
  // From the front (where the agent works), looking back over its shoulder at the desk.
  const off = norm([0, DESK_UP, DESK_BACK]);
  return { target: t, pos: [t[0] + off[0] * focusDistance, t[1] + off[1] * focusDistance, t[2] + off[2] * focusDistance] };
}

export function clampTarget(t: V3): V3 {
  const c = (v: number, [a, b]: readonly [number, number]) => Math.min(b, Math.max(a, v));
  return [c(t[0], LIMITS.x), c(t[1], LIMITS.y), c(t[2], LIMITS.z)];
}

/** Office footprint corners the overview must show: floor corners and the tops of the back and left walls. */
export const OVERVIEW_CORNERS: readonly V3[] = [
  [-ROOM.halfW, 0, -ROOM.halfD],
  [ROOM.halfW, 0, -ROOM.halfD],
  [-ROOM.halfW, 0, ROOM.halfD],
  [ROOM.halfW, 0, ROOM.halfD],
  [-ROOM.halfW, ROOM.wallH, -ROOM.halfD],
  [ROOM.halfW, ROOM.wallH, -ROOM.halfD],
  [-ROOM.halfW, ROOM.wallH, ROOM.halfD],
  [ROOM.halfW, ROOM.wallH, ROOM.halfD],
];
export const OVERVIEW_FIT = { dir: [0, 0.68, 0.73] as V3, target: [0, 0.4, 0.2] as V3, pad: 0.08 };

/** NDC of a world point for a camera at `pos` looking at `target` (vertical fov in degrees, aspect = w / h). */
export function projectNdc(p: V3, pos: V3, target: V3, fovDeg: number, aspect: number): [number, number] {
  const f = norm([target[0] - pos[0], target[1] - pos[1], target[2] - pos[2]]);
  const r = norm([f[1] * 0 - f[2] * 1, f[2] * 0 - f[0] * 0, f[0] * 1 - f[1] * 0]); // f x up(0,1,0)
  const u: V3 = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const v: V3 = [p[0] - pos[0], p[1] - pos[1], p[2] - pos[2]];
  const zc = v[0] * f[0] + v[1] * f[1] + v[2] * f[2];
  const t = Math.tan((fovDeg * Math.PI) / 360);
  return [(v[0] * r[0] + v[1] * r[1] + v[2] * r[2]) / (zc * t * aspect), (v[0] * u[0] + v[1] * u[1] + v[2] * u[2]) / (zc * t)];
}

/** Overview pose whose distance is the smallest that keeps every corner inside the free area minus padding. */
export function overviewFit(w: number, h: number, insets: Insets, fovDeg: number): CameraPose {
  const { dir, target, pad } = OVERVIEW_FIT;
  const d = norm(dir);
  const limX = (Math.max(1, w - insets.left - insets.right) / w) * (1 - pad);
  const limY = (Math.max(1, h - insets.top - insets.bottom) / h) * (1 - pad);
  const fits = (dist: number) => {
    const pos: V3 = [target[0] + d[0] * dist, target[1] + d[1] * dist, target[2] + d[2] * dist];
    return OVERVIEW_CORNERS.every((c) => {
      const [x, y] = projectNdc(c, pos, target, fovDeg, w / h);
      return Math.abs(x) <= limX && Math.abs(y) <= limY;
    });
  };
  let lo = 4;
  let hi = LIMITS.maxDistance;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) hi = mid;
    else lo = mid;
  }
  return { target, pos: [target[0] + d[0] * hi, target[1] + d[1] * hi, target[2] + d[2] * hi] };
}

/** Frame-rate independent damping factor for rate lambda (per second). */
export function dampK(lambda: number, dt: number): number {
  return 1 - Math.exp(-lambda * dt);
}

/** Distance multiplier so the scene fits the free area between panels. */
export function fitScale(w: number, h: number, insets: Insets, fitMax: number): number {
  const fw = Math.max(1, w - insets.left - insets.right);
  const fh = Math.max(1, h - insets.top - insets.bottom);
  return Math.min(fitMax, Math.max(1, (1.17 * h) / fw, (0.96 * h) / fh));
}

/** View offset (px) that centres the target in the free area: pass to camera.setViewOffset(w, h, x, y, w, h). */
export function viewShift(insets: Insets): { x: number; y: number } {
  return { x: -(insets.left - insets.right) / 2, y: -(insets.top - insets.bottom) / 2 };
}
