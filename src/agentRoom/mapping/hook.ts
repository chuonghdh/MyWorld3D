// Claude Code hook payload -> RoomEvents (ADR 0013). Pure apart from the mapper's own binding table.
// Redaction: only tool names and file paths leave this module; prompt text and tool input contents never do.
import type { AgentId, RoomEvent, Source } from '../model/types';
import { ownerOf, type ClaimLike } from './owners';

/** The subset of a hook payload the mapper reads. Everything else is ignored. */
export interface HookPayload {
  hook_event_name?: string;
  session_id?: string;
  /** Present on subagent events in newer Claude Code versions. */
  agent_id?: string;
  agent_type?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_response?: unknown;
}

/** Full specialist names (ownership table) and handbook slugs. */
const NAMES: [AgentId, string[]][] = [
  ['buildings', ['buildings']],
  ['city-streets', ['city & streets', 'city-streets', 'city and streets']],
  ['traffic-life', ['traffic & life', 'traffic-life', 'traffic and life']],
  ['sky-environment', ['sky & environment', 'sky-environment', 'sky and environment']],
  ['audio', ['audio']],
  ['ui-camera', ['ui & camera', 'ui-camera', 'ui and camera']],
  ['scene-qa', ['scene & qa', 'scene-qa', 'scene and qa']],
  ['architect', ['technical architect', 'architect']],
  ['graphics-character', ['graphics & character', 'graphics-character', 'graphics and character']],
];

/** Fallback keys, each pointing at exactly one specialist. Broad words (city, life, scene, environment) are left out. */
const KEYS: [AgentId, string[]][] = [
  ['buildings', ['building', 'facade', 'roof']],
  ['city-streets', ['streets', 'street']],
  ['traffic-life', ['traffic', 'pedestrian', 'pedestrians', 'crowd']],
  ['sky-environment', ['sky', 'weather', 'clouds']],
  ['audio', ['sound', 'mixer']],
  ['ui-camera', ['camera']],
  ['scene-qa', ['qa']],
  ['graphics-character', ['rig', 'character', 'characters']],
];

function words(t: string): string {
  return ` ${t.toLowerCase().replace(/[^a-z0-9&-]+/g, ' ').replace(/\s+/g, ' ').trim()} `;
}

/** The one id whose phrases occur as whole words, or null when none or several match. */
function unique(text: string, table: [AgentId, string[]][]): AgentId | null {
  const hits = new Set<AgentId>();
  for (const [id, phrases] of table) if (phrases.some((p) => text.includes(` ${p} `))) hits.add(id);
  return hits.size === 1 ? [...hits][0]! : null;
}

