// Prints a one-line summary of the newest run record in harness/runs/ (verify or evals).
// Exit 0 when status is pass, 1 when fail, 2 when there is no run record.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const runsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'runs');
const files = readdirSync(runsDir).filter((f) => f.endsWith('.json'));
if (files.length === 0) {
  console.log('no run record in harness/runs/');
  process.exit(2);
}
const records = files.map((name) => ({ name, rec: JSON.parse(readFileSync(join(runsDir, name), 'utf8')) }));
records.sort((a, b) => String(a.rec.finishedAt).localeCompare(String(b.rec.finishedAt)));
const { name, rec } = records[records.length - 1];
const failed = (rec.gates ?? []).filter((g) => g.status === 'fail').map((g) => g.id);
console.log(
  `${rec.finishedAt} commit=${rec.commit ?? 'unknown'} branch=${rec.branch ?? 'unknown'} status=${rec.status} failed=${failed.length ? failed.join(',') : 'none'} (${name})`,
);
process.exit(rec.status === 'pass' ? 0 : 1);
