/**
 * Real-time film recorder: canvas.captureStream + MediaRecorder.
 * Reads the canvas only. Does not change the scene, camera or render loop;
 * the caller sets the canvas size. Pure helpers are exported for node tests.
 */

import { film } from '../config/tuning';

export type FilmExtension = 'mp4' | 'webm';

export interface FilmRecording {
  /** Stops recording and resolves the full file. Repeat calls return the same promise. */
  stop(): Promise<Blob>;
  /** Drops all data. Nothing is downloaded. */
  cancel(): void;
  /** MIME type chosen for this recording. */
  readonly mime: string;
}

export interface StartRecordingOptions {
  canvas: HTMLCanvasElement;
  fps: number;
  width: number;
  height: number;
  audioStream?: MediaStream | null;
}

/** Codec strings must be quoted: Chrome rejects the unquoted list "avc1,mp4a". */
const MP4_VIDEO = 'video/mp4;codecs="avc1.42E028"';
const MP4_AUDIO_CODEC = 'mp4a.40.2';
const WEBM_VP9 = 'video/webm;codecs=vp9';
const WEBM_PLAIN = 'video/webm';
/** Timeslice for ondataavailable, so chunks flush during long takes. */
const CHUNK_MS = 1000;
/** Delay before revoking the object URL, so the download can start. */
const REVOKE_DELAY_MS = 1000;

/** Ordered MIME candidates. MP4 with audio codec only when audio is recorded. */
export function mimeCandidates(hasAudio: boolean): string[] {
  const mp4 = hasAudio ? `video/mp4;codecs="avc1.42E028,${MP4_AUDIO_CODEC}"` : MP4_VIDEO;
  return [mp4, WEBM_VP9, WEBM_PLAIN];
}

/** First candidate the predicate accepts, or null. */
export function pickMimeType(
  isSupported: (mime: string) => boolean,
  hasAudio: boolean,
): string | null {
  return mimeCandidates(hasAudio).find((mime) => isSupported(mime)) ?? null;
}

export function filmExtension(mime: string): FilmExtension {
  return mime.toLowerCase().startsWith('video/mp4') ? 'mp4' : 'webm';
}

/** myworld3d-film-<ISO timestamp, filename-safe>.<mp4|webm> */
export function filmFileName(mime: string, timestampMs: number): string {
  const stamp = new Date(timestampMs).toISOString().replace(/[:.]/g, '-');
  return `myworld3d-film-${stamp}.${filmExtension(mime)}`;
}

/** MediaRecorder exists and at least one candidate MIME type is supported. */
export function isRecordingSupported(): boolean {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return false;
  }
  return pickMimeType((mime) => MediaRecorder.isTypeSupported(mime), false) !== null;
}

/**
 * Starts recording the canvas. Audio tracks from audioStream are added when given.
 * The caller owns audio tracks (not stopped here); the canvas capture track is stopped on end.
 */
export function startRecording(opts: StartRecordingOptions): FilmRecording {
  const { canvas, fps, width, height, audioStream } = opts;
  if (!isRecordingSupported()) {
    throw new Error('Recording is not supported in this browser');
  }
  if (canvas.width !== width || canvas.height !== height) {
    throw new Error(
      `Canvas is ${canvas.width}x${canvas.height}, expected ${width}x${height}`,
    );
  }

  const audioTracks = audioStream ? audioStream.getAudioTracks() : [];
  const mime = pickMimeType((m) => MediaRecorder.isTypeSupported(m), audioTracks.length > 0);
  if (!mime) {
    throw new Error('No supported recording format');
  }

  const videoTracks = canvas.captureStream(fps).getVideoTracks();
  const releaseVideo = (): void => videoTracks.forEach((track) => track.stop());
  const recorder = new MediaRecorder(
    new MediaStream([...videoTracks, ...audioTracks]),
    { mimeType: mime, videoBitsPerSecond: film.videoBitrate1080 },
  );

  const chunks: Blob[] = [];
  let cancelled = false;
  let resolveEnd!: (blob: Blob) => void;
  let rejectEnd!: (err: Error) => void;
  const end = new Promise<Blob>((resolve, reject) => {
    resolveEnd = resolve;
    rejectEnd = reject;
  });
  // Cancel or error may happen with no awaiter; avoid an unhandled rejection.
  end.catch(() => undefined);

  recorder.ondataavailable = (event) => {
    if (!cancelled && event.data.size > 0) chunks.push(event.data);
  };
  recorder.onstop = () => {
    releaseVideo();
    if (cancelled) {
      rejectEnd(new Error('Recording cancelled'));
      return;
    }
    resolveEnd(new Blob(chunks, { type: recorder.mimeType || mime }));
    chunks.length = 0;
  };
  recorder.onerror = (event) => {
    releaseVideo();
    const detail = (event as Event & { error?: DOMException }).error;
    rejectEnd(new Error(`Recording failed: ${detail?.message ?? 'unknown error'}`));
  };

  try {
    recorder.start(CHUNK_MS);
  } catch (err) {
    releaseVideo();
    throw err;
  }

  return {
    mime,
    stop: () => {
      if (recorder.state !== 'inactive') recorder.stop();
      return end;
    },
    cancel: () => {
      cancelled = true;
      chunks.length = 0;
      if (recorder.state !== 'inactive') recorder.stop();
      rejectEnd(new Error('Recording cancelled'));
      releaseVideo();
    },
  };
}

/** Saves a blob through an anchor with an object URL, then revokes the URL. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}
