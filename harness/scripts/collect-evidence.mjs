// Prints a one-line summary of the latest gate run in harness/runs/.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const runsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'runs');
const files = readdirSync(runsDir).filter((f) => f.endsWith('.json')).sort();
if (files.length === 0) {
  console.log('no runs in harness/runs/');
  process.exit(0);
}
const latest = JSON.parse(readFileSync(join(runsDir, files[files.length - 1]), 'utf8'));
const gates = latest.gates.map((g) => `${g.id}=${g.status}`).join(' ');
console.log(`${latest.finishedAt} ${latest.status} ${gates} (${files[files.length - 1]})`);
