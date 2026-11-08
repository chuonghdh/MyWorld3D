#!/usr/bin/env node
// Agent room replay export (ADR 0013). Reads real harness state and git history into a raw JSON document that
// the room turns into events (src/agentRoom/replay/build.ts). Node 22, no dependencies.
// Usage: node tools/agent-bridge/replay.mjs [--commits 50] [--out harness/runs/agent-room-replay.json]
// Redaction: commit hashes, times and changed paths only (no commit bodies, no diffs); task ids, titles, states, owners.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const arg = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const COMMITS = Math.max(1, Number(arg('--commits', '50')) || 50);
const OUT = join(ROOT, arg('--out', 'harness/runs/agent-room-replay.json'));

const rel = (p) => relative(ROOT, p).split('\\').join('/');

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)]));
}

/** Front matter `key: value` lines between the first two `---` lines; trailing `# comment` dropped. */
export function frontMatter(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  if (lines[0]?.trim() !== '---') return null;
  const out = {};
  for (let i = 1; i < lines.length && lines[i].trim() !== '---'; i++) {
    const k = lines[i].indexOf(':');
    if (k > 0) out[lines[i].slice(0, k).trim()] = lines[i].slice(k + 1).replace(/\s+#.*$/, '').trim();
  }
  return out;
}

function tasks() {
  return walk(join(ROOT, 'harness', 'tasks'))
    .filter((f) => f.endsWith('.md') && !f.endsWith('TEMPLATE.md'))
    .map((f) => ({ file: rel(f), fm: frontMatter(readFileSync(f, 'utf8')) }))
    .filter((t) => t.fm && t.fm.id)
    .map(({ file, fm }) => ({ id: fm.id, title: fm.title ?? '', status: fm.status ?? '', owner: fm.owner ?? '', created: fm.created ?? '', file }));
}

function briefs() {
  return walk(join(ROOT, 'harness', 'briefs'))
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const text = readFileSync(f, 'utf8');
      const field = (label) => new RegExp(`^\\s*-?\\s*\\*\\*${label}:\\*\\*\\s*(.+)$`, 'mi').exec(text)?.[1]?.trim() ?? '';
      return { file: rel(f), task: field('Task id'), owner: field('Owner').replace(/\(.*\)/, '').trim() };
    });
}

function claims() {
  const p = join(ROOT, 'harness', 'state', 'claims.json');
  if (!existsSync(p)) return [];
  const j = JSON.parse(readFileSync(p, 'utf8'));
  return (j.claims ?? []).map((c) => ({ task: c.task, owner: c.owner, globs: c.globs ?? [], status: c.status, date: c.date ?? '' }));
}

function commits() {
  let raw = '';
  try {
    raw = execFileSync('git', ['log', `-${COMMITS}`, '--name-only', '--format=%x1e%H%x1f%aI'], { cwd: ROOT, encoding: 'utf8' });
  } catch {
    return [];
  }
  return raw
    .split('\x1e')
    .filter((b) => b.trim())
    .map((b) => {
      const [head, ...files] = b.trim().split('\n');
      const [hash, date] = head.split('\x1f');
      return { hash: hash.slice(0, 7), t: Date.parse(date), files: files.map((f) => f.trim()).filter(Boolean) };
    })
    .reverse();
}

const doc = { kind: 'agent-room-replay', version: 1, generatedAt: new Date().toISOString(), commits: commits(), tasks: tasks(), briefs: briefs(), claims: claims() };
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(doc));
process.stdout.write(`replay: ${doc.commits.length} commits, ${doc.tasks.length} tasks, ${doc.briefs.length} briefs, ${doc.claims.length} claims -> ${rel(OUT)}\n`);
