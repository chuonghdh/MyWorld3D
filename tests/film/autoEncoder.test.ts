import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { film } from '../../src/config/tuning';

// Fake muxer: records every chunk; finalize marks the file done.
const muxerLog = vi.hoisted(() => ({ instances: [] as FakeMuxerShape[] }));
interface FakeMuxerShape {
  chunks: { chunk: { timestamp: number; type: string }; meta?: unknown }[];
  audio: { chunk: { timestamp: number; type: string }; meta?: unknown }[];
  finalized: boolean;
  options: unknown;
}

vi.mock('mp4-muxer', () => {
  class ArrayBufferTarget {
    buffer = new ArrayBuffer(16);
  }
  class Muxer {
    chunks: FakeMuxerShape['chunks'] = [];
    audio: FakeMuxerShape['audio'] = [];
    finalized = false;
    options: unknown;
    constructor(options: unknown) {
      this.options = options;
      muxerLog.instances.push(this as unknown as FakeMuxerShape);
    }
    addVideoChunk(chunk: { timestamp: number; type: string }, meta?: unknown): void {
      this.chunks.push({ chunk, meta });
    }
    addAudioChunk(chunk: { timestamp: number; type: string }, meta?: unknown): void {
      this.audio.push({ chunk, meta });
    }
    finalize(): void {
      this.finalized = true;
    }
  }
  return { ArrayBufferTarget, Muxer };
});

interface FakeFrame {
  timestamp: number;
  closed: boolean;
  close(): void;
}

/** Shared switches and counters for the fake encoder (reset in beforeEach). */
const enc = vi.hoisted(() => ({
  supported: true,
  throwOnSupport: false,
  /** When true, outputs wait for drainOne(); otherwise each encode outputs on the next microtask. */
  manual: false,
  /** Output drops the n-th chunk (1-based) when > 0 (simulates a lost frame). */
  dropIndex: 0,
  instances: [] as FakeEncoderShape[],
  frames: [] as FakeFrame[],
  supportCalls: [] as unknown[],
}));

interface FakeEncoderShape {
  init: { output: (chunk: unknown, meta?: unknown) => void; error: (e: unknown) => void };
  config: VideoEncoderConfig | null;
  state: string;
  encodeQueueSize: number;
  ondequeue: (() => void) | null;
  pending: { timestamp: number; keyFrame: boolean }[];
  outputs: number;
  configure(c: VideoEncoderConfig): void;
  encode(frame: FakeFrame, opts?: { keyFrame?: boolean }): void;
  flush(): Promise<void>;
  close(): void;
  drainOne(): void;
  fail(e: Error): void;
}

class FakeVideoEncoder implements FakeEncoderShape {
  static async isConfigSupported(config: VideoEncoderConfig) {
    enc.supportCalls.push(config);
    if (enc.throwOnSupport) throw new Error('boom');
    return { supported: enc.supported, config };
  }
  init: FakeEncoderShape['init'];
  config: VideoEncoderConfig | null = null;
  state = 'unconfigured';
  encodeQueueSize = 0;
  ondequeue: (() => void) | null = null;
  pending: { timestamp: number; keyFrame: boolean }[] = [];
  outputs = 0;

  constructor(init: FakeEncoderShape['init']) {
    this.init = init;
    enc.instances.push(this);
  }
  configure(c: VideoEncoderConfig): void {
    this.config = c;
    this.state = 'configured';
  }
  encode(frame: FakeFrame, opts?: { keyFrame?: boolean }): void {
    if (this.state !== 'configured') throw new Error('encoder not configured');
    this.encodeQueueSize++;
    this.pending.push({ timestamp: frame.timestamp, keyFrame: !!opts?.keyFrame });
    if (!enc.manual) queueMicrotask(() => this.drainOne());
  }
  drainOne(): void {
    const next = this.pending.shift();
    if (!next) return;
    this.encodeQueueSize--;
    this.outputs++;
    if (enc.dropIndex !== this.outputs) {
      this.init.output({ timestamp: next.timestamp, type: next.keyFrame ? 'key' : 'delta' }, { decoderConfig: {} });
    }
    this.ondequeue?.();
  }
  async flush(): Promise<void> {
    while (this.pending.length > 0) this.drainOne();
  }
  close(): void {
    if (this.state === 'closed') throw new Error('already closed');
    this.state = 'closed';
    this.pending = [];
    this.encodeQueueSize = 0;
  }
  fail(e: Error): void {
    this.state = 'closed';
    this.init.error(e);
  }
}

