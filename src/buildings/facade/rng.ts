// Small deterministic random helpers for house detail variation.

export interface Rng {
  /** Uniform in [0, 1). */
  (): number;
}

/** Mulberry32 seeded generator. Same seed, same sequence. */
export function makeRng(seed: number): Rng {
  let a = (Math.floor(seed) ^ 0x9e3779b9) >>> 0;
  // Warm up so that nearby seeds diverge quickly.
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next();
  next();
  return next;
}

/** Hashes numbers and strings into a 32-bit seed. */
export function hashSeed(...parts: (number | string)[]): number {
  let h = 2166136261 >>> 0;
  for (const p of parts) {
    const s = String(p);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    h ^= 0xff;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

export function range(rng: Rng, lo: number, hi: number): number {
  return lo + (hi - lo) * rng();
}

export function int(rng: Rng, lo: number, hi: number): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

export function pick<T>(rng: Rng, list: readonly T[]): T {
  return list[Math.floor(rng() * list.length) % list.length];
}

export function chance(rng: Rng, p: number): boolean {
  return rng() < p;
}
