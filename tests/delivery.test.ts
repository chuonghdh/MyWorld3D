// Delivery guards (T-0009, ADR 0014): the delegated delivery pipeline must not drift.
// Contract: harness/briefs/T-0009-architect.md, items C1 to C6, C9 and C10. A failure means a rule broke: fix the
// guarded file, not the guard. A guarded file that is absent is a failure, never a skip: `.claude/` is tracked.
import { describe, expect, it } from 'vitest';

type Texts = Record<string, string>;
// Dot folders are globbed by explicit path (a `**` pattern skips them).
const AGENT_DEFS = import.meta.glob('../.claude/agents/*.md', { query: '?raw', import: 'default', eager: true }) as Texts;
const SKILLS = import.meta.glob('../.claude/skills/*/SKILL.md', { query: '?raw', import: 'default', eager: true }) as Texts;
const SETTINGS = import.meta.glob('../.claude/settings.json', { query: '?raw', import: 'default', eager: true }) as Texts;
const OWNERS_README = import.meta.glob('../docs/agents/README.md', { query: '?raw', import: 'default', eager: true }) as Texts;
const DELIVERY = import.meta.glob('../harness/workflows/delivery.md', { query: '?raw', import: 'default', eager: true }) as Texts;
const POLICIES = import.meta.glob('../harness/config/policies.json', { query: '?raw', import: 'default', eager: true }) as Texts;
const ADR_FILES = import.meta.glob('../docs/adr/*.md');
const BACKLOG = import.meta.glob('../harness/tasks/backlog/T-*.md', { query: '?raw', import: 'default', eager: true }) as Texts;
const WORKFLOWS = import.meta.glob('../.github/workflows/*.yml', { query: '?raw', import: 'default', eager: true }) as Texts;

// `.gitignore` has no extension, so `?raw` cannot import it. No @types/node here: reach fs through Node's loader.
type Fs = { existsSync(p: string): boolean; readFileSync(p: string, enc: 'utf8'): string };
const proc = (globalThis as { process?: { getBuiltinModule?(id: string): unknown; cwd(): string } }).process;
const fs = proc?.getBuiltinModule?.('node:fs') as Fs | undefined;
const root = proc?.cwd() ?? '.';

const DELIVERY_PATH = 'harness/workflows/delivery.md';
const lf = (text: string) => text.replace(/\r\n/g, '\n');

