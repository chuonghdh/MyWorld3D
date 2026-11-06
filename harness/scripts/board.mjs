// Prints the Agent Office board from harness/state/board.json: a table and a summary line. Reads only that file.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'state', 'board.json');
const board = JSON.parse(readFileSync(file, 'utf8'));
const agents = board.agents ?? [];
const counts = {};
for (const a of agents) counts[a.status] = (counts[a.status] ?? 0) + 1;

const rows = agents.map((a) => [a.id, a.status, `${a.progress}%`, a.activity ?? '']);
const header = ['id', 'status', 'progress', 'activity'];
const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
const line = (cols) => cols.map((c, i) => c.padEnd(widths[i])).join('  ');

console.log(line(header));
console.log(widths.map((w) => '-'.repeat(w)).join('  '));
for (const r of rows) console.log(line(r));
const summary = Object.entries(counts).map(([s, n]) => `${s}=${n}`).join(' ');
console.log(`summary: ${agents.length} agents; ${summary}`);
