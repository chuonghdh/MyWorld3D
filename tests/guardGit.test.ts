// Unit tests for the git guard (harness/scripts/guard-git.mjs, ADR 0014): the PreToolUse hook that keeps agent git
// work on task branches and pull requests on dev. decideGit is pure: branch and pull request base are injected.
// A failure means the guard lets a human-only action through, or blocks the delivery path: fix the guard script.
import { describe, expect, it } from 'vitest';
import { decideGit, splitCommands } from '../harness/scripts/guard-git.mjs';

const on = (branch: string, base: string | null = 'dev') => ({ branch, prBase: () => base });
const TASK = on('task/T-0001-x');

/** Commands from `list` whose verdict is not the expected one. */
function wrong(list: string[], blocked: boolean, ctx = TASK): string[] {
  return list.filter((c) => (decideGit(c, ctx) !== null) !== blocked);
}

describe('guard-git: commit', () => {
  it('blocks a commit on dev, master and main, allows it on a task branch', () => {
    for (const b of ['dev', 'master', 'main']) expect(decideGit('git commit -m "x"', on(b)), b).not.toBeNull();
    expect(decideGit('git commit -m "x"', TASK)).toBeNull();
    expect(decideGit('git -c user.name=a commit -am x', on('dev'))).not.toBeNull();
  });

  it('a switch earlier on the same line counts: the commit runs on the new branch', () => {
    expect(wrong(['git switch dev && git commit -m x', 'git switch master; git commit -m x', 'git switch --detach dev && git commit -m x'], true)).toEqual([]);
    expect(decideGit('git switch task/T-0002-y && git commit -m x', on('dev'))).toBeNull();
  });
});

describe('guard-git: push', () => {
  it('allows only a plain push of a task branch to origin, with or without -u', () => {
    expect(wrong(['git push origin task/T-0001-x', 'git push -u origin task/T-0001-x', 'git push --set-upstream origin task/T-0001-x'], false)).toEqual([]);
  });

  it('blocks every other push', () => {
    const blocked = [
      'git push',
      'git push origin',
      'git push origin HEAD',
      'git push origin dev',
      'git push origin master',
      'git push origin "master"',
      'git push origin task/T-0001-x:master',
      'git push origin HEAD:dev',
      'git push origin :task/T-0001-x',
      'git push origin +task/T-0001-x',
      'git push origin task/../master',
      'git push origin task/T-0001-x task/T-0002-y',
      'git push --force origin task/T-0001-x',
      'git push origin task/T-0001-x --force',
      'git push -f origin task/T-0001-x',
      'git push -uf origin task/T-0001-x',
      'git push --force-with-lease origin task/T-0001-x',
      'git push --all origin',
      'git push --delete origin task/T-0001-x',
      'git push upstream task/T-0001-x',
      'git push https://example.com/r.git task/T-0001-x',
      'GIT_TRACE=1 git push origin master',
      'git -C . push origin master',
      'echo $(git push origin master)',
    ];
    expect(wrong(blocked, true)).toEqual([]);
  });
});

describe('guard-git: pull requests', () => {
  it('gh pr create needs --base dev', () => {
    expect(wrong(['gh pr create --base dev --title "t" --body "b"', 'gh pr create --base=dev', 'gh pr create -B dev --fill'], false)).toEqual([]);
    expect(wrong(['gh pr create', 'gh pr create --fill', 'gh pr create --base master', 'gh pr create --base=master', 'gh pr create --base dev --base master'], true)).toEqual([]);
  });

  it('gh pr merge runs only when the pull request base is dev, and never with --admin', () => {
    const merge = 'gh pr merge 12 --squash --delete-branch';
    expect(decideGit(merge, on('task/T-0001-x', 'dev'))).toBeNull();
    expect(decideGit(merge, on('task/T-0001-x', 'master'))).not.toBeNull();
    expect(decideGit(merge, on('task/T-0001-x', null))).not.toBeNull();
    expect(decideGit('gh pr merge 12 --squash --admin', on('task/T-0001-x', 'dev'))).not.toBeNull();
  });

  it('gh pr merge asks for the base of the pull request named on the command line', () => {
    const asked: (string | null)[] = [];
    const ctx = { branch: 'task/T-0001-x', prBase: (pr: string | null) => (asked.push(pr), 'dev') };
    decideGit('gh pr merge 12 --squash', ctx);
    decideGit('gh pr merge --squash --body "text" 34', ctx);
    decideGit('gh pr merge --squash', ctx);
    expect(asked).toEqual(['12', '34', null]);
  });
});

