# Brief: T-0009 (architect)

- **Task id:** T-0009-delegated-delivery
- **Owner:** architect
- **Reviewer:** reviewer (read-only subagent, different from the owner)
- **Goal:** Build the delegated delivery pipeline described in the task record: policy, entry-point skills, durable specialist definitions, prioritized backlog, failure-to-issue feedback, permissions. Follow the contract below exactly: Scene & QA writes guards against it in parallel.
- **Files in scope:** the globs of the architect T-0009 claim in harness/state/claims.json, plus harness/tasks/backlog/ records and harness/tasks/TEMPLATE.md.
- **Files out of scope:** src/, tests/, package.json, package-lock.json, docs/agents/ handbooks other than architect.md and README.md, harness/evals/.
- **Claims:** architect entry for T-0009-delegated-delivery in harness/state/claims.json (already active).
- **Acceptance commands:** `npx vitest run tests/harness.test.ts`; `node harness/scripts/validate-task.mjs`; `node harness/scripts/check-claims.mjs`; `node harness/scripts/drift-check.mjs`; `node harness/scripts/next-task.mjs`. All exit 0. Do not run the full `npm run check`; Scene & QA runs it.
- **Report format:** at most 12 lines: files changed, gate result (failures only), contract items changed or not done, not verified.

## Human decisions (2026-11-11)

See the task record, "Human decisions". They are the approval for the ADR, the `.claude/` changes and the `.github/` changes in this brief. No commit, push or PR in this task.

## Contract

C1. Agent definitions: .claude/agents/SLUG.md for buildings, city-streets, traffic-life, sky-environment, audio, ui-camera, scene-qa, architect, reviewer. Front matter `name: SLUG` and `description:` (when the lead should use it; owned globs). Body, short: read docs/agents/SLUG.md first and treat it as the source of truth; stay inside owned files and the brief's claims; rules from CLAUDE.md that bite (knobs, determinism, 350 lines, no guard weakening); never commit, push or run git reset, checkout -- or stash (the lead lands the work); append to the handbook at the end; report in the brief's format. Do not copy handbook content in. reviewer: `tools: Read, Grep, Glob, Bash`; reads the diff against the brief, edits nothing, returns reviewer, diff range, findings (severity, file:line), result (pass or changes requested); names `harness/workflows/WORKFLOW.md`.

C2. Skills: .claude/skills/deliver/SKILL.md and .claude/skills/improve/SKILL.md. Front matter `name`, `description`. Thin: each says to read `harness/workflows/delivery.md` and run it (deliver: for the request in the arguments; improve: the Improve section, then deliver the picked task). The workflow file is the source of truth.

C3. `harness/workflows/delivery.md` with these `## ` sections, in order:
   - Intake: restate the request as a goal and acceptance; pick the change type (`harness/config/quality-gates.json`); get the next id (`node harness/scripts/next-task.mjs --next-id`); write the task record in harness/tasks/active/. Ask the human only when two readings of the request lead to different work; otherwise decide, and record the assumption in the record.
   - Plan: map every file to its owner (`docs/agents/README.md`); one brief per owner (`harness/templates/brief.md`); claims; cut `task/T-NNNN-slug` from an up-to-date `dev`. Parallel only for disjoint claims.
   - Delegate: spawn each owner by its agent definition (subagent_type = slug, and always pass `name` = slug, for the Agent Room registry); follow-ups go by SendMessage to the same agent. The lead does not edit feature code.
   - Verify: Scene & QA runs `node harness/scripts/verify.mjs`; retry policy (two attempts, then blocked); flake rule.
   - Review: the reviewer agent reads `git diff dev...HEAD` against the briefs; result recorded in the task record. Changes requested goes back to the owner.
   - Land: conditions (gate green, `node harness/scripts/check-claims.mjs --staged` exit 0, review pass, task record valid, claims released and record moved to harness/tasks/completed/ in the same commit). Then commit on the task branch (English message, attribution line), push the task branch, `gh pr create --base dev` with the template checklist ticked and Not verified filled in, `gh pr checks --watch`, and on green `gh pr merge --squash --delete-branch`. CI red: fix on the branch, at most two attempts, then leave the PR open and escalate. After merge: `git switch dev`, `git pull --ff-only`.
   - Escalate: the human-only list (C4); how to stop: state blocked, handoff file, PR left open or draft, one clear question.
   - Improve: sources of work, in order: open GitHub issues labelled `harness` (`gh issue list --label harness`), `node harness/scripts/drift-check.mjs`, "Open items" in each handbook, "Known gaps" in `harness/README.md`. Each becomes a backlog record (status proposed, priority, type, owner) unless one exists. Then `node harness/scripts/next-task.mjs` picks the top record; move it to active and deliver it. One task per run. After landing, each owner appends what it learned to its handbook (already rule 4 in `docs/agents/README.md`).
   - State that until T-0010 lands, visual, audio and perf checks are listed as not verified in the PR and do not block a merge to `dev`; they block the release to `master` (`harness/workflows/release.md`).

