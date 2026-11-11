// Mechanical guard for the delivery rules (docs/adr/0014-delegated-delivery.md). A PreToolUse hook for the Bash tool.
// Reads the hook JSON on stdin. Exit 2 with a one-line reason on stderr blocks the command; silent exit 0 otherwise.
// Blocks: git commit, merge, rebase and the like on dev, master or an unknown branch; any git push that is not
// "origin task/<name>" without force; moving dev or master by branch -f or update-ref; gh pr create without
// --base dev; gh pr edit --base away from dev; gh pr merge with --admin or on a pull request whose base is not dev;
// every gh api write; git switch that discards work.
// It is a net against mistakes, so it prefers a false block to a miss: git or gh anywhere in a command counts.
// Fails open on an unreadable payload: the permission deny list (.claude/settings.json) is the second layer.
// The hook command imports this file by absolute URL (CLAUDE_PROJECT_DIR, else the git top level) and calls main();
// it exits 2 when the file cannot be loaded, so a moved working directory does not switch the guard off.
//
// Known limits (not blocked; the list is closed, see harness/README.md "Known gaps"):
//   - commands hidden from the parser: bash -c "...", eval, aliases, scripts, a variable as the program name
//     ($G push), command substitutions inside an unquoted heredoc body;
//   - a git or gh word that is an argument of another program, when the real call comes later in the same simple
//     command (sudo -u git git ...): only the first git or gh word is read;
//   - git global options that take a value and are not in the list below (the value is read as the subcommand);
//   - other worktrees: the branch is read in the project directory, not where git -C or a cd points;
//   - local-only ref moves: git fetch . a:dev, git checkout -B dev, git reset on dev.
// The real hold on master is GitHub branch protection, which the human must switch on. This script is a net against
// mistakes, not a security boundary.
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const PROTECTED = ['dev', 'master', 'main'];
const TASK_BRANCH = /^task\/[A-Za-z0-9._-]+$/;
const OPERATORS = ['&&', '||', ';', '|', '&'];

/**
 * Splits a shell line into simple commands (arrays of words). Quotes are honoured; operators, parentheses, backticks
 * and $( ) end a command, also inside double quotes. Redirections and heredoc bodies are dropped.
 */
