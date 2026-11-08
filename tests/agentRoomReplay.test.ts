// Agent room replay (ADR 0013): replay document -> events is pure, ordered, labelled and redacted.
import { describe, expect, it } from 'vitest';
import { buildReplayEvents, commitOwner, isReplayDoc, spaceForPlayback, type ReplayDoc } from '../src/agentRoom/replay/build';
import { createReplayRuntime } from '../src/agentRoom/runtime';

const DOC: ReplayDoc = {
  kind: 'agent-room-replay',
  version: 1,
  generatedAt: '2026-11-08T00:00:00Z',
  commits: [
    { hash: 'aaaaaaa', t: Date.parse('2026-11-07T10:00:00Z'), files: ['src/buildings/a.ts', 'src/buildings/b.ts', 'src/ui/c.tsx'] },
    { hash: 'bbbbbbb', t: Date.parse('2026-11-08T09:00:00Z'), files: ['README.md'] },
  ],
  tasks: [
    { id: 'T-0007-x', title: 'X', status: 'done', owner: 'lead', created: '2026-11-07', file: 'harness/tasks/completed/T-0007-x.md' },
    { id: 'T-0008-y', title: 'Y', status: 'weird', owner: 'Someone', created: '2026-11-08', file: 'harness/tasks/active/T-0008-y.md' },
  ],
  briefs: [],
  claims: [{ task: 'T-0008-y', owner: 'scene-qa', globs: ['docs/REPO_MAP.md'], status: 'active', date: '2026-11-08' }],
};

describe('replay build', () => {
  it('recognises replay documents only', () => {
    expect(isReplayDoc(DOC)).toBe(true);
    expect(isReplayDoc({ kind: 'other' })).toBe(false);
    expect(isReplayDoc(null)).toBe(false);
  });
  it('is pure and ordered by time with seq 1..n, all labelled replay', () => {
    const a = buildReplayEvents(DOC);
    expect(buildReplayEvents(DOC)).toEqual(a);
    a.forEach((e, i) => {
      expect(e.seq).toBe(i + 1);
      expect(e.source).toBe('replay');
      if (i > 0) expect(e.t).toBeGreaterThanOrEqual(a[i - 1]!.t);
    });
  });
  it('a commit is delegated to the owner of most of its files', () => {
    expect(commitOwner(DOC.commits[0]!.files, [])).toBe('buildings');
    expect(commitOwner(['README.md'], [])).toBe('lead');
    const ev = buildReplayEvents(DOC);
    expect(ev.some((e) => e.kind === 'delegate' && e.to === 'buildings')).toBe(true);
    expect(ev.filter((e) => e.kind === 'file_touch' && e.path === 'src/ui/c.tsx')[0]).toMatchObject({ agent: 'buildings', owner: 'ui-camera' });
  });
  it('unknown owners become guests and unknown task states fall back to proposed', () => {
    const t = buildReplayEvents(DOC).find((e) => e.kind === 'task_state' && e.task === 'T-0008-y');
    expect(t).toMatchObject({ agent: 'guest', state: 'proposed' });
  });
  it('playback spacing keeps order and seq', () => {
    const s = spaceForPlayback(buildReplayEvents(DOC), 1500);
    expect(s.map((e) => e.t)).toEqual(s.map((_, i) => i * 1500));
  });
  it('replay runtime plays all events, labelled replay, and loops without stale events', () => {
    const ev = buildReplayEvents(DOC);
    const rt = createReplayRuntime(ev);
    for (let i = 0; i < 400; i++) rt.tick(0.1);
    expect(rt.source).toBe('replay');
    expect(rt.state.seq).toBeGreaterThan(ev.length);
    expect(rt.state.stale).toBe(0);
  });
});
