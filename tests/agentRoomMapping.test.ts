// Agent room mapping (ADR 0013): hook payloads -> redacted events, agent binding (no guest: unmatched -> lead), path owners.
import { describe, expect, it } from 'vitest';
import { createHookMapper, specialistFromText } from '../src/agentRoom/mapping/hook';
import { globMatch, normalizePath, ownerOf } from '../src/agentRoom/mapping/owners';

const SECRET = 'TOP-SECRET-PROMPT-TEXT';

describe('hook mapping', () => {
  it('first session is lead; delegation binds the subagent to the named specialist', () => {
    const m = createHookMapper('live');
    expect(m.map({ hook_event_name: 'SessionStart', session_id: 'main' }, 1)[0]).toMatchObject({ kind: 'session_start', agent: 'lead' });
    const pre = m.map(
      { hook_event_name: 'PreToolUse', session_id: 'main', tool_name: 'Agent', tool_input: { description: 'Audio specialist: mixer', prompt: SECRET } },
      2,
    );
    expect(pre.map((e) => e.kind)).toEqual(['tool_start', 'delegate']);
    expect(pre[1]).toMatchObject({ agent: 'lead', to: 'audio', via: 'Agent' });
    const sub = m.map({ hook_event_name: 'PreToolUse', session_id: 'main', agent_id: 'sub-1', tool_name: 'Read', tool_input: { file_path: 'src/audio/x.ts' } }, 3);
    expect(sub[0]).toMatchObject({ agent: 'audio', kind: 'tool_start', tool: 'Read' });
    expect(sub[1]).toMatchObject({ kind: 'file_touch', path: 'src/audio/x.ts', owner: 'audio' });
  });

  it('SendMessage to a resumed subagent id routes to the specialist that subagent is bound to', () => {
    const m = createHookMapper('live');
    m.map({ hook_event_name: 'PreToolUse', session_id: 'main', tool_name: 'Agent', tool_input: { description: 'Traffic & life pass', prompt: SECRET } }, 1);
    m.map({ hook_event_name: 'PreToolUse', session_id: 'main', agent_id: 'sub-t', tool_name: 'Read', tool_input: { file_path: 'src/traffic/x.ts' } }, 2);
    const sm = m.map({ hook_event_name: 'PreToolUse', session_id: 'main', tool_name: 'SendMessage', tool_input: { to: 'sub-t', message: SECRET } }, 3);
    expect(sm.find((e) => e.kind === 'delegate')).toMatchObject({ to: 'traffic-life', via: 'SendMessage' });
    expect(JSON.stringify(sm)).not.toContain(SECRET);
  });

  it('a spawn result that names the agent id binds it by the call name, not by queue order', () => {
    const m = createHookMapper('live');
    const agentCall = (name: string, t: number) =>
      m.map({ hook_event_name: 'PreToolUse', session_id: 'main', tool_name: 'Agent', tool_input: { name, description: name, prompt: SECRET } }, t);
    agentCall('audio', 1);
    agentCall('traffic-life', 2);
    m.map({ hook_event_name: 'PostToolUse', session_id: 'main', tool_name: 'Agent', tool_input: { name: 'traffic-life' }, tool_response: { agentId: 'sub-t' } }, 3);
    expect(m.map({ hook_event_name: 'PreToolUse', session_id: 'main', agent_id: 'sub-t', tool_name: 'Read' }, 4)[0]!.agent).toBe('traffic-life');
    // the traffic-life pending entry was consumed, so the next unknown subagent takes the oldest left: audio
    expect(m.map({ hook_event_name: 'PreToolUse', session_id: 'main', agent_id: 'sub-u', tool_name: 'Read' }, 5)[0]!.agent).toBe('audio');
  });

  it('a subagent with no delegation is lead until a file under a specialist owner names it', () => {
    const m = createHookMapper('live');
    expect(m.map({ hook_event_name: 'PreToolUse', session_id: 'main', agent_id: 'sub-f', tool_name: 'Bash', tool_input: {} }, 1)[0]!.agent).toBe('lead');
    expect(m.map({ hook_event_name: 'PreToolUse', session_id: 'main', agent_id: 'sub-f', tool_name: 'Read', tool_input: { file_path: 'src/audio/x.ts' } }, 2)[0]!.agent).toBe('audio');
    expect(m.map({ hook_event_name: 'PreToolUse', session_id: 'main', agent_id: 'sub-f', tool_name: 'Bash', tool_input: {} }, 3)[0]!.agent).toBe('audio');
  });

  it('unmatched subagents attribute to the lead and are counted; any main session is the lead', () => {
    const m = createHookMapper('live');
    m.map({ hook_event_name: 'SessionStart', session_id: 'main' }, 1);
    m.map({ hook_event_name: 'PreToolUse', session_id: 'main', tool_name: 'Agent', tool_input: { description: 'Explore repo' } }, 2);
    expect(m.map({ hook_event_name: 'PreToolUse', session_id: 'main', agent_id: 'x', tool_name: 'Grep' }, 3)[0]!.agent).toBe('lead');
    expect(m.map({ hook_event_name: 'UserPromptSubmit', session_id: 'other' }, 4)[0]!.agent).toBe('lead');
    expect(m.map({ hook_event_name: 'SubagentStop', session_id: 'main', agent_id: 'y', agent_type: 'general-purpose' }, 5)[0]!.agent).toBe('lead');
    expect(m.stats.unmatched).toBe(3); // the delegation, subagent x, subagent y
  });

  it('a stale older session in the ring does not displace the live lead; Agent name binds the specialist', () => {
    const m = createHookMapper('live');
    m.map({ hook_event_name: 'PreToolUse', session_id: 'old', tool_name: 'Agent', tool_input: { name: 'audio' } }, 1);
    m.map({ hook_event_name: 'SessionStart', session_id: 'new' }, 2);
    expect(m.map({ hook_event_name: 'UserPromptSubmit', session_id: 'new' }, 3)[0]!.agent).toBe('lead');
    const d = m.map({ hook_event_name: 'PreToolUse', session_id: 'new', tool_name: 'Agent', tool_input: { name: 'sky-environment', description: 'sky' } }, 4);
    expect(d[1]).toMatchObject({ kind: 'delegate', to: 'sky-environment' });
    m.map({ hook_event_name: 'PreToolUse', session_id: 'new', tool_name: 'Agent', tool_input: { name: 'architect', description: 'architect' } }, 5);
    // Pending delegations are per session: the old session's queued audio does not leak into the new session.
    const ids = ['s1', 's2'].map((a, i) => m.map({ hook_event_name: 'PreToolUse', session_id: 'new', agent_id: a, agent_type: 'general-purpose', tool_name: 'Read' }, 6 + i)[0]!.agent);
    expect(ids).toEqual(['sky-environment', 'architect']);
    expect(m.map({ hook_event_name: 'PreToolUse', session_id: 'new', tool_name: 'SendMessage', tool_input: { to: 'architect' } }, 9)[1]).toMatchObject({ to: 'architect' });
    expect(m.stats.unmatched).toBe(0);
  });

  it('redacts prompt text and tool input contents', () => {
    const m = createHookMapper('live');
    const all = [
      ...m.map({ hook_event_name: 'UserPromptSubmit', session_id: 'main', ...({ prompt: SECRET } as object) }, 1),
      ...m.map({ hook_event_name: 'PreToolUse', session_id: 'main', tool_name: 'Edit', tool_input: { file_path: 'src/ui/a.tsx', old_string: SECRET, new_string: SECRET } }, 2),
      ...m.map({ hook_event_name: 'PreToolUse', session_id: 'main', tool_name: 'Bash', tool_input: { command: SECRET } }, 3),
      ...m.map({ hook_event_name: 'PostToolUse', session_id: 'main', tool_name: 'Bash', tool_response: { stdout: SECRET } }, 4),
    ];
    expect(JSON.stringify(all)).not.toContain(SECRET);
    expect(all.some((e) => e.kind === 'file_touch' && e.path === 'src/ui/a.tsx')).toBe(true);
  });

  it('counts unknown hook events instead of throwing', () => {
    const m = createHookMapper('live');
    expect(m.map({ hook_event_name: 'PreCompact', session_id: 'main' }, 1)).toEqual([]);
    expect(m.stats.unknown).toBe(1);
  });

  it('seq rises across events and failed tools report ok false', () => {
    const m = createHookMapper('replay');
    const a = m.map({ hook_event_name: 'PreToolUse', session_id: 's', tool_name: 'SendMessage', tool_input: { to: 'scene-qa' } }, 1);
    const b = m.map({ hook_event_name: 'PostToolUse', session_id: 's', tool_name: 'Bash', tool_response: { is_error: true } }, 2);
    expect(a[1]).toMatchObject({ kind: 'delegate', to: 'scene-qa', via: 'SendMessage', source: 'replay' });
    expect(b[0]).toMatchObject({ kind: 'tool_end', ok: false });
    expect(b[0]!.seq).toBeGreaterThan(a[1]!.seq);
  });
});

