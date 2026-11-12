// Per-walker render motion state (T-0029): a smoothed render heading, a smoothed signed turn rate and a gait ramp, so turns,
// starts and stops read as body motion instead of snaps. Render only: the simulation heading, positions and routes are not
// touched (the walkers keep TURN_RATE). Typed arrays keyed by id % slots, reset when another id takes a slot, dt from begin();
// pure and allocation-free after construction (same pattern as gaitPhase.ts).

const TWO_PI = Math.PI * 2;
/** Largest step honoured, in seconds: a tab switch or a hitch must not spin or ramp a person. */
const MAX_DT = 0.25;
/** The turn rate (the lean signal) follows the actual turning with this time constant, seconds. */
const TURN_SMOOTH_S = 0.15;

/** Shortest signed angle from `from` to `to`, in (-pi, pi]. */
export function shortestAngle(from: number, to: number): number {
  let d = (to - from) % TWO_PI;
  if (d > Math.PI) d -= TWO_PI;
  else if (d <= -Math.PI) d += TWO_PI;
  return d;
}

export class BodyMotion {
  private readonly head: Float64Array;
  private readonly turn: Float64Array;
  private readonly ramps: Float64Array;
  private readonly owner: Int32Array;
  private lastTime = Number.NaN;
  private dt = 0;
  /** Results of the last step(): the render heading (rad), the turn in -1..1 (positive turns toward +x, the left) and the gait ramp 0..1. */
  heading = 0;
  turnUnit = 0;
  ramp = 0;

  /** `turnRate` is the visible turn speed in rad/s, `rampS` the time in seconds a walk takes to fade in or out. */
  constructor(slots: number, private readonly turnRate: number, private readonly rampS: number) {
    this.head = new Float64Array(slots);
    this.turn = new Float64Array(slots);
    this.ramps = new Float64Array(slots);
    this.owner = new Int32Array(slots).fill(-1);
  }

  /** Call once per frame with the sim time. A step backwards (pause, rewind) or the first call gives dt 0. */
  begin(time: number): void {
    const d = time - this.lastTime;
    this.dt = d > 0 ? Math.min(d, MAX_DT) : 0;
    this.lastTime = time;
  }

  /** Advances the walker toward the sim heading and the walking flag; read the results from the fields. */
  step(id: number, simHeading: number, walking: boolean): void {
    const n = this.head.length;
    const slot = ((id % n) + n) % n;
    if (this.owner[slot] !== id) {
      // A person seen for the first time (or a reused slot) starts at the sim heading and, if walking, fully in the gait.
      this.owner[slot] = id;
      this.head[slot] = simHeading;
      this.turn[slot] = 0;
      this.ramps[slot] = walking ? 1 : 0;
    }
    const dt = this.dt;
    const delta = shortestAngle(this.head[slot], simHeading);
    const maxStep = this.turnRate * dt;
    const step = Math.max(-maxStep, Math.min(maxStep, delta));
    // Within one step of the target the render heading IS the sim heading (exactly, so a settled walker is bit-identical to the sim).
    let h = Math.abs(delta) <= maxStep ? simHeading : this.head[slot] + step;
    if (h !== simHeading) h -= Math.floor((h + Math.PI) / TWO_PI) * TWO_PI;
    this.head[slot] = h;
    if (dt > 0) {
      const k = Math.min(1, dt / TURN_SMOOTH_S);
      this.turn[slot] += (step / dt - this.turn[slot]) * k;
    }
    const r = this.ramps[slot] + (walking ? 1 : -1) * (this.rampS > 0 ? dt / this.rampS : 1);
    this.ramps[slot] = Math.max(0, Math.min(1, r));
    this.heading = this.head[slot];
    this.turnUnit = this.turnRate > 0 ? Math.max(-1, Math.min(1, this.turn[slot] / this.turnRate)) : 0;
    this.ramp = this.ramps[slot];
  }
}
