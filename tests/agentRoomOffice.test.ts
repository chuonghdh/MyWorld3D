// Living office (phase 6): pure plan, seats, board and engine additions (tasks, shipped, called).
import { describe, expect, it } from 'vitest';
import { initialState, type RoomState } from '../src/agentRoom/engine/state';
import { apply, applyAll } from '../src/agentRoom/engine/reduce';
import { simulate } from '../src/agentRoom/engine/sim';
import { BOARD, PANTRY, PANTRY_SEATS, huddleSlot, planFor, seatOf } from '../src/agentRoom/world/office';
import { ROOM, SPECIALISTS, deskPose, homeSpot } from '../src/agentRoom/world/layout';
import type { RoomEvent } from '../src/agentRoom/model/types';

const T = { meetMs: 8000, reportMs: 6000, idleMs: 20000 };
type Draft = RoomEvent extends infer E ? (E extends RoomEvent ? Omit<E, 'seq' | 'source'> : never) : never;
let seq = 0;
const ev = (e: Draft): RoomEvent => ({ ...e, seq: ++seq, source: 'live' }) as RoomEvent;
const run = (...es: Draft[]): RoomState => applyAll(initialState('live'), es.map(ev));

describe('office layout', () => {
  it('every specialist has its own pantry seat and huddle slot (no overlap)', () => {
    const seats = SPECIALISTS.map(seatOf);
    expect(new Set(seats).size).toBe(SPECIALISTS.length);
    const slots = SPECIALISTS.map((id) => huddleSlot(id));
    for (let i = 0; i < slots.length; i++)
      for (let j = i + 1; j < slots.length; j++) expect(Math.hypot(slots[i]!.x - slots[j]!.x, slots[i]!.z - slots[j]!.z)).toBeGreaterThan(0.8);
  });
  it('pantry seats are in the back-right corner, inside the room', () => {
    for (const s of PANTRY_SEATS) {
      expect(s.pos.x).toBeGreaterThan(PANTRY.x0);
      expect(s.pos.x).toBeLessThan(ROOM.halfW);
      expect(s.pos.z).toBeGreaterThan(-ROOM.halfD);
      expect(s.pos.z).toBeLessThan(PANTRY.z1);
    }
  });
  it('board area is clear of the desks', () => {
    for (const id of SPECIALISTS) {
      const d = deskPose(id).pos;
      expect(Math.hypot(d.x - BOARD.x, d.z - BOARD.z)).toBeGreaterThan(2.2);
    }
  });
});

describe('office plan', () => {
  it('idle specialists and an idle lead sit in the pantry', () => {
    const s = initialState('live');
    const p = planFor(s, 'audio', 0, T);
    expect(p.activity).toBe('relax');
    expect(p.target).toEqual(PANTRY_SEATS[seatOf('audio')]!.pos);
    expect(planFor(s, 'lead', 0, T)).toMatchObject({ activity: 'relax', target: PANTRY_SEATS[seatOf('lead')]!.pos });
    expect(seatOf('lead')).not.toBe(seatOf('audio'));
  });
  it('work loop: called -> huddle at board, then desk work, then report, then pantry', () => {
    seq = 0;
    let s = run({ t: 0, agent: 'lead', kind: 'delegate', to: 'audio', via: 'Agent' });
    expect(planFor(s, 'audio', 1000, T)).toMatchObject({ activity: 'huddle', target: huddleSlot('audio') });
    expect(planFor(s, 'lead', 1000, T).activity).toBe('huddle');
    s = apply(s, ev({ t: 9000, agent: 'audio', kind: 'tool_start', tool: 'Edit' }));
    expect(planFor(s, 'audio', 9500, T)).toMatchObject({ activity: 'work', target: homeSpot('audio') });
    s = apply(s, ev({ t: 15000, agent: 'audio', kind: 'subagent_done' }));
    expect(planFor(s, 'audio', 16000, T).activity).toBe('report');
    expect(planFor(s, 'audio', 15000 + 6001, T).activity).toBe('relax');
  });
  it('a working agent with no events for idleAfterSec goes to the pantry', () => {
    seq = 0;
    const s = run({ t: 0, agent: 'buildings', kind: 'tool_start', tool: 'Read' });
    expect(planFor(s, 'buildings', 19_999, T).activity).toBe('work');
    expect(planFor(s, 'buildings', 20_001, T).activity).toBe('relax');
  });
  it('waiting and error show as wait at the desk', () => {
    seq = 0;
    expect(planFor(run({ t: 0, agent: 'audio', kind: 'notify' }), 'audio', 10, T).activity).toBe('wait');
  });
  it('there is no guest: the roster is the lead plus the eight specialists', () => {
    expect(Object.keys(initialState('live').agents).sort()).toEqual(['lead', ...SPECIALISTS].sort());
  });
});

describe('engine additions', () => {
  it('task_state builds kanban cards; commits count as shipped', () => {
    seq = 0;
    const s = run(
      { t: 0, agent: 'audio', kind: 'task_state', task: 'T-0009-x', state: 'in_progress' },
      { t: 1, agent: 'audio', kind: 'task_state', task: 'T-0009-x', state: 'done' },
      { t: 2, agent: 'lead', kind: 'tool_start', tool: 'commit abc1234' },
      { t: 3, agent: 'lead', kind: 'tool_start', tool: 'Bash' },
    );
    expect(s.tasks['T-0009-x']).toEqual({ state: 'done', owner: 'audio', t: 1 });
    expect(s.shipped).toEqual({ count: 1, lastHash: 'abc1234', t: 2 });
  });
  it('simulation produces DEMO tasks that finish, and labelled commits', () => {
    const s = applyAll(initialState('simulation'), simulate(8, 400, 30));
    const ids = Object.keys(s.tasks);
    expect(ids.length).toBeGreaterThan(3);
    expect(ids.every((id) => id.startsWith('DEMO-'))).toBe(true);
    expect(Object.values(s.tasks).some((c) => c.state === 'done')).toBe(true);
    expect(s.shipped.count).toBeGreaterThan(0);
  });
});