/** Specialist named in free text: exact name or slug, then a name inside the text, then an unambiguous key; else null. */
export function specialistFromText(text: string): AgentId | null {
  const t = words(text);
  for (const [id, phrases] of NAMES) if (phrases.some((p) => t === ` ${p} `)) return id;
  return unique(t, NAMES) ?? unique(t, KEYS);
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

export interface MapperStats {
  /** Hook events of a kind the mapper does not read. */
  unknown: number;
  /** Events or delegations that named no specialist; they are attributed to the lead (no guest, ADR 0013 2026-11-08). */
  unmatched: number;
}

/**
 * Stateful mapper. Events without agent_id come from a main session and are the lead's: whichever session is live,
 * so an older session in the bridge ring never displaces the current one. Subagents (agent_id) bind once: to the
 * specialist named by agent_type, else to the oldest pending delegation of the same session, else to the lead.
 */
/** One record of harness/runs/agent-registry.json (written by tools/agent-bridge/registry.mjs when a subagent is created). */
export interface RegistryEntry {
  agentId: string;
  name?: string | null;
  subagent_type?: string | null;
  description?: string | null;
}

/** Specialist of a registry record: its name first, then its description (the spawn label). Null when none. */
export function specialistOfEntry(e: RegistryEntry): AgentId | null {
  return specialistFromText(e.name ?? '') ?? specialistFromText(e.description ?? '');
}

export function createHookMapper(source: Source, claims: readonly ClaimLike[] = [], registry: readonly RegistryEntry[] = []) {
  const bound = new Map<string, AgentId>();
  // The registry is the source of truth: it binds before any other rule (delegation queue, file owner, lead).
  for (const e of registry) {
    const s = specialistOfEntry(e);
    if (s) bound.set(e.agentId, s);
  }
  /** Pending Agent/Task delegations per session, oldest first; null = named no specialist. */
  const pending = new Map<string, (AgentId | null)[]>();
  let seq = 0;
  const stats: MapperStats = { unknown: 0, unmatched: 0 };

  function orLead(id: AgentId | null): AgentId {
    if (id) return id;
    stats.unmatched++;
    return 'lead';
  }

  /** Subagents bound to lead without evidence. A file under a specialist owner settles them. */
  const tentative = new Set<string>();

  function agentOf(p: HookPayload, path: string): AgentId {
    if (!p.agent_id) return 'lead';
    const known = bound.get(p.agent_id);
    if (known && !tentative.has(p.agent_id)) return known;
    if (known) {
      const owner = path ? ownerOf(path, claims) : null;
      if (owner && owner !== 'lead') {
        bound.set(p.agent_id, owner);
        tentative.delete(p.agent_id);
        return owner;
      }
      return known;
    }
    // agent_type names a specialist only for custom agents; generic types (general-purpose, Explore) fall back to
    // the specialist named by the session's pending delegation.
    const typed = p.agent_type ? specialistFromText(p.agent_type) : null;
    const queued = typed ?? pending.get(p.session_id ?? '')?.shift() ?? null;
    if (queued) {
      bound.set(p.agent_id, queued);
      return queued;
    }
    // No delegation to match (resumed or pre-fix subagent): its first file under a specialist owner names it.
    const owner = path ? ownerOf(path, claims) : null;
    if (owner && owner !== 'lead') {
      bound.set(p.agent_id, owner);
      return owner;
    }
    bound.set(p.agent_id, orLead(null));
    tentative.add(p.agent_id);
    return 'lead';
  }

  /** Target of an Agent/Task/SendMessage call: the `name` or `to` field first (Agent tool name = specialist slug). */
  function targetOf(input: Record<string, unknown>): AgentId | null {
    for (const k of ['name', 'to', 'subagent_type']) {
      const v = str(input[k]);
      if (!v) continue;
      const t = words(v);
      for (const [id, phrases] of NAMES) if (phrases.some((ph) => t === ` ${ph} `)) return id;
    }
    return specialistFromText([input.subagent_type, input.name, input.description, input.to].map(str).join(' '));
  }

  function map(p: HookPayload, t: number): RoomEvent[] {
    const tool = str(p.tool_name);
    const input = p.tool_input ?? {};
    const path = str(input.file_path) || str(input.notebook_path) || str(input.path);
    const agent = agentOf(p, path);
    const base = { t, source, agent };
    const next = () => ++seq;
    switch (p.hook_event_name) {
      case 'SessionStart':
        return [{ ...base, seq: next(), kind: 'session_start', sessionId: str(p.session_id) }];
      case 'SessionEnd':
        return [{ ...base, seq: next(), kind: 'session_end', sessionId: str(p.session_id) }];
      case 'UserPromptSubmit':
        return [{ ...base, seq: next(), kind: 'prompt' }];
      case 'Notification':
        return [{ ...base, seq: next(), kind: 'notify' }];
      case 'Stop':
      case 'SubagentStop':
        return [{ ...base, seq: next(), kind: 'subagent_done' }];
      case 'PreToolUse': {
        const out: RoomEvent[] = [{ ...base, seq: next(), kind: 'tool_start', tool }];
        if (tool === 'Agent' || tool === 'Task' || tool === 'SendMessage') {
          // SendMessage to a resumed subagent carries its agent id in `to`, not a name: use the binding it already has.
          const byId = tool === 'SendMessage' ? bound.get(str(input.to)) : undefined;
          const named = byId ?? targetOf(input);
          if (tool !== 'SendMessage') {
            const sid = p.session_id ?? '';
            pending.set(sid, [...(pending.get(sid) ?? []), named]);
          }
          const to = orLead(named);
          out.push({ ...base, seq: next(), kind: 'delegate', to, via: tool === 'SendMessage' ? 'SendMessage' : 'Agent' });
        }
        if (path) out.push({ ...base, seq: next(), kind: 'file_touch', path, owner: ownerOf(path, claims) ?? 'lead' });
        return out;
      }
      case 'PostToolUse': {
        const r = p.tool_response as { is_error?: unknown; agentId?: unknown } | undefined;
        if (tool === 'Agent' && typeof r?.agentId === 'string' && r.agentId) {
          // The spawn's own result names the new agent id: bind it now, by the name read from the call (not by queue order).
          const named = targetOf(input);
          const sid = p.session_id ?? '';
          const queue = pending.get(sid) ?? [];
          const at = queue.indexOf(named);
          if (at >= 0) pending.set(sid, [...queue.slice(0, at), ...queue.slice(at + 1)]);
          if (named && !bound.has(r.agentId)) bound.set(r.agentId, named);
        }
        return [{ ...base, seq: next(), kind: 'tool_end', tool, ok: r?.is_error !== true }];
      }
      default:
        stats.unknown++;
        return [];
    }
  }

  return { map, stats };
}