/** Front matter as key to value pairs, or null when the file does not open with a `---` block. */
function frontMatter(text: string): Record<string, string> | null {
  const lines = lf(text).split('\n');
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

/** Text after the front matter block. */
function bodyOf(text: string): string {
  const lines = lf(text).split('\n');
  return lines.slice(lines.indexOf('---', 1) + 1).join('\n');
}

/** Names of the `## ` headings, in file order. */
const headings = (text: string) => lf(text).split('\n').filter((l) => l.startsWith('## ')).map((l) => l.slice(3).trim());

/** Parsed JSON object, or null (with a problem recorded) when the file is absent or invalid. */
function readJson(texts: Texts, name: string, problems: string[]): Record<string, unknown> | null {
  const text = Object.values(texts)[0];
  if (text === undefined) {
    problems.push(`${name}: missing`);
    return null;
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch (e) {
    problems.push(`${name}: ${(e as Error).message}`);
    return null;
  }
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

describe('agent definitions and skills (C1, C2)', () => {
  it('every specialist in the ownership table, plus reviewer, has an agent definition bound to its handbook', () => {
    const readme = Object.values(OWNERS_README)[0] ?? '';
    const rows = lf(readme).split('\n').filter((l) => /^\|\s*\d+\s*\|/.test(l));
    const slugs = rows.flatMap((l) => [...l.matchAll(/\]\(([\w-]+)\.md\)/g)].map((m) => m[1]));
    expect(slugs.length).toBeGreaterThanOrEqual(8);
    const problems: string[] = [];
    for (const slug of [...slugs, 'reviewer']) {
      const text = AGENT_DEFS[`../.claude/agents/${slug}.md`];
      if (text === undefined) {
        problems.push(`.claude/agents/${slug}.md: missing`);
        continue;
      }
      const fm = frontMatter(text);
      if (!fm) {
        problems.push(`${slug}: no front matter`);
        continue;
      }
      if (fm.name !== slug) problems.push(`${slug}: name "${fm.name}" is not the slug`);
      if (!fm.description) problems.push(`${slug}: empty description`);
      const body = bodyOf(text);
      if (slug !== 'reviewer') {
        if (!body.includes(`docs/agents/${slug}.md`)) problems.push(`${slug}: body does not name docs/agents/${slug}.md`);
        // Specialists never land work: the lead does (delivery.md, Land).
        if (!/never commit or push/i.test(body)) problems.push(`${slug}: body does not say "Never commit or push"`);
        continue;
      }
      // The reviewer is read-only: an explicit tools line with no editing tool.
      const tools = (fm.tools ?? '').split(',').map((t) => t.trim()).filter(Boolean);
      if (tools.length === 0) problems.push('reviewer: no tools line');
      for (const t of tools) if (/(Edit|Write)$/.test(t)) problems.push(`reviewer: tools must not include ${t}`);
      if (!body.includes('harness/workflows/WORKFLOW.md')) problems.push('reviewer: body does not name harness/workflows/WORKFLOW.md');
    }
    expect(problems).toEqual([]);
  });

  it('the deliver and improve skills exist, have name and description, and point at the delivery workflow', () => {
    const problems: string[] = [];
    for (const skill of ['deliver', 'improve']) {
      const text = SKILLS[`../.claude/skills/${skill}/SKILL.md`];
      if (text === undefined) {
        problems.push(`.claude/skills/${skill}/SKILL.md: missing`);
        continue;
      }
      const fm = frontMatter(text);
      if (!fm?.name) problems.push(`${skill}: no name`);
      if (!fm?.description) problems.push(`${skill}: no description`);
      // Both skills commit, push and merge: only the human starts them (/deliver, /improve).
      if (fm?.['disable-model-invocation'] !== 'true') problems.push(`${skill}: needs disable-model-invocation: true`);
      if (!text.includes(DELIVERY_PATH)) problems.push(`${skill}: does not name ${DELIVERY_PATH}`);
    }
    expect(problems).toEqual([]);
  });
});

describe('delivery workflow and policy (C3, C4)', () => {
  const SECTIONS = ['Intake', 'Plan', 'Delegate', 'Verify', 'Review', 'Land', 'Escalate', 'Improve'];

  it('delivery.md has the eight sections, in order', () => {
    expect(Object.keys(DELIVERY), `${DELIVERY_PATH} missing`).toHaveLength(1);
    const found = headings(Object.values(DELIVERY)[0] ?? '');
    // A heading may carry a number or a suffix ("## 1. Intake", "## Land (pull request)").
    const index = (s: string) => found.findIndex((h) => new RegExp(`^(\\d+[.)]\\s*)?${s}\\b`).test(h));
    const missing = SECTIONS.filter((s) => index(s) < 0);
    expect(missing).toEqual([]);
    const order = SECTIONS.map(index);
    expect(order, 'sections out of order').toEqual([...order].sort((a, b) => a - b));
  });

  it('delivery.md Land checks the pull request base (baseRefName) before the merge', () => {
    const lines = lf(Object.values(DELIVERY)[0] ?? '').split('\n');
    const start = lines.findIndex((l) => /^## (\d+[.)]\s*)?Land\b/.test(l));
    const next = lines.findIndex((l, i) => i > start && l.startsWith('## '));
    const land = start < 0 ? '' : lines.slice(start, next < 0 ? undefined : next).join('\n');
    expect(land).toContain('baseRefName');
  });

  // agentMay is exact: a new agent permission needs a human decision and an edit here. humanOnly may grow.
  const AGENT_MAY = ['task_branch_create', 'task_branch_commit', 'task_branch_push', 'pr_to_dev_open', 'pr_to_dev_merge', 'task_branch_delete'];
  const HUMAN_ONLY = [
    'master_pr_or_merge',
    'direct_commit_to_dev_or_master',
    'force_push',
    'foreign_branch_delete',
    'dependency_change',
    'adr_change',
    'claude_config_change',
    'github_config_change',
    'guard_weakening',
  ];

  it('policies.json autonomy lists what agents may do, what stays human-only, land conditions and its ADR', () => {
    const problems: string[] = [];
    const autonomy = (readJson(POLICIES, 'harness/config/policies.json', problems)?.autonomy ?? null) as Record<string, unknown> | null;
    if (!autonomy) {
      expect([...problems, 'policies.json: no autonomy block']).toEqual([]);
      return;
    }
    const entries = (key: string) => (Array.isArray(autonomy[key]) ? (autonomy[key] as { id?: string; rule?: string }[]) : []);
    for (const key of ['agentMay', 'humanOnly']) {
      for (const e of entries(key)) if (!e.id || !e.rule) problems.push(`${key}: entry "${String(e.id)}" needs id and rule`);
    }
    const may = entries('agentMay').map((e) => e.id ?? '');
    const human = entries('humanOnly').map((e) => e.id ?? '');
    for (const id of AGENT_MAY) if (!may.includes(id)) problems.push(`agentMay: missing ${id}`);
    for (const id of may) if (!AGENT_MAY.includes(id)) problems.push(`agentMay: "${id}" is not in the contract`);
    for (const id of HUMAN_ONLY) if (!human.includes(id)) problems.push(`humanOnly: missing ${id}`);
    for (const id of may) if (human.includes(id)) problems.push(`"${id}" is in both lists`);
    const land = autonomy.landConditions;
    if (!Array.isArray(land) || land.length === 0 || strings(land).some((s) => s.trim() === '') || strings(land).length !== land.length) {
      problems.push('landConditions: must be a non-empty list of non-empty strings');
    }
    const adr = typeof autonomy.adr === 'string' ? autonomy.adr : '';
    if (!/^docs\/adr\/[\w-]+\.md$/.test(adr)) problems.push(`adr: "${adr}" is not a file under docs/adr/`);
    else if (!(`../${adr}` in ADR_FILES)) problems.push(`adr: ${adr} not found`);
    expect(problems).toEqual([]);
  });
});

describe('permissions (C5)', () => {
  // Each destructive command must be covered by a deny rule. Rule syntax may vary, so match on the command words.
  const DENY: [string, (rule: string) => boolean][] = [
    ['git push --force', (r) => r.includes('git push') && r.includes('--force')],
    ['git push -f', (r) => r.includes('git push') && /\s-f\b/.test(r)],
    ['git push to master', (r) => r.includes('git push') && /\bmaster\b/.test(r)],
    ['git push to dev', (r) => r.includes('git push') && /\bdev\b/.test(r)],
    // A refspec (src:dst) can land a task branch on dev or master. The trailing ":*" of the prefix syntax is not one.
    ['git push with a src:dst refspec', (r) => r.includes('git push') && r.replace(/:\*\)?$/, '').includes(':')],
    ['git reset --hard', (r) => r.includes('git reset --hard')],
    ['git stash', (r) => r.includes('git stash')],
    ['git checkout --', (r) => r.includes('git checkout --')],
    ['git branch -D', (r) => r.includes('git branch -D')],
  ];

  /** Why an allow rule would let a push to master or a force push through, or null when it does not. */
  function pushRisk(rule: string): string | null {
    const m = /^Bash(?:\((.*)\))?$/.exec(rule.trim());
    if (!m) return null;
    const cmd = (m[1] ?? '*').trim();
    const prefix = cmd.replace(/(:\*|\s*\*)$/, '').trim();
    // A wildcard rule whose prefix stops at or before "git push" allows every push.
    if (prefix !== cmd && 'git push'.startsWith(prefix)) return 'allows any git push';
    if (!cmd.includes('git push')) return null;
    if (/\bmaster\b/.test(cmd)) return 'names master';
    if (/--force|\s-f\b/.test(cmd)) return 'allows a force push';
    return cmd.includes('task/') ? null : 'git push is not limited to task/ branches';
  }

  it('settings.json keeps env and its hooks, runs the git guard, allows the pipeline and denies destructive git', () => {
    type Hooks = Record<string, { matcher?: string; hooks?: { command?: string }[] }[]>;
    const problems: string[] = [];
    const json = readJson(SETTINGS, '.claude/settings.json', problems);
    if (!json) {
      expect(problems).toEqual([]);
      return;
    }
    if (!json.env || Object.keys(json.env).length === 0) problems.push('env: missing');
    const post = ((json.hooks ?? {}) as Hooks).PostToolUse ?? [];
    for (const matcher of ['Edit|Write', 'Agent']) if (!post.some((h) => h.matcher === matcher)) problems.push(`PostToolUse ${matcher} hook missing`);
    // The permission lists match text; the guard script parses the command. Both layers are required.
    const pre = ((json.hooks ?? {}) as Hooks).PreToolUse ?? [];
    const guarded = pre.some((h) => (h.matcher ?? '').split('|').includes('Bash') && (h.hooks ?? []).some((x) => (x.command ?? '').includes('harness/scripts/guard-git.mjs')));
    if (!guarded) problems.push('PreToolUse Bash hook running harness/scripts/guard-git.mjs missing');
    const permissions = (json.permissions ?? {}) as { allow?: unknown; deny?: unknown };
    const allow = strings(permissions.allow);
    const deny = strings(permissions.deny);
    if (allow.length === 0) problems.push('permissions.allow: empty');
    for (const [name, covers] of DENY) if (!deny.some(covers)) problems.push(`permissions.deny: no rule for ${name}`);
    for (const rule of allow) {
      const risk = pushRisk(rule);
      if (risk) problems.push(`permissions.allow "${rule}": ${risk}`);
      // The default base of a pull request is master, which is human-only.
      if (rule.includes('gh pr create') && !rule.includes('--base dev')) problems.push(`permissions.allow "${rule}": gh pr create without --base dev`);
    }
    expect(problems).toEqual([]);
  });
});

describe('backlog records (C6)', () => {
  const TYPES = ['feature', 'bug', 'refactor', 'docs', 'config_toolchain'];

  // Zero records is valid: an empty backlog only means nothing is queued.
  it('every backlog record is proposed, has priority P1 to P3, a change type and the four sections', () => {
    const problems: string[] = [];
    for (const [key, text] of Object.entries(BACKLOG)) {
      const name = key.split('/').pop() ?? '';
      const fm = frontMatter(text);
      if (!fm) {
        problems.push(`${name}: no front matter`);
        continue;
      }
      if (fm.id !== name.replace(/\.md$/, '')) problems.push(`${name}: id "${fm.id}" does not match file name`);
      for (const k of ['title', 'owner', 'branch']) if (!fm[k]) problems.push(`${name}: missing ${k}`);
      if (fm.status !== 'proposed') problems.push(`${name}: status "${fm.status}" must be proposed`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fm.created ?? '')) problems.push(`${name}: created must be YYYY-MM-DD`);
      if (!/^P[123]$/.test(fm.priority ?? '')) problems.push(`${name}: priority "${fm.priority}" not P1, P2 or P3`);
      if (!TYPES.includes(fm.type ?? '')) problems.push(`${name}: type "${fm.type}" not a change type`);
      const have = headings(text);
      for (const s of ['Spec', 'Acceptance', 'Checkpoints', 'Handoff']) if (!have.some((h) => h.startsWith(s))) problems.push(`${name}: missing section ${s}`);
    }
    expect(problems).toEqual([]);
  });
});

/** True when `.gitignore` text ignores `path` (root file only; later rules win; an ignored folder hides its content). */
function gitIgnores(ignoreText: string, path: string): boolean {
  const rules = lf(ignoreText)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('#'))
    .map((line) => {
      const negated = line.startsWith('!');
      const pattern = negated ? line.slice(1) : line;
      const dirOnly = pattern.endsWith('/');
      const core = pattern.replace(/\/$/, '');
      const anchored = core.includes('/');
      const source = core
        .replace(/^\//, '')
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*/g, '<<any>>')
        .replace(/\*/g, '[^/]*')
        .replace(/\?/g, '[^/]')
        .replace(/<<any>>/g, '.*');
      return { negated, dirOnly, re: new RegExp(anchored ? `^${source}$` : `(^|/)${source}$`) };
    });
  const parts = path.split('/');
  for (let i = 1; i <= parts.length; i++) {
    const isDir = i < parts.length;
    const candidate = parts.slice(0, i).join('/');
    let ignored = false;
    for (const r of rules) if ((isDir || !r.dirOnly) && r.re.test(candidate)) ignored = !r.negated;
    if (ignored) return true;
  }
  return false;
}