export function splitCommands(input) {
  // A backslash-newline joins two lines before anything else is read.
  const line = input.replace(/\\\r?\n/g, '');
  const commands = [];
  const stack = [{ type: 'cmd', depth: 0, close: '' }];
  const heredocs = [];
  let words = [];
  let word = '';
  let has = false;
  let skipWord = false;
  const endWord = () => {
    if (has && !skipWord) words.push(word);
    if (has) skipWord = false;
    word = '';
    has = false;
  };
  const endCommand = () => {
    endWord();
    skipWord = false;
    if (words.length) commands.push(words);
    words = [];
  };
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    const next = line[i + 1];
    const top = stack[stack.length - 1];
    if (top.type === 'sq') {
      if (c === "'") stack.pop();
      else word += c;
      continue;
    }
    if (top.type === 'dq') {
      if (c === '"') stack.pop();
      else if (c === '\\' && next !== undefined) word += line[++i];
      else if (c === '$' && next === '(') {
        endCommand();
        stack.push({ type: 'cmd', depth: 0, close: ')' });
        i++;
      } else if (c === '`') {
        endCommand();
        stack.push({ type: 'cmd', depth: 0, close: '`' });
      } else word += c;
      continue;
    }
    if (c === '`') {
      endCommand();
      if (top.close === '`') stack.pop();
    } else if (c === '(') {
      endCommand();
      top.depth++;
    } else if (c === ')') {
      endCommand();
      if (top.depth > 0) top.depth--;
      else if (top.close === ')') stack.pop();
    } else if (c === "'" || c === '"') {
      stack.push({ type: c === '"' ? 'dq' : 'sq' });
      has = true;
    } else if (c === '\\' && next !== undefined) {
      word += line[++i];
      has = true;
    } else if (c === '\n') {
      endCommand();
      // Heredoc bodies are data, not commands: skip to each delimiter line.
      while (heredocs.length) {
        const delim = heredocs.shift();
        // No end line (not a heredoc after all, such as 1<<2 in arithmetic): skip nothing, read the rest as commands.
        let end = i;
        let found = false;
        while (!found && end + 1 < line.length) {
          const start = end + 1;
          const nl = line.indexOf('\n', start);
          end = nl < 0 ? line.length : nl;
          found = line.slice(start, end).trim() === delim;
        }
        if (found) i = end;
      }
    } else if (c === ' ' || c === '\t' || c === '\r') {
      endWord();
    } else if (c === '#' && !has) {
      const nl = line.indexOf('\n', i);
      i = (nl < 0 ? line.length : nl) - 1;
    } else if (c === '<' && next === '<' && line[i + 2] !== '<') {
      endWord();
      i += 2;
      if (line[i] === '-') i++;
      while (line[i] === ' ' || line[i] === '\t') i++;
      let delim = '';
      if (line[i] === '"' || line[i] === "'") {
        const close = line.indexOf(line[i], i + 1);
        const stop = close < 0 ? line.length : close;
        delim = line.slice(i + 1, stop);
        i = stop;
      } else {
        while (i < line.length && !/[\s;&|()<>]/.test(line[i])) delim += line[i++];
        delim = delim.replace(/['"\\]/g, '');
        i--;
      }
      if (delim) heredocs.push(delim.trim());
    } else if (c === '<' && next === '(') {
      // Process substitution: the parenthesis starts a command of its own.
    } else if (c === '>' || c === '<' || (c === '&' && next === '>')) {
      // Redirection: drop the file descriptor in front of it and the target after it.
      if (/^\d*$/.test(word)) {
        word = '';
        has = false;
      } else endWord();
      if (c === '&') i++;
      while (line[i + 1] === '>' || line[i + 1] === '<' || line[i + 1] === '|') i++;
      if (line[i + 1] === '&') {
        i++;
        while (/[\d-]/.test(line[i + 1] ?? '')) i++;
      } else skipWord = true;
    } else {
      const op = OPERATORS.find((o) => line.startsWith(o, i));
      if (op) {
        endCommand();
        i += op.length - 1;
      } else {
        word += c;
        has = true;
      }
    }
  }
  endCommand();
  return commands;
}

/** Program name of a word: last path segment, lower case, without .exe. */
const programOf = (w) => w.replace(/\\/g, '/').split('/').pop().replace(/\.exe$/i, '').toLowerCase();

/** The first git or gh invocation anywhere in a command (so `env X=1 git`, `time git`, `then git` count), or null. */
function invocation(words) {
  const at = words.findIndex((w) => ['git', 'gh'].includes(programOf(w)));
  if (at < 0) return null;
  const program = programOf(words[at]);
  const withValue = program === 'git' ? ['-C', '-c', '--git-dir', '--work-tree', '--namespace'] : ['-R', '--repo'];
  let i = at + 1;
  while (i < words.length && words[i].startsWith('-')) i += withValue.includes(words[i]) ? 2 : 1;
  return { program, args: words.slice(i) };
}

/** True when a short option cluster (-fc) contains one of the letters. */
const hasShort = (arg, letters) => /^-[A-Za-z]+$/.test(arg) && [...letters].some((l) => arg.includes(l));
const unknown = (branch) => !branch || branch === 'HEAD';
const unsafe = (branch) => unknown(branch) || PROTECTED.includes(branch);
const named = (branch) => (unknown(branch) ? 'an unknown or detached branch' : branch);

function checkPush(args) {
  const flags = args.filter((a) => a.startsWith('-'));
  const rest = args.filter((a) => !a.startsWith('-'));
  for (const f of flags) {
    if (f === '-u' || f === '--set-upstream') continue;
    if (f.startsWith('--force') || hasShort(f, 'f')) return `git push ${f}: force push is human-only`;
    return `git push ${f}: only -u is allowed on a task branch push`;
  }
  if (rest.length !== 2) return 'git push needs an explicit remote and branch: git push -u origin task/T-NNNN-slug';
  const [remote, ref] = rest;
  if (remote !== 'origin') return `git push to remote "${remote}": only origin is allowed`;
  if (ref.includes(':')) return `git push ${ref}: refspecs (src:dst) are not allowed, push the task branch by name`;
  if (!TASK_BRANCH.test(ref) || ref.includes('..')) return `git push ${ref}: only task/<name> branches may be pushed (dev and master are human-only)`;
  return null;
}

function checkPrCreate(args) {
  const bases = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--base' || args[i] === '-B') bases.push(args[i + 1] ?? '');
    else if (args[i].startsWith('--base=')) bases.push(args[i].slice(7));
  }
  if (bases.length === 0) return 'gh pr create needs --base dev (the default base is master, which is human-only)';
  const bad = bases.find((b) => b !== 'dev');
  if (bad !== undefined) return `gh pr create --base ${bad}: only dev is allowed (master is human-only)`;
  return null;
}

function checkPrEdit(args) {
  for (let i = 0; i < args.length; i++) {
    const base = args[i] === '--base' || args[i] === '-B' ? (args[i + 1] ?? '') : args[i].startsWith('--base=') ? args[i].slice(7) : null;
    if (base !== null && base !== 'dev') return `gh pr edit --base ${base}: retargeting a pull request away from dev is human-only`;
  }
  return null;
}

const MERGE_VALUE_FLAGS = ['-b', '--body', '-F', '--body-file', '-t', '--subject', '-A', '--author-email', '--match-head-commit', '-R', '--repo'];

function checkPrMerge(args, prBase) {
  let pr = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--admin') return 'gh pr merge --admin: bypassing checks is human-only';
    if (MERGE_VALUE_FLAGS.includes(args[i])) i++;
    else if (!args[i].startsWith('-') && pr === null) pr = args[i];
  }
  const base = prBase(pr);
  if (base !== 'dev') return `gh pr merge: the pull request base is "${base ?? 'unknown'}", only dev may be merged by an agent`;
  return null;
}

