// Pure UI helpers: header metrics, status pills, source honesty lines and the source control matrix.
import type { AgentSnapshot, AgentStatus, Source } from '../model/types';

export interface Metrics {
  agents: number;
  active: number;
  waiting: number;
  done: number;
  errors: number;
}

/** Guests count only when they have done something. */
export function metricsOf(agents: readonly AgentSnapshot[]): Metrics {
  const shown = agents.filter((a) => a.id !== 'guest' || a.status !== 'idle');
  const is = (...s: AgentStatus[]) => shown.filter((a) => s.includes(a.status)).length;
  return { agents: shown.length, active: is('thinking', 'tool', 'delegating'), waiting: is('waiting'), done: is('done'), errors: is('error') };
}

export type Tone = 'ok' | 'warn' | 'bad' | 'signal' | 'quiet';

export const STATUS_PILL: Record<AgentStatus, { label: string; tone: Tone }> = {
  idle: { label: 'Idle', tone: 'quiet' },
  thinking: { label: 'Thinking', tone: 'signal' },
  tool: { label: 'Using tool', tone: 'signal' },
  delegating: { label: 'Delegating', tone: 'signal' },
  waiting: { label: 'Waiting for you', tone: 'warn' },
  done: { label: 'Done', tone: 'ok' },
  error: { label: 'Error', tone: 'bad' },
};

export const SOURCE_LINE: Record<Source, { label: string; note: string; tone: Tone }> = {
  live: { label: 'Live', note: 'Claude Code hooks via local bridge', tone: 'ok' },
  replay: { label: 'Replay', note: 'Recorded harness state (last 50 commits)', tone: 'signal' },
  simulation: { label: 'Simulation', note: 'Seeded demo, not real work', tone: 'warn' },
};

export interface SourceControls {
  playPause: boolean;
  speed: boolean;
  restart: boolean;
  scrubber: boolean;
  reseed: boolean;
  connection: boolean;
}

/** Which controls a source may show (ADR 0013 decision 5: no commands to live agents). */
export function controlsFor(source: Source): SourceControls {
  switch (source) {
    case 'live':
      return { playPause: false, speed: false, restart: false, scrubber: false, reseed: false, connection: true };
    case 'replay':
      return { playPause: true, speed: true, restart: true, scrubber: true, reseed: false, connection: false };
    case 'simulation':
      return { playPause: true, speed: true, restart: true, scrubber: false, reseed: true, connection: false };
  }
}

export const SPEEDS = [0.5, 1, 2, 4] as const;

const PLACE: Record<string, string> = {
  relax: 'Pantry (idle)',
  huddle: 'At board (huddle)',
  report: 'At board (report)',
  work: 'At desk (working)',
  wait: 'At desk (waiting)',
  stand: 'At board',
  hidden: 'Not in the room',
};

/** Location label for the Agents tab (presentation of the office plan; guests rest on the bench, not the pantry). */
export function placeText(id: string, place: { activity: string; arrived: boolean } | undefined): string {
  if (!place) return '';
  const where = id === 'guest' && place.activity === 'relax' ? 'Guest bench' : (PLACE[place.activity] ?? place.activity);
  return place.arrived || place.activity === 'hidden' ? where : `Walking to ${where.replace(/ \(.*\)$/, '').replace(/^At /, '').toLowerCase()}`;
}

/** mm:ss of room time. */
export function clockText(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
