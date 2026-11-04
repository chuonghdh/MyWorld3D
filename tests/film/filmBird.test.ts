import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { trafficLife } from '../../src/config/tuning';
import { birdPoseAt, createFilmBird, type FilmPathPose, type FilmPathSampler } from '../../src/life/filmBird';

const DURATION_S = 30;

/** Circular camera orbit around the origin, looking at the centre. */
const orbit: FilmPathSampler = (t) => {
  const a = (2 * Math.PI * t) / DURATION_S;
  return { x: 200 * Math.cos(a), y: 120, z: 200 * Math.sin(a), tx: 0, ty: 0, tz: 0 };
};

/** Straight flight along +x, looking forward and slightly down. */
const straight: FilmPathSampler = (t) => ({ x: 10 * t, y: 60, z: -40, tx: 10 * t + 100, ty: 40, tz: -40 });

/** Camera still, looking straight down (degenerate right axis). */
const stillDown: FilmPathSampler = () => ({ x: 0, y: 150, z: 0, tx: 0, ty: 0, tz: 0 });

/** Camera looking straight up from ground level. */
const lookUp: FilmPathSampler = (t) => ({ x: 50 + t, y: 2, z: 50, tx: 50 + t, ty: 500, tz: 50 });

const PATHS: Array<[string, FilmPathSampler]> = [
  ['orbit', orbit],
  ['straight', straight],
  ['still down', stillDown],
  ['look up', lookUp],
];

function samples(step = 0.37): number[] {
  const out: number[] = [];
  for (let t = 0; t <= DURATION_S; t += step) out.push(t);
  return out;
}

function dist(a: { x: number; y: number; z: number }, cam: FilmPathPose): number {
  return Math.hypot(a.x - cam.x, a.y - cam.y, a.z - cam.z);
}

describe('birdPoseAt', () => {
  it('never produces NaN or infinity on any path', () => {
    for (const [, path] of PATHS) {
      for (const t of samples()) {
        const p = birdPoseAt(t, path);
        for (const v of [p.x, p.y, p.z, p.hx, p.hy, p.hz, p.yaw, p.pitch]) {
          expect(Number.isFinite(v)).toBe(true);
        }
        expect(Math.hypot(p.hx, p.hy, p.hz)).toBeCloseTo(1, 6);
      }
    }
  });

  it('keeps the bird at least the minimum distance from the camera, at the preferred distance', () => {
    const want = Math.max(trafficLife.filmBirdDistanceM, trafficLife.filmBirdMinDistanceM);
    for (const [, path] of PATHS) {
      for (const t of samples()) {
        const d = dist(birdPoseAt(t, path), path(t));
        expect(d).toBeGreaterThanOrEqual(trafficLife.filmBirdMinDistanceM - 1e-9);
        expect(d).toBeCloseTo(want, 6);
      }
    }
  });

  it('sits centred on the camera look direction, at the preferred distance', () => {
    const want = Math.max(trafficLife.filmBirdDistanceM, trafficLife.filmBirdMinDistanceM);
    for (const [, path] of PATHS) {
      for (const t of samples()) {
        const cam = path(t);
        const p = birdPoseAt(t, path);
        const fx = cam.tx - cam.x;
        const fy = cam.ty - cam.y;
        const fz = cam.tz - cam.z;
        const fl = Math.hypot(fx, fy, fz);
        if (!(fl > 1e-9)) continue;
        const ux = (p.x - cam.x) / want;
        const uy = (p.y - cam.y) / want;
        const uz = (p.z - cam.z) / want;
        // Unit offset equals the unit look direction: no lateral or vertical offset.
        expect(ux).toBeCloseTo(fx / fl, 6);
        expect(uy).toBeCloseTo(fy / fl, 6);
        expect(uz).toBeCloseTo(fz / fl, 6);
      }
    }
  });

  it('heading matches the direction of motion', () => {
    for (const [, path] of [PATHS[0], PATHS[1]] as Array<[string, FilmPathSampler]>) {
      for (const t of samples(1.3)) {
        const h = 0.01;
        const a = birdPoseAt(t - h, path);
        const b = birdPoseAt(t + h, path);
        const vx = b.x - a.x;
        const vy = b.y - a.y;
        const vz = b.z - a.z;
        const vl = Math.hypot(vx, vy, vz);
        const p = birdPoseAt(t, path);
        const dot = (p.hx * vx + p.hy * vy + p.hz * vz) / vl;
        expect(dot).toBeGreaterThan(0.999);
      }
    }
  });

  it('is deterministic: same input gives the same output', () => {
    for (const t of [0, 3.3, 17.9, 29.99]) {
      const a = birdPoseAt(t, orbit);
      const b = birdPoseAt(t, orbit);
      expect(b).toEqual(a);
    }
  });

  it('is periodic in film time for a periodic path', () => {
    const a = birdPoseAt(4, orbit);
    const b = birdPoseAt(4 + DURATION_S, orbit);
    expect(b.x).toBeCloseTo(a.x, 6);
    expect(b.y).toBeCloseTo(a.y, 6);
    expect(b.z).toBeCloseTo(a.z, 6);
  });
});

describe('createFilmBird', () => {
  it('is one mesh, one instance, no shadow', () => {
    const bird = createFilmBird();
    const meshes: THREE.Object3D[] = [];
    bird.group.traverse((o) => {
      if (o !== bird.group) meshes.push(o);
    });
    expect(meshes).toHaveLength(1);
    const mesh = meshes[0] as THREE.InstancedMesh;
    expect(mesh).toBeInstanceOf(THREE.InstancedMesh);
    expect(mesh.count).toBe(1);
    expect(mesh.castShadow).toBe(false);
    expect(mesh.receiveShadow).toBe(false);
    bird.dispose();
  });

  it('update writes a finite matrix and dispose runs without throwing', () => {
    const bird = createFilmBird();
    const mesh = bird.group.children[0] as THREE.InstancedMesh;
    bird.update(birdPoseAt(12, orbit));
    const m = mesh.instanceMatrix.array as Float32Array;
    for (let i = 0; i < 16; i++) expect(Number.isFinite(m[i])).toBe(true);
    expect(() => bird.dispose()).not.toThrow();
  });

  it('dispose removes the mesh from the group and can be called twice', () => {
    const bird = createFilmBird();
    expect(bird.group.children).toHaveLength(1);
    bird.dispose();
    expect(bird.group.children).toHaveLength(0);
    expect(() => bird.dispose()).not.toThrow();
  });
});

describe('filmBird source', () => {
  it('imports no traffic, pedestrian, pigeon, flock or random or clock source', () => {
    const files = import.meta.glob('/src/life/filmBird.ts', { query: '?raw', import: 'default', eager: true }) as Record<
      string,
      string
    >;
    const src = files['/src/life/filmBird.ts'] ?? '';
    expect(src.length).toBeGreaterThan(0);
    expect(src).not.toMatch(/Math\.random\(/);
    expect(src).not.toMatch(/Date\.now\(|new Date\(|performance\.now\(/);
    expect(src).not.toMatch(/from ['"][^'"]*(traffic|walkers|pigeon|birds|flock|audio)/);
  });
});
