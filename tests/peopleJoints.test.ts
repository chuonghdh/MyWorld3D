// Joint coverage (T-0032). The thigh and the upper arm are tubes that end at the knee and the elbow; the shin and the
// forearm swing about that pivot (rigShaderGlsl.ts rotYZ, pivot aRig.zw). Where the tubes end open, bending the
// joint opens a see-through wedge. This test rotates the open end of the upper limb about the pivot (in the lower
// limb's frame) by the largest angles the shader uses and checks that surface of the lower limb part reaches at
// least as far from the pivot, along the same direction, as the rim point does. A closing element on the lower limb
// (a knee or elbow ball) passes; open tubes do not.
import { describe, expect, it } from 'vitest';
import { PART, REGION, buildPerson, type BodyKind } from '../src/traffic/people/personGeometry';

type V = [number, number, number];
/** Slack in metres: 2 mm, far below what shows (the model is 1.8 m tall). */
const TOLERANCE = 0.002;
const KINDS: BodyKind[] = ['adult', 'child', 'elder', 'teen'];

interface Joint {
  name: string;
  upper: number;
  lower: number;
  angles: number[];
}
// Knee: sitting is 1.45 rad, the walking swing up to about 1.2. Elbow: umbrella 0.75, chat 1.25 (the test used to stop at 0.9), sitting 0.6.
const JOINTS: Joint[] = [
  { name: 'left knee', upper: PART.THIGH_L, lower: PART.SHIN_L, angles: [0.3, 0.6, 0.9, 1.2, 1.45] },
  { name: 'right knee', upper: PART.THIGH_R, lower: PART.SHIN_R, angles: [0.3, 0.6, 0.9, 1.2, 1.45] },
  { name: 'left elbow', upper: PART.ARM_L, lower: PART.FORE_L, angles: [0.3, 0.6, 0.9, 1.25] },
  { name: 'right elbow', upper: PART.ARM_R, lower: PART.FORE_R, angles: [0.3, 0.6, 0.9, 1.25] },
];

function partVertices(pos: Float32Array, rig: Float32Array, morph: Float32Array, sex: number, part: number, skipShoes = false): V[] {
  const out: V[] = [];
  for (let v = 0; v < rig.length / 4; v++) {
    if (Math.round(rig[v * 4]) !== part) continue;
    if (skipShoes && Math.round(rig[v * 4 + 1]) === REGION.FIXED) continue; // shoes are region FIXED: they are not cover for the joint
    out.push([pos[v * 3] + morph[v * 3] * sex, pos[v * 3 + 1] + morph[v * 3 + 1] * sex, pos[v * 3 + 2] + morph[v * 3 + 2] * sex]);
  }
  return out;
}

/** Farthest distance along the ray (origin, unit dir) at which any triangle of the list (flat triples of vertices) is crossed, or 0. */
function farthestHit(tris: V[], o: V, d: V): number {
  let best = 0;
  for (let i = 0; i < tris.length; i += 3) {
    const a = tris[i];
    const e1: V = [tris[i + 1][0] - a[0], tris[i + 1][1] - a[1], tris[i + 1][2] - a[2]];
    const e2: V = [tris[i + 2][0] - a[0], tris[i + 2][1] - a[1], tris[i + 2][2] - a[2]];
    const p: V = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
    const det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2];
    if (Math.abs(det) < 1e-12) continue;
    const s: V = [o[0] - a[0], o[1] - a[1], o[2] - a[2]];
    const u = (s[0] * p[0] + s[1] * p[1] + s[2] * p[2]) / det;
    if (u < -1e-7 || u > 1 + 1e-7) continue;
    const q: V = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]];
    const w = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) / det;
    if (w < -1e-7 || u + w > 1 + 1e-7) continue;
    const t = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) / det;
    if (t > best) best = t;
  }
  return best;
}

describe('joint coverage at the largest bend', () => {
  for (const detail of ['far', 'near'] as const) {
    it(`covers the open end of the upper limb at the knees and elbows (${detail})`, () => {
      const failures: string[] = [];
      for (const kind of KINDS) {
        const geo = buildPerson(kind, detail).geometry;
        const pos = geo.getAttribute('position').array as Float32Array;
        const rig = geo.getAttribute('aRig').array as Float32Array;
        const morph = geo.getAttribute('aMorph').array as Float32Array;
        for (const sex of [0, 1]) {
          for (const j of JOINTS) {
            const upper = partVertices(pos, rig, morph, sex, j.upper);
            const lower = partVertices(pos, rig, morph, sex, j.lower, true);
            const minY = Math.min(...upper.map((v) => v[1]));
            const rim = upper.filter((v) => Math.abs(v[1] - minY) < 1e-5);
            // The pivot is stored on the lower limb's vertices (aRig.zw), including any stoop shift.
            const first = [...Array(rig.length / 4).keys()].find((v) => Math.round(rig[v * 4]) === j.lower) as number;
            const pivotY = rig[first * 4 + 2];
            const pivotZ = rig[first * 4 + 3];
            const cx = rim.reduce((s, v) => s + v[0], 0) / rim.length;
            for (const th of j.angles) {
              for (const sign of [1, -1]) {
                const c = Math.cos(sign * th);
                const s = Math.sin(sign * th);
                for (const r of rim) {
                  const dy = r[1] - pivotY;
                  const dz = r[2] - pivotZ;
                  const p: V = [r[0] - cx, c * dy + s * dz, -s * dy + c * dz]; // rim point relative to the pivot, in the lower limb's frame
                  const dist = Math.hypot(p[0], p[1], p[2]);
                  if (dist < 1e-6) continue;
                  const dir: V = [p[0] / dist, p[1] / dist, p[2] / dist];
                  const reach = farthestHit(lower, [cx, pivotY, pivotZ] as V, [...dir] as V);
                  if (reach < dist - TOLERANCE) {
                    failures.push(`${kind} sex ${sex} ${j.name} angle ${sign * th} reach ${reach.toFixed(4)} need ${dist.toFixed(4)} dir ${dir.map((x) => x.toFixed(2)).join(',')}`);
                    break;
                  }
                }
              }
            }
          }
        }
      }
      expect([...new Set(failures)]).toEqual([]);
    });
  }
});