describe('specialist names and path owners', () => {
  it.each([
    ['Technical Architect', 'architect'],
    ['Scene & QA', 'scene-qa'],
    ['UI & Camera', 'ui-camera'],
    ['Sky & Environment', 'sky-environment'],
    ['Traffic & Life', 'traffic-life'],
    ['City & Streets', 'city-streets'],
    ['Buildings', 'buildings'],
    ['Audio', 'audio'],
    ['Graphics & Character', 'graphics-character'],
    ['graphics-character', 'graphics-character'],
    ['Graphics and Character specialist: rig pass', 'graphics-character'],
    ['general-purpose', null],
  ])('%s -> %s', (text, id) => {
    expect(specialistFromText(text)).toBe(id);
  });
  it.each([
    ['scene-qa', 'scene-qa'],
    ['Brief for the Audio specialist', 'audio'],
    ['fix street lamps', 'city-streets'],
    ['fix the person rig', 'graphics-character'],
    ['pedestrian crossing wait', 'traffic-life'],
    ['city life overview', null],
    ['test environment check', null],
    ['camera and sound sync', null],
    ['Audio and Buildings joint review', null],
    ['lifecycle refactor', null],
  ])('tight matching: %s -> %s', (text, id) => {
    expect(specialistFromText(text)).toBe(id);
  });
  it('ownership table, exact files before folders', () => {
    expect(ownerOf('src/scene/audioBridge.ts')).toBe('audio');
    expect(ownerOf('src/scene/CameraRig.tsx')).toBe('ui-camera');
    expect(ownerOf('src/scene/Other.tsx')).toBe('scene-qa');
    expect(ownerOf('D:\\x\\myworld3d\\src\\buildings\\a.ts')).toBe('buildings');
    expect(ownerOf('README.md')).toBeNull();
  });
  it('people rendering files belong to graphics-character, walker files to traffic-life', () => {
    expect(ownerOf('src/traffic/people/rigShader.ts')).toBe('graphics-character');
    expect(ownerOf('src/traffic/walkers/resolve.ts')).toBe('traffic-life');
  });
  it('graphics-character subagent: spawn by name, resume by id, people file edit attributed', () => {
    const m = createHookMapper('live');
    const d = m.map({ hook_event_name: 'PreToolUse', session_id: 'main', tool_name: 'Agent', tool_input: { subagent_type: 'graphics-character', name: 'graphics-character', description: 'gait pass' } }, 1);
    expect(d[1]).toMatchObject({ kind: 'delegate', to: 'graphics-character', via: 'Agent' });
    const first = m.map({ hook_event_name: 'PreToolUse', session_id: 'main', agent_id: 'gc1', agent_type: 'graphics-character', tool_name: 'Read', tool_input: { file_path: 'docs/agents/graphics-character.md' } }, 2);
    expect(first[0]!.agent).toBe('graphics-character');
    const sm = m.map({ hook_event_name: 'PreToolUse', session_id: 'main', tool_name: 'SendMessage', tool_input: { to: 'gc1' } }, 3);
    expect(sm.find((e) => e.kind === 'delegate')).toMatchObject({ to: 'graphics-character', via: 'SendMessage' });
    const edit = m.map({ hook_event_name: 'PreToolUse', session_id: 'main', agent_id: 'gc1', agent_type: 'graphics-character', tool_name: 'Edit', tool_input: { file_path: 'src/traffic/people/rigShaderGlsl.ts' } }, 4);
    expect(edit.find((e) => e.kind === 'file_touch')).toMatchObject({ agent: 'graphics-character', owner: 'graphics-character', path: 'src/traffic/people/rigShaderGlsl.ts' });
  });
  it('falls back to active claim globs', () => {
    const claims = [
      { owner: 'scene-qa', globs: ['docs/REPO_MAP.md'], status: 'active' },
      { owner: 'audio', globs: ['docs/**'], status: 'released' },
    ];
    expect(ownerOf('docs/REPO_MAP.md', claims)).toBe('scene-qa');
    expect(ownerOf('docs/other.md', claims)).toBeNull();
    expect(globMatch('harness/**', 'harness/a/b.md')).toBe(true);
    expect(globMatch('src/*.ts', 'src/a/b.ts')).toBe(false);
    expect(normalizePath('./src/a.ts')).toBe('src/a.ts');
  });
});
