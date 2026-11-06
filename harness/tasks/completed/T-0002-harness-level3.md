---
id: T-0002-harness-level3
title: Harness Level 3: workflow and state
status: done
owner: Technical Architect (lead: Claude main session)
branch: dev
created: 2026-11-06
---

# T-0002: Harness Level 3: workflow and state

## Spec

- Goal: a documented task lifecycle, checkpoint and handoff rules, recovery without reset, approval gates, and task and handoff templates.
- Files in scope: `harness/workflows/WORKFLOW.md`, `harness/tasks/**`, `harness/state/handoffs/**`, `AGENTS.md` (one link line), `CLAUDE.md` (one link line in the map).
- Out of scope: code, tests, git operations, commits, `.claude/`, `package.json`.

## Acceptance

- [x] `harness/workflows/WORKFLOW.md`, `harness/tasks/TEMPLATE.md`, `harness/state/handoffs/TEMPLATE.md`, this record and T-0001 written.
- [x] `npx vitest run tests/harness.test.ts` (docs links, ADR headings) run after the docs change; see handoff for result.
- [x] `npm run check` green at `1bd3e4a` (vitest 90 files, 1585 pass, 1 skipped), and CI green on PR #6.
- Not verified: a separate written human review of the approval gate list in `harness/workflows/WORKFLOW.md`. The human merged PR #6 without raising objections to it.

## Checkpoints

- 2026-11-06: docs written (working tree).
- 2026-11-06, commit `1bd3e4a` ("Level 3 workflow and harness/ folder structure"): task lifecycle, checkpoints, handoff, retry and recovery, approval gates, `harness/` folder, guards. Gate green.
- 2026-11-06, merged: PR #6 into `dev`, merge commit `49af302`.

## Handoff

- Next step: none for this task. Level 4 (agent orchestration: independent review, parallel execution rules) is a new task.
- Open questions: none.

## Review

Review: not independently reviewed. Work was done before the review gate existed; the lead ran `npm run check` only.
- Reviewer: none (no independent review)
- Diff range: not recorded (pre-review gate)
- Result: not reviewed (gate green at the recorded commits, which is not a review)
