// Harness guards: mechanical rules from CLAUDE.md and harness/README.md. A failure means a rule broke: fix the code.
// Only the size ratchet (OVERSIZED below) may be edited by hand, and only to lower a number or remove an entry.
// Core/store layering is in layers.test.ts; tuning parity is in tuningParity.test.ts.
import { describe, expect, it } from 'vitest';
import claudeMd from '../CLAUDE.md?raw';
import harnessMd from '../harness/README.md?raw';

const SOURCES = import.meta.glob('../src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>;
// One glob per folder: an array of patterns with braces matches too little in this Vite version.
const REPO_FILES = {
  ...import.meta.glob('../docs/**/*'),
  ...import.meta.glob('../src/**/*'),
  ...import.meta.glob('../tests/**/*'),
  ...import.meta.glob('../dashboard/**/*'),
  ...import.meta.glob('../public/**/*'),
  ...import.meta.glob('../*.{md,json,html,ts}'),
};

// Keys are relative to this file: '../x' is repo-root x, './x' is tests/x.
const rel = (key: string) => (key.startsWith('./') ? 'tests/' + key.slice(2) : key.replace(/^\.\.\//, ''));
// The glob skips the importing file itself, so add it explicitly.
const FILE_SET = new Set([...Object.keys(REPO_FILES).map(rel), 'tests/harness.test.ts']);
const sourceEntries = Object.entries(SOURCES).map(([key, text]) => [rel(key), text] as const);

/** Code lines only: comment lines (// and block-comment bodies) are skipped. */
function codeLines(text: string): string[] {
  return text.split('\n').filter((line) => {
    const t = line.trim();
    return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'));
  });
}

/** Every import specifier in a file, type-only imports included. */
function allImports(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\bfrom\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/gm)) {
    out.push(m[1] ?? m[2] ?? m[3]);
  }
  return out;
}

/** Top-level src folder a relative import lands in, or null for packages and files outside src. */
function targetFolder(file: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const parts = file.split('/').slice(0, -1);
  for (const seg of spec.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  }
  return parts[0] === 'src' ? (parts[1] ?? null) : null;
}

describe('dependency direction', () => {
  // Feature modules must not reach up into the composition layer (scene) or the UI.
  // src/dev (tree lab) is outside the city and may import anything.
  const FEATURES = ['city', 'streets', 'buildings', 'traffic', 'life', 'environment', 'sky', 'weather', 'aircraft', 'audio', 'shaders', 'store', 'core'];
  const RULES: { from: string[]; forbid: string[] }[] = [
    { from: FEATURES, forbid: ['scene', 'ui'] },
    { from: ['core'], forbid: FEATURES.filter((f) => f !== 'core') },
    { from: ['store'], forbid: ['city', 'weather', 'scene', 'ui'] },
  ];

  it('feature, core and store modules do not import scene or ui (type imports included)', () => {
    const bad: string[] = [];
    for (const [file, text] of sourceEntries) {
      const folder = file.split('/')[1];
      if (!folder || folder === 'dev') continue;
      for (const rule of RULES) {
        if (!rule.from.includes(folder)) continue;
        for (const spec of allImports(text)) {
          const target = targetFolder(file, spec);
          if (target && rule.forbid.includes(target)) bad.push(`${file} -> ${spec}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('determinism', () => {
  // Layout must be a pure function of settings and layout.seed (architect handbook, performance standards).
  const LAYOUT_DIRS = ['core', 'store', 'city', 'streets', 'buildings', 'traffic', 'life', 'environment'];

  it('no Math.random in layout code', () => {
    const bad = sourceEntries
      .filter(([file]) => LAYOUT_DIRS.includes(file.split('/')[1] ?? ''))
      .filter(([, text]) => codeLines(text).some((line) => /Math\.random\s*\(/.test(line)))
      .map(([file]) => file);
    expect(bad).toEqual([]);
  });
});

describe('boundaries', () => {
  it('no network calls in src (no fetch, XHR or WebSocket)', () => {
    const bad = sourceEntries
      .filter(([, text]) => codeLines(text).some((line) => /\bfetch\s*\(|XMLHttpRequest|new WebSocket/.test(line)))
      .map(([file]) => file);
    expect(bad).toEqual([]);
  });

  // Per-viewer conveniences only (CLAUDE.md, docs/agents/architect.md). Add a file here only with a reason.
  const LOCAL_STORAGE_ALLOWED = ['src/ui/SoundMixer.tsx', 'src/ui/sectionState.ts'];
  it('localStorage only in allowed UI files', () => {
    const bad = sourceEntries
      .filter(([, text]) => codeLines(text).some((line) => /\blocalStorage\b/.test(line)))
      .map(([file]) => file)
      .filter((file) => !LOCAL_STORAGE_ALLOWED.includes(file));
    expect(bad).toEqual([]);
  });
});

describe('file size ratchet', () => {
  // Limit from docs/agents/architect.md. Existing oversized files are recorded with their current line count.
  // Rules: a file above the limit must be listed; a listed file may not grow; once it is at or under the limit
  // its entry must be deleted. Split files to shrink the number, never raise it.
  const LIMIT = 350;
  const OVERSIZED: Record<string, number> = {};

  it('no new file over the limit, no listed file grows, no stale entry', () => {
    const problems: string[] = [];
    const seen = new Set<string>();
    for (const [file, text] of sourceEntries) {
      const lines = text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
      const max = OVERSIZED[file];
      if (max === undefined) {
        if (lines > LIMIT) problems.push(`${file}: ${lines} lines, over ${LIMIT} and not listed`);
        continue;
      }
      seen.add(file);
      if (lines > max) problems.push(`${file}: ${lines} lines, grew past recorded ${max}`);
      if (lines <= LIMIT) problems.push(`${file}: now ${lines} lines, delete its OVERSIZED entry`);
    }
    for (const file of Object.keys(OVERSIZED)) {
      if (!seen.has(file)) problems.push(`${file}: listed but not found, delete its OVERSIZED entry`);
    }
    expect(problems).toEqual([]);
  });
});

describe('docs point at real files', () => {
  // Backticked repo paths in the harness map must exist. Directories are written with a trailing slash.
  const refs = (md: string) =>
    [...md.matchAll(/`([^`\s]+)`/g)]
      .map((m) => m[1].split(':')[0])
      .filter((p) => /^(docs|src|tests|public|dashboard)\//.test(p) || /^[\w-]+\.(md|json|html)$/.test(p))
      .filter((p) => !p.includes('*'));

  // A bare doc name (BRD.md) resolves from the repo root or from docs/.
  const exists = (p: string) => {
    if (p.endsWith('/')) return [...FILE_SET].some((f) => f.startsWith(p));
    const hit = (q: string) => FILE_SET.has(q) || [...FILE_SET].some((f) => f.startsWith(q + '/'));
    return hit(p) || (!p.includes('/') && hit('docs/' + p));
  };

  // Every docs/**/*.md (ADRs and architecture included), harness/**/*.md and AGENTS.md, plus CLAUDE.md and harness/README.md.
  const DOC_TEXTS = import.meta.glob(['../docs/**/*.md', '../AGENTS.md', '../harness/**/*.md'], { query: '?raw', import: 'default', eager: true }) as Record<
    string,
    string
  >;

  it('CLAUDE.md, AGENTS.md and every docs/**/*.md reference existing paths', () => {
    const texts = [claudeMd, harnessMd, ...Object.values(DOC_TEXTS)];
    const missing = [...new Set(texts.flatMap((t) => refs(t)))].filter((p) => !exists(p));
    expect(missing).toEqual([]);
  });
});

// Ownership and ADR guards (ADR 0001 ownership, ADR 0009 harness enforcement).
const OWNERS_DOCS = import.meta.glob(['../docs/agents/*.md', '../docs/REPO_MAP.md'], { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>;
const ADR_DOCS = import.meta.glob('../docs/adr/[0-9][0-9][0-9][0-9]-*.md', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>;

describe('ownership and ADR records', () => {
  const readme = OWNERS_DOCS['../docs/agents/README.md'] ?? '';
  const repoMap = OWNERS_DOCS['../docs/REPO_MAP.md'] ?? '';

  it('every src folder (except dev) appears in the ownership table or REPO_MAP', () => {
    const folders = [...new Set([...FILE_SET].filter((f) => f.startsWith('src/') && f.split('/').length > 2).map((f) => f.split('/')[1]))].filter(
      (f) => f !== 'dev',
    );
    const tableRows = `${readme}\n${repoMap}`.split('\n').filter((l) => l.startsWith('|')).join('\n');
    const missing = folders.filter((f) => !tableRows.includes(`src/${f}`));
    expect(missing).toEqual([]);
  });

  it('every handbook linked from the ownership table exists in docs/agents/', () => {
    const have = new Set(Object.keys(OWNERS_DOCS).map((k) => k.split('/').pop()));
    const missing = [...readme.matchAll(/\]\(([\w-]+\.md)\)/g)].map((m) => m[1]).filter((l) => !have.has(l));
    expect(missing).toEqual([]);
  });

  it('every REPO_MAP owner names a specialist from the ownership table', () => {
    const specialists = [...readme.matchAll(/^\|\s*\d+\s*\|\s*([^|]+?)\s*\|/gm)].map((m) => m[1]);
    const rows = repoMap.split('\n').filter((l) => l.startsWith('| `'));
    const missing = rows.filter((l) => !specialists.some((n) => (l.split('|')[4] ?? '').includes(n))).map((l) => l.split('|')[1]);
    expect(missing).toEqual([]);
  });

  it('every ADR has Status, Context, Decision and Consequences', () => {
    const problems = Object.entries(ADR_DOCS).flatMap(([k, t]) => {
      const need = ['Context', 'Decision', 'Consequences'].filter((h) => !t.split('\n').some((l) => l.trim() === '## ' + h));
      if (!/^(##\s+Status\b|Status:)/m.test(t)) need.push('Status');
      return need.map((h) => `${k}: missing ${h}`);
    });
    expect(problems).toEqual([]);
  });
});

// Workflow guards: task records, handoff template and the state list (harness/workflows/WORKFLOW.md).
const TASK_DOCS = import.meta.glob(['../harness/tasks/active/T-*.md', '../harness/tasks/completed/T-*.md'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const HANDOFF_TEMPLATE = import.meta.glob('../harness/state/handoffs/TEMPLATE.md', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>;
const WORKFLOW_DOCS = import.meta.glob('../harness/workflows/WORKFLOW.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const TASK_STATES = ['proposed', 'assigned', 'in_progress', 'verifying', 'done', 'blocked', 'cancelled'];

/** Front matter as key to value pairs, or null when the file does not open with a `---` block. */
function frontMatter(text: string): Record<string, string> | null {
  const lines = text.split('\n');
  if (lines[0].trim() !== '---') return null;
  const end = lines.indexOf('---', 1);
  if (end < 0) return null;
  const out: Record<string, string> = {};
  for (const line of lines.slice(1, end)) {
    const i = line.indexOf(':');
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

/** Text of one `## heading` section (up to the next `## ` heading). */
function sectionOf(text: string, heading: string): string | null {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.startsWith('## ' + heading));
  if (start < 0) return null;
  const next = lines.findIndex((l, i) => i > start && l.startsWith('## '));
  return lines.slice(start + 1, next < 0 ? undefined : next).join('\n');
}

describe('workflow records', () => {
  it('every task record has front matter (id, title, status, owner, branch, created) and the four sections', () => {
    expect(Object.keys(TASK_DOCS).length).toBeGreaterThan(0);
    const problems: string[] = [];
    for (const [key, text] of Object.entries(TASK_DOCS)) {
      const name = key.split('/').pop() ?? '';
      const fm = frontMatter(text);
      if (!fm) {
        problems.push(`${name}: no front matter`);
        continue;
      }
      if (fm.id !== name.replace(/\.md$/, '')) problems.push(`${name}: id "${fm.id}" does not match file name`);
      for (const k of ['title', 'owner', 'branch']) if (!fm[k]) problems.push(`${name}: missing ${k}`);
      if (!TASK_STATES.includes(fm.status ?? '')) problems.push(`${name}: status "${fm.status}" not one of the seven states`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fm.created ?? '')) problems.push(`${name}: created must be YYYY-MM-DD`);
      for (const s of ['Spec', 'Acceptance', 'Checkpoints', 'Handoff']) if (sectionOf(text, s) === null) problems.push(`${name}: missing section ${s}`);
    }
    expect(problems).toEqual([]);
  });

  it('a task with status done has no unchecked acceptance item', () => {
    const problems: string[] = [];
    for (const [key, text] of Object.entries(TASK_DOCS)) {
      const fm = frontMatter(text);
      if (fm?.status !== 'done') continue;
      const open = (sectionOf(text, 'Acceptance') ?? '').split('\n').filter((l) => l.trim().startsWith('- [ ]'));
      for (const l of open) problems.push(`${key.split('/').pop()}: ${l.trim()}`);
    }
    expect(problems).toEqual([]);
  });

  it('the handoff template has the sections Next step, Open questions, Verified and Not verified', () => {
    const text = Object.values(HANDOFF_TEMPLATE)[0] ?? '';
    const missing = ['Next step', 'Open questions', 'Verified', 'Not verified'].filter((h) => sectionOf(text, h) === null);
    expect(Object.keys(HANDOFF_TEMPLATE)).toHaveLength(1);
    expect(missing).toEqual([]);
  });

  it('WORKFLOW.md names all seven task states', () => {
    const tokens = new Set((Object.values(WORKFLOW_DOCS)[0] ?? '').toLowerCase().split(/[^a-z_]+/));
    const missing = TASK_STATES.filter((s) => !tokens.has(s));
    expect(Object.keys(WORKFLOW_DOCS)).toHaveLength(1);
    expect(missing).toEqual([]);
  });
});

// Harness structure and config guards (harness/README.md). Scripts named in harness/, docs/ or CLAUDE.md must exist.
const HARNESS_FILES = import.meta.glob(['../harness/**/*', '../harness/**/.gitkeep'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const DOCS_ALL = import.meta.glob('../docs/**/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

describe('harness structure', () => {
  const REQUIRED_DIRS = [
    'tasks/backlog',
    'tasks/active',
    'tasks/completed',
    'state/handoffs',
    'workflows',
    'config',
    'scripts',
    'runs',
    'evals/regression',
    'evals/test-cases',
  ];

  it('harness/ has every required folder with at least one file', () => {
    const keys = Object.keys(HARNESS_FILES);
    const missing = REQUIRED_DIRS.filter((d) => !keys.some((k) => k.startsWith(`../harness/${d}/`)));
    expect(missing).toEqual([]);
  });

  it('config/policies.json and config/quality-gates.json parse as JSON', () => {
    const problems = ['policies.json', 'quality-gates.json'].flatMap((f) => {
      const text = HARNESS_FILES[`../harness/config/${f}`];
      if (text === undefined) return [`${f}: missing`];
      try {
        JSON.parse(text);
        return [];
      } catch (e) {
        return [`${f}: ${(e as Error).message}`];
      }
    });
    expect(problems).toEqual([]);
  });

  it('every script named in harness/, docs/ or CLAUDE.md exists in harness/scripts/', () => {
    const scripts = new Set(
      Object.keys(HARNESS_FILES)
        .filter((k) => k.startsWith('../harness/scripts/'))
        .map((k) => k.split('/').pop()),
    );
    const named = new Set<string>();
    for (const t of [...Object.values(HARNESS_FILES), ...Object.values(DOCS_ALL), claudeMd]) {
      for (const m of t.matchAll(/harness\/scripts\/([\w.-]+\.mjs)/g)) named.add(m[1]);
    }
    const missing = [...named].filter((n) => !scripts.has(n));
    expect(missing).toEqual([]);
  });
});
