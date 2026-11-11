---
id: T-0018-css-size-guard
title: Guard the size of panel CSS files
status: proposed
owner: scene-qa
branch: dev
created: 2026-11-11
priority: P3
type: config_toolchain
---

# T-0018: Guard the size of panel CSS files

## Spec

- Goal: CSS size is not guarded (`harness/README.md`, known gaps). The panel styles were split into `src/ui/panels/`; the largest file is 315 lines. Add a ratchet for .css files under src/ with the same 350-line limit, so the split does not regress.
- Source: `harness/README.md`, known gaps.
- Owner: Scene & QA (owns `tests/harness.test.ts`). UI & Camera owns the CSS and splits a file if the guard finds one over the limit.
- Files in scope: `tests/harness.test.ts` (new check next to the file size ratchet), `harness/README.md` (guard table, known gaps), `CLAUDE.md` (the 350-line rule names CSS).
- Out of scope: CSS content.

## Acceptance

- [ ] `npm run check`
- [ ] The guard fails on a synthetic 351-line CSS file (shown once, then reverted)
- [ ] Human check: none

## Checkpoints

- 2026-11-11: recorded as proposed by the architect (T-0009 backlog seed). No work started.

## Handoff

- Next step: the improve skill picks it by priority; the lead writes the brief and the claims.
- Open questions: none.
