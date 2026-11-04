// Film session: starts and stops one recording of the 3D canvas and saves it. Manual film is real-time (MediaRecorder
// with the audio mix). Auto film is frame by frame (WebCodecs, video only, src/film/autoRun.ts) and runs without audio.
// Module state (not React) so the recording survives the picker and the time bar being closed or folded.
import { film } from '../config/tuning';
import { useWorldStore } from '../store';
import { getRecordStream } from '../audio';
import { downloadBlob, filmFileName, isRecordingSupported, startRecording, type FilmRecording } from '../film/recorder';
import { applyFilmSize, restoreFilmSize } from '../film/resizeBridge';
import { openAutoEncoder } from '../film/autoEncoder';
import { audioTapSnapshots } from '../film/audioSnapshot';
import { getGroupVolumes } from '../audio';
import { autoEncodeSupport, startAutoRun, type AutoAudioInput, type AutoFilmInputs, type AutoRunHandle } from '../film/autoRun';
import { startAutoFilmClock, stopAutoFilmClock } from '../film/filmClock';
import { clampSeconds, filmUnavailableReason } from './filmUtils';

/** Set on the root element while a film records: the CSS in film.css hides everything but the 3D view and REC chip. */
const FILMING_CLASS = 'mw-filming';
const MP4 = 'video/mp4';

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

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

interface Active {
  rec: FilmRecording;
  stopTimer: number;
  onHidden: () => void;
}
let active: Active | null = null;

interface AutoActive {
  handle: AutoRunHandle;
}
let autoActive: AutoActive | null = null;
/** True while startAutoFilm awaits the encoder, so a second start cannot begin meanwhile. */
let autoStarting = false;
let autoSource: (() => AutoFilmInputs | null) | null = null;

/** The scene registers how to reach the canvas, camera and path for an auto film. Pass null to unregister. */
export function registerAutoFilmSource(source: (() => AutoFilmInputs | null) | null): void {
  autoSource = source;
}

function setFilming(on: boolean): void {
  useWorldStore.getState().setToggle('filming', on);
  document.documentElement.classList.toggle(FILMING_CLASS, on);
}

/** Ends the running manual recording, saves the file and reports the outcome. Safe to call when idle. */
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

/** Reports the end of an auto run. A run replaced by cancelFilm is ignored: cancelFilm already reported it. */
function settleAuto(cur: AutoActive): void {
  cur.handle.done.then(
    (blob) => {
      if (autoActive !== cur) return;
      autoActive = null;
      setFilming(false);
      stopAutoFilmClock();
      try {
        downloadBlob(blob, filmFileName(MP4, Date.now()));
        publish({ ...IDLE, message: 'Film saved' });
      } catch {
        publish({ ...IDLE, message: 'Recording failed' });
      } finally {
        restoreFilmSize();
      }
    },
    (err: unknown) => {
      if (autoActive !== cur) return;
      autoActive = null;
      setFilming(false);
      stopAutoFilmClock();
      restoreFilmSize();
      publish({ ...IDLE, message: `Auto film failed: ${errorText(err)}` });
    },
  );
}

/** Stop button and the length limit: save what has been recorded. An auto run ends after its current frame. */
export function stopFilm(): Promise<void> {
  if (autoActive) {
    autoActive.handle.stop();
    publish({ ...IDLE, saving: true });
    return Promise.resolve();
  }
  return finish(null);
}

/** Drops the running recording without saving it. */
export function cancelFilm(): void {
  const auto = autoActive;
  if (auto) {
    autoActive = null;
    auto.handle.cancel();
    restoreFilmSize();
    setFilming(false);
    stopAutoFilmClock();
    publish({ ...IDLE, message: 'Auto film cancelled' });
    return;
  }
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
  if (active || autoActive || autoStarting) return 'A film is already recording';
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

/** Audio of the running auto film: the tap copy, the Sound switch and the group levels, read before filming ends. */
function readFilmAudio(): AutoAudioInput {
  return {
    snapshots: audioTapSnapshots(),
    soundEnabled: useWorldStore.getState().settings.soundEnabled,
    volumes: getGroupVolumes(),
  };
}

/**
 * Starts an auto film at film.width1080 x film.height1080, film.autoSeconds long. Resolves null on success, or the
 * reason it cannot start. The encoder is checked and opened before the size is applied, so a failure leaves the scene as it was.
 */
export async function startAutoFilm(): Promise<string | null> {
  if (active || autoActive || autoStarting) return 'A film is already recording';
  autoStarting = true;
  try {
    const support = await autoEncodeSupport();
    if (support) return support;
    const inputs = autoSource?.() ?? null;
    if (!inputs) return 'The 3D view is not ready for an auto film';
    if (!applyFilmSize(film.width1080, film.height1080)) return 'No 3D view to record';
    if (inputs.canvas.width !== film.width1080 || inputs.canvas.height !== film.height1080) {
      restoreFilmSize();
      return `Could not set the film size to ${film.width1080} x ${film.height1080}`;
    }
    // Audio is required: an encoder that cannot take audio stops the start with its reason. No video-only fallback.
    const opened = await openAutoEncoder({ audio: true });
    if (!opened.ok) {
      restoreFilmSize();
      return opened.reason;
    }
    const withAudio: AutoFilmInputs = { ...inputs, readAudio: inputs.readAudio ?? readFilmAudio };
    const cur: AutoActive = { handle: startAutoRun(opened.session, withAudio) };
    autoActive = cur;
    startAutoFilmClock();
    setFilming(true);
    publish({ recording: true, saving: false, startedAt: Date.now(), message: null, seconds: film.autoSeconds });
    settleAuto(cur);
    return null;
  } finally {
    autoStarting = false;
  }
}

// HMR: a reloaded module must not keep a live recorder or the filming lock.
if (import.meta.hot) {
  import.meta.hot.dispose(() => cancelFilm());
}