function checkApi(args) {
  const text = args.join(' ');
  let method = '';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-X' || args[i] === '--method') method = args[i + 1] ?? '';
    else if (args[i].startsWith('--method=')) method = args[i].slice(9);
    else if (/^-X./.test(args[i])) method = args[i].slice(2);
  }
  // Fields or an input body make gh api send POST even without -X.
  const fields = args.some((a) => /^(-f|-F|--field|--raw-field|--input)(=|$)/.test(a) || /^-[fF]./.test(a));
  // graphql always posts: it is a write only when the query is a mutation.
  if (args.includes('graphql')) return /mutation/i.test(text) ? 'gh api graphql mutation: writes go through gh pr and gh issue commands' : null;
  if (method !== '' && !/^get$/i.test(method)) return `gh api -X ${method}: writes go through gh pr and gh issue commands`;
  if (method === '' && fields) return 'gh api with fields sends POST: writes go through gh pr and gh issue commands';
  return null;
}

/** Branch after `git switch` or `git checkout`: the target, or '' (unknown) when it cannot be told. */
function branchAfter(sub, args, branch) {
  if (sub === 'checkout' && args.includes('--')) return branch;
  if (args.includes('-')) return '';
  const target = args.find((a) => !a.startsWith('-'));
  if (target === undefined) return branch;
  if (sub === 'switch' || PROTECTED.includes(target) || TASK_BRANCH.test(target)) return target;
  // checkout of something that may be a file, a tag or a commit: the branch is not known any more.
  return '';
}

function checkGit(sub, args, branch) {
  if (sub === 'commit' && unsafe(branch)) return `git commit on ${named(branch)}: commit on a task branch (task/T-NNNN-slug)`;
  if (['merge', 'cherry-pick', 'revert', 'rebase', 'am'].includes(sub) && unsafe(branch)) return `git ${sub} on ${named(branch)}: dev and master change only by pull request`;
  if (sub === 'pull' && unsafe(branch) && !args.includes('--ff-only')) return `git pull on ${named(branch)} needs --ff-only`;
  if (sub === 'push') return checkPush(args);
  if (sub === 'branch') {
    const moves = args.some((a) => a === '--force' || a === '--move' || a === '--delete' || hasShort(a, 'fMmDd'));
    const target = args.find((a) => PROTECTED.includes(a));
    if (moves && target) return `git branch on ${target}: moving, renaming or deleting dev or master is human-only`;
  }
  if (sub === 'update-ref') {
    const ref = args.find((a) => /^refs\/heads\/(dev|master|main)$/.test(a));
    if (ref) return `git update-ref ${ref}: dev and master change only by pull request`;
  }
  if (sub === 'switch') {
    const bad = args.find((a) => a === '--force' || a === '--discard-changes' || a === '--force-create' || hasShort(a, 'fC'));
    if (bad) return `git switch ${bad}: discards work or resets a branch, not allowed`;
  }
  return null;
}

/**
 * Pure decision. Returns the reason to block `command`, or null to let it run.
 * ctx.branch: the current branch name ('' or 'HEAD' when unknown or detached). ctx.prBase(pr): base branch of a
 * pull request (pr is the number, url or branch given on the command line, or null for the current branch);
 * returns null when it cannot be read.
 */
export function decideGit(command, ctx) {
  let branch = ctx.branch;
  for (const words of splitCommands(command)) {
    const call = invocation(words);
    if (!call) continue;
    const [sub, ...args] = call.args;
    let reason = null;
    if (call.program === 'git') {
      reason = checkGit(sub, args, branch);
      // Later commands on the same line run on the new branch.
      if (sub === 'switch' || sub === 'checkout') branch = branchAfter(sub, args, branch);
    } else if (sub === 'pr' && args[0] === 'create') reason = checkPrCreate(args.slice(1));
    else if (sub === 'pr' && args[0] === 'merge') reason = checkPrMerge(args.slice(1), ctx.prBase);
    else if (sub === 'pr' && args[0] === 'edit') reason = checkPrEdit(args.slice(1));
    else if (sub === 'api') reason = checkApi(args);
    if (reason) return reason;
  }
  return null;
}

/** Hook entry: reads the hook JSON on stdin and sets exit code 2 on a block. `projectDir` is where git and gh run. */
export function main(projectDir) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => (input += c));
  process.stdin.on('end', () => {
    let payload;
    try {
      payload = JSON.parse(input);
    } catch {
      return;
    }
    const command = payload?.tool_input?.command;
    if (payload?.tool_name !== 'Bash' || typeof command !== 'string') return;
    const cwd = projectDir || process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const run = (cmd, args) => {
      const r = spawnSync(cmd, args, { cwd, encoding: 'utf8' });
      return r.status === 0 ? r.stdout.trim() : null;
    };
    const reason = decideGit(command, {
      branch: run('git', ['rev-parse', '--abbrev-ref', 'HEAD']) ?? '',
      prBase: (pr) => run('gh', ['pr', 'view', ...(pr ? [pr] : []), '--json', 'baseRefName', '--jq', '.baseRefName']),
    });
    if (reason) {
      process.stderr.write(`guard-git: blocked. ${reason}\n`);
      process.exitCode = 2;
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
