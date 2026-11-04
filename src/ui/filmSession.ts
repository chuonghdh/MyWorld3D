// Manual film session: starts and stops one real-time recording of the 3D canvas with the audio mix, and saves it.
// Module state (not React) so the recording survives the picker and the time bar being closed or folded.
import { film } from '../config/tuning';
import { useWorldStore } from '../store';
import { getRecordStream } from '../audio';
import { downloadBlob, filmFileName, isRecordingSupported, startRecording, type FilmRecording } from '../film/recorder';
import { applyFilmSize, restoreFilmSize } from '../film/resizeBridge';
import { clampSeconds, filmUnavailableReason } from './filmUtils';

/** Set on the root element while a film records: the CSS in film.css hides everything but the 3D view and REC chip. */
const FILMING_CLASS = 'mw-filming';

export interface FilmStatus {
  recording: boolean;
  /** The file is being finished and saved. */
  saving: boolean;
  /** Wall-clock start of the recording (ms since epoch); 0 when idle. */
  startedAt: number;
  /** Last message for the user (error or outcome), or null. */
  message: string | null;
  /** Length limit of the running recording, real seconds. */
  seconds: number;
}

const IDLE: FilmStatus = { recording: false, saving: false, startedAt: 0, message: null, seconds: 0 };
let status: FilmStatus = IDLE;
const listeners = new Set<() => void>();

function publish(next: FilmStatus): void {
  status = next;
  listeners.forEach((l) => l());
}

export function subscribeFilm(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getFilmStatus(): FilmStatus {
  return status;
}

interface Active {
  rec: FilmRecording;
  stopTimer: number;
  onHidden: () => void;
}
let active: Active | null = null;

function setFilming(on: boolean): void {
  useWorldStore.getState().setToggle('filming', on);
  document.documentElement.classList.toggle(FILMING_CLASS, on);
}

/** Ends the running recording, saves the file and reports the outcome. Safe to call when idle. */
async function finish(note: string | null): Promise<void> {
  const cur = active;
  if (!cur) return;
  active = null;
  window.clearTimeout(cur.stopTimer);
  document.removeEventListener('visibilitychange', cur.onHidden);
  setFilming(false);
  publish({ ...IDLE, saving: true, message: note });
  try {
    const blob = await cur.rec.stop();
    downloadBlob(blob, filmFileName(cur.rec.mime, Date.now()));
    publish({ ...IDLE, message: note ?? 'Film saved' });
  } catch {
    publish({ ...IDLE, message: 'Recording failed' });
  } finally {
    restoreFilmSize();
  }
}

/** Stop button and the length limit: save what has been recorded. */
export function stopFilm(): Promise<void> {
  return finish(null);
}

/** Drops the running recording without saving it. */
export function cancelFilm(): void {
  const cur = active;
  if (!cur) return;
  active = null;
  window.clearTimeout(cur.stopTimer);
  document.removeEventListener('visibilitychange', cur.onHidden);
  cur.rec.cancel();
  restoreFilmSize();
  setFilming(false);
  publish({ ...IDLE, message: 'Recording cancelled' });
}

export interface ManualFilmRequest {
  seconds: number;
  width: number;
  height: number;
}

/**
 * Starts a manual film. Returns null on success, or the message to show when it cannot start.
 * The film size is applied to the 3D root first (resizeBridge) and restored when the film ends.
 */
export function startManualFilm(req: ManualFilmRequest): string | null {
  if (active) return 'A film is already recording';
  const unavailable = filmUnavailableReason(typeof MediaRecorder !== 'undefined', isRecordingSupported());
  if (unavailable) return unavailable;
  const canvas = document.querySelector('canvas');
  if (!(canvas instanceof HTMLCanvasElement)) return 'No 3D view to record';
  // Drive the GL buffer, camera aspect and composer to the output size; restored when the film ends.
  if (!applyFilmSize(req.width, req.height)) return 'No 3D view to record';
  if (canvas.width !== req.width || canvas.height !== req.height) {
    restoreFilmSize();
    return `Could not set the film size to ${req.width} x ${req.height}`;
  }
  const seconds = clampSeconds(req.seconds);
  let rec: FilmRecording;
  try {
    rec = startRecording({ canvas, fps: film.fps, width: req.width, height: req.height, audioStream: getRecordStream() });
  } catch (err) {
    restoreFilmSize();
    return err instanceof Error ? err.message : 'Recording could not start';
  }
  // A hidden tab stops the frame loop: end the take rather than save a frozen picture.
  const onHidden = () => {
    if (document.hidden) void finish('Recording stopped: the tab was hidden');
  };
  document.addEventListener('visibilitychange', onHidden);
  const stopTimer = window.setTimeout(() => void finish(null), seconds * 1000);
  active = { rec, stopTimer, onHidden };
  setFilming(true);
  publish({ recording: true, saving: false, startedAt: Date.now(), message: null, seconds });
  return null;
}

// HMR: a reloaded module must not keep a live recorder or the filming lock.
if (import.meta.hot) {
  import.meta.hot.dispose(() => cancelFilm());
}