class FakeVideoFrame implements FakeFrame {
  timestamp: number;
  closed = false;
  constructor(_source: unknown, init: { timestamp: number }) {
    this.timestamp = init.timestamp;
    enc.frames.push(this);
  }
  close(): void {
    this.closed = true;
  }
}

const canvas = {} as CanvasImageSource;

const g = globalThis as unknown as Record<string, unknown>;
let savedEncoder: unknown;
let savedFrame: unknown;

async function loadModule() {
  return import('../../src/film/autoEncoder');
}

beforeEach(() => {
  vi.resetModules();
  enc.supported = true;
  enc.throwOnSupport = false;
  enc.manual = false;
  enc.dropIndex = 0;
  enc.instances.length = 0;
  enc.frames.length = 0;
  enc.supportCalls.length = 0;
  muxerLog.instances.length = 0;
  savedEncoder = g.VideoEncoder;
  savedFrame = g.VideoFrame;
  g.VideoEncoder = FakeVideoEncoder;
  g.VideoFrame = FakeVideoFrame;
});

afterEach(() => {
  g.VideoEncoder = savedEncoder;
  g.VideoFrame = savedFrame;
});

describe('openAutoEncoder: support check', () => {
  it('returns a reason, not a throw, when isConfigSupported says no', async () => {
    enc.supported = false;
    const { openAutoEncoder } = await loadModule();
    const res = await openAutoEncoder();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/not supported/);
    expect(enc.instances).toHaveLength(0);
    expect(muxerLog.instances).toHaveLength(0);
  });

  it('returns a reason when WebCodecs is missing', async () => {
    g.VideoEncoder = undefined;
    const { openAutoEncoder } = await loadModule();
    const res = await openAutoEncoder();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/WebCodecs/);
  });

  it('returns a reason when isConfigSupported throws', async () => {
    enc.throwOnSupport = true;
    const { openAutoEncoder } = await loadModule();
    const res = await openAutoEncoder();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/boom/);
  });

  it('checks the config with the film size, fps and bitrate from config', async () => {
    const { openAutoEncoder } = await loadModule();
    const res = await openAutoEncoder();
    expect(res.ok).toBe(true);
    const cfg = enc.supportCalls[0] as VideoEncoderConfig;
    expect(cfg).toMatchObject({
      codec: 'avc1.640028',
      width: film.width1080,
      height: film.height1080,
      bitrate: film.videoBitrate1080,
      framerate: film.fps,
    });
    expect(enc.instances[0]?.config).toEqual(cfg);
  });
});

describe('openAutoEncoder: lazy muxer', () => {
  it('does not build the muxer when the encoder is unsupported', async () => {
    enc.supported = false;
    const { openAutoEncoder } = await loadModule();
    await openAutoEncoder();
    expect(muxerLog.instances).toHaveLength(0);
  });

  it('builds one MP4 muxer with the film size and fps when supported', async () => {
    const { openAutoEncoder } = await loadModule();
    await openAutoEncoder();
    expect(muxerLog.instances).toHaveLength(1);
    expect(muxerLog.instances[0]?.options).toMatchObject({
      video: { codec: 'avc', width: film.width1080, height: film.height1080, frameRate: film.fps },
      fastStart: 'in-memory',
    });
  });
});

