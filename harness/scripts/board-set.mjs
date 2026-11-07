// Sets one agent row in harness/state/board.json. Validates the result with the same rules as tests/harness.test.ts.
// Usage: node harness/scripts/board-set.mjs <agent-id> <active|permission|done|waiting> <progress 0-100> "<activity>" [--if-no-active-agents]
//   --if-no-active-agents: apply only when no agent other than the orchestrator is active; otherwise do nothing.
// Prints nothing on success. Prints the problem and exits 1 when validation fails; exits 2 on bad usage.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'state', 'board.json');
const STATUSES = ['active', 'waiting', 'done', 'permission'];

const args = process.argv.slice(2);
const onlyIfIdle = args.includes('--if-no-active-agents');
const [id, status, progressRaw, activity] = args.filter((a) => a !== '--if-no-active-agents');

if (!id || !status || progressRaw === undefined || activity === undefined) {
  console.log('usage: node harness/scripts/board-set.mjs <agent-id> <active|permission|done|waiting> <progress 0-100> "<activity>" [--if-no-active-agents]');
  process.exit(2);
}

const board = JSON.parse(readFileSync(file, 'utf8'));

if (onlyIfIdle && board.agents.some((a) => a.id !== 'orchestrator' && a.status === 'active')) process.exit(0);

const progress = Number(progressRaw);
const agent = board.agents.find((a) => a.id === id);
const problems = [];
if (!agent) problems.push(`unknown agent id ${id}`);
if (!STATUSES.includes(status)) problems.push(`status ${status} not one of ${STATUSES.join(', ')}`);
if (!Number.isInteger(progress) || progress < 0 || progress > 100) problems.push(`progress ${progressRaw} out of 0 to 100`);
if (status === 'done' && progress !== 100) problems.push(`done needs progress 100, got ${progressRaw}`);
if (!activity.trim()) problems.push('activity is empty');

if (problems.length === 0) {
  const next = structuredClone(board);
  const row = next.agents.find((a) => a.id === id);
  row.status = status;
  row.progress = progress;
  row.activity = activity;
  const anyActive = next.agents.some((a) => a.status === 'active');
  const orch = next.agents.find((a) => a.id === 'orchestrator');
  if (!orch) problems.push('orchestrator id missing');
  else if (anyActive && orch.status !== 'active') problems.push(`orchestrator is ${orch.status} while an agent is active`);
  if (problems.length === 0) {
    // Write only when the row actually changes, so the tracked file does not churn on every turn.
    if (JSON.stringify(next) !== JSON.stringify(board)) writeFileSync(file, JSON.stringify(next, null, 2) + '\n');
    process.exit(0);
  }
}

for (const p of problems) console.log(`FAIL board-set: ${p}`);
process.exit(1);
