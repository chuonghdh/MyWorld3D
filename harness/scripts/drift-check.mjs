// Drift check for the harness. Reports four kinds of drift and exits 1 when any is found:
//   claims-on-done      an active claim belongs to a task whose record is done
//   stale-active-tasks  a record in harness/tasks/active/ was created more than 14 days ago
//   board-without-task  a board agent (not the orchestrator) is active with no active claim or active task for it
//   dead-doc-links      a backticked repo path in CLAUDE.md, AGENTS.md, docs/ or harness/ does not exist
// Writes a report to harness/runs/drift-<timestamp>.json. Prints only drift lines. Exit 0 when clean.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const STALE_DAYS = 14;
const now = new Date();

const read = (p) => readFileSync(join(root, p), 'utf8');
const listMd = (dir) => {
  const abs = join(root, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs).filter((f) => f.endsWith('.md') && f !== 'TEMPLATE.md').map((f) => join(dir, f).replace(/\\/g, '/'));
};

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

const records = [...listMd('harness/tasks/backlog'), ...listMd('harness/tasks/active'), ...listMd('harness/tasks/completed')].map((p) => ({
  path: p,
  id: p.split('/').pop().replace(/\.md$/, ''),
  fm: frontMatter(read(p)),
  folder: p.split('/')[2],
}));
const claims = JSON.parse(read('harness/state/claims.json')).claims ?? [];
const board = JSON.parse(read('harness/state/board.json'));

const drift = [];

// claims-on-done
for (const c of claims.filter((x) => x.status === 'active')) {
  const m = String(c.task).match(/^T-\d{4}/);
  if (!m) continue;
  const rec = records.find((r) => r.id.startsWith(m[0]));
  if (rec && rec.fm.status === 'done') drift.push({ check: 'claims-on-done', detail: `active claim (${c.owner}, ${c.globs.join(', ')}) on done task ${rec.id}` });
}

// stale-active-tasks
for (const r of records.filter((x) => x.folder === 'active')) {
  const created = new Date(r.fm.created ?? '');
  const days = Math.floor((now - created) / 86400000);
  if (Number.isNaN(days)) drift.push({ check: 'stale-active-tasks', detail: `${r.id}: created date missing or invalid` });
  else if (days > STALE_DAYS) drift.push({ check: 'stale-active-tasks', detail: `${r.id} in active/ for ${days} days (created ${r.fm.created})` });
}

// board-without-task
const activeTaskOwners = new Set(records.filter((r) => r.folder === 'active').map((r) => r.fm.owner));
const claimOwners = new Set(claims.filter((c) => c.status === 'active').map((c) => c.owner));
for (const a of board.agents ?? []) {
  if (a.id === 'orchestrator' || a.status !== 'active') continue;
  if (!activeTaskOwners.has(a.id) && !claimOwners.has(a.id)) drift.push({ check: 'board-without-task', detail: `board row ${a.id} is active with no active task or claim` });
}

// dead-doc-links
const docFiles = ['CLAUDE.md', 'AGENTS.md', ...listDocs('docs'), ...listDocs('harness')];
function listDocs(dir) {
  const abs = join(root, dir);
  if (!existsSync(abs)) return [];
  const out = [];
  const walk = (d) => {
    for (const f of readdirSync(join(root, d), { withFileTypes: true })) {
      const rel2 = join(d, f.name).replace(/\\/g, '/');
      if (f.isDirectory()) walk(rel2);
      else if (f.name.endsWith('.md')) out.push(rel2);
    }
  };
  walk(dir);
  return out;
}
const repoPath = /^(docs|src|tests|public|dashboard|harness|\.github)\//;
for (const f of docFiles) {
  if (!existsSync(join(root, f))) continue;
  for (const m of read(f).matchAll(/`([^`\s]+)`/g)) {
    const p = m[1].split(':')[0];
    if (!repoPath.test(p) || p.includes('*') || p.includes('<') || /NNNN|YYYY|slug/.test(p)) continue;
    if (!existsSync(join(root, p))) drift.push({ check: 'dead-doc-links', detail: `${f} names ${p}, which does not exist` });
  }
}

const runsDir = join(root, 'harness/runs');
const reportFile = join(runsDir, `drift-${now.toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(reportFile, JSON.stringify({ checkedAt: now, status: drift.length ? 'drift' : 'clean', drift }, null, 2) + '\n');

for (const d of drift) console.log(`DRIFT ${d.check}: ${d.detail}`);
if (drift.length) console.log(`drift-check: ${drift.length} drift item(s). Report: ${relative(root, reportFile)}`);
process.exit(drift.length ? 1 : 0);
