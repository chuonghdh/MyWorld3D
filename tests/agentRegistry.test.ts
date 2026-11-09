// Agent registry binding (ADR 0013, 2026-11-09): spawn records written by tools/agent-bridge/registry.mjs bind
// agent_id -> specialist before the delegation queue. The ids below are the real ones backfilled from the session
// transcript (harness/runs/agent-registry.json); they are copied here so the guard runs without the local file.
import { describe, expect, it } from 'vitest';
import { createHookMapper, specialistOfEntry, type RegistryEntry } from '../src/agentRoom/mapping/hook';
import { entryFromPayload, extractAgentId, upsertEntry } from '../tools/agent-bridge/registry.mjs';

const BACKFILLED: RegistryEntry[] = [
  { agentId: 'a12aa086de64354d0', description: 'Traffic & Life: trim people perf test', subagent_type: 'general-purpose' },
  { agentId: 'a47bc33c9a4f561a6', description: 'Scene & QA: run npm run check', subagent_type: 'general-purpose' },
  { agentId: 'a115bea227ef2c2ad', description: 'Buildings specialist: handbook review', subagent_type: 'general-purpose' },
  { agentId: 'a4b273d32ba908315', description: 'City & Streets specialist: handbook review', subagent_type: 'general-purpose' },
  { agentId: 'af03ab9b117aa359b', description: 'Sky & Environment specialist: handbook review', subagent_type: 'general-purpose' },
  { agentId: 'a79cf7687bde506d0', description: 'Audio specialist: handbook and AUDIO.md review', subagent_type: 'general-purpose' },
  { agentId: 'a1b3ac509ded54491', description: 'Architect: shared docs and handbook review', subagent_type: 'general-purpose' },
  { agentId: 'a4eaba7c659263081', description: 'UI & Camera specialist: handbook review', subagent_type: 'general-purpose' },
  { agentId: 'ac8c928382f2e860b', name: 'sky-environment', description: 'Sky owner: suncalc guard + handbook' },
  { agentId: 'a264e4e27f481db4f', name: 'architect', description: 'Architect: dependency drift guard + docs' },
  { agentId: 'a531cbbfcf80ae49a', name: 'scene-qa', description: 'Scene & QA: verify fixes' },
];

const EXPECTED: Record<string, string> = {
  a12aa086de64354d0: 'traffic-life',
  a47bc33c9a4f561a6: 'scene-qa',
  a115bea227ef2c2ad: 'buildings',
  a4b273d32ba908315: 'city-streets',
  af03ab9b117aa359b: 'sky-environment',
  a79cf7687bde506d0: 'audio',
  a1b3ac509ded54491: 'architect',
  a4eaba7c659263081: 'ui-camera',
  ac8c928382f2e860b: 'sky-environment',
  a264e4e27f481db4f: 'architect',
  a531cbbfcf80ae49a: 'scene-qa',
};

describe('agent registry: id capture', () => {
  it('reads the agent id from a spawn result, string or content blocks', () => {
    expect(extractAgentId('Async agent launched. agentId: a12aa086de64354d0')).toBe('a12aa086de64354d0');
    expect(extractAgentId([{ type: 'text', text: 'agentId: ac8c928382f2e860b (use SendMessage)' }])).toBe('ac8c928382f2e860b');
    expect(extractAgentId({ status: 'ok' })).toBeNull();
  });

  it('records only Agent spawn results that carry an id', () => {
    const post = {
      hook_event_name: 'PostToolUse',
      session_id: 'main',
      tool_name: 'Agent',
      tool_input: { subagent_type: 'general-purpose', description: 'Scene & QA: probe', prompt: 'SECRET-PROMPT' },
      tool_response: { agentId: 'a47bc33c9a4f561a6' },
    };
    const e = entryFromPayload(post, 5);
    expect(e).toMatchObject({ agentId: 'a47bc33c9a4f561a6', description: 'Scene & QA: probe', source: 'hook' });
    expect(JSON.stringify(e)).not.toContain('SECRET-PROMPT');
    expect(entryFromPayload({ ...post, hook_event_name: 'PreToolUse' })).toBeNull();
    expect(entryFromPayload({ ...post, tool_response: 'no id here' })).toBeNull();
  });

  it('upserts by agent id without losing a name already known', () => {
    const a = upsertEntry([{ agentId: 'x1', name: 'audio', description: null }], { agentId: 'x1', name: null, description: 'Audio: pass' });
    expect(a).toEqual([{ agentId: 'x1', name: 'audio', description: 'Audio: pass' }]);
  });
});

describe('agent registry: binding', () => {
  it('each backfilled id resolves to its specialist', () => {
    for (const e of BACKFILLED) expect(specialistOfEntry(e)).toBe(EXPECTED[e.agentId]);
  });

  it('a registered subagent binds to its specialist before any delegation queue is consulted', () => {
    const m = createHookMapper('live', [], BACKFILLED);
    // A different delegation is pending for this session; the registry must win over it.
    m.map({ hook_event_name: 'PreToolUse', session_id: 'main', tool_name: 'Agent', tool_input: { description: 'Audio pass' } }, 1);
    const ev = m.map({ hook_event_name: 'PreToolUse', session_id: 'main', agent_id: 'a12aa086de64354d0', tool_name: 'Read', tool_input: { file_path: 'src/traffic/x.ts' } }, 2);
    expect(ev[0]!.agent).toBe('traffic-life');
  });

  it('SendMessage to a registered id routes to its specialist', () => {
    const m = createHookMapper('live', [], BACKFILLED);
    const sm = m.map({ hook_event_name: 'PreToolUse', session_id: 'main', tool_name: 'SendMessage', tool_input: { to: 'a47bc33c9a4f561a6', message: 'x' } }, 3);
    expect(sm.find((e) => e.kind === 'delegate')).toMatchObject({ to: 'scene-qa', via: 'SendMessage' });
  });

  it('an id not in the registry still falls back to the queue, then lead', () => {
    const m = createHookMapper('live', [], BACKFILLED);
    expect(m.map({ hook_event_name: 'PreToolUse', session_id: 'main', agent_id: 'unknown-1', tool_name: 'Bash', tool_input: {} }, 4)[0]!.agent).toBe('lead');
  });
});
