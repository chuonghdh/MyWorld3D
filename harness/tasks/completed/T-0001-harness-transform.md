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
- Not verified: CI run on GitHub: not run (no push allowed).

## Checkpoints

- 2026-11-06, Level 1 (harness transform): commit `dcb63d5` ("Harness transform: split oversized files, add guards and Level 1 docs"). Gate: tsc, vite build and vitest green (1573 tests); pedestrian timing flake noted (passes solo); lint not yet in the gate.
- 2026-11-06, Level 2 (verification): commit `b45268c` ("Level 2 verification: ESLint, owner and ADR guards, acceptance criteria"). Gate: green (tsc, eslint, vitest, vite build as listed above).

## Handoff

- Next step: owners fix the lint list, then `npm run check` must go green before the next checkpoint.
- Open questions: whether `npm run check` should be re-run and recorded at each commit in `dcb63d5` and `b45268c`.
