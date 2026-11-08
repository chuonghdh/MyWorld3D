// Harness guards: mechanical rules from CLAUDE.md and harness/README.md. A failure means a rule broke: fix the code.
// Only the size ratchet (OVERSIZED below) may be edited by hand, and only to lower a number or remove an entry.
// Core/store layering is in layers.test.ts; tuning parity is in tuningParity.test.ts.
import { describe, expect, it } from 'vitest';
import claudeMd from '../CLAUDE.md?raw';
import harnessMd from '../harness/README.md?raw';
import { globToRegExp } from '../harness/scripts/check-claims.mjs';

const SOURCES = import.meta.glob('../src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>;
// One glob per folder: an array of patterns with braces matches too little in this Vite version.
const REPO_FILES = {
  ...import.meta.glob('../docs/**/*'),
  ...import.meta.glob('../src/**/*'),
  ...import.meta.glob('../tests/**/*'),
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
  const LAYOUT_DIRS = ['core', 'store', 'city', 'streets', 'buildings', 'traffic', 'life', 'environment', 'agentRoom'];

  it('no Math.random in layout code', () => {
    const bad = sourceEntries
      .filter(([file]) => LAYOUT_DIRS.includes(file.split('/')[1] ?? ''))
      .filter(([, text]) => codeLines(text).some((line) => /Math\.random\s*\(/.test(line)))
      .map(([file]) => file);
    expect(bad).toEqual([]);
  });
});

describe('boundaries', () => {
  it('no network calls in src (no fetch, XHR, WebSocket or EventSource)', () => {
    // Reasoned exception (ADR 0013): the agent room reads its local bridge (127.0.0.1) via one EventSource plus a
    // replay snapshot GET. Only src/agentRoom/bridgeClient/ may use EventSource and fetch. XHR and WebSocket stay banned there.
    const BRIDGE_CLIENT = 'src/agentRoom/bridgeClient/';
    const bad = sourceEntries
      .filter(([file, text]) => {
        const pattern = file.startsWith(BRIDGE_CLIENT)
          ? /XMLHttpRequest|new WebSocket/
          : /\bfetch\s*\(|XMLHttpRequest|new WebSocket|\bEventSource\b/;
        return codeLines(text).some((line) => pattern.test(line));
      })
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
      .filter((p) => /^(docs|src|tests|public)\//.test(p) || /^[\w-]+\.(md|json|html)$/.test(p))
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
  // Windows checkouts may store CRLF; parse both.
  const lines = text.replace(/\r\n/g, '\n').split('\n');
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
    // Reasoned exception: the Agent Office board scripts were removed on 2026-11-07. Old briefs and claims keep their
    // history and still name them. They must stay absent, which the next test checks.
    const RETIRED_SCRIPTS = ['board-set.mjs', 'board-export.mjs', 'board.mjs', 'board-hook.mjs'];
    const missing = [...named].filter((n) => !scripts.has(n) && !RETIRED_SCRIPTS.includes(n));
    expect(missing).toEqual([]);
    expect(RETIRED_SCRIPTS.filter((n) => scripts.has(n))).toEqual([]);
  });
});

// Orchestration guards (Level 4): claims, brief template and independent review of done tasks.
const CLAIMS = import.meta.glob('../harness/state/claims.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const BRIEF = import.meta.glob('../harness/templates/brief.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const COMPLETED_TASKS = import.meta.glob('../harness/tasks/completed/T-*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

/** Static part of a glob: the text before the first wildcard or brace. */
function staticPrefix(glob: string): string {
  return glob.split(/[*?{[]/)[0];
}

describe('orchestration', () => {
  it('harness/state/claims.json parses and each entry has task, owner, globs, status and date', () => {
    const text = Object.values(CLAIMS)[0];
    if (text === undefined) {
      expect(text).toBeDefined();
      return;
    }
    const json = JSON.parse(text) as unknown;
    const list = Array.isArray(json) ? json : ((json as { claims?: unknown }).claims ?? null);
    expect(Array.isArray(list)).toBe(true);
    const problems: string[] = [];
    for (const [i, e] of ((list as Record<string, unknown>[]) ?? []).entries()) {
      for (const k of ['task', 'owner', 'status', 'date']) if (typeof e[k] !== 'string' || e[k] === '') problems.push(`entry ${i}: missing ${k}`);
      if (!Array.isArray(e.globs)) problems.push(`entry ${i}: globs must be an array`);
      if (e.status !== 'active' && e.status !== 'released') problems.push(`entry ${i}: status "${String(e.status)}" not active or released`);
    }
    expect(problems).toEqual([]);
  });

  it('no two active claims have overlapping glob prefixes', () => {
    const json = JSON.parse(Object.values(CLAIMS)[0] ?? '[]') as unknown;
    const list = (Array.isArray(json) ? json : ((json as { claims?: unknown }).claims ?? [])) as { task: string; status: string; globs: string[] }[];
    const active = list.filter((e) => e.status === 'active');
    const pairs: string[] = [];
    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        for (const ga of active[i].globs) {
          for (const gb of active[j].globs) {
            const a = staticPrefix(ga);
            const b = staticPrefix(gb);
            if (a.startsWith(b) || b.startsWith(a)) pairs.push(`${active[i].task} ${ga} <> ${active[j].task} ${gb}`);
          }
        }
      }
    }
    expect(pairs).toEqual([]);
  });

  it('harness/templates/brief.md has the fields task, owner, files in scope, files out of scope, claims, acceptance and report format', () => {
    const text = (Object.values(BRIEF)[0] ?? '').toLowerCase();
    expect(Object.keys(BRIEF)).toHaveLength(1);
    const missing = ['task', 'owner', 'files in scope', 'files out of scope', 'claims', 'acceptance', 'report format'].filter((f) => !text.includes(f));
    expect(missing).toEqual([]);
  });

  it('every completed task has a Review section naming reviewer, diff range and result', () => {
    const problems: string[] = [];
    for (const [key, text] of Object.entries(COMPLETED_TASKS)) {
      const name = key.split('/').pop();
      if (frontMatter(text)?.status !== 'done') continue;
      const review = sectionOf(text, 'Review');
      if (review === null) {
        problems.push(`${name}: no Review section`);
        continue;
      }
      const low = review.toLowerCase();
      for (const f of ['reviewer', 'diff range', 'result']) if (!low.includes(f)) problems.push(`${name}: Review lacks ${f}`);
    }
    expect(problems).toEqual([]);
  });
});

// Review records (T-0003): reviewer is independent of the owner, result is one of three values.
// A done task whose Result is "changes requested" fails: WORKFLOW sends it back to in_progress.
const CHECK_CLAIMS = import.meta.glob('../harness/scripts/check-claims.mjs', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const CLAIMS_JSON = import.meta.glob('../harness/state/claims.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const REVIEW_RESULTS = ['pass', 'changes requested', 'not reviewed'];

/** Value of a `Label: value` line inside a section; accepts a list dash and a bold label (`**Label:**`). */
function fieldIn(section: string, label: string): string | null {
  for (const raw of section.split('\n')) {
    const line = raw.replace(/\r$/, '').replace(/^\s*-\s*/, '').replace(/\*\*/g, '');
    if (line.toLowerCase().startsWith(label.toLowerCase() + ':')) return line.slice(label.length + 1).trim();
  }
  return null;
}

describe('review records', () => {
  it('each completed task Review names an independent reviewer and an allowed result', () => {
    const problems: string[] = [];
    for (const [key, text] of Object.entries(COMPLETED_TASKS)) {
      const name = key.split('/').pop();
      const review = sectionOf(text, 'Review');
      if (review === null) continue;
      const owner = (frontMatter(text)?.owner ?? '').replace(/\(.*\)/, '').trim().toLowerCase();
      const reviewerRaw = fieldIn(review, 'Reviewer');
      if (reviewerRaw === null || reviewerRaw === '') {
        problems.push(`${name}: no Reviewer value`);
        continue;
      }
      const reviewer = reviewerRaw.replace(/\(.*\)/, '').trim().toLowerCase();
      const result = (fieldIn(review, 'Result') ?? '').toLowerCase();
      if (reviewer === '') problems.push(`${name}: empty reviewer`);
      if (reviewer !== '' && reviewer === owner) problems.push(`${name}: reviewer equals owner`);
      if ((reviewer === 'lead' || reviewer === 'none') && !result.includes('not reviewed')) problems.push(`${name}: reviewer "${reviewer}" needs result "not reviewed"`);
      if (!REVIEW_RESULTS.some((r) => result.startsWith(r))) problems.push(`${name}: result "${result}" not one of pass, changes requested, not reviewed`);
      if (result.startsWith('changes requested')) problems.push(`${name}: done with changes requested; send back to in_progress`);
    }
    expect(problems).toEqual([]);
  });

  it('harness/scripts/check-claims.mjs exists and harness/state/claims.json parses as JSON', () => {
    expect(Object.keys(CHECK_CLAIMS)).toHaveLength(1);
    const text = Object.values(CLAIMS_JSON)[0];
    expect(text).toBeDefined();
    expect(() => JSON.parse(text ?? '')).not.toThrow();
  });

  it('globToRegExp: ** crosses directories, * stays in one segment', () => {
    expect(globToRegExp('harness/tasks/**').test('harness/tasks/active/x.md')).toBe(true);
    expect(globToRegExp('src/**/*.ts').test('src/a/b/c.ts')).toBe(true);
    expect(globToRegExp('harness/*.md').test('harness/a.md')).toBe(true);
    expect(globToRegExp('harness/*.md').test('harness/x/a.md')).toBe(false);
  });
});

// Enforcement guards: claim briefs and the edit hook in settings.json.
const BRIEF_FILES = import.meta.glob('../harness/briefs/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const SETTINGS = import.meta.glob('../.claude/settings.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const BRIEF_FIELDS = ['Task id', 'Owner', 'Goal', 'Files in scope', 'Files out of scope', 'Reviewer', 'Claims', 'Acceptance commands', 'Report format'];

describe('enforcement', () => {
  it('every claim has a brief under harness/briefs/ with the required fields and a matching Owner', () => {
    const json = JSON.parse(Object.values(CLAIMS)[0] ?? '{"claims":[]}') as { claims?: { task: string; owner: string; brief?: string }[] };
    const problems: string[] = [];
    for (const c of json.claims ?? []) {
      const who = c.task;
      if (!c.brief) {
        problems.push(`${who}: no brief path`);
        continue;
      }
      const text = BRIEF_FILES[`../${c.brief}`];
      if (text === undefined) {
        problems.push(`${who}: brief ${c.brief} not found`);
        continue;
      }
      for (const f of BRIEF_FIELDS) {
        if (fieldIn(text, f) === null) problems.push(`${who}: brief lacks ${f}`);
      }
      const owner = (fieldIn(text, 'Owner') ?? '').replace(/\(.*\)/, '').trim().toLowerCase();
      if (owner !== c.owner.toLowerCase()) problems.push(`${who}: brief Owner "${owner}" does not match claim owner "${c.owner}"`);
    }
    expect(problems).toEqual([]);
  });

  // .claude/ is gitignored, so CI has no settings.json: skip there, as the guard did before.
  it.skipIf(Object.keys(SETTINGS).length === 0)('settings.json keeps the PostToolUse Edit|Write hook', () => {
    type Hooks = Record<string, { matcher?: string; hooks?: { command?: string }[] }[]>;
    const shared = (JSON.parse(Object.values(SETTINGS)[0] ?? '{}') as { hooks?: Hooks }).hooks ?? {};
    const problems: string[] = [];
    if (!(shared.PostToolUse ?? []).some((h) => h.matcher === 'Edit|Write')) problems.push('settings.json: PostToolUse Edit|Write hook missing');
    expect(problems).toEqual([]);
  });
});

// Continuous evaluation (T-0005): the regression case list must point at real test files.
const EVAL_CASES = import.meta.glob('../harness/evals/regression/cases.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const TEST_TEXTS = import.meta.glob('../tests/*.test.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

describe('eval cases', () => {
  it('cases.json parses; every case has id, title, file and covers; ids are unique; each file exists under tests/ and has a test', () => {
    const json = JSON.parse(Object.values(EVAL_CASES)[0] ?? '{"cases":[]}') as { cases?: { id?: string; title?: string; file?: string; covers?: string }[] };
    const cases = json.cases ?? [];
    const problems: string[] = [];
    const ids = cases.map((c) => c.id);
    for (const id of ids.filter((x, i) => ids.indexOf(x) !== i)) problems.push(`duplicate id ${String(id)}`);
    for (const c of cases) {
      for (const k of ['id', 'title', 'file', 'covers'] as const) if (!c[k]) problems.push(`${String(c.id)}: missing ${k}`);
      const rel = `./${(c.file ?? '').slice(6)}`;
      if (!c.file?.startsWith('tests/')) {
        problems.push(`${String(c.id)}: file must be under tests/`);
        continue;
      }
      // The glob skips this file itself; it always contains describe blocks.
      const text = c.file === 'tests/harness.test.ts' ? 'describe(' : TEST_TEXTS[rel];
      if (text === undefined) problems.push(`${String(c.id)}: ${c.file} not found`);
      else if (!/\b(describe|it|test)\s*\(/.test(text)) problems.push(`${String(c.id)}: ${c.file} has no test`);
    }
    expect(problems).toEqual([]);
  });
});

// PR, drift and CI guards (T-0006): PR template checklist, drift-check script, workflow shape, code owners.
const PR_TEMPLATE = import.meta.glob('../.github/pull_request_template.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const DRIFT_SCRIPT = import.meta.glob('../harness/scripts/drift-check.mjs', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const WORKFLOWS = import.meta.glob('../.github/workflows/*.yml', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const CODEOWNERS = import.meta.glob(['../.github/CODEOWNERS', '../CODEOWNERS'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const PR_ITEMS = ['acceptance', 'claims', 'brief', 'reviewer', 'not verified'];
/** Drift surfaces the drift check must name (T-0006 brief: four drift checks). */
const DRIFT_CHECK_NAMES = ['claims-on-done', 'stale-active-tasks', 'dead-doc-links'];

describe('pull request, drift and CI', () => {
  it('the PR template exists and has a "- [ ]" item for acceptance, claims, brief, reviewer and not verified', () => {
    expect(Object.keys(PR_TEMPLATE)).toHaveLength(1);
    const items = (Object.values(PR_TEMPLATE)[0] ?? '').split('\n').filter((l) => l.trim().startsWith('- [ ]')).map((l) => l.toLowerCase());
    const missing = PR_ITEMS.filter((k) => !items.some((l) => l.includes(k)));
    expect(missing).toEqual([]);
  });

  it('harness/scripts/drift-check.mjs exists and names the four drift checks', () => {
    expect(Object.keys(DRIFT_SCRIPT)).toHaveLength(1);
    const text = (Object.values(DRIFT_SCRIPT)[0] ?? '').toLowerCase();
    const missing = DRIFT_CHECK_NAMES.filter((n) => !text.includes(n));
    expect(missing).toEqual([]);
  });

  it('every workflow parses as YAML-shaped text: no tab indents, top-level name, on and jobs keys', () => {
    expect(Object.keys(WORKFLOWS).length).toBeGreaterThan(0);
    const problems: string[] = [];
    for (const [key, text] of Object.entries(WORKFLOWS)) {
      const name = key.split('/').pop();
      if (text.split('\n').some((l) => /^\t/.test(l))) problems.push(`${name}: tab indent`);
      const topKeys = text.split('\n').filter((l) => /^[A-Za-z"'_]/.test(l)).map((l) => l.split(':')[0].replace(/["']/g, '').trim());
      for (const k of ['name', 'on', 'jobs']) if (!topKeys.includes(k)) problems.push(`${name}: missing top-level ${k}`);
    }
    expect(problems).toEqual([]);
  });

  it('CODEOWNERS exists and lists harness/ and .github/', () => {
    expect(Object.keys(CODEOWNERS)).toHaveLength(1);
    const text = Object.values(CODEOWNERS)[0] ?? '';
    expect(text).toContain('harness/');
    expect(text).toContain('.github/');
  });
});
