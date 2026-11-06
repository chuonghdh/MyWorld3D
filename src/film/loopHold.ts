// Frame loop hold for the auto film. One source of truth: the `held` flag. App passes it to <Canvas frameloop>, and
// holdFilmLoop applies the same value to the R3F store at once, so the first fixed step does not wait for a React
// render. Gotcha: R3F's configure() runs on every Canvas render and sets the store frameloop from the prop, so an
// imperative setFrameloop('never') alone is undone by the next App re-render (the loop then runs on wall time).
// The stepper is guarded: a step fails loudly when the loop is not 'never' or the clock left the film timeline.
import { create } from 'zustand';
import { createFixedStepper, type FixedStepper } from './fixedStep';

export type Frameloop = 'always' | 'demand' | 'never';

/** The slice of R3F's root state the hold reads and writes. */
export interface LoopState {
  frameloop: Frameloop;
  clock: { elapsedTime: number };
  setFrameloop: (frameloop?: Frameloop) => void;
}

export const useFilmLoopHold = create<{ held: boolean }>(() => ({ held: false }));

/** The Canvas frameloop prop: 'never' while the auto film holds the loop, else real time. */
export function canvasFrameloop(held: boolean): Frameloop {
  return held ? 'never' : 'always';
}

/** True while the auto film steps the world: per-frame code must not see a wall-clock dt then. */
export function filmLoopHeld(): boolean {
  return useFilmLoopHold.getState().held;
}

/**
 * Holds the loop at 'never' and returns a stepper: each step advances the world by exactly 1/fps of film time.
 * setFrameloop resets clock.elapsedTime to 0, so the start is read after it and the first delta is exactly 1/fps.
 */
export function holdFilmLoop(
  get: () => LoopState,
  advance: (timestampS: number, runGlobalEffects?: boolean) => void,
  fps: number,
): FixedStepper {
  useFilmLoopHold.setState({ held: true });
  if (get().frameloop !== 'never') get().setFrameloop('never');
  const startS = get().clock.elapsedTime;
  const inner = createFixedStepper(fps, startS, (ts) => advance(ts, true));
  return {
    step() {
      const s = get();
      if (s.frameloop !== 'never') {
        throw new Error(`Auto film: frame loop is '${s.frameloop}', not 'never'; the world would move on wall time`);
      }
      const want = startS + inner.steps / fps;
      if (Math.abs(s.clock.elapsedTime - want) > 1e-6) {
        throw new Error(`Auto film: clock at ${s.clock.elapsedTime.toFixed(6)} s, expected ${want.toFixed(6)} s`);
      }
      inner.step();
    },
    get steps() {
      return inner.steps;
    },
  };
}

/** Gives the loop back to real time. */
export function releaseFilmLoop(get: () => LoopState): void {
  useFilmLoopHold.setState({ held: false });
  if (get().frameloop !== 'always') get().setFrameloop('always');
}
