import { afterEach, describe, expect, it } from 'vitest';
import type { AudioFrame } from '../../src/audio/frame';
import { audioTapSnapshots, resetAudioTap, tapAudioFrame } from '../../src/film/audioSnapshot';
import { startAutoFilmClock, stopAutoFilmClock } from '../../src/film/filmClock';

const frame = {
  dt: 0.033,
  listener: { x: 0, y: 1.7, z: 0, forward: { x: 0, y: 0, z: 1 }, up: { x: 0, y: 1, z: 0 }, height: 1.7 },
  timeOfDay: 12, season: 'autumn', windSpeed: 0, gust: 0, rain: 0, night: false, musicEnabled: false,
  vehicles: [], pedestrians: [], trees: [], church: null, lifeEvents: [], thunder: [], horns: [], aircraft: [],
} as unknown as AudioFrame;

afterEach(() => {
  stopAutoFilmClock();
  resetAudioTap();
});

describe('audio tap guard', () => {
  it('stores nothing when not filming', () => {
    startAutoFilmClock(0);
    tapAudioFrame(false, frame);
    expect(audioTapSnapshots()).toHaveLength(0);
  });
  it('stores nothing when the auto clock is idle (manual film)', () => {
    tapAudioFrame(true, frame);
    expect(audioTapSnapshots()).toHaveLength(0);
  });
  it('stores a snapshot while the auto film runs', () => {
    startAutoFilmClock(performance.now());
    tapAudioFrame(true, frame);
    expect(audioTapSnapshots()).toHaveLength(1);
  });
});
