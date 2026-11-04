// Pure helpers for the film picker and recording session (no DOM, no React: run under vitest in node).
import { film } from '../config/tuning';

/** Output size choice: Full HD (default) or the current window size. */
export type FilmResolution = 'hd' | 'window';

/** Why recording is unavailable. Short messages, one per cause, kept as plain text for translation. */
export const FILM_UNAVAILABLE_TEXT = {
  noRecorder: 'Recording is not available in this browser.',
  noEncoder: 'This browser cannot record MP4 or WebM video.',
} as const;

const MS_PER_S = 1000;
const SECONDS_PER_MIN = 60;

/** Manual film length clamped to the configured limits; a non-number falls back to the default length. */
export function clampSeconds(value: number): number {
  if (!Number.isFinite(value)) return film.manualDefaultSeconds;
  return Math.min(film.manualMaxSeconds, Math.max(film.manualMinSeconds, Math.round(value)));
}

/** Reason recording cannot run, or null when it can. */
export function filmUnavailableReason(hasRecorder: boolean, hasEncoder: boolean): string | null {
  if (!hasRecorder) return FILM_UNAVAILABLE_TEXT.noRecorder;
  if (!hasEncoder) return FILM_UNAVAILABLE_TEXT.noEncoder;
  return null;
}

/** Pixel size for a resolution choice. H.264 needs even sides, so the window size is rounded down to even. */
export function filmSizeFor(res: FilmResolution, window: { width: number; height: number }): { width: number; height: number } {
  if (res === 'hd') return { width: film.width1080, height: film.height1080 };
  return { width: window.width - (window.width % 2), height: window.height - (window.height % 2) };
}

/** Elapsed time as m:ss (or h:mm:ss from one hour), from milliseconds. */
export function elapsedText(ms: number): string {
  const total = Math.floor(Math.max(0, ms) / MS_PER_S);
  const h = Math.floor(total / (SECONDS_PER_MIN * SECONDS_PER_MIN));
  const m = Math.floor(total / SECONDS_PER_MIN) % SECONDS_PER_MIN;
  const s = total % SECONDS_PER_MIN;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
