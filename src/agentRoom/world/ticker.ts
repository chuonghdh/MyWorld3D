// Board ticker messages (pure): one short status per specialist, the lead, shipped count and the live tasks.
import type { AgentSnapshot, AgentStatus } from '../model/types';
import type { Shipped, TaskCard } from '../engine/state';
import { AGENT_LABEL } from './palette';
import { columnOf } from './boardCanvas';

const STATUS_TEXT: Record<AgentStatus, string> = {
  idle: 'idle',
  thinking: 'thinking',
  tool: 'running a tool',
  delegating: 'delegating',
  waiting: 'waiting for input',
  done: 'finished',
  error: 'hit an error',
};
const MAX_TASKS = 4;

export function tickerMessages(agents: readonly AgentSnapshot[], tasks: Readonly<Record<string, TaskCard>>, shipped: Shipped): string[] {
  const out: string[] = [];
  for (const a of agents) out.push(`${AGENT_LABEL[a.id]}: ${STATUS_TEXT[a.status]}`);
  out.push(`Shipped ${shipped.count}`);
  Object.entries(tasks)
    .filter(([, c]) => columnOf(c.state) === 'Active' || columnOf(c.state) === 'Review')
    .slice(0, MAX_TASKS)
    .forEach(([id, c]) => out.push(`${id}: ${c.state.replace('_', ' ')}`));
  return out;
}
