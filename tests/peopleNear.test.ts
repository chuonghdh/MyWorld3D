// Near and far person models (T-0023). Far detail must stay exactly as before T-0023; near detail is the smooth model.
// Ranges (triangles per person, all parts including hidden hair styles, garments and beard):
//   far  350 to 480 (today 376 for every age group), near 900 to 1400 (today 1296).
import { describe, expect, it } from 'vitest';
import { PART, buildPerson, triangleCount } from '../src/traffic/people/personGeometry';

const KINDS = ['adult', 'child', 'elder', 'teen'] as const;
// Weighted position sums recorded before T-0023 changed anything (far model, male shape plus morph is in aMorph).
const FAR_POSITION_SUM = { adult: 69673.0206, child: 44885.3455, elder: 72361.1891, teen: 60652.4458 };

function weightedSum(a: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * ((i % 97) + 1);
  return s;
}

describe('person detail levels', () => {
  it('keeps the far model identical to the pre-T-0023 one', () => {
    for (const kind of KINDS) {
      const g = buildPerson(kind, 'far').geometry;
      expect(triangleCount(g)).toBe(376);
      expect(weightedSum(g.getAttribute('position').array as Float32Array)).toBeCloseTo(FAR_POSITION_SUM[kind], 1);
    }
  });

  it('builds the near model in 900 to 1400 triangles with finite data and unit normals', () => {
    for (const kind of KINDS) {
      const m = buildPerson(kind, 'near');
      const tris = triangleCount(m.geometry);
      expect(tris).toBeGreaterThanOrEqual(900);
      expect(tris).toBeLessThanOrEqual(1400);
      for (const name of ['position', 'normal', 'aMorph', 'aMorphN', 'color', 'aRig']) {
        const a = m.geometry.getAttribute(name).array as Float32Array;
        expect(a.every((v) => Number.isFinite(v))).toBe(true);
      }
      const n = m.geometry.getAttribute('normal').array as Float32Array;
      for (let i = 0; i < n.length; i += 3) expect(Math.hypot(n[i], n[i + 1], n[i + 2])).toBeGreaterThan(0.99);
    }
  });

  it('gives near and far the same pivots, so the shared materials stay valid', () => {
    for (const kind of KINDS) {
      const f = buildPerson(kind, 'far');
      const n = buildPerson(kind, 'near');
      expect([n.hip, n.shoulder, n.neck, n.headTop, n.seatDrop]).toEqual([f.hip, f.shoulder, f.neck, f.headTop, f.seatDrop]);
    }
  });

  it('keeps every far part in the near model, with the same pivots per part', () => {
    const pivots = (kind: (typeof KINDS)[number], detail: 'far' | 'near'): Map<number, string> => {
      const rig = buildPerson(kind, detail).geometry.getAttribute('aRig').array as Float32Array;
      const out = new Map<number, string>();
      for (let v = 0; v < rig.length; v += 4) out.set(rig[v], `${rig[v + 2].toFixed(4)},${rig[v + 3].toFixed(4)}`);
      return out;
    };
    for (const kind of KINDS) {
      const far = pivots(kind, 'far');
      const near = pivots(kind, 'near');
      // The moustache is drawn by the near face shader (T-0024), so its part has no near geometry.
      for (const [part] of far) if (part !== PART.MOUSTACHE) expect(near.has(part)).toBe(true);
      expect(near.has(PART.HEAD)).toBe(true);
    }
  });

  it('morphs near women only in width, like the far model', () => {
    for (const kind of KINDS) {
      const morph = buildPerson(kind, 'near').geometry.getAttribute('aMorph').array as Float32Array;
      let maxDy = 0;
      let maxDx = 0;
      for (let i = 0; i < morph.length; i += 3) {
        maxDy = Math.max(maxDy, Math.abs(morph[i + 1]));
        maxDx = Math.max(maxDx, Math.abs(morph[i]));
      }
      expect(maxDy).toBe(0);
      expect(maxDx).toBeGreaterThan(0.001);
    }
  });

  it('keeps the near model inside the far height range', () => {
    for (const kind of KINDS) {
      const f = buildPerson(kind, 'far').geometry;
      const n = buildPerson(kind, 'near').geometry;
      f.computeBoundingBox();
      n.computeBoundingBox();
      expect(n.boundingBox!.min.y).toBeGreaterThanOrEqual(f.boundingBox!.min.y - 0.01);
      expect(n.boundingBox!.max.y).toBeLessThanOrEqual(f.boundingBox!.max.y + 0.05);
    }
  });
});