C4. `harness/config/policies.json`: add `autonomy` = { `adr`: "docs/adr/0014-delegated-delivery.md", `agentMay`: [{id, rule}], `humanOnly`: [{id, rule}], `landConditions`: [strings] }.
   - agentMay ids: task_branch_create, task_branch_commit, task_branch_push, pr_to_dev_open, pr_to_dev_merge, task_branch_delete.
   - humanOnly ids: master_pr_or_merge, direct_commit_to_dev_or_master, force_push, foreign_branch_delete, dependency_change, adr_change, claude_config_change, github_config_change, guard_weakening.
   - A human-only item is approved when the human's request, or the task record's Spec under "Human decisions", names it. Record that in `approvalScope`.
   - Rewrite `approvalGates` to match (keep config_default_change and outside_owner_files: approved when the request names them, otherwise ask). Keep `version`, bump to 2.

C5. .claude/settings.json: keep `env` and both hooks unchanged. Add `permissions.allow` for the pipeline's commands (npm run check/lint/test/typecheck, npx tsc, npx vitest, npx vite build, node harness/scripts/*, node tools/agent-bridge/*, read-only git, git switch, git add, git commit, git pull --ff-only, git push for task/ branches, gh pr create/view/checks/merge/list, gh run list/view, gh issue list/view/create) and `permissions.deny` with at least: git push --force, git push -f, git push origin master, git reset --hard, git stash, git checkout --, git branch -D. Use the current Claude Code permission rule syntax (load the update-config skill if you have it; otherwise `Bash(prefix:*)`). The file must stay valid JSON.

C6. Backlog: harness/tasks/TEMPLATE.md gains `priority: P1 | P2 | P3` and `type: feature | bug | refactor | docs | config_toolchain`. `harness/scripts/validate-task.mjs` requires both for records in backlog/ (records in active/ and completed/ stay valid without them). Seed harness/tasks/backlog/ with records (status proposed, branch dev, created 2026-11-11, four sections, concrete files in scope and acceptance):
   - T-0010-headless-smoke (P1, config_toolchain, owner architect with Scene & QA for the test): Playwright as a devDependency (approved by the human 2026-11-11); a headless Chromium run that loads the built app, fails on console errors, checks the canvas is not blank by day and by night, and reads draw calls and triangles from the renderer; a separate CI job; `harness/config/quality-gates.json` human checks reduced to what the smoke cannot see.
   - One record per still-open item in `docs/agents/README.md` "Open items (architect, 2026-11-09)" (items 1 to 5; check each against the code first and skip what is closed) and per "Known gaps" line in `harness/README.md` that is actionable. Owner by the ownership table. P2 for rule gaps, P3 for the rest.

C7. `harness/scripts/next-task.mjs`: no arguments prints backlog records sorted by priority then id, one line each (`P1 T-0010-headless-smoke [architect] title`), exit 0, prints `backlog empty` when none. `--next-id` prints the next free `T-NNNN` across backlog, active and completed. Failures only otherwise.

C8. ADR: docs/adr/0014-delegated-delivery.md (Status: Accepted (2026-11-11), Context, Decision, Consequences), superseding the commit rule of ADR 0008. In `docs/adr/0008-commit-and-branch-workflow.md` change only the status line (Superseded in part by ADR 0014). Row in `docs/adr/README.md`.

C9. `.github/workflows/drift.yml` and `evals.yml`: on failure, open a GitHub issue labelled `harness` (create the label if missing, skip if an open issue with the same title exists), `permissions: issues: write` plus `contents: read`. Keep the three top-level keys and no tabs. `.github/CODEOWNERS`: replace `@OWNER` with `@chuonghdh` (the repository owner in the origin URL), add `/.claude/`, fix the comment. `.github/pull_request_template.md`: keep the five items (guarded).

C10. `.gitignore`: track .claude/agents/, .claude/skills/ and .claude/settings.json; keep everything else under .claude/ ignored (settings.local.json, launch.json, scheduled_tasks.lock).

C11. Docs to bring in line (one rule, one place; point, do not repeat): `CLAUDE.md` (replace "Commit ONLY on user prompt" with one line pointing at ADR 0014 and `harness/workflows/delivery.md`; add delivery to "Context"; keep it short), `AGENTS.md`, `docs/ACCEPTANCE.md`, `harness/workflows/WORKFLOW.md` (approval gates, read order), `harness/workflows/feature-development.md`, `harness/workflows/bug-fix.md`, `harness/workflows/release.md` (master stays human-only), `harness/templates/brief.md`, `harness/README.md` (enforcement, layout, guard table row for `tests/delivery.test.ts`, known gaps), `docs/agents/README.md` (rule 1: spawn by agent definition; rule 6), `harness/config/quality-gates.json` rules line. Add an "Update 2026-11-11" section to `docs/agents/architect.md`.

## Traps

- `tests/harness.test.ts` checks that every backticked path starting with docs/, src/, tests/ or public/ in docs and harness markdown exists, and that every harness/scripts/*.mjs named anywhere exists. `harness/scripts/drift-check.mjs` checks harness/ and .github/ paths too. Write a path in backticks only when the file exists at the end of the task.
- WORKFLOW.md must keep naming all seven task states.
- ADR files need `## Context`, `## Decision`, `## Consequences` and a Status line.