describe('auto encoder session', () => {
  it('writes one chunk per frame, with timestamps i * 1e6 / fps, and resolves an mp4 Blob', async () => {
    const { openAutoEncoder } = await loadModule();
    const res = await openAutoEncoder();
    if (!res.ok) throw new Error(res.reason);
    const n = 10;
    for (let i = 0; i < n; i++) await res.session.encodeFrame(canvas, i);
    const blob = await res.session.finish();

    const chunks = muxerLog.instances[0]?.chunks ?? [];
    expect(chunks).toHaveLength(n);
    expect(chunks.map((c) => c.chunk.timestamp)).toEqual(
      Array.from({ length: n }, (_, i) => Math.round((i * 1e6) / film.fps)),
    );
    expect(blob.type).toBe('video/mp4');
    expect(blob.size).toBe(16);
    expect(muxerLog.instances[0]?.finalized).toBe(true);
  });

  it('closes every VideoFrame it creates', async () => {
    const { openAutoEncoder } = await loadModule();
    const res = await openAutoEncoder();
    if (!res.ok) throw new Error(res.reason);
    for (let i = 0; i < 5; i++) await res.session.encodeFrame(canvas, i);
    await res.session.finish();
    expect(enc.frames).toHaveLength(5);
    expect(enc.frames.every((f) => f.closed)).toBe(true);
  });

  it('marks keyframes at the GOP interval only', async () => {
    const { openAutoEncoder, keyframeGop } = await loadModule();
    const gop = keyframeGop();
    const res = await openAutoEncoder();
    if (!res.ok) throw new Error(res.reason);
    const n = gop + 3;
    for (let i = 0; i < n; i++) await res.session.encodeFrame(canvas, i);
    await res.session.finish();
    const keys = muxerLog.instances[0]!.chunks.filter((c) => c.chunk.type === 'key');
    expect(keys.map((c) => c.chunk.timestamp)).toEqual([0, Math.round((gop * 1e6) / film.fps)]);
  });

  it('keeps the encoder queue at or below encodeQueueMax', async () => {
    enc.manual = true;
    const { openAutoEncoder } = await loadModule();
    const res = await openAutoEncoder();
    if (!res.ok) throw new Error(res.reason);
    const max = film.encodeQueueMax;
    const all: Promise<void>[] = [];
    for (let i = 0; i < max + 3; i++) all.push(res.session.encodeFrame(canvas, i));
    await new Promise((r) => setTimeout(r, 0));
    const encoder = enc.instances[0]!;
    expect(encoder.encodeQueueSize).toBe(max);
    expect(enc.frames).toHaveLength(max);

    // Drain one: the next frame enters, the queue stays at max.
    encoder.drainOne();
    await new Promise((r) => setTimeout(r, 0));
    expect(encoder.encodeQueueSize).toBe(max);
    expect(enc.frames).toHaveLength(max + 1);

    // Drain the rest and finish.
    while (enc.frames.length < max + 3 || encoder.pending.length > 0) {
      encoder.drainOne();
      await new Promise((r) => setTimeout(r, 0));
    }
    await Promise.all(all);
    const blob = await res.session.finish();
    expect(blob.type).toBe('video/mp4');
    expect(muxerLog.instances[0]!.chunks).toHaveLength(max + 3);
  });
});

describe('auto encoder session: cancel and errors', () => {
  it('cancel closes the encoder, drops data and rejects later calls', async () => {
    enc.manual = true;
    const { openAutoEncoder } = await loadModule();
    const res = await openAutoEncoder();
    if (!res.ok) throw new Error(res.reason);
    await res.session.encodeFrame(canvas, 0);
    res.session.cancel();

    const encoder = enc.instances[0]!;
    expect(encoder.state).toBe('closed');
    expect(encoder.encodeQueueSize).toBe(0);
    expect(muxerLog.instances[0]!.chunks).toHaveLength(0);
    await expect(res.session.encodeFrame(canvas, 1)).rejects.toThrow(/cancelled/);
    await expect(res.session.finish()).rejects.toThrow(/cancelled/);
    expect(muxerLog.instances[0]!.finalized).toBe(false);
  });

  it('cancel can be called twice and after finish without error', async () => {
    const { openAutoEncoder } = await loadModule();
    const res = await openAutoEncoder();
    if (!res.ok) throw new Error(res.reason);
    await res.session.encodeFrame(canvas, 0);
    await res.session.finish();
    expect(() => res.session.cancel()).not.toThrow();
    expect(() => res.session.cancel()).not.toThrow();
  });

  it('cancel while a frame is waiting for queue room does not hang', async () => {
    enc.manual = true;
    const { openAutoEncoder } = await loadModule();
    const res = await openAutoEncoder();
    if (!res.ok) throw new Error(res.reason);
    const max = film.encodeQueueMax;
    const waiting: Promise<unknown>[] = [];
    for (let i = 0; i < max + 1; i++) waiting.push(res.session.encodeFrame(canvas, i).catch((e: Error) => e));
    await new Promise((r) => setTimeout(r, 0));
    res.session.cancel();
    const results = await Promise.all(waiting);
    expect(results.slice(0, max)).toEqual(Array(max).fill(undefined));
    expect(results[max]).toBeInstanceOf(Error);
  });

  it('a frame lost in the encoder makes finish reject', async () => {
    enc.dropIndex = 2;
    const { openAutoEncoder } = await loadModule();
    const res = await openAutoEncoder();
    if (!res.ok) throw new Error(res.reason);
    for (let i = 0; i < 4; i++) await res.session.encodeFrame(canvas, i);
    await expect(res.session.finish()).rejects.toThrow(/3 chunks for 4 frames/);
    res.session.cancel();
  });

  it('an encoder error makes later calls and finish reject with that error', async () => {
    const { openAutoEncoder } = await loadModule();
    const res = await openAutoEncoder();
    if (!res.ok) throw new Error(res.reason);
    await res.session.encodeFrame(canvas, 0);
    enc.instances[0]!.fail(new Error('gpu lost'));
    await expect(res.session.encodeFrame(canvas, 1)).rejects.toThrow(/gpu lost/);
    await expect(res.session.finish()).rejects.toThrow(/gpu lost/);
    res.session.cancel();
    expect(enc.instances[0]!.state).toBe('closed');
  });
});

