import { afterEach, describe, expect, it } from 'vitest';
import {
  applyFilmSize,
  filmFrameFor,
  fitInside,
  isFilmSizeApplied,
  registerFilmRoot,
  restoreFilmSize,
  type FilmRoot,
} from '../../src/film/resizeBridge';

/**
 * Fake renderer with the three.js semantics the bridge relies on: setPixelRatio calls this.setSize,
 * setSize(w, h, false) leaves the canvas style alone, and getSize reports the logical (CSS) size.
 */
function fakeRoot(css = { w: 1367, h: 769 }, aspect = 1367 / 769) {
  const state = {
    pixelRatio: 2,
    buffer: { w: css.w * 2, h: css.h * 2 },
    logical: { w: css.w, h: css.h },
    style: { width: `${css.w}px`, height: `${css.h}px`, marginLeft: '', marginTop: '' },
    aspect,
    projectionUpdates: 0,
    composerRatio: 2,
    composerSize: { w: 0, h: 0 },
    setSizeCalls: 0,
  };
  const gl: FilmRoot['gl'] = {
    domElement: { style: state.style },
    getPixelRatio: () => state.pixelRatio,
    setPixelRatio(r) {
      state.pixelRatio = r;
      this.setSize(state.logical.w, state.logical.h, false);
    },
    // three.js getSize(target) writes through target.set(x, y); a plain {x, y} object throws.
    getSize: (t) => t.set(state.logical.w, state.logical.h) as unknown as typeof t,
    setSize(w, h, updateStyle) {
      state.setSizeCalls += 1;
      state.logical = { w, h };
      state.buffer = { w: w * state.pixelRatio, h: h * state.pixelRatio };
      if (updateStyle !== false) {
        state.style.width = `${w}px`;
        state.style.height = `${h}px`;
      }
    },
  };
  const root: FilmRoot = {
    gl,
    camera: {
      get aspect() {
        return state.aspect;
      },
      set aspect(v: number) {
        state.aspect = v;
      },
      updateProjectionMatrix: () => {
        state.projectionUpdates += 1;
      },
    },
    composer: {
      setPixelRatio: (r) => {
        state.composerRatio = r;
      },
      setSize: (w, h) => {
        state.composerSize = { w, h };
      },
    },
  };
  return { root, state };
}

afterEach(() => {
  registerFilmRoot(null);
});

describe('filmFrameFor', () => {
  it('keeps even sides and derives the aspect from them', () => {
    expect(filmFrameFor(1920, 1080)).toEqual({ width: 1920, height: 1080, aspect: 1920 / 1080 });
    expect(filmFrameFor(1367, 769)).toEqual({ width: 1366, height: 768, aspect: 1366 / 768 });
  });

  it('never returns a side below 2 px, and treats non-finite input as the minimum', () => {
    expect(filmFrameFor(0, 1)).toEqual({ width: 2, height: 2, aspect: 1 });
    expect(filmFrameFor(Number.NaN, 1080).width).toBe(2);
  });
});

describe('fitInside', () => {
  it('letterboxes a wide frame in a tall box and pillarboxes a tall frame in a wide box', () => {
    expect(fitInside({ width: 500, height: 1000 }, 1)).toEqual({ width: 500, height: 500, left: 0, top: 250 });
    expect(fitInside({ width: 1000, height: 500 }, 1)).toEqual({ width: 500, height: 500, left: 250, top: 0 });
  });

  it('keeps the box when the aspect already matches, and tolerates a zero box', () => {
    expect(fitInside({ width: 1920, height: 1080 }, 1920 / 1080)).toMatchObject({ width: 1920, height: 1080, left: 0, top: 0 });
    expect(fitInside({ width: 0, height: 0 }, 1)).toEqual({ width: 0, height: 0, left: 0, top: 0 });
  });
});