describe('tracked config and failure feedback (C10, C9)', () => {
  it('the ignore matcher follows git rules', () => {
    expect(gitIgnores('.claude/\n!.claude/agents/', '.claude/agents/a.md')).toBe(true);
    expect(gitIgnores('.claude/*\n!.claude/agents/', '.claude/agents/a.md')).toBe(false);
    expect(gitIgnores('.claude/*\n!.claude/agents/', '.claude/launch.json')).toBe(true);
    expect(gitIgnores('*.log\ndist/', 'a/b/x.log')).toBe(true);
  });

  it('.gitignore tracks .claude agents, skills and settings.json, and ignores the rest of .claude/', () => {
    expect(fs, 'node:fs unavailable (Node >= 20.16 required)').toBeDefined();
    if (!fs) return;
    const file = `${root}/.gitignore`;
    expect(fs.existsSync(file), '.gitignore missing').toBe(true);
    const text = fs.readFileSync(file, 'utf8');
    const tracked = ['.claude/agents/architect.md', '.claude/skills/deliver/SKILL.md', '.claude/settings.json'];
    const local = ['.claude/settings.local.json', '.claude/launch.json', '.claude/scheduled_tasks.lock'];
    const problems = [
      ...tracked.filter((p) => gitIgnores(text, p)).map((p) => `${p}: ignored, must be tracked`),
      ...local.filter((p) => !gitIgnores(text, p)).map((p) => `${p}: not ignored`),
    ];
    expect(problems).toEqual([]);
  });

  it('drift.yml and evals.yml open a GitHub issue when the run fails', () => {
    const problems: string[] = [];
    for (const name of ['drift.yml', 'evals.yml']) {
      const text = WORKFLOWS[`../.github/workflows/${name}`];
      if (text === undefined) {
        problems.push(`${name}: missing`);
        continue;
      }
      if (!/^\s*issues:\s*write\s*$/m.test(lf(text))) problems.push(`${name}: no "issues: write" permission`);
      // One block per step: a step opens with "- key:" and runs to the next one.
      const steps = lf(text).split(/\n(?=\s*- [\w-]+:)/);
      const create = steps.filter((s) => /gh issue create|issues\.create\b|createIssue/.test(s));
      if (create.length === 0) problems.push(`${name}: no issue-create step`);
      for (const s of create) if (!/^\s*(- )?if:.*\bfailure\(\)/m.test(s)) problems.push(`${name}: the issue step has no "if:" with failure()`);
    }
    expect(problems).toEqual([]);
  });
});
