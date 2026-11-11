---
id: T-0009-delegated-delivery
title: Delegated delivery: request in, merged PR out
status: done
owner: architect
branch: task/T-0009-delegated-delivery
created: 2026-11-11
priority: P1
type: config_toolchain
---

# T-0009: Delegated delivery

## Spec

- Goal: the human gives one request; the lead plans it, delegates to the owning specialists, verifies, gets an independent review and lands it on `dev` through a pull request, with no per-action approval. A backlog and an improve loop keep work coming without a new request.
- Gaps found by the lead audit (2026-11-11):
  1. Every commit, push and merge needs a per-action yes (ADR 0008, `harness/config/policies.json`). Nothing can land hands-off.
  2. No entry point: no skill turns a request into a task record, briefs, claims, delegation, verify, review and landing. The lead must be told each step.
  3. Specialists exist only inside a session. No agent definitions; a new session respawns them by hand with the handbook pasted in.
  4. The backlog is empty and has no priority field. Open items live in handbooks and `harness/README.md` and never become tasks.
  5. Drift and eval failures on GitHub stop at a red run. They do not come back as work.
  6. No permission allowlist: an unattended session stops at prompts. No deny list for destructive git commands.
  7. `.claude/` is gitignored: hooks, agents and skills are not versioned and not present in cloud sessions or CI.
  8. Visual, console and perf checks are human-only. Recorded as backlog task T-0010 (headless smoke), not done here.
  9. Stale state: T-0008 claims were still active on shared files with a clean tree (released 2026-11-11, see Checkpoints).
- Human decisions (2026-11-11, in chat):
  1. Git autonomy: agents commit on a task branch, push it, open a PR to `dev`, and merge it when the land conditions hold. `master` stays human-only.
  2. `.claude/` may change for this task, and `.claude/agents/`, `.claude/skills/` and `.claude/settings.json` are tracked in git.
  3. No schedule. The loop runs on demand (`/deliver <request>`, `/improve`).
  4. Headless visual smoke with Playwright: backlog task T-0010, dependency approved in advance.
- Files in scope: the globs of the two T-0009 claims in `harness/state/claims.json`; this record; the backlog records.
- Out of scope: everything under `src/`; existing guard tests; `package.json`; any push, PR or merge for this task itself (the human approves the first commit under the old rule).

## Acceptance

- [x] `npm run check`
- [x] `node harness/scripts/validate-task.mjs`, `node harness/scripts/check-claims.mjs`, `node harness/scripts/drift-check.mjs` exit 0
- [x] Independent review recorded below with result pass
- [x] Not verified, named: skills and agent definitions load only in a new session; GitHub issue step in `drift.yml` and `evals.yml` runs only on GitHub; first end-to-end `/deliver` run

## Checkpoints

- 2026-11-11: branch `task/T-0009-delegated-delivery` cut from `dev` at f14bf89. T-0008 claims released (tree was clean, its work is committed; reclaim if its human check asks for changes). T-0009 claims active. Uncommitted, working tree.
- 2026-11-11: architect built C1 to C11 except applying C5; Scene & QA wrote tests/delivery.test.ts and tests/guardGit.test.ts. Gate: tsc, lint, build pass; vitest 1887 pass, 1 skip, 1 fail (settings guard in tests/delivery.test.ts: .claude/settings.json not applied). validate-task, check-claims (57 changed, 0 unclaimed), drift-check exit 0; run-evals red on the same guard only. Uncommitted, working tree.
- 2026-11-11: the permissions and hook edit to .claude/settings.json was refused for the architect by the session permission classifier. Not worked around. Proposed file: harness/runs/settings.proposed.json (ignored by git). Waiting for the human.
- 2026-11-11: the human approved in chat; lead copied harness/runs/settings.proposed.json over .claude/settings.json (44 allow, 22 deny, PreToolUse Bash hook guard-git). Gate: npm run check exit 0 (110 files, 1888 pass, 1 skip, build ok); run-evals, validate-task, check-claims (57 changed, 0 unclaimed), drift-check exit 0. Uncommitted, working tree.
- 2026-11-11: the human approved commit, push and a PR to dev in chat. Claims released. Done on the task branch; real on dev once the PR merges.

## Review

- Reviewer: reviewer (read-only subagent)
- Diff range: working tree vs dev at f14bf89, plus the unapplied proposed settings file
- Findings: round 1: 1 high (master held by prose only), 6 medium, 5 low. Round 2: 1 medium (relative hook path fails open), 3 low. Round 3: none of medium or high. Fixed: all high and medium. Accepted as known limits: guard evasion by bash -c, eval and the like (harness/scripts/guard-git.mjs header); specialists inherit Bash; scheduled runs see master only.
- Result: pass (safe to commit once the human applies the settings file)

## Handoff

- Next step: none for this task. First real run: start a new session (hook, permissions, agents and skills load at session start) and run /improve, which picks T-0010.
- Open questions: switch on GitHub branch protection for master (human action).
- Not verified: skills, agent definitions and the hook in a fresh session; the issue step on GitHub; a first end-to-end /deliver run.
