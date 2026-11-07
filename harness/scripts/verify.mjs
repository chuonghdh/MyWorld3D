// Runs the gates in harness/config/quality-gates.json in order. Prints only failures.
// Writes a result file to harness/runs/ (commit, branch, gate ids, gate results). Exit code 0 when every gate passes, 1 otherwise.
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const config = JSON.parse(readFileSync(join(root, 'harness/config/quality-gates.json'), 'utf8'));
const startedAt = new Date();
const results = [];

/** Read-only git query. Returns 'unknown' when git is not available. */
function gitValue(args) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : 'unknown';
}
const commit = gitValue(['rev-parse', '--short', 'HEAD']);
const branch = gitValue(['rev-parse', '--abbrev-ref', 'HEAD']);

for (const gate of config.gates) {
  const t = Date.now();
  const r = spawnSync(gate.command, { cwd: root, shell: true, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const output = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const status = r.status === 0 ? 'pass' : 'fail';
  const tail = status === 'fail' ? output.split('\n').slice(-40).join('\n') : '';
  results.push({ id: gate.id, command: gate.command, status, exitCode: r.status, durationMs: Date.now() - t, failureTail: tail });
}

const overall = results.every((g) => g.status === 'pass') ? 'pass' : 'fail';
const finishedAt = new Date();
const runFile = join(root, 'harness/runs', `${startedAt.toISOString().replace(/[:.]/g, '-')}.json`);
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
if (overall === 'fail') console.log(`verify: FAIL. Result: ${runFile}`);
process.exit(overall === 'pass' ? 0 : 1);