// Fake AudioEncoder: outputs each chunk synchronously; records configs and every AudioData.
const audioLog = vi.hoisted(() => ({
  supported: true,
  supportCalls: [] as AudioEncoderConfig[],
  instances: [] as FakeAudioEncoderInstance[],
  datas: [] as FakeAudioDataInstance[],
}));

interface FakeAudioEncoderInstance {
  init: { output: (chunk: unknown, meta?: unknown) => void; error: (e: unknown) => void };
  config: AudioEncoderConfig | null;
  state: string;
  encodeQueueSize: number;
  ondequeue: (() => void) | null;
}

interface FakeAudioDataInstance {
  format: string;
  sampleRate: number;
  numberOfFrames: number;
  numberOfChannels: number;
  timestamp: number;
  data: Float32Array;
  closed: boolean;
  close(): void;
}

class FakeAudioEncoder implements FakeAudioEncoderInstance {
  static async isConfigSupported(config: AudioEncoderConfig) {
    audioLog.supportCalls.push(config);
    return { supported: audioLog.supported, config };
  }
  init: FakeAudioEncoderInstance['init'];
  config: AudioEncoderConfig | null = null;
  state = 'unconfigured';
  encodeQueueSize = 0;
  ondequeue: (() => void) | null = null;
  constructor(init: FakeAudioEncoderInstance['init']) {
    this.init = init;
    audioLog.instances.push(this);
  }
  configure(c: AudioEncoderConfig): void {
    this.config = c;
    this.state = 'configured';
  }
  encode(data: FakeAudioDataInstance): void {
    if (this.state !== 'configured') throw new Error('audio encoder not configured');
    this.init.output({ timestamp: data.timestamp, type: 'key' }, { decoderConfig: {} });
  }
  async flush(): Promise<void> {}
  close(): void {
    this.state = 'closed';
  }
}

class FakeAudioData implements FakeAudioDataInstance {
  format: string;
  sampleRate: number;
  numberOfFrames: number;
  numberOfChannels: number;
  timestamp: number;
  data: Float32Array;
  closed = false;
  constructor(init: { format: string; sampleRate: number; numberOfFrames: number; numberOfChannels: number; timestamp: number; data: Float32Array }) {
    this.format = init.format;
    this.sampleRate = init.sampleRate;
    this.numberOfFrames = init.numberOfFrames;
    this.numberOfChannels = init.numberOfChannels;
    this.timestamp = init.timestamp;
    this.data = init.data;
    audioLog.datas.push(this);
  }
  close(): void {
    this.closed = true;
  }
}

