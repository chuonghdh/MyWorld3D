// Geometry and algorithm constants of the auto film path (not designer knobs; see docs/TUNING.md "not yet tunable").
// Shared by filmPath.ts (planner), filmPathPlan.ts (descent and perch search) and filmPathKeys.ts (keyframes).
import { CLOUD_TOP_MAX } from '../environment/cloudSprites';
import { ALTITUDE_MAX, CAMERA_SAFETY_MARGIN } from '../aircraft/schedule';
import { APPROACH_M } from './filmPathField';

export const FILM_SALT = 0x5f11d;
/** Descent candidates: the seeded pick is made among this many clear roads nearest the town centre. */
export const DESCENT_POOL = 3;
/** Ring radius around the cathedral: half the block plus this pad, metres. */
export const RING_PAD_M = 15;
/** Ring radius without a cathedral, as a fraction of the town half size. */
export const FALLBACK_RING_FRACTION = 0.3;
/** Town orbit radius as a fraction of the town half size (shrunk when the speed cap needs it). */
export const ORBIT_FRACTION = 0.6;
/** Sweep of the town orbit, radians (a half turn). */
export const ORBIT_SWEEP = Math.PI;
/** Speed cap by height above the floor (m/s at metres): LOW at or below LOW_H, rising linearly to HIGH at the start
 * height (a fast opening descent). The town orbit shrinks while the capped profile does not fit the flight. Not designer knobs. */
export const LOW_CAP_MPS = 28;
export const LOW_CAP_H_M = 30;
export const HIGH_CAP_MPS = 120;
/** Speed ramp (m/s^2) at or below LOW_CAP_H_M and at the start height, linear between: a fast opening descent. */
export const LOW_ACCEL = 2;
export const HIGH_ACCEL = 12;
/** Low-band cap scale search: bisection steps when the capped profile is shorter than the flight. */
export const FIT_STEPS = 14;
export const MIN_ORBIT_SCALE = 0.3;
export const MIN_RING_SCALE = 0.6;
/** Shrinking stops before it makes the tightest bend smaller than this radius, metres. */
export const MIN_BEND_M = 15;
export const ORBIT_SHRINK = 0.9;
/** Camera margin inside the town bounds, metres. */
export const BOUNDS_MARGIN_M = 2;
/** Overview start height as a multiple of the cruise height. */
export const OVERVIEW_Y_FACTOR = 2;
/** Distance of the sky and descent look targets, metres. */
export const LOOK_DIST_M = 300;
export const DESCENT_LOOK_M = 60;
/** Ring exit search: sweep angles tried on the cathedral ring. */
export const RING_SWEEP_SAMPLES = 72;
/** Forward finale (steps 5 and 6), metres along the road: climb point this far before the perch, street ride ending
 * and a ride of at least this length. */
export const CLIMB_RUN_M = APPROACH_M * 0.75;
export const MIN_RIDE_M = APPROACH_M / 2;
/** Perch spec: lot within this distance of the cathedral block, front within acos(PERCH_FACING_COS) of it, and the
 * facade point it looks at this high (metres). */
export const PERCH_NEAR_M = 45;
export const PERCH_FACING_COS = 0.5;
export const FACADE_VIEW_M = 8;
export const VIEW_SAMPLES = 32;
/** Wide climbing turn before the perch (user spec: 60 m or more), metres; samples and key spacing (rad) of its sweep,
 * and the largest angle between its exit heading and the line to the perch (rad). Ride end search step, metres. */
export const TURN_RADIUS_M = 60;
export const ARC_SAMPLES = 144;
export const ARC_KEY_STEP = Math.PI / 4;
export const ARC_FIRST_STEP = Math.PI / 12;
export const ARC_EXIT_TOL = Math.PI / 12;
export const RIDE_STEP_M = 5;
/** Arc exit at least this many approach lengths from the perch (room for the straight approach and the drop). */
export const ARC_EXIT_GAP = 1.25;
/** Film start height: above the cloud tops and the highest aircraft, by the aircraft's own camera margin. */
export const START_HEIGHT_M = Math.max(CLOUD_TOP_MAX, ALTITUDE_MAX) + CAMERA_SAFETY_MARGIN;
/** Route samples this far below cruise height keep their line (descent street, perch drop): not smoothed sideways. */
export const PIN_DROP_M = 10;
export const TAU = 2 * Math.PI;
