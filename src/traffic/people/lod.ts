// Distance LOD classifier for people: near or far mesh set. Pure and allocation-free after construction.
// Hysteresis: a far person enters the near set inside `radius`, a near person leaves it beyond `radius + margin`,
// so someone standing on the border does not flip every frame. State is one byte per walker slot (id % slots).
// The per-group cap is the caller's `allowed` flag: first come, first served, deterministic in list order.

export class NearClassifier {
  private readonly near: Uint8Array;
  private readonly owner: Int32Array;
  private readonly enter2: number;
  private readonly leave2: number;

  constructor(slots: number, radius: number, margin: number) {
    this.near = new Uint8Array(slots);
    this.owner = new Int32Array(slots).fill(-1);
    this.enter2 = radius * radius;
    const out = radius + Math.max(0, margin);
    this.leave2 = out * out;
  }

  /** True when the walker draws from the near set. `dist2` is the squared camera distance; `allowed` is false when the near set is full. */
  classify(id: number, dist2: number, allowed: boolean): boolean {
    const n = this.near.length;
    const slot = ((id % n) + n) % n;
    if (this.owner[slot] !== id) {
      this.owner[slot] = id;
      this.near[slot] = 0;
    }
    const was = this.near[slot] === 1;
    const now = allowed && dist2 <= (was ? this.leave2 : this.enter2);
    this.near[slot] = now ? 1 : 0;
    return now;
  }
}
