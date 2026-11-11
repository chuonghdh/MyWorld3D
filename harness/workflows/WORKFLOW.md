# Workflow

Reviewed 2026-11-06. How a task moves from request to done, how work is checkpointed and handed over, and where the human must approve. Acceptance commands are in `docs/ACCEPTANCE.md`. Commit, branch and merge rules are in `docs/adr/0014-delegated-delivery.md` (it supersedes the commit rule of `docs/adr/0008-commit-and-branch-workflow.md`). The steps from request to merged pull request are in `harness/workflows/delivery.md`.

## Task states

Each task has one state, stored in its record under `harness/tasks/` (front matter `status`; see `harness/tasks/TEMPLATE.md`).

| State | Meaning |
|---|---|
| proposed | Written down, not yet owned. |
| assigned | An owner (specialist or lead) is named. Files in scope are listed. |
| in_progress | Owner is changing files. |
| verifying | Changes are in place; the acceptance commands and human checks are running. |
| done | The gate (`npm run check`) is green at the recorded commit. Human checks not done are recorded as not verified. A failing gate means in_progress or blocked, not done. |
| blocked | Work stops until a named question is answered by the human. |
| cancelled | Dropped. Reason recorded. |

Allowed transitions:

- proposed to assigned, cancelled
- assigned to in_progress, blocked, cancelled
- in_progress to verifying, blocked
- verifying to done, in_progress (a check failed), blocked
- blocked to assigned or in_progress (after the answer)
- done: terminal. A follow-up is a new task.

## Checkpoints

A checkpoint is a recorded, passing state of the gate. It is taken:

- after a change set that passes `npm run check` (or the docs-only command in `docs/ACCEPTANCE.md`);
- before any risky step (a large split, a dependency change, a lint rule turned on).

To take one: run the gate, and write a dated line in the task record: date, the gate result, the changed files, and the commit hash once the work is committed on the task branch. Before that, write "uncommitted, working tree" and the list of files. Never use `git stash`. Stash hides work from the next session and from the human.

## Session handoff

When a session ends with work open, write a handoff from `harness/state/handoffs/TEMPLATE.md` into `harness/state/handoffs/` (file name `YYYY-MM-DD-<task-id>.md`). The next session reads, in this order:

1. `CLAUDE.md` (rules and gate)
2. `AGENTS.md` (pointer list)
3. the latest handoff for the task, if any
4. the task record in `harness/tasks/`
5. `git status` and `git log -5` (what is in the tree now)
6. the handbook of each owner in the task's scope
7. `harness/workflows/delivery.md`, when the session delivers or lands work

The next session does not trust chat history. Only files count.

## Retry and recovery

- A failing check gets at most two attempts with a fix. The second failure on the same check: stop, record the output (failures only) in the task record, set the state to blocked, and report to the human.
- A check failing in another owner's area is not fixed. It is reported with the file and the rule (`docs/agents/README.md`, rule 2).
- Broken working tree (unexpected changes, half-applied edits, a file that will not compile):
  1. Read the diff: `git status` and `git diff` on the files in scope. Do not guess.
  2. If the change is yours and the cause is clear, fix forward: finish or correct the edit.
  3. If the change is not yours or the cause is unclear, do not revert. Ask the human.
- Never use `git reset`, `git checkout --` or `git stash` to recover. Those discard work other agents or the human may need.

## Human approval gates

The lists are data in `harness/config/policies.json` (`autonomy`, `approvalGates`); the decision is `docs/adr/0014-delegated-delivery.md`. Do not copy them elsewhere.

- No approval needed (`autonomy.agentMay`): the task branch, its commits and its push, the pull request to `dev`, its merge when every land condition holds, deleting that task branch.
- Human-only (`autonomy.humanOnly`): anything to `master`, a direct commit to `dev`, a force push, a foreign branch, dependencies, ADRs, `.claude/`, `.github/`, weakening a guard.
- Ask unless the request names it (`approvalGates`): a config default in `src/config/tuning/` that changes shipped behaviour; any file outside the owner's files (`docs/agents/README.md`).

An item is approved when the human's request, or the task record's Spec under "Human decisions", names it. The approval covers that task only.

## Parallel work

- Two active tasks may run in parallel only if their claim globs do not overlap (`harness/state/claims.json`).
- A task claims its globs before work starts (status active, with its date).
- Before a commit, the lead runs `node harness/scripts/check-claims.mjs --staged`. The commit must not include unclaimed files.
- Claims are released (status released in claims.json) when the task is done.
- Overlapping globs: one task waits, or the human decides the order. Do not edit a file another active claim covers.

## Independent review

- Before a task moves to done, a reviewer who did not write the change reads the diff against the brief (`harness/templates/brief.md`). In the delivery workflow this is the reviewer agent (`.claude/agents/reviewer.md`).
- The reviewer records a Review section in the task record with: reviewer, diff range, findings (severity and file:line), and result (pass or changes requested).
- The reviewer does not edit code. Changes requested send the task back to in_progress.
- Use the code-review skill where it fits (a diff against a branch or commit range).
