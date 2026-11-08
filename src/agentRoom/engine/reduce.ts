// Pure reducer: (state, event) -> state (ADR 0013). No clock, no randomness; time comes from event.t.
import type { AgentId, AgentStatus, RoomEvent } from '../model/types';
import type { RoomState } from './state';

/** Most comm links kept (the arcs fade by time in the view; this only bounds memory). */
const MAX_LINKS = 16;
/** A commit shows up as tool `commit <hash>` (replay) or a Bash `git commit` (live mapping later). */
const COMMIT = /^commit ([0-9a-f]{7,40})$/;

function setAgent(s: RoomState, id: AgentId, t: number, status: AgentStatus, lastTool?: string | null): RoomState {
  const prev = s.agents[id];
  const next = { ...prev, status, lastEventT: t, lastTool: lastTool === undefined ? prev.lastTool : lastTool };
  return { ...s, agents: { ...s.agents, [id]: next } };
}

export function apply(state: RoomState, e: RoomEvent): RoomState {
  if (e.seq <= state.seq) return { ...state, stale: state.stale + 1 };
  let s: RoomState = { ...state, seq: e.seq, t: Math.max(state.t, e.t) };
  switch (e.kind) {
    case 'session_start':
    case 'prompt':
      return setAgent(s, e.agent, e.t, 'thinking');
    case 'session_end':
    case 'subagent_done':
      return setAgent(s, e.agent, e.t, 'done');
    case 'tool_start': {
      s = setAgent(s, e.agent, e.t, 'tool', e.tool);
      const hash = COMMIT.exec(e.tool)?.[1];
      return hash ? { ...s, shipped: { count: s.shipped.count + 1, lastHash: hash, t: e.t } } : s;
    }
    case 'tool_end':
      return setAgent(s, e.agent, e.t, e.ok ? 'thinking' : 'error');
    case 'delegate':
      s = setAgent(s, e.agent, e.t, 'delegating');
      s = setAgent(s, e.to, e.t, 'thinking');
      return { ...s, called: { ...s.called, [e.to]: e.t }, links: [...s.links, { from: e.agent, to: e.to, t: e.t }].slice(-MAX_LINKS) };
    case 'notify':
      return setAgent(s, e.agent, e.t, 'waiting');
    case 'file_touch':
      return { ...setAgent(s, e.agent, e.t, s.agents[e.agent].status), lastPath: { ...s.lastPath, [e.owner]: e.path } };
    case 'error':
      return setAgent(s, e.agent, e.t, 'error');
    case 'task_state':
      return { ...s, tasks: { ...s.tasks, [e.task]: { state: e.state, owner: e.agent, t: e.t } } };
    case 'claim_change':
      return s;
  }
}

/** Fold a list of events from a start state. */
export function applyAll(state: RoomState, events: readonly RoomEvent[]): RoomState {
  return events.reduce(apply, state);
}

/** Agents with no event for idleAfterMs become idle (view-time query; does not change state). */
export function isIdle(state: RoomState, id: AgentId, now: number, idleAfterMs: number): boolean {
  const a = state.agents[id];
  return a.status === 'idle' || a.status === 'done' || now - a.lastEventT > idleAfterMs;
}
