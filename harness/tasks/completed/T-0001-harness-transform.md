---
id: T-0001-harness-transform
title: Harness transform (Levels 1 and 2)
status: done
owner: Technical Architect (lead: Claude main session)
branch: dev
created: 2026-11-06
---

# T-0001: Harness transform (Levels 1 and 2)

## Spec

- Goal: make the harness real: Edit hook, `npm run check`, CI workflow, ADRs, architecture and coding docs, ESLint with a zero-violation rule set, acceptance gate.
- Files in scope: `.claude/settings.json`, `package.json` (scripts and devDependencies), `eslint.config.js`, `.github/workflows/ci.yml`, `docs/**`, `AGENTS.md`, `CLAUDE.md` (Harness and QA lines).
- Out of scope: feature code under `src/**` and test logic. Owners fix their own lint and check failures.

## Acceptance

- [x] Hook runs `tsc --noEmit` on `src/`/`tests/` edits; silent on success, exit 2 with output on failure (tested by hand under Git Bash).
- [x] `npm run check` green at `b45268c`: tsc exit 0, eslint clean, vitest 90 files and 1578 tests pass, 1 skipped, vite build exit 0.
- [x] CI run on GitHub for PR #6 (head `1bd3e4a`): `check` job pass, 2m3s, run 42296978151.

## Checkpoints

- 2026-11-06, Level 1 (harness transform): commit `dcb63d5` ("Harness transform: split oversized files, add guards and Level 1 docs"). Gate: tsc, vite build and vitest green (1573 tests); pedestrian timing flake noted (passes solo); lint not yet in the gate.
- 2026-11-06, Level 2 (verification): commit `b45268c` ("Level 2 verification: ESLint, owner and ADR guards, acceptance criteria"). Gate: green (tsc, eslint, vitest, vite build as listed above).
- 2026-11-06, merged: branch `harness_transform` (commits `dcb63d5`, `b45268c`, `1bd3e4a`) merged into `dev` through PR #6 by the human; merge commit `49af302`. Gate on PR head `1bd3e4a`: CI green.

## Handoff

- Next step: none for this task. Follow-ups belong to new tasks (Level 4 and 5 work continues on `harness_transform`).
- Open questions: none.

## Review

Review: not independently reviewed. Work was done before the review gate existed; the lead ran `npm run check` only.
- Reviewer: none (no independent review)
- Diff range: not recorded (pre-review gate)
- Result: not reviewed (gate green at the recorded commits, which is not a review)