/** Stereo buffer of `length` frames; channel 0 is all 1, channel 1 all 2. */
function fakeMix(length: number, sampleRate = 48000, channels = 2): AudioBuffer {
  return {
    length,
    sampleRate,
    numberOfChannels: channels,
    getChannelData: (c: number) => new Float32Array(length).fill(c + 1),
  } as unknown as AudioBuffer;
}

describe('auto encoder: audio track', () => {
  let savedAudioEncoder: unknown;
  let savedAudioData: unknown;

  beforeEach(() => {
    audioLog.supported = true;
    audioLog.supportCalls.length = 0;
    audioLog.instances.length = 0;
    audioLog.datas.length = 0;
    savedAudioEncoder = g.AudioEncoder;
    savedAudioData = g.AudioData;
    g.AudioEncoder = FakeAudioEncoder;
    g.AudioData = FakeAudioData;
  });

  afterEach(() => {
    g.AudioEncoder = savedAudioEncoder;
    g.AudioData = savedAudioData;
  });

  async function openSession(options?: { audio?: boolean }) {
    const mod = await loadModule();
    const res = await mod.openAutoEncoder(options);
    if (!res.ok) throw new Error(res.reason);
    return res.session;
  }

  it('audio: false (or omitted) keeps the video-only muxer and no audio encoder', async () => {
    await openSession();
    expect(audioLog.supportCalls).toHaveLength(0);
    expect(audioLog.instances).toHaveLength(0);
    expect((muxerLog.instances[0]!.options as { audio?: unknown }).audio).toBeUndefined();
  });

  it('audio: true declares an AAC 48 kHz stereo track and configures the encoder', async () => {
    await openSession({ audio: true });
    expect(audioLog.supportCalls[0]).toMatchObject({ codec: 'mp4a.40.2', sampleRate: 48000, numberOfChannels: 2, bitrate: film.audioBitrate });
    expect((muxerLog.instances[0]!.options as { audio: unknown }).audio).toEqual({ codec: 'aac', numberOfChannels: 2, sampleRate: 48000 });
    expect(audioLog.instances[0]!.config).toMatchObject({ codec: 'mp4a.40.2' });
  });

  it('reports a clear reason when AAC is not supported', async () => {
    audioLog.supported = false;
    const mod = await loadModule();
    const res = await mod.openAutoEncoder({ audio: true });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/AAC/);
  });

  it('encodeAudio slices the mix into 1024-frame AudioData with exact timestamps and muxes them', async () => {
    const session = await openSession({ audio: true });
    await session.encodeAudio(fakeMix(2500));
    const datas = audioLog.datas;
    expect(datas.map((d) => d.numberOfFrames)).toEqual([1024, 1024, 452]);
    expect(datas.map((d) => d.timestamp)).toEqual([0, 21333, 42667]);
    expect(datas.every((d) => d.format === 'f32-planar' && d.sampleRate === 48000 && d.closed)).toBe(true);
    // Planar layout: first n samples are channel 0, next n are channel 1.
    expect(datas[2]!.data.length).toBe(452 * 2);
    expect(datas[2]!.data[0]).toBe(1);
    expect(datas[2]!.data[452]).toBe(2);
    await session.finish();
    expect(muxerLog.instances[0]!.audio).toHaveLength(3);
    expect(muxerLog.instances[0]!.finalized).toBe(true);
  });

  it('finish rejects when the audio track was opened but encodeAudio was not called', async () => {
    const session = await openSession({ audio: true });
    await expect(session.finish()).rejects.toThrow(/encodeAudio was not called/);
  });

  it('encodeAudio rejects on a video-only session, on a wrong format and on a second call', async () => {
    const videoOnly = await openSession();
    await expect(videoOnly.encodeAudio(fakeMix(10))).rejects.toThrow(/opened without audio/);
    videoOnly.cancel();

    const session = await openSession({ audio: true });
    await expect(session.encodeAudio(fakeMix(10, 44100))).rejects.toThrow(/48000 Hz/);
    await session.encodeAudio(fakeMix(10));
    await expect(session.encodeAudio(fakeMix(10))).rejects.toThrow(/already encoded/);
  });

  it('cancel closes the audio encoder', async () => {
    const session = await openSession({ audio: true });
    session.cancel();
    expect(audioLog.instances[0]!.state).toBe('closed');
  });
});