describe('guard-git: switch, chains and unrelated commands', () => {
  it('blocks a switch that discards work or resets a branch', () => {
    expect(wrong(['git switch -f dev', 'git switch --force dev', 'git switch --discard-changes dev', 'git switch -C dev', 'git switch --force-create dev'], true)).toEqual([]);
    expect(wrong(['git switch dev', 'git switch -c task/T-0002-y', 'git switch -'], false)).toEqual([]);
  });

  it('checks every command of a chained line', () => {
    const blocked = [
      'npm run check && git push origin master',
      'git status; git push --force origin task/T-0001-x',
      'git add -A || git push',
      'git status | cat; gh pr create',
      'git add .\ngit push origin dev',
      '(git push origin master)',
    ];
    expect(wrong(blocked, true)).toEqual([]);
    expect(decideGit('git add -A && git commit -m "x" && git push -u origin task/T-0001-x && gh pr create --base dev --fill', TASK)).toBeNull();
  });

  it('text inside quotes is not a command', () => {
    expect(decideGit('git commit -m "fix; git push origin master && gh pr create"', TASK)).toBeNull();
    expect(splitCommands('a "b; c" && d \'e | f\'')).toEqual([['a', 'b; c'], ['d', 'e | f']]);
  });

  it('lets unrelated commands through, on any branch', () => {
    const free = ['npm run check', 'git status', 'git diff dev...HEAD', 'git log --oneline -5', 'git add -A', 'git pull --ff-only', 'gh pr view 12 --json baseRefName', 'gh pr checks --watch', 'node harness/scripts/verify.mjs', ''];
    expect(wrong(free, false, on('dev'))).toEqual([]);
  });
});

// Regression: holes and one false block found by probing on 2026-11-11 (T-0009 review), fixed in the guard.
describe('guard-git: regression (T-0009 review)', () => {
  it('a word in front of git does not hide it', () => {
    const blocked = [
      'command git push origin master',
      'time git push origin master',
      'env git push --force origin master',
      '! git push origin master',
      '{ git push origin master; }',
      'if true; then git push origin master; fi',
      '`git push origin master`',
      'echo "$(git push origin master)"',
      '/usr/bin/git push origin master',
      '"C:/Program Files/Git/bin/git.exe" push origin master',
      'GIT push origin master',
    ];
    expect(wrong(blocked, true)).toEqual([]);
  });

  it('git checkout and git switch - change the branch for the rest of the line', () => {
    expect(wrong(['git checkout dev && git commit -m x', 'git switch - && git commit -m x', 'git checkout - && git commit -m x', 'git checkout HEAD~1 && git commit -m x'], true)).toEqual([]);
    // A file checkout (after --) keeps the branch.
    expect(wrong(['git checkout -- src/a.ts && git commit -m x', 'git checkout task/T-0002-y && git commit -m x'], false)).toEqual([]);
  });

  it('dev and master do not move without a pull request', () => {
    const blocked = [
      'git switch dev && git merge task/T-0001-x',
      'git switch dev && git cherry-pick abc123',
      'git switch dev && git revert abc123',
      'git switch dev && git rebase task/T-0001-x',
      'git switch dev && git pull',
      'git switch master && git pull origin dev',
      'git branch -f dev HEAD',
      'git branch --force master HEAD',
      'git branch -D dev',
      'git branch -m dev old',
      'git update-ref refs/heads/dev HEAD',
      'git update-ref refs/heads/master HEAD',
    ];
    expect(wrong(blocked, true)).toEqual([]);
    for (const c of ['git merge task/T-0001-x', 'git pull', 'git rebase dev', 'git cherry-pick abc123']) expect(decideGit(c, on('dev')), c).not.toBeNull();
  });

  it('merge and pull stay free on a task branch, and pull --ff-only on dev', () => {
    expect(wrong(['git merge dev', 'git merge origin/dev', 'git pull', 'git rebase dev', 'git cherry-pick abc123', 'git branch -d task/T-0000-old'], false)).toEqual([]);
    expect(decideGit('git pull --ff-only', on('dev'))).toBeNull();
    expect(decideGit('git switch dev && git pull --ff-only', TASK)).toBeNull();
  });

  it('gh api cannot merge a pull request or write to a branch, ref or protection path', () => {
    const blocked = [
      'gh api -X PUT repos/o/r/pulls/5/merge',
      'gh api --method PUT repos/o/r/pulls/5/merge',
      'gh api repos/o/r/pulls/5/merge -f merge_method=squash',
      'gh api -X PATCH repos/o/r/git/refs/heads/master -f sha=abc',
      'gh api repos/o/r/merges -f base=master -f head=dev',
      'gh api -X DELETE repos/o/r/branches/master/protection',
    ];
    expect(wrong(blocked, true)).toEqual([]);
    expect(wrong(['gh api repos/o/r/pulls/5', 'gh api repos/o/r/branches/dev', 'gh api -X GET repos/o/r/issues'], false)).toEqual([]);
  });

  it('an unknown or detached branch is not a task branch', () => {
    for (const b of ['', 'HEAD']) {
      expect(decideGit('git commit -m x', on(b)), `commit on "${b}"`).not.toBeNull();
      expect(decideGit('git merge task/T-0001-x', on(b)), `merge on "${b}"`).not.toBeNull();
      expect(decideGit('git status', on(b))).toBeNull();
    }
  });

  it('redirections and pipes do not block the delivery path, and do not hide a bad push', () => {
    const free = [
      'git push -u origin task/T-0001-x 2>&1',
      'git push -u origin task/T-0001-x > /dev/null',
      'git push -u origin task/T-0001-x > /dev/null 2>&1',
      'git push -u origin task/T-0001-x &> push.log',
      'git push -u origin task/T-0001-x 2>&1 | tail -5',
      'git commit -m x 2>&1 | tail -3',
      'gh pr create --base dev --fill 2>&1 | cat',
      'gh pr merge 12 --squash --delete-branch 2>&1 | cat',
    ];
    expect(wrong(free, false)).toEqual([]);
    expect(wrong(['git push origin master 2>&1', 'git push origin > master', 'git status | git push origin dev', 'git push --force origin task/T-0001-x 2>/dev/null'], true)).toEqual([]);
  });

  it('heredoc bodies and comments are data, the lines after them are commands', () => {
    const message = 'git commit -F - <<EOF\nfix: say why git push origin master is blocked\ngh pr create\nEOF';
    const quoted = `git commit -m "$(cat <<'EOF'\nfix: mention git push origin master\nEOF\n)"`;
    expect(wrong([message, quoted, 'git status # git push origin master', '# git push origin master\ngit status'], false)).toEqual([]);
    expect(wrong([`${message}\ngit push origin master`, 'cat <<-EOF\n\ttext\n\tEOF\ngit push origin dev', '# note\ngit push origin master'], true)).toEqual([]);
    expect(decideGit(message, on('dev'))).not.toBeNull();
  });
});

