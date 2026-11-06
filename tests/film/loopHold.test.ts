// Auto film frame loop hold. A fake R3F root mirrors @react-three/fiber 8.17 semantics: setFrameloop resets the clock,
// advance() in 'never' mode sets delta = timestamp - elapsedTime, 'always' uses the wall clock, and configure() (every
// Canvas render) re-applies the frameloop prop. Regression: Canvas re-renders mid-run must not put the world on wall time.
import { afterEach, describe, expect, it } from 'vitest';
import { film } from '../../src/config/tuning';
import {
  canvasFrameloop,
  filmLoopHeld,
  holdFilmLoop,
  releaseFilmLoop,
  useFilmLoopHold,
  type Frameloop,
  type LoopState,
} from '../../src/film/loopHold';

function fakeRoot(startElapsed = 12.5) {
  const state: LoopState & { simTime: number } = {
    frameloop: 'always',
    clock: { elapsedTime: startElapsed },
    simTime: 0,
    setFrameloop(f: Frameloop = 'always') {
      state.clock.elapsedTime = 0;
      state.frameloop = f;
    },
  };
  // useTownFrame's dt rule.
  const subscriber = (frameloop: Frameloop, delta: number) => {
    const wallFrameInFilm = filmLoopHeld() && frameloop !== 'never';
    state.simTime += wallFrameInFilm ? 0 : delta;
  };
  const render = (timestamp?: number) => {
    let delta = 0.2; // wall-clock getDelta(): a slow encoder frame
    if (state.frameloop === 'never' && typeof timestamp === 'number') {
      delta = timestamp - state.clock.elapsedTime;
      state.clock.elapsedTime = timestamp;
    } else {
      state.clock.elapsedTime += delta;
    }
    subscriber(state.frameloop, delta);
  };
  return {
    state,
    get: () => state,
    advance: (ts: number) => render(ts),
    /** One rAF tick of R3F's loop: renders only when not 'never'. */
    rafTick: () => {
      if (state.frameloop !== 'never') render();
    },
    /** A Canvas render: configure() applies the frameloop prop. */
    configure: (prop: Frameloop) => {
      if (state.frameloop !== prop) state.setFrameloop(prop);
    },
  };
}

afterEach(() => useFilmLoopHold.setState({ held: false }));

describe('auto film frame loop hold', () => {
  it('N renderFrame calls advance simTime by N/fps even when the Canvas re-renders mid-run', () => {
    const r = fakeRoot();
    const stepper = holdFilmLoop(r.get, r.advance, film.fps);
    expect(r.state.frameloop).toBe('never');
    const N = 300;
    for (let i = 0; i < N; i++) {
      if (i % 37 === 0) r.configure(canvasFrameloop(useFilmLoopHold.getState().held)); // App re-render
      r.rafTick(); // rAF keeps firing but must not render
      stepper.step();
      if (i === 0) expect(r.state.simTime).toBeCloseTo(1 / film.fps, 9); // first delta exactly 1/fps
    }
    expect(stepper.steps).toBe(N);
    expect(Math.abs(r.state.simTime - N / film.fps)).toBeLessThan(1e-6);
  });

  it('guard: a step throws when the loop was flipped back to always (uncontrolled Canvas prop)', () => {
    const r = fakeRoot();
    const stepper = holdFilmLoop(r.get, r.advance, film.fps);
    stepper.step();
    r.configure('always'); // the bug: Canvas without a frameloop prop re-renders
    expect(() => stepper.step()).toThrow(/frame loop is 'always'/);
  });

  it('guard: a step throws when the clock left the film timeline', () => {
    const r = fakeRoot();
    const stepper = holdFilmLoop(r.get, r.advance, film.fps);
    stepper.step();
    r.state.setFrameloop('never'); // clock reset to 0 while held
    expect(() => stepper.step()).toThrow(/clock at/);
  });

  it('a wall-time frame during the hold gives the town dt 0', () => {
    const r = fakeRoot();
    holdFilmLoop(r.get, r.advance, film.fps);
    r.state.frameloop = 'always';
    r.rafTick();
    expect(r.state.simTime).toBe(0);
  });

  it('release gives the loop back to real time (manual film path: always)', () => {
    const r = fakeRoot();
    holdFilmLoop(r.get, r.advance, film.fps);
    releaseFilmLoop(r.get);
    expect(filmLoopHeld()).toBe(false);
    expect(r.state.frameloop).toBe('always');
    expect(canvasFrameloop(false)).toBe('always');
    r.configure(canvasFrameloop(useFilmLoopHold.getState().held));
    r.rafTick();
    expect(r.state.simTime).toBeCloseTo(0.2, 9);
  });
});
