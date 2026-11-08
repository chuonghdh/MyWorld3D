// Agent room engine (ADR 0013): pure reducer and seeded simulation are deterministic and headless.
import { describe, expect, it } from 'vitest';
import { initialState } from '../src/agentRoom/engine/state';
import { apply, applyAll, isIdle } from '../src/agentRoom/engine/reduce';
import { simulate } from '../src/agentRoom/engine/sim';
import { agentRoom } from '../src/config/tuning';

describe('agent room simulation', () => {
  it('same seed gives the same events and the same final state', () => {
    const a = simulate(agentRoom.simSeed, 200, agentRoom.simEventsPerMin);
    const b = simulate(agentRoom.simSeed, 200, agentRoom.simEventsPerMin);
    expect(b).toEqual(a);
    expect(applyAll(initialState('simulation'), b)).toEqual(applyAll(initialState('simulation'), a));
  });
  it('another seed gives other events', () => {
    expect(simulate(1, 50, 30)).not.toEqual(simulate(2, 50, 30));
  });
  it('emits exactly count events with rising seq and labelled simulation', () => {
    const ev = simulate(3, 100, 30);
    expect(ev).toHaveLength(100);
    ev.forEach((e, i) => {
      expect(e.source).toBe('simulation');
      if (i > 0) expect(e.seq).toBeGreaterThan(ev[i - 1]!.seq);
    });
  });
});

describe('agent room reducer', () => {
  const s0 = initialState('live');
  it('does not mutate its input', () => {
    const frozen = JSON.stringify(s0);
    apply(s0, { seq: 1, t: 10, source: 'live', agent: 'lead', kind: 'prompt' });
    expect(JSON.stringify(s0)).toBe(frozen);
  });
  it('delegation sets both agents and records a link', () => {
    const s = apply(s0, { seq: 1, t: 5, source: 'live', agent: 'lead', kind: 'delegate', to: 'audio', via: 'Agent' });
    expect(s.agents.lead.status).toBe('delegating');
    expect(s.agents.audio.status).toBe('thinking');
    expect(s.links).toEqual([{ from: 'lead', to: 'audio', t: 5 }]);
  });
  it('tool events and failures', () => {
    let s = apply(s0, { seq: 1, t: 1, source: 'live', agent: 'buildings', kind: 'tool_start', tool: 'Edit' });
    expect(s.agents.buildings).toMatchObject({ status: 'tool', lastTool: 'Edit' });
    s = apply(s, { seq: 2, t: 2, source: 'live', agent: 'buildings', kind: 'tool_end', tool: 'Edit', ok: false });
    expect(s.agents.buildings.status).toBe('error');
  });
  it('ignores events whose seq is not newer', () => {
    const s = apply(s0, { seq: 2, t: 1, source: 'live', agent: 'lead', kind: 'prompt' });
    const again = apply(s, { seq: 2, t: 1, source: 'live', agent: 'lead', kind: 'notify' });
    expect(again.agents.lead.status).toBe('thinking');
    expect(again.stale).toBe(1);
  });
  it('file touch records the path on the owner desk', () => {
    const s = apply(s0, { seq: 1, t: 1, source: 'live', agent: 'lead', kind: 'file_touch', path: 'src/sky/a.ts', owner: 'sky-environment' });
    expect(s.lastPath['sky-environment']).toBe('src/sky/a.ts');
  });
  it('idle query uses event time only', () => {
    const s = apply(s0, { seq: 1, t: 1000, source: 'live', agent: 'audio', kind: 'prompt' });
    expect(isIdle(s, 'audio', 1500, agentRoom.idleAfterSec * 1000)).toBe(false);
    expect(isIdle(s, 'audio', 1000 + agentRoom.idleAfterSec * 1000 + 1, agentRoom.idleAfterSec * 1000)).toBe(true);
  });
});
