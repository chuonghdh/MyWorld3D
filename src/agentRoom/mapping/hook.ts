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

/** Specialist named in free text: exact name or slug, then a name inside the text, then an unambiguous key; else guest. */
export function specialistFromText(text: string): AgentId {
  const t = words(text);
  for (const [id, phrases] of NAMES) if (phrases.some((p) => t === ` ${p} `)) return id;
  return unique(t, NAMES) ?? unique(t, KEYS) ?? 'guest';
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

export interface MapperStats {
  unknown: number;
}

/** Stateful mapper: binds the main session to lead and subagent ids to specialists. */
export function createHookMapper(source: Source, claims: readonly ClaimLike[] = []) {
  const bound = new Map<string, AgentId>();
  const pending: AgentId[] = [];
  let leadSession: string | null = null;
  let seq = 0;
  const stats: MapperStats = { unknown: 0 };

  function agentOf(p: HookPayload): AgentId {
    if (p.agent_id) {
      const known = bound.get(p.agent_id);
      if (known) return known;
      // agent_type names a specialist only for custom agents; generic types (general-purpose, Explore) fall back to
      // the specialist named by the pending delegation.
      const typed = p.agent_type ? specialistFromText(p.agent_type) : 'guest';
      const id = typed !== 'guest' ? typed : (pending.shift() ?? 'guest');
      bound.set(p.agent_id, id);
      return id;
    }
    const sid = p.session_id ?? '';
    if (leadSession === null) leadSession = sid;
    return sid === leadSession ? 'lead' : (bound.get(sid) ?? 'guest');
  }

  function map(p: HookPayload, t: number): RoomEvent[] {
    const agent = agentOf(p);
    const base = { t, source, agent };
    const next = () => ++seq;
    const tool = str(p.tool_name);
    const input = p.tool_input ?? {};
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
          const text = [input.subagent_type, input.name, input.description, input.to].map(str).join(' ');
          const to = specialistFromText(text);
          if (tool !== 'SendMessage') pending.push(to);
          out.push({ ...base, seq: next(), kind: 'delegate', to, via: tool === 'SendMessage' ? 'SendMessage' : 'Agent' });
        }
        const path = str(input.file_path) || str(input.notebook_path) || str(input.path);
        if (path) out.push({ ...base, seq: next(), kind: 'file_touch', path, owner: ownerOf(path, claims) ?? 'guest' });
        return out;
      }
      case 'PostToolUse': {
        const r = p.tool_response as { is_error?: unknown } | undefined;
        return [{ ...base, seq: next(), kind: 'tool_end', tool, ok: r?.is_error !== true }];
      }
      default:
        stats.unknown++;
        return [];
    }
  }

  return { map, stats };
}
