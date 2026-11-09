// Agent room shell logic (pure): metrics, honesty matrix, keys, insets.
import { describe, expect, it } from 'vitest';
import { SOURCE_LINE, clockText, controlsFor, metricsOf, placeText } from '../src/agentRoom/ui/metrics';
import { keyAction } from '../src/agentRoom/ui/CameraBar';
import { measureInsets } from '../src/agentRoom/ui/AppShell';
import { isClick } from '../src/agentRoom/ui/pick';
import { nextQuality } from '../src/agentRoom/world/QualityMonitor';
import { useUi } from '../src/agentRoom/ui/uiStore';
import { initialState } from '../src/agentRoom/engine/state';
import { apply } from '../src/agentRoom/engine/reduce';

describe('metrics', () => {
  it('counts active, waiting, done; every roster agent counts', () => {
    let s = initialState('live');
    s = apply(s, { seq: 1, t: 0, source: 'live', agent: 'audio', kind: 'tool_start', tool: 'Edit' });
    s = apply(s, { seq: 2, t: 0, source: 'live', agent: 'lead', kind: 'notify' });
    s = apply(s, { seq: 3, t: 0, source: 'live', agent: 'buildings', kind: 'subagent_done' });
    expect(metricsOf(Object.values(s.agents))).toEqual({ agents: 9, active: 1, waiting: 1, done: 1, errors: 0 });
  });
  it('clock text', () => {
    expect(clockText(0)).toBe('00:00');
    expect(clockText(125_400)).toBe('02:05');
  });
});

describe('source honesty', () => {
  it('live shows no playback controls (no command channel)', () => {
    expect(controlsFor('live')).toEqual({ playPause: false, speed: false, restart: false, scrubber: false, reseed: false, connection: true });
  });
  it('replay has a scrubber, simulation has reseed, neither shows connection', () => {
    expect(controlsFor('replay')).toMatchObject({ playPause: true, scrubber: true, reseed: false, connection: false });
    expect(controlsFor('simulation')).toMatchObject({ playPause: true, scrubber: false, reseed: true, connection: false });
  });
  it('simulation is labelled as not real work', () => {
    expect(SOURCE_LINE.simulation.note).toMatch(/not real work/);
  });
});

describe('keys', () => {
  it.each([
    ['0', { preset: 'overview' }],
    ['1', { preset: 'hub' }],
    ['2', { preset: 'buildings' }],
    ['9', { preset: 'architect' }],
    ['w', { preset: 'wall' }],
    ['Escape', { cmd: 'clear' }],
    ['F', { cmd: 'follow' }],
    [' ', { cmd: 'pause' }],
    ['x', null],
  ])('%s', (k, want) => {
    expect(keyAction(k)).toEqual(want);
  });
});

describe('place labels', () => {
  it('derive location text from the office activity', () => {
    expect(placeText({ activity: 'relax', arrived: true })).toBe('Pantry (idle)');
    expect(placeText({ activity: 'huddle', arrived: false })).toBe('Walking to board');
    expect(placeText({ activity: 'hidden', arrived: true })).toBe('Not in the room');
  });
});

describe('picking and quality', () => {
  it('click tolerance is 5 px; no press means no click', () => {
    expect(isClick({ x: 10, y: 10 }, { x: 13, y: 14 })).toBe(true);
    expect(isClick({ x: 10, y: 10 }, { x: 16, y: 10 })).toBe(false);
    expect(isClick(null, { x: 0, y: 0 })).toBe(false);
  });
  it('auto quality only drops from high, never raises', () => {
    expect(nextQuality('high', true)).toBe('performance');
    expect(nextQuality('high', false)).toBe('high');
    expect(nextQuality('performance', false)).toBe('performance');
  });
  it('a 3D pick switches to the Agents tab; a list pick keeps the tab', () => {
    useUi.getState().set({ tab: 'activity', selected: null });
    useUi.getState().select('audio');
    expect(useUi.getState().tab).toBe('activity');
    useUi.getState().select('audio', true);
    expect(useUi.getState().tab).toBe('agents');
  });
});

describe('insets', () => {
  const r = (left: number, top: number, right: number, bottom: number) => ({ left, top, right, bottom }) as DOMRect;
  it('desktop: rail left, top bar, panel right, camera bar bottom', () => {
    expect(measureInsets(1920, 1080, { rail: r(12, 12, 84, 1068), top: r(96, 12, 1908, 76), panel: r(1516, 88, 1908, 1068), cam: r(800, 1012, 1100, 1068) })).toEqual({
      left: 84,
      top: 76,
      right: 404,
      bottom: 68,
    });
  });
  it('mobile: panel is a bottom sheet', () => {
    expect(measureInsets(390, 800, { top: r(12, 12, 378, 64), panel: r(12, 400, 378, 720) })).toEqual({ left: 0, top: 64, right: 0, bottom: 400 });
  });
});
