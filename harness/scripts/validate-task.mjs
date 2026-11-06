// Checks task records: front matter and sections, same rules as tests/harness.test.ts.
// Usage: node harness/scripts/validate-task.mjs [file ...]. Default: all records in harness/tasks/.
// Prints only failures. Exit code 1 on any failure.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const tasksDir = join(root, 'harness/tasks');
const STATES = ['proposed', 'assigned', 'in_progress', 'verifying', 'done', 'blocked', 'cancelled'];
const SECTIONS = ['Spec', 'Acceptance', 'Checkpoints', 'Handoff'];

function listRecords() {
  const out = [];
  for (const sub of ['backlog', 'active', 'completed']) {
    const dir = join(tasksDir, sub);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) if (f.endsWith('.md')) out.push(join(dir, f));
  }
  return out;
}

function frontMatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([a-z_]+):\s*(.*)$/);
    if (kv) fm[kv[1]] = kv[2].replace(/\s+#.*$/, '').trim();
  }
  return fm;
}

function sectionOf(text, name) {
  const re = new RegExp(`^## ${name}\\s*$([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm');
  const m = text.match(re);
  return m ? m[1] : null;
}

function check(file) {
  const name = basename(file);
  const text = readFileSync(file, 'utf8');
  const problems = [];
  const fm = frontMatter(text);
  if (!fm) return [`${name}: no front matter`];
  if (fm.id !== name.replace(/\.md$/, '')) problems.push(`id "${fm.id}" does not match file name`);
  for (const k of ['title', 'owner', 'branch']) if (!fm[k]) problems.push(`missing ${k}`);
  if (!STATES.includes(fm.status ?? '')) problems.push(`status "${fm.status}" not one of the seven states`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fm.created ?? '')) problems.push('created must be YYYY-MM-DD');
  for (const s of SECTIONS) if (sectionOf(text, s) === null) problems.push(`missing section ${s}`);
  if (fm.status === 'done') {
    const open = (sectionOf(text, 'Acceptance') ?? '').split('\n').filter((l) => l.trim().startsWith('- [ ]'));
    for (const l of open) problems.push(`done with unchecked acceptance item: ${l.trim()}`);
  }
  return problems.map((p) => `${name}: ${p}`);
}

const args = process.argv.slice(2);
const files = args.length ? args : listRecords();
const failures = files.flatMap((f) => (statSync(f).isFile() ? check(f) : []));
for (const f of failures) console.log(`FAIL ${f}`);
process.exit(failures.length ? 1 : 0);
