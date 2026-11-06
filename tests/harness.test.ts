// Harness guards: mechanical rules from CLAUDE.md and docs/HARNESS.md. A failure means a rule broke: fix the code.
// Only the size ratchet (OVERSIZED below) may be edited by hand, and only to lower a number or remove an entry.
// Core/store layering is in layers.test.ts; tuning parity is in tuningParity.test.ts.
import { describe, expect, it } from 'vitest';
import claudeMd from '../CLAUDE.md?raw';
import harnessMd from '../docs/HARNESS.md?raw';

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

  // Every docs/**/*.md (ADRs and architecture included) and AGENTS.md, plus CLAUDE.md and HARNESS.md.
  const DOC_TEXTS = import.meta.glob(['../docs/**/*.md', '../AGENTS.md'], { query: '?raw', import: 'default', eager: true }) as Record<
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
