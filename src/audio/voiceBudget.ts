// Keeps the N nearest sources "voiced" with a stable assignment. A source that already holds a voice
// is only displaced when a candidate is clearly nearer (distance * (1 + hysteresis) < holder's distance),
// so voices do not thrash between two similar-distance sources every frame.

export interface VoiceCandidate<T> {
  key: number | string;
  /** Distance to the listener in metres. */
  distance: number;
  item: T;
}

export interface VoiceBudgetOptions<T> {
  /** Maximum simultaneous voices. */
  max: number;
  /** Relative margin a newcomer must win by to steal a voice. Default 0.2. */
  hysteresis?: number;
  /** Sources farther than this never hold a voice. Default Infinity. */
  maxDistance?: number;
  onAcquire: (key: number | string, item: T) => void;
  onRelease: (key: number | string, item: T) => void;
}

interface Holder<T> {
  distance: number;
  item: T;
}

export class VoiceBudget<T> {
  private readonly max: number;
  private readonly hysteresis: number;
  private readonly maxDistance: number;
  private readonly onAcquire: (key: number | string, item: T) => void;
  private readonly onRelease: (key: number | string, item: T) => void;
  private readonly held = new Map<number | string, Holder<T>>();

  constructor(opts: VoiceBudgetOptions<T>) {
    this.max = Math.max(0, Math.floor(opts.max));
    this.hysteresis = opts.hysteresis ?? 0.2;
    this.maxDistance = opts.maxDistance ?? Infinity;
    this.onAcquire = opts.onAcquire;
    this.onRelease = opts.onRelease;
  }

  get size(): number {
    return this.held.size;
  }

  has(key: number | string): boolean {
    return this.held.has(key);
  }

  keys(): IterableIterator<number | string> {
    return this.held.keys();
  }

  /** Re-evaluates the assignment for this frame. Candidates may be in any order. */
  update(candidates: readonly VoiceCandidate<T>[]): void {
    const byKey = new Map<number | string, VoiceCandidate<T>>();
    for (const c of candidates) byKey.set(c.key, c);

    // Release vanished or out-of-range holders; refresh the rest.
    for (const [key, h] of [...this.held]) {
      const c = byKey.get(key);
      if (!c || c.distance > this.maxDistance) {
        this.held.delete(key);
        this.onRelease(key, h.item);
      } else {
        h.distance = c.distance;
        h.item = c.item;
      }
    }

    const waiting = candidates
      .filter((c) => !this.held.has(c.key) && c.distance <= this.maxDistance)
      .sort((a, b) => a.distance - b.distance);
    for (const c of waiting) {
      if (this.held.size < this.max) {
        this.acquire(c);
        continue;
      }
      let farKey: number | string | null = null;
      let far = -1;
      for (const [k, h] of this.held) {
        if (h.distance > far) {
          far = h.distance;
          farKey = k;
        }
      }
      if (farKey === null || !(c.distance * (1 + this.hysteresis) < far)) break;
      const old = this.held.get(farKey) as Holder<T>;
      this.held.delete(farKey);
      this.onRelease(farKey, old.item);
      this.acquire(c);
    }
  }

  /** Releases every voice. */
  clear(): void {
    for (const [key, h] of [...this.held]) {
      this.held.delete(key);
      this.onRelease(key, h.item);
    }
  }

  private acquire(c: VoiceCandidate<T>): void {
    this.held.set(c.key, { distance: c.distance, item: c.item });
    this.onAcquire(c.key, c.item);
  }
}
