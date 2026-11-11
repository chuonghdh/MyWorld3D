# Delivery

Request in, merged pull request to `dev` out. Run by the lead through the deliver and improve skills (.claude/skills/), on demand only. Decision: `docs/adr/0014-delegated-delivery.md`. What the agent may do alone and what stays with the human is data in `harness/config/policies.json` (`autonomy`). Task states, checkpoints, retry and recovery: `harness/workflows/WORKFLOW.md`.

Until T-0010 (headless smoke) lands, visual, audio and perf checks are listed as not verified in the pull request. They do not block a merge to `dev`. They block the release to `master` (`harness/workflows/release.md`).

## Intake

1. Restate the request as a goal and an acceptance list.
2. Pick the change type from `harness/config/quality-gates.json` (feature, bug, refactor, docs, config_toolchain).
3. Get the next id: `node harness/scripts/next-task.mjs --next-id`.
4. Write the task record in `harness/tasks/active/` from `harness/tasks/TEMPLATE.md` (state: assigned).
5. Ask the human only when two readings of the request lead to different work. Otherwise decide, and write the assumption in the record's Spec.

## Plan

1. Map every file to its owner (`docs/agents/README.md`).
2. One brief per owner, from `harness/templates/brief.md`, under `harness/briefs/`.
3. Claim the globs in `harness/state/claims.json` (status active).
4. Cut `task/T-NNNN-slug` from an up-to-date `dev`: `git switch dev`, `git pull --ff-only`, `git switch -c task/T-NNNN-slug`.
5. Owners work in parallel only when their claims are disjoint.

## Delegate

1. Spawn each owner by its agent definition under .claude/agents/: subagent_type = slug, and always pass `name` = slug (the Agent Room registry binds by it).
2. Follow-ups go by SendMessage to the same agent. Do not respawn.
3. The lead does not edit feature code. It writes the record, the briefs, the claims, and lands the work.

## Verify

1. Scene & QA runs `node harness/scripts/verify.mjs` (typecheck, lint, test, build). Failures only.
2. Retry: at most two attempts on the same failing check. Then state blocked (see Escalate).
3. Flake: rerun the failing file alone. It is a flake only if it passes solo; say so in the record.
4. Checkpoint in the task record (state: verifying).

## Review

1. The reviewer agent reads `git diff dev...HEAD` against the briefs. It edits nothing.
2. Record its result in the task record: a Review section with reviewer, diff range, findings, result.
3. Changes requested: back to the owner (state: in_progress), then Verify again, then the reviewer reads the fix diff.
4. At most two rounds of changes requested. A third: state blocked (see Escalate).

## Land

Conditions (all of them; data in `harness/config/policies.json`, `autonomy.landConditions`): the gate is green; the staged files are all claimed; the review result is pass; the task record is valid with state done; claims are released and the record is in `harness/tasks/completed/` in the same commit.

Order:

1. Stage the work (`git add`), while the claims are still active.
2. `node harness/scripts/check-claims.mjs --staged` exits 0.
3. Then: set the record to done (checkpoint, Review section), release the claims in `harness/state/claims.json`, move the record to `harness/tasks/completed/`, and stage those three changes.
4. `node harness/scripts/validate-task.mjs` exits 0.
5. Commit on the task branch. English message, attribution line from the session instructions.
6. Push the task branch: `git push -u origin task/T-NNNN-slug`.
7. `gh pr create --base dev`, with the template checklist ticked and Not verified filled in.
8. `gh pr checks --watch`. Right after the create it can exit 1 with "no checks reported", before CI registers: wait a minute and retry, at most three times. That is not a red CI. Still no checks after the third try: stop and escalate.
9. Check the base: `gh pr view N --json baseRefName` must say `dev`. Anything else: do not merge; stop and escalate.
10. On green: `gh pr merge N --squash --delete-branch`.
11. After the merge: `git switch dev`, `git pull --ff-only`. If the task came from an issue, close it (see Improve).

Done and the merge: the landing commit carries the record as done in `harness/tasks/completed/`, so `dev` sees done only when the pull request merges. Before the merge, done exists on the task branch alone.

CI red, or any fix after the review:

- Fix on the task branch. Every fix pushed after the review needs Verify again and a reviewer pass on the fix diff before the merge.
- At most two fix attempts. Then a correcting commit on the unmerged task branch puts the record back in `harness/tasks/active/` as blocked and sets its claims active again. The state on `dev` never changed, so no transition rule is broken (done is terminal once merged). Leave the pull request open and escalate.

Once the human has applied the hook to .claude/settings.json, the mechanical guard `harness/scripts/guard-git.mjs` (a PreToolUse hook on Bash) blocks a commit on `dev` or `master`, a push that is not `origin task/...`, a pull request without `--base dev`, and a merge of a pull request whose base is not `dev`. Until then these rules are held by this workflow alone: follow the steps exactly.

## Escalate

Human-only (ids in `harness/config/policies.json`, `autonomy.humanOnly`): a pull request or merge to `master`; a direct commit to `dev` or `master`; a force push; deleting a branch the task did not create; a dependency change; a new or changed ADR; a change under .claude/; a change under .github/; weakening a guard. An item is approved when the human's request, or the task record's Spec under "Human decisions", names it.

How to stop:

1. Set the state to blocked in the task record, with the failure output (failures only).
2. Write a handoff from `harness/state/handoffs/TEMPLATE.md`.
3. Leave the pull request open, or open it as a draft. Do not merge.
4. Ask the human one clear question.

## Improve

Sources of work, in this order:

1. Open GitHub issues labelled `harness`: `gh issue list --label harness`.
2. `node harness/scripts/drift-check.mjs`.
3. "Open items" in each handbook under `docs/agents/`.
4. "Known gaps" in `harness/README.md`.

Each item becomes a record in `harness/tasks/backlog/` (status proposed, priority, type, owner), unless one exists.

- A record made from an issue stores `source: issue-N` in its front matter.
- Duplicate check: compare the parsed `source` value across backlog, active and completed (issues), or the same file and rule (other items), before writing a record.

Then `node harness/scripts/next-task.mjs` lists the backlog by priority; move the top record to `harness/tasks/active/` and deliver it (Plan to Land). One task per run.

After the merge:

- A task with `source: issue-N`: the lead closes the issue with `gh issue close N --comment` and the pull request link. "Closes #N" in the pull request does not close it: GitHub closes issues only on a merge to the default branch (`master`).
- Each owner appends what it learned to its handbook (`docs/agents/README.md`, rule 4).
