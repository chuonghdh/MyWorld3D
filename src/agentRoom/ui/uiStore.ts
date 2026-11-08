// UI state for the agent room shell (tab, selection, camera requests, toggles, view insets).
// Separate from the engine mirror (store.ts). The 3D side reads camera requests and selection; it never writes the mirror.
import { create } from 'zustand';
import type { AgentId } from '../model/types';
import type { ReplayDoc } from '../replay/build';
import { agentRoom } from '../../config/tuning';

export type Tab = 'overview' | 'agents' | 'tasks' | 'activity' | 'settings';
export type PresetId = 'overview' | 'hub' | 'wall' | AgentId;
export type Quality = 'high' | 'performance';

export interface Insets {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface CameraRequest {
  nonce: number;
  preset: PresetId;
}

export interface UiState {
  tab: Tab;
  selected: AgentId | null;
  hovered: AgentId | null;
  followId: AgentId | null;
  camera: CameraRequest;
  paused: boolean;
  speed: number;
  showTrails: boolean;
  showBubbles: boolean;
  quality: Quality;
  insets: Insets;
  replayDoc: ReplayDoc | null;
  /** Live bridge connection, shown only for the live source. */
  connection: 'connected' | 'reconnecting' | 'down';
  /** Director camera: eases toward the latest event's agent; off by default, any drag turns it off. */
  director: boolean;
  set: (p: Partial<Omit<UiState, 'set' | 'goTo' | 'select'>>) => void;
  goTo: (preset: PresetId) => void;
  /** fromScene: a click in the 3D view (switches the panel to Agents); list clicks keep the current tab. */
  select: (id: AgentId | null, fromScene?: boolean) => void;
}

export const useUi = create<UiState>((set, get) => ({
  tab: 'overview',
  selected: null,
  hovered: null,
  followId: null,
  camera: { nonce: 0, preset: 'overview' },
  paused: false,
  speed: 1,
  showTrails: true,
  showBubbles: true,
  quality: agentRoom.qualityDefault,
  insets: { left: 0, top: 0, right: 0, bottom: 0 },
  replayDoc: null,
  connection: 'down',
  director: false,
  set: (p) => set(p),
  goTo: (preset) => set({ camera: { nonce: get().camera.nonce + 1, preset }, followId: null }),
  select: (id, fromScene = false) => {
    set({ selected: id, followId: null, ...(id && fromScene ? { tab: 'agents' as Tab } : {}) });
    if (id) get().goTo(id);
  },
}));
