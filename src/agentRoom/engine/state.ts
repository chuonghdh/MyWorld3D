// Room state for the engine (ADR 0013). Plain data; the reducer returns new objects and never mutates its input.
import type { AgentId, AgentSnapshot, Source, TaskState } from '../model/types';

export const ALL_AGENTS: readonly AgentId[] = [
  'lead', 'buildings', 'city-streets', 'traffic-life', 'sky-environment', 'audio', 'ui-camera', 'scene-qa', 'architect', 'graphics-character',
];

export interface Link {
  from: AgentId;
  to: AgentId;
  t: number;
}

export interface TaskCard {
  state: TaskState;
  owner: AgentId;
  /** Event time of the last state change. */
  t: number;
}

export interface Shipped {
  count: number;
  lastHash: string;
  t: number;
}

export interface RoomState {
  source: Source;
  seq: number;
  t: number;
  agents: Readonly<Record<AgentId, AgentSnapshot>>;
  /** Most recent delegations, for comm arcs. */
  links: readonly Link[];
  /** Time of the last delegation to each agent (the call to the board). */
  called: Readonly<Partial<Record<AgentId, number>>>;
  /** Last touched path per agent, for desk screens. */
  lastPath: Readonly<Partial<Record<AgentId, string>>>;
  /** Kanban cards by task id (from task_state events). */
  tasks: Readonly<Record<string, TaskCard>>;
  /** Commits seen (tool `commit <hash>`), for the ship-it bell and counter. */
  shipped: Shipped;
  /** Events ignored because their seq was not newer. */
  stale: number;
}

export function initialState(source: Source, t = 0): RoomState {
  const agents = {} as Record<AgentId, AgentSnapshot>;
  for (const id of ALL_AGENTS) agents[id] = { id, status: 'idle', lastTool: null, lastEventT: t };
  return { source, seq: 0, t, agents, links: [], called: {}, lastPath: {}, tasks: {}, shipped: { count: 0, lastHash: '', t: -Infinity }, stale: 0 };
}
