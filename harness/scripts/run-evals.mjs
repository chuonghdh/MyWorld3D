// Runs the regression eval cases in harness/evals/regression/cases.json, one `npx vitest run <file>` per case.
// Writes harness/runs/evals-<timestamp>.json (same shape as a verify record). Prints failures only.
// Exit 0 when every case passes, 1 when a case fails, 2 when cases.json is missing or invalid.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const casesFile = join(root, 'harness/evals/regression/cases.json');

if (!existsSync(casesFile)) {
  console.log('no cases: harness/evals/regression/cases.json not found');
  process.exit(2);
}

let parsed;
try {
  parsed = JSON.parse(readFileSync(casesFile, 'utf8'));
} catch (err) {
  console.log(`invalid cases file: ${err.message}`);
  process.exit(2);
}
const cases = Array.isArray(parsed) ? parsed : parsed.cases;
if (!Array.isArray(cases) || cases.some((c) => typeof c.file !== 'string')) {
  console.log('invalid cases file: expected an array (or {"cases": [...]}) of objects with a "file" string');
  process.exit(2);
}

/** Read-only git query. Returns 'unknown' when git is not available. */
function gitValue(args) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : 'unknown';
}

const startedAt = new Date();
const commit = gitValue(['rev-parse', '--short', 'HEAD']);
const branch = gitValue(['rev-parse', '--abbrev-ref', 'HEAD']);
const results = [];

for (const c of cases) {
  const id = c.id ?? c.file;
  const command = `npx vitest run ${c.file}`;
  const t = Date.now();
  const r = spawnSync(command, { cwd: root, shell: true, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const output = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const status = r.status === 0 ? 'pass' : 'fail';
  const tail = status === 'fail' ? output.split('\n').slice(-40).join('\n') : '';
  results.push({ id, command, status, exitCode: r.status, durationMs: Date.now() - t, failureTail: tail });
}

const overall = results.every((g) => g.status === 'pass') ? 'pass' : 'fail';
const finishedAt = new Date();
const runFile = join(root, 'harness/runs', `evals-${startedAt.toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(
  runFile,
  JSON.stringify(
    { startedAt, finishedAt, commit, branch, status: overall, gateIds: results.map((g) => g.id), gates: results },
    null,
    2,
  ) + '\n',
);

for (const g of results) {
  if (g.status === 'pass') continue;
  console.log(`FAIL ${g.id} (exit ${g.exitCode}): ${g.command}`);
  console.log(g.failureTail);
}
if (overall === 'fail') console.log(`evals: FAIL. Result: ${runFile}`);
process.exit(overall === 'pass' ? 0 : 1);
