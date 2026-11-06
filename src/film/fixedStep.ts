// Fixed film-time stepper (pure): one call per rendered auto film frame advances the world by exactly 1/fps of film
// time, independent of how long the encoder takes. The caller passes R3F's advance (frameloop 'never' during the
// film), so every useFrame subscriber (simulation, audio tap, post chain) runs once per frame with dt = 1/fps.

export interface FixedStepper {
  /** Advances one frame: calls advance(start + steps / fps). */
  step(): void;
  /** Frames advanced so far. */
  readonly steps: number;
}

export function createFixedStepper(fps: number, startS: number, advance: (timestampS: number) => void): FixedStepper {
  if (!(fps > 0)) throw new Error('createFixedStepper: fps must be > 0');
  let steps = 0;
  return {
    step() {
      steps++;
      advance(startS + steps / fps);
    },
    get steps() {
      return steps;
    },
  };
}
