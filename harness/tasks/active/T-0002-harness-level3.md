---
id: T-0002-harness-level3
title: Harness Level 3: workflow and state
status: in_progress
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
- [ ] Human review of the approval gate list in `harness/workflows/WORKFLOW.md`.

## Checkpoints

- 2026-11-06: docs written, uncommitted, working tree.

## Handoff

- Next step: human review of `harness/workflows/WORKFLOW.md` and the gate list; then fill the T-0002 checkpoint with the commit if the human asks for one.
- Open questions: confirm the approval gates are the right set; confirm `docs/ACCEPTANCE.md` is the gate reference.
