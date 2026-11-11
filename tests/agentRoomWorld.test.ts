// Agent room view logic (ADR 0013): layout, world stepping and runtime are deterministic and headless.
import { describe, expect, it } from 'vitest';
import { AISLE_X, BOARD, DESK, DISCUSS, LEAD_DESK, ROOM, SEAT_COUNT, SPECIALISTS, deskPose } from '../src/agentRoom/world/layout';
import { huddleSlot } from '../src/agentRoom/world/office';
import { createLiveWorld, stepWorld } from '../src/agentRoom/world/liveWorld';
import { initialState } from '../src/agentRoom/engine/state';
import { apply } from '../src/agentRoom/engine/reduce';
import { createSimulationRuntime } from '../src/agentRoom/runtime';
import { bubbleText } from '../src/agentRoom/ui/bubbleText';

describe('room layout', () => {
  it('nine desks, pairwise distinct, clear of the lead desk, the board, the discuss table and the aisle', () => {
    expect(SPECIALISTS).toHaveLength(9);
    expect(SPECIALISTS).toContain('graphics-character');
    const ps = SPECIALISTS.map((id) => deskPose(id).pos);
    expect(new Set(ps.map((p) => `${p.x},${p.z}`)).size).toBe(9);
    const hit = (p: { x: number; z: number }, cx: number, cz: number, hw: number, hd: number, pad: number) => Math.abs(p.x - cx) < hw + DESK.w / 2 + pad && Math.abs(p.z - cz) < hd + DESK.d / 2 + pad;
    for (const p of ps) {
      expect(hit(p, LEAD_DESK.x, LEAD_DESK.z, LEAD_DESK.w / 2, LEAD_DESK.d / 2, 0.5)).toBe(false);
      expect(hit(p, BOARD.x, BOARD.z, BOARD.w / 2, 0.08, 0.5)).toBe(false);
      expect(Math.hypot(p.x - DISCUSS.x, p.z - DISCUSS.z)).toBeGreaterThan(DISCUSS.r + DESK.w / 2 + 1);
    }
    expect(SEAT_COUNT).toBeGreaterThanOrEqual(SPECIALISTS.length);
    expect(new Set(SPECIALISTS.map((id) => huddleSlot(id)).map((s) => `${s.x},${s.z}`)).size).toBe(9);
  });
  it('desks sit in the front half, inside the room, apart from each other', () => {
    const ps = SPECIALISTS.map((id) => deskPose(id).pos);
    for (const p of ps) {
      expect(Math.abs(p.x) + DESK.w / 2).toBeLessThan(ROOM.halfW);
      expect(p.z - DESK.d / 2).toBeGreaterThan(DISCUSS.z + DISCUSS.d / 2);
      expect(Math.abs(p.x - AISLE_X)).toBeGreaterThan(DESK.w / 2 + 0.5);
    }
    for (let i = 0; i < ps.length; i++)
      for (let j = i + 1; j < ps.length; j++) expect(Math.hypot(ps[i]!.x - ps[j]!.x, ps[i]!.z - ps[j]!.z)).toBeGreaterThan(DESK.w);
    expect(BOARD.z).toBeLessThan(DISCUSS.z);
  });
});
describe('live world', () => {
  const T = { meetMs: 8000, reportMs: 6000, idleMs: 20000 };
  it('a delegated specialist walks toward the board at walking speed', () => {
    const s = apply(initialState('simulation'), { seq: 1, t: 0, source: 'simulation', agent: 'lead', kind: 'delegate', to: 'audio', via: 'Agent' });
    const w = createLiveWorld(32, T);
    const start = { ...w.agents.audio.pos };
    // Three seconds in 0.1 s steps: the move eases in from the minimum speed, so the first second covers little ground.
    for (let i = 0; i < 30; i++) stepWorld(w, s, 0.1, 1000 + i * 100, 1.4, T);
    // Never faster than the walking speed; the straight-line displacement is at most the path length (routes turn).
    const moved = Math.hypot(w.agents.audio.pos.x - start.x, w.agents.audio.pos.z - start.z);
    expect(moved).toBeLessThanOrEqual(1.4 * 3 + 1e-9);
    expect(moved).toBeGreaterThan(0.7);
    expect(w.agents.audio.activity).toBe('huddle');
  });
  it('screen glow rises only once the owner works at the desk, and falls when done', () => {
    let s = apply(initialState('simulation'), { seq: 1, t: 0, source: 'simulation', agent: 'buildings', kind: 'tool_start', tool: 'Edit' });
    const TL = { ...T, idleMs: 120_000 }; // long walk from the pantry along the corridors
    const w = createLiveWorld(8, TL);
    stepWorld(w, s, 0.1, 100, 1.4, TL);
    expect(w.agents.buildings.glow).toBeLessThan(0.1);
    for (let i = 0; i < 400; i++) stepWorld(w, s, 0.1, 200 + i * 100, 1.4, TL);
    expect(w.agents.buildings.arrived).toBe(true);
    expect(w.agents.buildings.glow).toBeGreaterThan(0.9);
    s = apply(s, { seq: 2, t: 41000, source: 'simulation', agent: 'buildings', kind: 'subagent_done' });
    for (let i = 0; i < 30; i++) stepWorld(w, s, 0.1, 41000 + i * 100, 1.4, TL);
    expect(w.agents.buildings.glow).toBeLessThan(0.1);
    expect(w.agents.buildings.activity).toBe('report');
  });
});
describe('simulation runtime', () => {
  it('two runtimes with the same seed and steps end identical', () => {
    const a = createSimulationRuntime(5);
    const b = createSimulationRuntime(5);
    for (let i = 0; i < 2000; i++) {
      a.tick(1 / 30);
      b.tick(1 / 30);
    }
    expect(b.state).toEqual(a.state);
    expect(b.world.agents.architect.pos).toEqual(a.world.agents.architect.pos);
    expect(a.state.seq).toBeGreaterThan(10);
  });
  it('keeps seq rising across simulation loops', () => {
    const rt = createSimulationRuntime(2);
    for (let i = 0; i < 20000; i++) rt.tick(0.1);
    expect(rt.state.stale).toBe(0);
  });
  it('bubble text carries no paths beyond the file name', () => {
    expect(bubbleText({ seq: 1, t: 0, source: 'live', agent: 'audio', kind: 'file_touch', path: 'src/audio/deep/x.ts', owner: 'audio' })).toBe('x.ts');
  });
});
