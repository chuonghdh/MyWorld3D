import { describe, expect, it } from 'vitest';
import { film } from '../../src/config/tuning';
import { autoFrameCount } from '../../src/film/autoPath';
import { autoEncodeSupport, currentFilmTime, startAutoRun, AUTO_UNAVAILABLE_TEXT } from '../../src/film/autoRun';
import type { AutoEncoderSession } from '../../src/film/autoEncoder';
import type { FilmPath, FilmPose } from '../../src/scene/filmPath';

interface FakeSession extends AutoEncoderSession {
  indices: number[];
  audioCalls: number;
  finished: boolean;
  cancelled: boolean;
}

function fakeSession(): FakeSession {
  const s: FakeSession = {
    indices: [],
    audioCalls: 0,
    finished: false,
    cancelled: false,
    async encodeFrame(_canvas, index) {
      if (s.cancelled) throw new Error('auto encoder was cancelled');
      s.indices.push(index);
    },
    async encodeAudio() {
      s.audioCalls++;
    },
    async finish() {
      s.finished = true;
      return new Blob(['mp4'], { type: 'video/mp4' });
    },
    cancel() {
      s.cancelled = true;
    },
  };
  return s;
}

function fakePath(): FilmPath {
  const path = {
    duration: film.autoSeconds,
    length: 0,
    peakSpeed: 0,
    keys: [],
    focus: [0, 0, 0] as const,
    perch: { position: [0, 0, 0] as const, target: [0, 0, 0] as const },
    skyDir: [0, 0, 1] as const,
    poseAt(t: number, out?: FilmPose): FilmPose {
      const o = out ?? { position: [0, 0, 0], target: [0, 0, 0] };
      o.position = [t, 0, 0];
      return o;
    },
  };
  return path as unknown as FilmPath;
}

const fakeCanvas = {} as HTMLCanvasElement;
const snapshot = async () => ({ close() {} }) as unknown as ImageBitmap;

describe('auto run driver', () => {
  it('renders every frame in order and returns the encoder file', async () => {
    const session = fakeSession();
    const poses: number[] = [];
    let renders = 0;
    const handle = startAutoRun(
      session,
      {
        path: fakePath(),
        canvas: fakeCanvas,
        setPose: (p) => poses.push(p.position[0]),
        renderFrame: () => {
          renders++;
        },
      },
      { snapshot },
    );
    const blob = await handle.done;
    const frames = autoFrameCount();
    expect(session.indices).toEqual(Array.from({ length: frames }, (_, i) => i));
    expect(renders).toBe(frames);
    expect(poses[1]).toBeCloseTo(1 / film.fps, 9);
    expect(session.finished).toBe(true);
    expect(blob.type).toBe('video/mp4');
    expect(currentFilmTime()).toBe(0);
  });

  it('stop ends after the frame in progress and keeps the file', async () => {
    const session = fakeSession();
    let handle!: ReturnType<typeof startAutoRun>;
    handle = startAutoRun(
      session,
      {
        path: fakePath(),
        canvas: fakeCanvas,
        setPose: (p) => {
          if (p.position[0] > 4 / film.fps - 1e-9 && p.position[0] < 4 / film.fps + 1e-9) handle.stop();
        },
        renderFrame: () => {},
      },
      { snapshot },
    );
    await handle.done;
    expect(session.indices).toEqual([0, 1, 2, 3, 4]);
    expect(session.finished).toBe(true);
  });

  it('cancel rejects, closes the encoder and does not finish', async () => {
    const session = fakeSession();
    let handle!: ReturnType<typeof startAutoRun>;
    handle = startAutoRun(
      session,
      {
        path: fakePath(),
        canvas: fakeCanvas,
        setPose: () => {},
        renderFrame: () => {
          if (session.indices.length === 3) handle.cancel();
        },
      },
      { snapshot },
    );
    await expect(handle.done).rejects.toThrow();
    expect(session.cancelled).toBe(true);
    expect(session.finished).toBe(false);
    expect(currentFilmTime()).toBe(0);
  });
});

describe('auto encode support', () => {
  it('reports the reason when WebCodecs is missing', async () => {
    expect(await autoEncodeSupport()).toBe(AUTO_UNAVAILABLE_TEXT.noWebCodecs);
  });
});
