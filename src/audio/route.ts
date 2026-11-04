// Which frame each sound system receives. Shared by the live update (index.ts) and the offline film render.
import type { AudioFrame } from './frame';
import { AERIAL_HEIGHT_M } from './listener';

/** The frame with every ground source and the wind removed, so those systems fade out; rain and thunder stay. */
export function quietFrame(f: AudioFrame): AudioFrame {
  return {
    ...f, night: false, windSpeed: 0, gust: 0, vehicles: [], pedestrians: [], trees: [],
    church: null, lifeEvents: [], horns: [],
    // Airliners are 200-300 m up and heard from the overview too (quietly, by distance and the zoom factor).
    aircraft: f.aircraft,
  };
}

/** The frame for the bird system: no walkers (so no dogs) and only bird life events (no cats). */
export function birdsOnlyFrame(f: AudioFrame): AudioFrame {
  const events = f.lifeEvents.filter((e) => e.type === 'bird-call' || e.type === 'pigeon-scatter');
  return { ...f, pedestrians: [], lifeEvents: events };
}

export interface RouteOptions {
  /**
   * The 45 m aerial gate. Default true (live play). The offline film render passes false: the film overview is
   * above 45 m and keeps its ground sound (risk 11, film exemption). Live behaviour does not change.
   */
  aerialGate?: boolean;
}

/**
 * The frame a system gets this tick, or null when it is skipped. Sound off silences every system except music
 * (its own switch, frame.musicEnabled). Above AERIAL_HEIGHT_M only birds and music are heard, unless the aerial
 * gate is off (film render).
 */
export function routeFrame(name: string, frame: AudioFrame, soundEnabled: boolean, opts: RouteOptions = {}): AudioFrame | null {
  if (name === 'music') return frame;
  if (!soundEnabled) return null;
  if (opts.aerialGate === false || frame.listener.height <= AERIAL_HEIGHT_M) return frame;
  return name === 'animals' ? birdsOnlyFrame(frame) : quietFrame(frame);
}
