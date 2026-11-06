# Bug fix

Source: `harness/workflows/WORKFLOW.md`. Gates: `harness/config/quality-gates.json`. Approvals: `harness/config/policies.json`.

1. Record the task in `harness/tasks/active/` (state: assigned). Write the failing symptom and the file where it shows.
   Write the brief from `harness/templates/brief.md` and claim the globs in `harness/state/claims.json` before work starts.
2. Find the root cause. Do not add a workaround that hides the symptom. Never weaken a guard test to pass.
3. If a regression test is possible, add it first and see it fail (state: in_progress).
4. Fix the code in the owner's files. Run `node harness/scripts/verify.mjs`.
5. Retry policy: at most two attempts on the same failing check. Then stop: record the failure output, set state blocked, report to the human.
6. Broken working tree: read `git status` and `git diff`, fix forward, or ask. Never reset, checkout or stash.
7. Checkpoint, then done only when the gate is green at the recorded commit.

Approval points: commit, push, merge, branch delete, `.claude/` changes, dependency changes, ADRs, config defaults, files outside the owner's files.
