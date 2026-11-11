// Agent Working Room contract (ADR 0013). Types only: no runtime code, no imports.

/** The lead hub plus the nine specialists. Work that matches no specialist is the lead's (ADR 0013, 2026-11-08). */
export type AgentId =
  | 'lead'
  | 'buildings'
  | 'city-streets'
  | 'traffic-life'
  | 'sky-environment'
  | 'audio'
  | 'ui-camera'
  | 'scene-qa'
  | 'architect'
  | 'graphics-character';

/** Where the shown data comes from. Always visible as a badge. */
export type Source = 'live' | 'replay' | 'simulation';

/** Agent state machine states (engine). */
export type AgentStatus = 'idle' | 'thinking' | 'tool' | 'delegating' | 'waiting' | 'done' | 'error';

/** Task states, as in harness/workflows/WORKFLOW.md. */
export type TaskState = 'proposed' | 'assigned' | 'in_progress' | 'verifying' | 'done' | 'blocked' | 'cancelled';

/** Fields every event carries. `t` is milliseconds since epoch, set by the bridge or replay, never by rendering. */
interface EventBase {
  seq: number;
  t: number;
  source: Source;
  agent: AgentId;
}

/** The fixed event vocabulary (closed union). Prompt text and tool input contents are never carried (redaction). */
export type RoomEvent =
  | (EventBase & { kind: 'session_start'; sessionId: string })
  | (EventBase & { kind: 'session_end'; sessionId: string })
  | (EventBase & { kind: 'prompt' })
  | (EventBase & { kind: 'tool_start'; tool: string })
  | (EventBase & { kind: 'tool_end'; tool: string; ok: boolean })
  | (EventBase & { kind: 'delegate'; to: AgentId; via: 'Agent' | 'SendMessage' })
  | (EventBase & { kind: 'subagent_done' })
  | (EventBase & { kind: 'notify' })
  | (EventBase & { kind: 'file_touch'; path: string; owner: AgentId })
  | (EventBase & { kind: 'claim_change'; task: string; status: 'active' | 'released' })
  | (EventBase & { kind: 'task_state'; task: string; state: TaskState })
  | (EventBase & { kind: 'error'; message: string });

export type RoomEventKind = RoomEvent['kind'];

/** Per-agent view in a snapshot. */
export interface AgentSnapshot {
  id: AgentId;
  status: AgentStatus;
  lastTool: string | null;
  lastEventT: number;
}

/** Full state sent by the bridge on connect, or built by replay. */
export interface Snapshot {
  source: Source;
  seq: number;
  t: number;
  agents: AgentSnapshot[];
  activeTasks: { task: string; owner: AgentId; state: TaskState }[];
}

/** One message on the bridge stream (SSE data line, JSON). */
export type BridgeMessage = { kind: 'event'; event: RoomEvent } | { kind: 'snapshot'; snapshot: Snapshot };
