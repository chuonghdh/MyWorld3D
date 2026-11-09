// Replay document -> RoomEvents (ADR 0013). Pure: same document, same events. Real data, labelled 'replay'.
import type { AgentId, RoomEvent, TaskState } from '../model/types';
import { asAgentId, ownerOf, type ClaimLike } from '../mapping/owners';

export interface ReplayDoc {
  kind: 'agent-room-replay';
  version: 1;
  generatedAt: string;
  commits: { hash: string; t: number; files: string[] }[];
  tasks: { id: string; title: string; status: string; owner: string; created: string; file: string }[];
  briefs: { file: string; task: string; owner: string }[];
  claims: (ClaimLike & { task: string; date: string })[];
}

const STATES: readonly TaskState[] = ['proposed', 'assigned', 'in_progress', 'verifying', 'done', 'blocked', 'cancelled'];
/** Paths shown per commit, so one big commit does not flood the room. */
const FILES_PER_COMMIT = 6;

export function isReplayDoc(x: unknown): x is ReplayDoc {
  const d = x as Partial<ReplayDoc> | null;
  return !!d && d.kind === 'agent-room-replay' && d.version === 1 && Array.isArray(d.commits) && Array.isArray(d.tasks) && Array.isArray(d.claims);
}

function agentOf(name: string): AgentId {
  return asAgentId(name.trim().toLowerCase()) ?? 'lead';
}

const dayMs = (d: string) => {
  const t = Date.parse(`${d}T00:00:00Z`);
  return Number.isFinite(t) ? t : 0;
};

/** Most frequent owner among a commit's files; ties go to the first file's owner. */
export function commitOwner(files: readonly string[], claims: readonly ClaimLike[]): AgentId {
  const count = new Map<AgentId, number>();
  let best: AgentId = 'lead';
  let bestN = 0;
  for (const f of files) {
    const o = ownerOf(f, claims);
    if (!o) continue;
    const n = (count.get(o) ?? 0) + 1;
    count.set(o, n);
    if (n > bestN) [best, bestN] = [o, n];
  }
  return best;
}

type DistOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type Draft = RoomEvent & { order: number };

/** Events in time order with seq 1..n. Timestamps are the real ones; the runtime spaces them out for playback. */
export function buildReplayEvents(doc: ReplayDoc): RoomEvent[] {
  const drafts: Draft[] = [];
  let order = 0;
  const add = (d: DistOmit<RoomEvent, 'seq' | 'source'>) => drafts.push({ ...d, seq: 0, source: 'replay', order: order++ } as Draft);

  for (const t of doc.tasks) {
    const state = (STATES as readonly string[]).includes(t.status) ? (t.status as TaskState) : 'proposed';
    add({ t: dayMs(t.created), agent: agentOf(t.owner), kind: 'task_state', task: t.id, state });
  }
  for (const c of doc.claims) {
    add({ t: dayMs(c.date), agent: agentOf(c.owner), kind: 'claim_change', task: c.task, status: c.status === 'active' ? 'active' : 'released' });
  }
  for (const c of doc.commits) {
    const owner = commitOwner(c.files, doc.claims);
    if (owner !== 'lead') add({ t: c.t, agent: 'lead', kind: 'delegate', to: owner, via: 'Agent' });
    add({ t: c.t, agent: owner, kind: 'tool_start', tool: `commit ${c.hash}` });
    for (const f of c.files.slice(0, FILES_PER_COMMIT)) add({ t: c.t, agent: owner, kind: 'file_touch', path: f, owner: ownerOf(f, doc.claims) ?? 'lead' });
    add({ t: c.t, agent: owner, kind: 'tool_end', tool: `commit ${c.hash}`, ok: true });
    if (owner !== 'lead') add({ t: c.t, agent: owner, kind: 'subagent_done' });
  }
  drafts.sort((a, b) => a.t - b.t || a.order - b.order);
  return drafts.map((d, i) => {
    const { order: _order, ...e } = d;
    return { ...e, seq: i + 1 } as RoomEvent;
  });
}

/** Playback times: event i at t0 + i * stepMs, keeping order and seq. */
export function spaceForPlayback(events: readonly RoomEvent[], stepMs: number, t0 = 0): RoomEvent[] {
  return events.map((e, i) => ({ ...e, t: t0 + i * stepMs }));
}