describe('film size bridge', () => {
  it('does nothing when no root is registered', () => {
    expect(applyFilmSize(1920, 1080)).toBe(false);
    expect(isFilmSizeApplied()).toBe(false);
  });

  it('sets the buffer, pixel ratio 1, camera aspect and composer; restores all on restore', () => {
    const { root, state } = fakeRoot();
    registerFilmRoot(root);
    expect(applyFilmSize(1920, 1080)).toBe(true);
    expect(isFilmSizeApplied()).toBe(true);
    expect(state.pixelRatio).toBe(1);
    expect(state.buffer).toEqual({ w: 1920, h: 1080 });
    expect(state.logical).toEqual({ w: 1920, h: 1080 });
    expect(state.aspect).toBeCloseTo(1920 / 1080);
    expect(state.composerSize).toEqual({ w: 1920, h: 1080 });

    restoreFilmSize();
    expect(isFilmSizeApplied()).toBe(false);
    expect(state.pixelRatio).toBe(2);
    expect(state.buffer).toEqual({ w: 2734, h: 1538 });
    expect(state.logical).toEqual({ w: 1367, h: 769 });
    expect(state.aspect).toBeCloseTo(1367 / 769);
    expect(state.composerRatio).toBe(2);
    expect(state.composerSize).toEqual({ w: 1367, h: 769 });
  });

  it('is idempotent: a second apply keeps the first saved state', () => {
    const { root, state } = fakeRoot();
    registerFilmRoot(root);
    applyFilmSize(1920, 1080);
    applyFilmSize(1920, 1080);
    restoreFilmSize();
    expect(state.pixelRatio).toBe(2);
    expect(state.logical).toEqual({ w: 1367, h: 769 });
    expect(state.aspect).toBeCloseTo(1367 / 769);
  });

  it('restore with nothing applied is a no-op', () => {
    const { root, state } = fakeRoot();
    registerFilmRoot(root);
    const calls = state.setSizeCalls;
    restoreFilmSize();
    expect(state.pixelRatio).toBe(2);
    expect(state.projectionUpdates).toBe(0);
    expect(state.setSizeCalls).toBe(calls);
  });

  it('unregistering while applied restores the old root and removes the guard', () => {
    const { root, state } = fakeRoot();
    registerFilmRoot(root);
    applyFilmSize(1920, 1080);
    registerFilmRoot(null);
    expect(isFilmSizeApplied()).toBe(false);
    expect(state.pixelRatio).toBe(2);
    expect(state.logical).toEqual({ w: 1367, h: 769 });
    // Guard removed: a window resize now reaches the buffer again.
    root.gl.setSize(1000, 600, true);
    expect(state.buffer).toEqual({ w: 2000, h: 1200 });
  });

  it('leaves the camera alone when it is not perspective', () => {
    const { root } = fakeRoot();
    registerFilmRoot({ ...root, camera: null });
    expect(applyFilmSize(1920, 1080)).toBe(true);
    restoreFilmSize();
    expect(isFilmSizeApplied()).toBe(false);
  });
});

describe('window resize guard while filming', () => {
  it('holds a renderer resize while a film size is applied, then applies the window size on restore', () => {
    const { root, state } = fakeRoot();
    registerFilmRoot(root);
    applyFilmSize(1920, 1080);
    const buffer = { ...state.buffer };

    // R3F reacts to a window resize: it calls setPixelRatio and setSize with the new window size.
    root.gl.setPixelRatio(2);
    root.gl.setSize(1000, 600, true);
    expect(state.buffer).toEqual(buffer);
    expect(state.pixelRatio).toBe(1);

    restoreFilmSize();
    expect(state.logical).toEqual({ w: 1000, h: 600 });
    expect(state.pixelRatio).toBe(2);
    expect(state.buffer).toEqual({ w: 2000, h: 1200 });
  });

  it('refits the canvas to the window while filming, with no distortion', () => {
    const { root, state } = fakeRoot({ w: 1000, h: 500 }, 2);
    registerFilmRoot(root);
    applyFilmSize(1920, 1080);
    // 16:9 frame in a 1000 x 500 window: height is the limit, width 889, centred.
    expect(state.style.height).toBe('500px');
    expect(parseFloat(state.style.width) / parseFloat(state.style.height)).toBeCloseTo(1920 / 1080);
    expect(state.style.marginLeft).toBe(`${(1000 - parseFloat(state.style.width)) / 2}px`);

    root.gl.setSize(800, 800, true);
    expect(state.style.width).toBe('800px');
    expect(state.style.height).toBe('450px');
    expect(state.style.marginTop).toBe('175px');
  });

  it('restores the canvas style that was there before the film', () => {
    const { root, state } = fakeRoot();
    registerFilmRoot(root);
    applyFilmSize(1920, 1080);
    restoreFilmSize();
    expect(state.style.marginLeft).toBe('');
    expect(state.style.marginTop).toBe('');
    expect(state.style.width).toBe('1367px');
    expect(state.style.height).toBe('769px');
  });

  it('passes resizes straight through when nothing is applied', () => {
    const { root, state } = fakeRoot();
    registerFilmRoot(root);
    root.gl.setSize(900, 400, true);
    expect(state.logical).toEqual({ w: 900, h: 400 });
    expect(state.buffer).toEqual({ w: 1800, h: 800 });
  });
});
