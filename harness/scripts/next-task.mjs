// Backlog picker for the delivery workflow (harness/workflows/delivery.md).
// Usage: node harness/scripts/next-task.mjs            backlog records sorted by priority, then id, one line each:
//                                                       "P1 T-0010-headless-smoke [architect] title". Prints "backlog empty" when none.
//        node harness/scripts/next-task.mjs --next-id   the next free T-NNNN across backlog, active and completed.
// Exit 0. Exit 1 only on an unknown argument.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const tasksDir = join(root, 'harness/tasks');

function records(sub) {
  const dir = join(tasksDir, sub);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^T-\d{4}.*\.md$/.test(f))
    .map((f) => ({ id: f.replace(/\.md$/, ''), text: readFileSync(join(dir, f), 'utf8') }));
}

function frontMatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const fm = {};
  if (!m) return fm;
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([a-z_]+):\s*(.*)$/);
    if (kv) fm[kv[1]] = kv[2].replace(/\s+#.*$/, '').trim();
  }
  return fm;
}

const args = process.argv.slice(2);
if (args.length === 0) {
  const rows = records('backlog')
    .map((r) => ({ id: r.id, fm: frontMatter(r.text) }))
    // A record without a valid priority sorts last; validate-task.mjs reports it.
    .map((r) => ({ ...r, priority: /^P[123]$/.test(r.fm.priority ?? '') ? r.fm.priority : 'P?' }))
    .sort((a, b) => a.priority.localeCompare(b.priority) || a.id.localeCompare(b.id));
  if (rows.length === 0) console.log('backlog empty');
  for (const r of rows) console.log(`${r.priority} ${r.id} [${r.fm.owner ?? '?'}] ${r.fm.title ?? ''}`.trimEnd());
} else if (args.length === 1 && args[0] === '--next-id') {
  const used = ['backlog', 'active', 'completed'].flatMap((s) => records(s)).map((r) => Number(r.id.slice(2, 6)));
  console.log(`T-${String(Math.max(0, ...used) + 1).padStart(4, '0')}`);
} else {
  console.log(`next-task: unknown argument(s) ${args.join(' ')}. Usage: next-task.mjs [--next-id]`);
  process.exit(1);
}
