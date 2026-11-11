// Per-walker walk-cycle angle, integrated on the CPU so a change of cadence (stop, start, rain, speed change)
// never makes the legs jump. The shader used to compute uTime * omega + phase, which jumps by uTime * delta omega
// whenever omega changes. Now the angle is advanced by omega * dt each frame and sent as aGait.x.
// Pure and allocation-free after construction.

const TWO_PI = Math.PI * 2;
/** Largest step honoured, in seconds: a tab switch or a hitch must not spin the legs. */
const MAX_DT = 0.25;

export class GaitPhase {
  private readonly angle: Float32Array;
  private readonly owner: Int32Array;
  private lastTime = Number.NaN;
  private dt = 0;

  /** `slots` bounds the table; ids map to id % slots and a slot is reset when another id takes it. */
  constructor(slots: number) {
    this.angle = new Float32Array(slots);
    this.owner = new Int32Array(slots).fill(-1);
  }

  /** Call once per frame with the sim time. A step backwards (pause, rewind) or the first call gives dt 0. */
  begin(time: number): void {
    const d = time - this.lastTime;
    this.dt = d > 0 ? Math.min(d, MAX_DT) : 0;
    this.lastTime = time;
  }

  /** Advances the walker's angle by omega * dt and returns it in [0, 2pi). omega 0 holds the angle. */
  step(id: number, omega: number): number {
    const slot = ((id % this.angle.length) + this.angle.length) % this.angle.length;
    if (this.owner[slot] !== id) {
      this.owner[slot] = id;
      this.angle[slot] = 0;
    }
    let a = this.angle[slot] + omega * this.dt;
    a -= Math.floor(a / TWO_PI) * TWO_PI;
    this.angle[slot] = a;
    return a;
  }
}
