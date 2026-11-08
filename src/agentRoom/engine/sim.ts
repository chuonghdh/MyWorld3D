// Seeded simulation demo (ADR 0013). Always labelled 'simulation'. Same seed, same events.
import type { AgentId, RoomEvent } from '../model/types';

const SPECIALISTS: readonly AgentId[] = [
  'buildings', 'city-streets', 'traffic-life', 'sky-environment', 'audio', 'ui-camera', 'scene-qa', 'architect',
];
const TOOLS = ['Read', 'Edit', 'Grep', 'Bash', 'Write'] as const;
const DEMO_PATHS: Partial<Record<AgentId, string>> = {
  buildings: 'src/buildings/demo.ts',
  'city-streets': 'src/streets/demo.ts',
  'traffic-life': 'src/traffic/demo.ts',
  'sky-environment': 'src/sky/demo.ts',
  audio: 'src/audio/demo.ts',
  'ui-camera': 'src/ui/demo.tsx',
  'scene-qa': 'src/scene/demo.tsx',
  architect: 'src/agentRoom/demo.ts',
};

/** mulberry32: small deterministic PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `count` demo events starting at t0, spaced by the rate (events per minute). */
export function simulate(seed: number, count: number, eventsPerMin: number, t0 = 0): RoomEvent[] {
  const rnd = mulberry32(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)] as T;
  const step = 60000 / Math.max(1, eventsPerMin);
  const out: RoomEvent[] = [];
  let seq = 0;
  const busy: AgentId[] = [];
  const open = new Map<AgentId, string>();
  let demo = 0;
  const base = (agent: AgentId) => ({ seq: ++seq, t: t0 + out.length * step, source: 'simulation' as const, agent });
  while (out.length < count) {
    const r = rnd();
    if (busy.length === 0 || r < 0.2) {
      const to = pick(SPECIALISTS);
      out.push({ ...base('lead'), kind: 'delegate', to, via: rnd() < 0.5 ? 'Agent' : 'SendMessage' });
      if (!busy.includes(to)) {
        busy.push(to);
        // Demo kanban card (ids say DEMO: simulated, not a real harness task).
        const task = `DEMO-${++demo}`;
        open.set(to, task);
        if (out.length < count) out.push({ ...base(to), kind: 'task_state', task, state: 'in_progress' });
      }
    } else if (r < 0.85) {
      const agent = pick(busy);
      const tool = pick(TOOLS);
      out.push({ ...base(agent), kind: 'tool_start', tool });
      const path = DEMO_PATHS[agent];
      if ((tool === 'Edit' || tool === 'Write') && path && out.length < count) {
        out.push({ ...base(agent), kind: 'file_touch', path, owner: agent });
      }
    } else {
      const agent = busy.splice(Math.floor(rnd() * busy.length), 1)[0] as AgentId;
      const task = open.get(agent);
      if (task) {
        open.delete(agent);
        out.push({ ...base(agent), kind: 'task_state', task, state: 'verifying' });
        if (out.length < count) out.push({ ...base(agent), kind: 'task_state', task, state: 'done' });
      }
      if (out.length < count) out.push({ ...base(agent), kind: 'subagent_done' });
      if (out.length < count && rnd() < 0.5) {
        const hash = Math.floor(rnd() * 0xfffffff).toString(16).padStart(7, '0');
        out.push({ ...base('lead'), kind: 'tool_start', tool: `commit ${hash}` });
      }
    }
  }
  return out.slice(0, count);
}
