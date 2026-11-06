// Keyframes of the auto film route for one orbit scale (steps 1 to 6 of docs/feature_video_camera.md 3.3).
// Pure: the planner (filmPath.ts) fills a KeyContext once, then calls buildKeys again when the town orbit shrinks.
import { film } from '../config/tuning';
import type { Rect } from '../city/layout';
import { wholeMapFraming, clampToBounds, type V3 } from './cameraMath';
import { APPROACH_M, floorAt, type HeightField } from './filmPathField';
import { SKIM_HEIGHT_M } from './filmRoute';
import {
  BOUNDS_MARGIN_M,
  DESCENT_LOOK_M,
  LOOK_DIST_M,
  MIN_RING_SCALE,
  OVERVIEW_Y_FACTOR,
  ORBIT_FRACTION,
  ORBIT_SWEEP,
  RING_SWEEP_SAMPLES,
  START_HEIGHT_M,
  TAU,
} from './filmPathConsts';
import type { FilmKey } from './filmPath';

/** Values the planner fixes once per path; buildKeys reads them for every orbit scale. */
export interface KeyContext {
  f: HeightField;
  tb: Rect;
  fovDeg: number;
  cruiseY: number;
  cx: number;
  cz: number;
  half: number;
  cathCx: number;
  cathCz: number;
  ringR: number;
  limits: Rect;
  focus: V3;
  sx0: number;
  sz0: number;
  sx: number;
  sz: number;
  rx: number;
  rz: number;
  ex: number;
  ez: number;
  skyPos: V3;
  skyDir: V3;
  arcKeys: V3[];
  perchApproach: V3;
  perchPos: V3;
  perchTarget: V3;
}

function circlePos(cx: number, cz: number, r: number, a: number, y: number): V3 {
  return [cx + r * Math.sin(a), y, cz + r * Math.cos(a)];
}

function clampedXZ(p: V3, b: Rect): V3 {
  const c = clampToBounds(p[0], p[2], b, BOUNDS_MARGIN_M);
  return [c.x, p[1], c.z];
}

