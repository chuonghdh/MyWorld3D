/**
 * Auto film encoder (P3): H.264 VideoEncoder into an MP4 file.
 * The MP4 muxer (mp4-muxer) is a lazy chunk: it is imported only when a session opens and the encoder is supported.
 * Frames are canvases; frame i gets timestamp i / fps. Each VideoFrame is closed right after encode().
 */
import type { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import { film } from '../config/tuning';

/** High profile, level 4.0: 1920x1080 at 30 fps is above Baseline 3.0 limits. Fixed codec string, not a knob. */
const AVC_CODEC = 'avc1.640028';
/** AAC-LC in MP4. Fixed codec string, not a knob. */
const AAC_CODEC = 'mp4a.40.2';
/** Film mix rate and layout: must match RENDER_SAMPLE_RATE in audio/offlineRender.ts and the stereo render. */
const AUDIO_SAMPLE_RATE = 48000;
const AUDIO_CHANNELS = 2;
/** Frames per AudioData (one AAC access unit). Algorithm constant, not a knob. */
const AUDIO_CHUNK_FRAMES = 1024;

export type AutoEncoderOpenResult = { ok: true; session: AutoEncoderSession } | { ok: false; reason: string };

export interface AutoEncoderOpenOptions {
  /**
   * Adds an AAC audio track (48 kHz stereo). The track must be declared at open. Without it, encodeAudio rejects
   * and the MP4 is video only. Default false.
   */
  audio?: boolean;
}

export interface AutoEncoderSession {
  /** Encodes one frame. Calls run in order; waits while the encoder queue is full. Rejects after cancel or on error. */
  encodeFrame(canvas: CanvasImageSource, index: number): Promise<void>;
  /**
   * Encodes the whole film mix (renderFilmAudio buffer) into the audio track. Call once, before finish(). Rejects when
   * the session was opened without audio, the buffer is not 48 kHz stereo, or it is called twice.
   */
  encodeAudio(buffer: AudioBuffer): Promise<void>;
  /**
   * Flushes the encoders, finalizes the MP4 and resolves the file. Rejects if frames were lost, the encoder failed,
   * or the audio track was opened but encodeAudio was not called.
   */
  finish(): Promise<Blob>;
  /** Closes the encoder and drops all encoded data. Safe to call more than once. */
  cancel(): void;
}

/** Encoder config for the auto film output (size, fps and bitrate come from config/tuning/film.ts). */
export function autoEncoderConfig(): VideoEncoderConfig {
  return {
    codec: AVC_CODEC,
    width: film.width1080,
    height: film.height1080,
    bitrate: film.videoBitrate1080,
    framerate: film.fps,
    avc: { format: 'avc' },
  };
}

/** Keyframe every `keyframeIntervalS` seconds, at least every frame. */
export function keyframeGop(): number {
  return Math.max(1, Math.round(film.keyframeIntervalS * film.fps));
}

/** Timestamp of frame `index` in microseconds (integer, as WebCodecs requires). */
export function frameTimestampUs(index: number): number {
  return Math.round((index * 1e6) / film.fps);
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Opens an H.264 encoding session. Never throws for an unsupported browser or encoder: returns the reason instead.
 * The muxer chunk is loaded only after the support check passes.
 */
export async function openAutoEncoder(options: AutoEncoderOpenOptions = {}): Promise<AutoEncoderOpenResult> {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') {
    return { ok: false, reason: 'WebCodecs (VideoEncoder/VideoFrame) is not available in this browser' };
  }
  const config = autoEncoderConfig();
  try {
    const support = await VideoEncoder.isConfigSupported(config);
    if (!support.supported) {
      return { ok: false, reason: `H.264 ${config.width}x${config.height} at ${config.framerate} fps is not supported by this encoder` };
    }
  } catch (e) {
    return { ok: false, reason: `VideoEncoder.isConfigSupported failed: ${errorText(e)}` };
  }

  const audioConfig = options.audio ? autoAudioEncoderConfig() : null;
  if (audioConfig) {
    if (typeof AudioEncoder === 'undefined' || typeof AudioData === 'undefined') {
      return { ok: false, reason: 'WebCodecs (AudioEncoder/AudioData) is not available in this browser' };
    }
    try {
      const support = await AudioEncoder.isConfigSupported(audioConfig);
      if (!support.supported) return { ok: false, reason: `AAC ${AUDIO_SAMPLE_RATE} Hz stereo is not supported by this encoder` };
    } catch (e) {
      return { ok: false, reason: `AudioEncoder.isConfigSupported failed: ${errorText(e)}` };
    }
  }

  let muxerModule: typeof import('mp4-muxer');
  try {
    muxerModule = await import('mp4-muxer');
  } catch (e) {
    return { ok: false, reason: `MP4 muxer failed to load: ${errorText(e)}` };
  }

  const target = new muxerModule.ArrayBufferTarget();
  const muxer = new muxerModule.Muxer({
    target,
    video: { codec: 'avc', width: config.width, height: config.height, frameRate: film.fps },
    ...(audioConfig
      ? { audio: { codec: 'aac' as const, numberOfChannels: AUDIO_CHANNELS, sampleRate: AUDIO_SAMPLE_RATE } }
      : {}),
    fastStart: 'in-memory',
  });

  try {
    return { ok: true, session: createSession(muxer, target, config, audioConfig) };
  } catch (e) {
    return { ok: false, reason: `VideoEncoder could not start: ${errorText(e)}` };
  }
}

/** AAC config for the auto film audio track. Bitrate from config/tuning/film.ts. */
export function autoAudioEncoderConfig(): AudioEncoderConfig {
  return {
    codec: AAC_CODEC,
    sampleRate: AUDIO_SAMPLE_RATE,
    numberOfChannels: AUDIO_CHANNELS,
    bitrate: film.audioBitrate,
  };
}

function createSession(
  muxer: Muxer<ArrayBufferTarget> | null,
  target: ArrayBufferTarget,
  config: VideoEncoderConfig,
  audioConfig: AudioEncoderConfig | null,
): AutoEncoderSession {
  const maxQueue = film.encodeQueueMax;
  const gop = keyframeGop();
  let failure: Error | null = null;
  let cancelled = false;
  let finished = false;
  let submitted = 0;
  let received = 0;
  /** Resolver of the single pending wait for queue room (encodeFrame calls are serialized). */
  let wake: (() => void) | null = null;
  /** Serializes encodeFrame and finish so only one waiter exists at a time. */
  let chain: Promise<unknown> = Promise.resolve();
  /** Audio track state: encoder (null when opened without audio), single queue waiter, and whether it was fed. */
  let audioEncoder: AudioEncoder | null = null;
  let audioWake: (() => void) | null = null;
  let audioEncoded = false;

  const notify = (): void => {
    const w = wake;
    wake = null;
    w?.();
  };
  const notifyAudio = (): void => {
    const w = audioWake;
    audioWake = null;
    w?.();
  };

  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      if (cancelled || !muxer) return;
      received++;
      muxer.addVideoChunk(chunk, meta);
    },
    error: (e) => {
      failure = e instanceof Error ? e : new Error(errorText(e));
      notify();
      notifyAudio();
    },
  });
  encoder.ondequeue = notify;
  encoder.configure(config);

  if (audioConfig) {
    audioEncoder = new AudioEncoder({
      output: (chunk, meta) => {
        if (cancelled || !muxer) return;
        muxer.addAudioChunk(chunk, meta);
      },
      error: (e) => {
        failure = e instanceof Error ? e : new Error(errorText(e));
        notify();
        notifyAudio();
      },
    });
    audioEncoder.ondequeue = notifyAudio;
    audioEncoder.configure(audioConfig);
  }

  const assertOpen = (): void => {
    if (cancelled) throw new Error('auto encoder was cancelled');
    if (finished) throw new Error('auto encoder already finished');
    if (failure) throw failure;
  };

  const waitForRoom = async (): Promise<void> => {
    while (encoder.encodeQueueSize >= maxQueue && !failure && !cancelled) {
      await new Promise<void>((resolve) => {
        wake = resolve;
      });
    }
  };

  const waitForAudioRoom = async (): Promise<void> => {
    while (audioEncoder && audioEncoder.encodeQueueSize >= maxQueue && !failure && !cancelled) {
      await new Promise<void>((resolve) => {
        audioWake = resolve;
      });
    }
  };

  /** Feeds the mix in AUDIO_CHUNK_FRAMES slices. Runs inside the serialized chain, like encodeOne. */
  const encodeAudioBuffer = async (buffer: AudioBuffer): Promise<void> => {
    assertOpen();
    const audio = audioEncoder;
    if (!audio) throw new Error('auto encoder was opened without audio (use openAutoEncoder({ audio: true }))');
    if (audioEncoded) throw new Error('auto encoder audio was already encoded');
    if (buffer.sampleRate !== AUDIO_SAMPLE_RATE || buffer.numberOfChannels !== AUDIO_CHANNELS) {
      throw new Error(`auto encoder audio must be ${AUDIO_SAMPLE_RATE} Hz with ${AUDIO_CHANNELS} channels`);
    }
    audioEncoded = true;
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    for (let start = 0; start < buffer.length; start += AUDIO_CHUNK_FRAMES) {
      assertOpen();
      await waitForAudioRoom();
      assertOpen();
      const n = Math.min(AUDIO_CHUNK_FRAMES, buffer.length - start);
      const data = new Float32Array(n * AUDIO_CHANNELS);
      data.set(left.subarray(start, start + n), 0);
      data.set(right.subarray(start, start + n), n);
      const chunk = new AudioData({
        format: 'f32-planar',
        sampleRate: AUDIO_SAMPLE_RATE,
        numberOfFrames: n,
        numberOfChannels: AUDIO_CHANNELS,
        timestamp: Math.round((start * 1e6) / AUDIO_SAMPLE_RATE),
        data,
      });
      try {
        audio.encode(chunk);
      } finally {
        chunk.close();
      }
    }
  };

  const encodeOne = async (canvas: CanvasImageSource, index: number): Promise<void> => {
    assertOpen();
    await waitForRoom();
    assertOpen();
    const frame = new VideoFrame(canvas, { timestamp: frameTimestampUs(index) });
    try {
      encoder.encode(frame, { keyFrame: index % gop === 0 });
      submitted++;
    } finally {
      frame.close();
    }
  };

  return {
    encodeFrame(canvas, index) {
      const run = chain.then(() => encodeOne(canvas, index));
      chain = run.catch(() => undefined);
      return run;
    },

    encodeAudio(buffer) {
      const run = chain.then(() => encodeAudioBuffer(buffer));
      chain = run.catch(() => undefined);
      return run;
    },

    finish() {
      const run = chain.then(async (): Promise<Blob> => {
        assertOpen();
        await encoder.flush();
        if (failure) throw failure;
        if (received !== submitted) {
          throw new Error(`auto encoder produced ${received} chunks for ${submitted} frames`);
        }
        if (audioEncoder) {
          if (!audioEncoded) throw new Error('auto encoder: audio track opened but encodeAudio was not called');
          await audioEncoder.flush();
          if (failure) throw failure;
        }
        finished = true;
        encoder.close();
        if (audioEncoder && audioEncoder.state !== 'closed') audioEncoder.close();
        muxer?.finalize();
        muxer = null;
        return new Blob([target.buffer], { type: 'video/mp4' });
      });
      chain = run.catch(() => undefined);
      return run;
    },

    cancel() {
      if (cancelled) return;
      cancelled = true;
      notify();
      notifyAudio();
      if (encoder.state !== 'closed') encoder.close();
      if (audioEncoder && audioEncoder.state !== 'closed') audioEncoder.close();
      muxer = null;
    },
  };
}
