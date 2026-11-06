// House type thumbnails: store contract, one preset per frame scheduling, camera framing and pixel readback helpers.
import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { HOUSE_PRESETS } from '../src/buildings';
import { sceneQa } from '../src/config/tuning';
import {
  flipAndUnpremultiply,
  frameThumbCamera,
  nextThumbPreset,
  storeHouseThumb,
  useHouseThumbs,
  type Vec3,
} from '../src/scene/houseThumbs';

afterEach(() => useHouseThumbs.setState({ thumbs: {}, requested: false }));

const t = sceneQa.houseThumbs;
const VIEW = { fovDeg: t.thumbFovDeg, azimuthDeg: t.thumbAzimuthDeg, elevationDeg: t.thumbElevationDeg, margin: t.thumbMargin };

describe('house thumbs store', () => {
  it('starts empty and unrequested; request() is idempotent', () => {
    expect(useHouseThumbs.getState().requested).toBe(false);
    expect(useHouseThumbs.getState().thumbs).toEqual({});
    let writes = 0;
    const unsub = useHouseThumbs.subscribe(() => writes++);
    useHouseThumbs.getState().request();
    useHouseThumbs.getState().request();
    unsub();
    expect(useHouseThumbs.getState().requested).toBe(true);
    expect(writes).toBe(1);
  });

  it('storeHouseThumb adds one preset and keeps the others', () => {
    storeHouseThumb('bauhaus', 'data:image/png;base64,AAA');
    storeHouseThumb('mediterranean', 'data:image/png;base64,BBB');
    expect(useHouseThumbs.getState().thumbs).toEqual({
      bauhaus: 'data:image/png;base64,AAA',
      mediterranean: 'data:image/png;base64,BBB',
    });
  });
});

describe('house thumbs scheduling (one preset per frame)', () => {
  it('renders nothing until requested', () => {
    expect(nextThumbPreset(HOUSE_PRESETS, useHouseThumbs.getState())).toBeNull();
  });

  it('a frame loop renders each preset exactly once, one per frame, then stops', () => {
    useHouseThumbs.getState().request();
    const rendered: string[] = [];
    let frames = 0;
    for (let f = 0; f < HOUSE_PRESETS.length + 5; f++) {
      const p = nextThumbPreset(HOUSE_PRESETS, useHouseThumbs.getState());
      if (!p) continue;
      frames++;
      rendered.push(p);
      storeHouseThumb(p, `data:${p}`);
    }
    expect(frames).toBe(HOUSE_PRESETS.length);
    expect(rendered).toEqual([...HOUSE_PRESETS]);
    expect(nextThumbPreset(HOUSE_PRESETS, useHouseThumbs.getState())).toBeNull();
  });
});

function project(frame: ReturnType<typeof frameThumbCamera>, p: Vec3): THREE.Vector3 {
  const cam = new THREE.PerspectiveCamera(VIEW.fovDeg, 1, frame.near, frame.far);
  cam.position.set(...frame.position);
  cam.lookAt(...frame.target);
  cam.updateMatrixWorld();
  return new THREE.Vector3(...p).project(cam);
}

function corners(min: Vec3, max: Vec3): Vec3[] {
  return Array.from({ length: 8 }, (_, i) => [i & 1 ? max[0] : min[0], i & 2 ? max[1] : min[1], i & 4 ? max[2] : min[2]] as Vec3);
}

describe('thumb camera framing', () => {
  const boxes: [Vec3, Vec3][] = [
    [[-4, 0, -5], [4, 10, 5]], // narrow town house
    [[-9, 0, -7], [9, 12, 7]], // wide shophouse
    [[-6, 0, -6], [6, 30, 6]], // tall tower
  ];

  it.each(boxes)('every corner is inside the frame with the margin, and the fit is tight (%j)', (min, max) => {
    const f = frameThumbCamera(min, max, VIEW);
    let extent = 0;
    for (const c of corners(min, max)) {
      const n = project(f, c);
      expect(Math.abs(n.x)).toBeLessThanOrEqual(1 / VIEW.margin + 1e-9);
      expect(Math.abs(n.y)).toBeLessThanOrEqual(1 / VIEW.margin + 1e-9);
      expect(n.z).toBeGreaterThan(-1); // in front of near
      expect(n.z).toBeLessThan(1); // before far
      extent = Math.max(extent, Math.abs(n.x), Math.abs(n.y));
    }
    expect(extent).toBeCloseTo(1 / VIEW.margin, 6);
  });

  it('looks from the front (+Z), to the +X side, from above, at the box centre', () => {
    const f = frameThumbCamera([-4, 0, -5], [4, 10, 5], VIEW);
    expect(f.target).toEqual([0, 5, 0]);
    expect(f.position[2]).toBeGreaterThan(0);
    expect(f.position[0]).toBeGreaterThan(0);
    expect(f.position[1]).toBeGreaterThan(5);
  });
});

describe('thumb pixel readback', () => {
  it('flips rows and unpremultiplies edge pixels', () => {
    // 1 x 2 image, bottom row first (WebGL order): bottom = half-covered grey, top = opaque red.
    const src = new Uint8Array([64, 64, 64, 128, 255, 0, 0, 255]);
    const out = new Uint8ClampedArray(8);
    flipAndUnpremultiply(src, 1, 2, out);
    expect([...out.slice(0, 4)]).toEqual([255, 0, 0, 255]);
    expect([...out.slice(4, 8)]).toEqual([128, 128, 128, 128]);
  });
});