/** Builds the keyframes for an orbit scale (1 = full town orbit, smaller when the speed cap needs a tighter one). */
export function buildKeys(c: KeyContext, scale: number): FilmKey[] {
  const { f, tb, fovDeg, cruiseY, cx, cz, half, cathCx, cathCz, ringR, limits, focus } = c;
  const { sx0, sz0, sx, sz, rx, rz, ex, ez, skyPos, skyDir, arcKeys, perchApproach, perchPos, perchTarget } = c;
  const skim = SKIM_HEIGHT_M;
  const orbitR = half * ORBIT_FRACTION * scale;
  const keys: FilmKey[] = [];
  const framing = wholeMapFraming({ townSize: 2 * half, fovDeg, viewW: film.width1080, viewH: film.height1080, rightInset: 0 });
  const over = clampedXZ([...framing.position] as V3, tb);
  // Opening: at rest high above the clouds and the aircraft, then down into the overview.
  keys.push({ step: 1, position: [over[0], START_HEIGHT_M, over[2]], target: [...framing.target] as V3 });
  keys.push({ step: 1, position: [over[0], cruiseY * OVERVIEW_Y_FACTOR, over[2]], target: [...framing.target] as V3 });
  // Step 2: town orbit, a half turn at cruise height, entered on the tangent that continues the overview heading
  // (from the overview point toward the town centre). Side: the one whose half turn ends nearer the cathedral.
  const townTarget: V3 = [cx, 0, cz];
  const ohx = cx - over[0];
  const ohz = cz - over[2];
  const ohl = Math.hypot(ohx, ohz) || 1;
  const h0x = ohx / ohl;
  const h0z = ohz / ohl;
  const entryAngle = (d: number, hx: number, hz: number): number => (d > 0 ? Math.atan2(-hz, hx) : Math.atan2(hz, -hx));
  const orbitEndFor = (d: number): V3 => circlePos(cx, cz, orbitR, entryAngle(d, h0x, h0z) + d * ORBIT_SWEEP, cruiseY);
  const od = Math.hypot(orbitEndFor(1)[0] - cathCx, orbitEndFor(1)[2] - cathCz) <= Math.hypot(orbitEndFor(-1)[0] - cathCx, orbitEndFor(-1)[2] - cathCz) ? 1 : -1;
  const a0 = entryAngle(od, h0x, h0z);
  for (const a of [a0, a0 + (od * ORBIT_SWEEP) / 2, a0 + od * ORBIT_SWEEP]) {
    keys.push({ step: 2, position: clampedXZ(circlePos(cx, cz, orbitR, a, cruiseY), tb), target: townTarget });
  }
  // Step 3: cathedral ring at cruise height. Entered on the tangent that continues the orbit's exit heading (the
  // candidate entry point most ahead with the least side offset), then swept until the ring heading points at the
  // road entry and that line runs on into the road. The ring shrinks with the orbit, down to MIN_RING_SCALE (it
  // flies above every roof, so a smaller ring cannot clip).
  const orbitEnd = keys[keys.length - 1]!.position;
  const aOut = a0 + od * ORBIT_SWEEP;
  const hx = od * Math.cos(aOut);
  const hz = -od * Math.sin(aOut);
  const rr = ringR * Math.max(MIN_RING_SCALE, scale);
  // Ring centre moved inward when the ring would leave the town (clamping keys bent it into a tight kink).
  const rcx = Math.min(limits.maxX - rr, Math.max(limits.minX + rr, cathCx));
  const rcz = Math.min(limits.maxZ - rr, Math.max(limits.minZ + rr, cathCz));
  const ringAt = (ang: number): V3 => circlePos(rcx, rcz, rr, ang, cruiseY);
  const entryScore = (d: number): number => {
    const q = ringAt(entryAngle(d, hx, hz));
    const dx = q[0] - orbitEnd[0];
    const dz = q[2] - orbitEnd[2];
    const fwd = dx * hx + dz * hz;
    const side = Math.abs(dx * hz - dz * hx);
    return (fwd > 0 ? 0 : -1e6 + fwd) - side;
  };
  const rd = entryScore(1) >= entryScore(-1) ? 1 : -1;
  const aR = entryAngle(rd, hx, hz);
  const qx = sx0;
  const qz = sz0;
  let sweep = Math.PI;
  let bestSweep = -Infinity;
  for (let i = 1; i < RING_SWEEP_SAMPLES; i++) {
    const phi = (i / RING_SWEEP_SAMPLES) * TAU;
    const ang = aR + rd * phi;
    const xp = ringAt(ang);
    const ex0 = rd * Math.cos(ang);
    const ez0 = -rd * Math.sin(ang);
    const lx = qx - xp[0];
    const lz = qz - xp[2];
    const ll = Math.hypot(lx, lz) || 1;
    const score = (ex0 * lx + ez0 * lz) / ll + (lx * rx + lz * rz) / ll;
    if (score > bestSweep) {
      bestSweep = score;
      sweep = phi;
    }
  }
  const ringKeys = Math.max(2, Math.ceil(sweep / (Math.PI / 2)));
  for (let i = 0; i <= ringKeys; i++) {
    keys.push({ step: 3, position: ringAt(aR + (rd * sweep * i) / ringKeys), target: focus });
  }
  // Step 4: cruise to the approach point, drop onto the street, ride to the far end.
  keys.push({ step: 4, position: [sx - rx * APPROACH_M, cruiseY, sz - rz * APPROACH_M], target: [ex, skim * 0.5, ez] });
  keys.push({ step: 4, position: [sx, skim, sz], target: [ex, skim * 0.5, ez] });
  keys.push({ step: 4, position: [ex, skim, ez], target: [ex + rx * DESCENT_LOOK_M, skim * 0.5, ez + rz * DESCENT_LOOK_M] });
  // Step 5: climb and tilt toward the sun or moon. A mid-climb key still looks level along the road, so the sky
  // tilt is a brief peak at the climb point rather than the whole climb.
  const midY = (skim + skyPos[1]) / 2;
  keys.push({ step: 5, position: [(ex + skyPos[0]) / 2, midY, (ez + skyPos[2]) / 2], target: [skyPos[0] + rx * DESCENT_LOOK_M, midY, skyPos[2] + rz * DESCENT_LOOK_M] });
  keys.push({ step: 5, position: skyPos, target: [skyPos[0] + skyDir[0] * LOOK_DIST_M, cruiseY + skyDir[1] * LOOK_DIST_M, skyPos[2] + skyDir[2] * LOOK_DIST_M] });
  // Step 6: cruise over to the perch approach, descend onto the roof.
  for (const q of arcKeys) keys.push({ step: 5, position: q, target: perchTarget });
  keys.push({ step: 6, position: perchApproach, target: perchTarget });
  // Midpoint of the final drop: the spline bulges between the approach and the perch, so the knot keeps
  // the bulge above the roofs beside the perch (the height lift would otherwise move the perch itself).
  const from = perchApproach;
  const mx = (from[0] + perchPos[0]) / 2;
  const mz = (from[2] + perchPos[2]) / 2;
  const my = Math.max((from[1] + perchPos[1]) / 2, floorAt(f, mx, mz) + SKIM_HEIGHT_M);
  keys.push({ step: 6, position: [mx, my, mz], target: perchTarget });
  keys.push({ step: 6, position: perchPos, target: perchTarget });
  return keys;
}
