// Live bridge (phase 5): redaction, hook never fails, SSE resume, and mapping of a recorded hook session.
import { describe, expect, it } from 'vitest';
import { Ring, redact, safePath, sendHook, sseFrame } from '../tools/agent-bridge/lib.mjs';
import { createHookMapper, type HookPayload } from '../src/agentRoom/mapping/hook';

const FIXTURE = Object.values(import.meta.glob('/tools/agent-bridge/fixture.jsonl', { query: '?raw', import: 'default', eager: true }))[0] as string;
const LINES = FIXTURE.trim().split('\n').map((l) => JSON.parse(l) as Record<string, unknown>);
const CWD = 'D:/work/myworld3d';

describe('redaction', () => {
  it('no prompt text, tool input contents, outputs or cwd survive (sentinel)', () => {
    const out = JSON.stringify(LINES.map((l) => redact(l, CWD)));
    expect(out).not.toContain('SENTINEL');
    expect(out).not.toContain('secret');
    expect(out).not.toContain('Users');
  });
  it('keeps event names, tool names, file paths, ids and specialist words', () => {
    const r = LINES.map((l) => redact(l, CWD));
    expect(r[2]).toEqual({ hook_event_name: 'PreToolUse', session_id: 's-main', tool_name: 'Agent', tool_input: { subagent_type: 'general-purpose', description: 'audio' } });
    expect(r[5]!.tool_input).toEqual({ file_path: 'src/audio/mixer.ts' });
    expect(r[7]!.tool_response).toEqual({ is_error: true });
  });
  it('absolute paths become repo-relative, outside paths only their base name', () => {
    expect(safePath('D:/work/myworld3d/src/a.ts', CWD)).toBe('src/a.ts');
    expect(safePath('C:/Users/x/notes/secret.txt', CWD)).toBe('secret.txt');
  });
});

describe('hook delivery never fails', () => {
  it('resolves false when the bridge is down', async () => {
    await expect(sendHook({}, { port: 1, fetchImpl: () => Promise.reject(new Error('ECONNREFUSED')) })).resolves.toBe(false);
  });
  it('gives up within the time limit when the bridge hangs', async () => {
    const t0 = Date.now();
    await expect(sendHook({}, { port: 1, timeoutMs: 120, fetchImpl: () => new Promise(() => undefined) })).resolves.toBe(false);
    expect(Date.now() - t0).toBeLessThan(400);
  });
  it('resolves true when the bridge accepts', async () => {
    await expect(sendHook({}, { port: 1, fetchImpl: () => Promise.resolve({ ok: true }) })).resolves.toBe(true);
  });
});

describe('SSE resume', () => {
  it('replays only entries after Last-Event-ID; ring is bounded', () => {
    const ring = new Ring(3);
    for (let i = 0; i < 5; i++) ring.push({ t: i });
    expect(ring.since(undefined).map((e) => e.id)).toEqual([3, 4, 5]);
    expect(ring.since('4').map((e) => e.id)).toEqual([5]);
    expect(ring.since('garbage').map((e) => e.id)).toEqual([3, 4, 5]);
    expect(sseFrame(ring.items[2]!)).toBe(`id: 5\ndata: ${JSON.stringify(ring.items[2])}\n\n`);
  });
});

describe('recorded session -> room events', () => {
  it('maps the fixture: lead delegates to Audio, Audio works and finishes, lead is notified', () => {
    const m = createHookMapper('live');
    const events = LINES.flatMap((l, i) => m.map(redact(l, CWD) as HookPayload, i * 1000));
    const kinds = events.map((e) => `${e.agent}:${e.kind}`);
    expect(kinds).toContain('lead:session_start');
    expect(events.find((e) => e.kind === 'delegate')).toMatchObject({ agent: 'lead', to: 'audio' });
    expect(kinds).toContain('audio:tool_start');
    expect(events.find((e) => e.kind === 'file_touch')).toMatchObject({ agent: 'audio', owner: 'audio', path: 'src/audio/mixer.ts' });
    expect(events.find((e) => e.kind === 'tool_end' && e.agent === 'audio' && !e.ok)).toBeTruthy();
    expect(kinds).toContain('audio:subagent_done');
    expect(kinds).toContain('lead:notify');
    expect(m.stats.unknown).toBe(0);
    expect(JSON.stringify(events)).not.toContain('SENTINEL');
  });
});
