// Auto film driver (pass 2): walks the pure path frame by frame, renders each frame into the 1080p canvas and
// hands it to the H.264 encoder session. Frame i is at film time i / fps (autoFrameCount() frames).
// The scene owns the camera and the renderer: setPose and renderFrame are passed in, nothing here touches R3F.
// The canvas is copied with createImageBitmap in the same task as renderFrame. The encoder may wait for queue room,
// and the drawing buffer is cleared after the task (preserveDrawingBuffer is false), so a live canvas would go black.
// Video only: the encoder session has no audio input yet, so renderFilmAudio is not called here.
import { film } from '../config/tuning';
import type { FilmPath, FilmPose } from '../scene/filmPath';
import { autoEncoderConfig, type AutoEncoderSession } from './autoEncoder';
import { autoFrameCount } from './autoPath';
import { renderFilmAudio, type AudioSnapshot } from '../audio/offlineRender';
import type { VolumeSettings } from '../audio/bus';

/** Reasons Auto film cannot run in this browser. Shown in the picker. */
export const AUTO_UNAVAILABLE_TEXT = {
  noWebCodecs: 'Auto film needs WebCodecs (VideoEncoder), which this browser does not have.',
  noH264: `This browser cannot encode H.264 ${film.width1080} x ${film.height1080} video for Auto film.`,
} as const;

/** What the scene provides for one auto run. */
export interface AutoFilmInputs {
  path: FilmPath;
  /** The 3D canvas, already at film size (1920 x 1080). */
  canvas: HTMLCanvasElement;
  /** Places the camera (Scene & QA owns the camera). */
  setPose: (pose: FilmPose) => void;
  /** Draws one frame into the canvas, synchronously. */
  renderFrame: () => void;
  /**
   * Audio of the film, read once after the last frame and before finish (filming is still on). Set only when the
   * encoder was opened with audio: true. Returns the snapshot copy; the run keeps it.
   */
  readAudio?: () => AutoAudioInput;
}

export interface AutoAudioInput {
  snapshots: readonly AudioSnapshot[];
  soundEnabled: boolean;
  volumes: VolumeSettings;
}

/** Test seam: the default copies the canvas with createImageBitmap. */
export interface AutoRunDeps {
  snapshot?: (canvas: HTMLCanvasElement) => Promise<ImageBitmap>;
}

export interface AutoRunHandle {
  /** Resolves the MP4 when the run ends (all frames, or stop()). Rejects on cancel or error. */
  done: Promise<Blob>;
  /** Ends early after the frame in progress and keeps the file. */
  stop(): void;
  /** Aborts: encoder closed, nothing is saved. `done` rejects. */
  cancel(): void;
}

let clockT = 0;

/** Film time in seconds of the frame being rendered (0 when no run renders). For the FilmRig filmTime prop. */
export function currentFilmTime(): number {
  return clockT;
}

/** Null when this browser can encode the auto film, else the reason. Does not open an encoder. */
export async function autoEncodeSupport(): Promise<string | null> {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') return AUTO_UNAVAILABLE_TEXT.noWebCodecs;
  try {
    const support = await VideoEncoder.isConfigSupported(autoEncoderConfig());
    return support.supported ? null : AUTO_UNAVAILABLE_TEXT.noH264;
  } catch {
    return AUTO_UNAVAILABLE_TEXT.noH264;
  }
}

const defaultSnapshot = (canvas: HTMLCanvasElement): Promise<ImageBitmap> => createImageBitmap(canvas);

/** Starts the frame loop on an open encoder session. The session is owned by the run: finish or cancel closes it. */
export function startAutoRun(session: AutoEncoderSession, inputs: AutoFilmInputs, deps: AutoRunDeps = {}): AutoRunHandle {
  const snapshot = deps.snapshot ?? defaultSnapshot;
  const frames = autoFrameCount();
  const pose: FilmPose = { position: [0, 0, 0], target: [0, 0, 0] };
  let stopRequested = false;
  let cancelled = false;

  const run = async (): Promise<Blob> => {
    let encoded = 0;
    try {
      for (let i = 0; i < frames && !stopRequested; i++) {
        if (cancelled) throw new Error('Auto film cancelled');
        const t = i / film.fps;
        clockT = t;
        inputs.setPose(inputs.path.poseAt(t, pose));
        inputs.renderFrame();
        const frame = await snapshot(inputs.canvas);
        try {
          await session.encodeFrame(frame, i);
        } finally {
          frame.close();
        }
        encoded++;
      }
      if (cancelled) throw new Error('Auto film cancelled');
      if (encoded === 0) throw new Error('Auto film has no frames');
      if (inputs.readAudio) {
        const audio = inputs.readAudio();
        if (audio.snapshots.length === 0) throw new Error('Auto film: no audio snapshots');
        const rendered = await renderFilmAudio([...audio.snapshots], {
          durationS: encoded / film.fps,
          soundEnabled: audio.soundEnabled,
          volumes: audio.volumes,
          peakTargetDb: film.audioPeakTargetDb,
        });
        await session.encodeAudio(rendered.buffer);
      }
      return await session.finish();
    } catch (err) {
      session.cancel();
      throw err;
    } finally {
      clockT = 0;
    }
  };

  return {
    done: run(),
    stop() {
      stopRequested = true;
    },
    cancel() {
      if (cancelled) return;
      cancelled = true;
      session.cancel();
    },
  };
}
