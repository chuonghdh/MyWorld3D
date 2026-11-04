import { describe, expect, it } from 'vitest';
import { film } from '../src/config/tuning';
import { clampSeconds, elapsedText, filmSizeFor, filmUnavailableReason, FILM_UNAVAILABLE_TEXT } from '../src/ui/filmUtils';

describe('film length', () => {
  it('clamps to the configured limits and rounds to whole seconds', () => {
    expect(clampSeconds(0)).toBe(film.manualMinSeconds);
    expect(clampSeconds(500)).toBe(film.manualMaxSeconds);
    expect(clampSeconds(12.4)).toBe(12);
    expect(clampSeconds(Number.NaN)).toBe(film.manualDefaultSeconds);
  });
});

describe('film output size', () => {
  const win = { width: 1367, height: 769 };
  it('Full HD size comes from config', () => {
    expect(filmSizeFor('hd', win)).toEqual({ width: 1920, height: 1080 });
  });
  it('window size is rounded down to even sides', () => {
    expect(filmSizeFor('window', win)).toEqual({ width: 1366, height: 768 });
  });
  it('names the missing capability, recorder first', () => {
    expect(filmUnavailableReason(false, false)).toBe(FILM_UNAVAILABLE_TEXT.noRecorder);
    expect(filmUnavailableReason(true, false)).toBe(FILM_UNAVAILABLE_TEXT.noEncoder);
    expect(filmUnavailableReason(true, true)).toBeNull();
  });
});

describe('elapsed text', () => {
  it('formats m:ss and h:mm:ss', () => {
    expect(elapsedText(0)).toBe('0:00');
    expect(elapsedText(65_900)).toBe('1:05');
    expect(elapsedText(3_725_000)).toBe('1:02:05');
    expect(elapsedText(-5)).toBe('0:00');
  });
});
