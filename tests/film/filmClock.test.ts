import { afterEach, describe, expect, it } from 'vitest';
import { autoFilmTime, isAutoFilmClockRunning, startAutoFilmClock, stopAutoFilmClock } from '../../src/film/filmClock';

afterEach(() => stopAutoFilmClock());

describe('auto film clock', () => {
  it('reads 0 while idle', () => {
    expect(isAutoFilmClockRunning()).toBe(false);
    expect(autoFilmTime(12345)).toBe(0);
  });
  it('counts film seconds from the start instant', () => {
    startAutoFilmClock(1000);
    expect(isAutoFilmClockRunning()).toBe(true);
    expect(autoFilmTime(1000)).toBe(0);
    expect(autoFilmTime(3500)).toBeCloseTo(2.5, 9);
  });
  it('never goes negative before the start instant', () => {
    startAutoFilmClock(5000);
    expect(autoFilmTime(4000)).toBe(0);
  });
});