// Regression: second probe (2026-11-11), fixed in the guard. Lead decision: every gh api write is blocked.
describe('guard-git: regression (second probe)', () => {
  it('a backslash-newline joins the line: a valid push passes, a split command is still read', () => {
    expect(wrong(['git push -u origin \\\n  task/T-0001-x', 'gh pr create \\\n  --base dev --fill', 'git commit \\\n  -m x'], false)).toEqual([]);
    expect(wrong(['git \\\npush origin master', 'git pu\\\nsh origin master', 'git push \\\n  origin master', 'gh pr create \\\n  --fill'], true)).toEqual([]);
  });

  it('gh pr edit may set the base to dev only', () => {
    expect(wrong(['gh pr edit 12 --base master', 'gh pr edit --base=master', 'gh pr edit 12 -B master', 'gh pr edit 12 --base master && gh pr merge 12 --squash'], true)).toEqual([]);
    expect(wrong(['gh pr edit 12 --base dev', 'gh pr edit 12 --title "t"'], false)).toEqual([]);
  });

  it('every gh api write is blocked, reads pass', () => {
    const blocked = [
      'gh api repos/o/r/issues -f title=x',
      'gh api -X PUT repos/o/r/contents/README.md -f message=x -f content=eA== -f branch=master',
      'gh api -X PATCH repos/o/r/pulls/5 -f base=master',
      'gh api --method POST repos/o/r/issues',
      'gh api -XDELETE repos/o/r/git/refs/heads/task/x',
      'gh api repos/o/r/issues -F title=x',
      'gh api repos/o/r/issues --raw-field title=x',
      'gh api repos/o/r/issues --input body.json',
      `gh api graphql -f query='mutation { mergePullRequest(input:{pullRequestId:"x"}) { clientMutationId } }'`,
    ];
    expect(wrong(blocked, true)).toEqual([]);
    expect(wrong(['gh api repos/o/r/pulls/5', 'gh api -X GET repos/o/r/pulls', 'gh api --method GET repos/o/r/issues --jq ".[].title"'], false)).toEqual([]);
  });

  it('arithmetic shifts and quoted heredoc delimiters do not swallow the next lines', () => {
    expect(wrong(['echo $((1<<2))\ngit push origin master', 'cat <<"E OF"\nx\nE OF\ngit push origin master', "cat <<'E OF'\nx\nE OF\ngit push origin dev"], true)).toEqual([]);
    expect(wrong(['echo $((1<<2))\ngit status', 'cat <<"E OF"\ngit push origin master\nE OF\ngit status'], false)).toEqual([]);
  });
});
