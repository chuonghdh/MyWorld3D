// UI mirror (ADR 0013): throttled copy of engine and world state for DOM panels. Never read by the 3D view.
import { create } from 'zustand';
import type { AgentId, AgentSnapshot, RoomEvent, Source } from './model/types';

export interface RoomMirror {
  source: Source;
  now: number;
  agents: AgentSnapshot[];
  /** Newest last, bounded. */
  log: RoomEvent[];
  /** Where each agent is in the office (presentation of the office plan, derived from status and time). */
  places: Partial<Record<AgentId, { activity: string; arrived: boolean }>>;
  set: (m: Partial<Omit<RoomMirror, 'set'>>) => void;
}

export const useRoomMirror = create<RoomMirror>((set) => ({
  source: 'simulation',
  now: 0,
  agents: [],
  log: [],
  places: {},
  set: (m) => set(m),
}));
