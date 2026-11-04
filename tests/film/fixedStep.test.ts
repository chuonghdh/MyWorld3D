import { describe, expect, it } from 'vitest';
import { film } from '../../src/config/tuning';
import { autoFrameCount } from '../../src/film/autoPath';
import { createFixedStepper } from '../../src/film/fixedStep';

describe('fixed film-time stepper', () => {
  it('runs one simulation step per rendered frame, each exactly 1/fps of film time', () => {
    const stamps: number[] = [];
    const s = createFixedStepper(film.fps, 0, (ts) => stamps.push(ts));
    const frames = autoFrameCount();
    for (let i = 0; i < frames; i++) s.step();
    expect(s.steps).toBe(frames);
    expect(stamps).toHaveLength(frames);
    for (let i = 1; i < stamps.length; i++) expect(stamps[i]! - stamps[i - 1]!).toBeCloseTo(1 / film.fps, 9);
    // Film time covered equals the film length, so game time advances autoVirtualMinutes (1 s = 1 game minute).
    expect(stamps[stamps.length - 1]).toBeCloseTo(film.autoSeconds, 6);
  });
});
