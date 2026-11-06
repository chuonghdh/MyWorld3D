---
id: T-0003-level4-closure
title: Close Level 4 gaps (claims, reviewer guard, independent review)
status: done
owner: Technical Architect (lead: Claude main session)
branch: harness_transform
created: 2026-11-07
---

# T-0003: Close Level 4 gaps

## Spec

- Goal: make Level 4 orchestration enforceable: a claim check before commit, a reviewer that differs from the owner, and one real change reviewed by an independent reviewer.
- Files in scope: `harness/scripts/check-claims.mjs`, `harness/workflows/WORKFLOW.md`, `harness/templates/brief.md`, `harness/state/README.md`, `harness/state/claims.json`, `tests/harness.test.ts` (T-0003 guards only), `harness/tasks/**`.
- Out of scope: feature code under `src/**`, `package.json`, `.claude/**`, commits and pushes (the human asks for them).

## Acceptance

- [x] `node harness/scripts/check-claims.mjs` run on the working tree: 13 changed files, 0 unclaimed, exit 0.
- [x] Guards: reviewer parse strict; reviewer differs from owner; done task with result "changes requested" rejected; claims.json parsed as JSON; globToRegExp unit-tested. `npx vitest run tests/harness.test.ts`: 29 of 29 pass.
- [x] `npm run check` green (see checkpoint for the run).
- Not verified: the pre-commit `--staged` check on a real commit (no commit made in this task).

## Checkpoints

- 2026-11-07, claims recorded in `harness/state/claims.json` for the architect and scene-qa owners; Level 4 pre-work claim recorded retroactively.
- 2026-11-07, architect and scene-qa changes applied in parallel on disjoint claims.
- 2026-11-07, independent review: changes requested (3 medium, 3 low); fixed; re-review: pass (see Review).

## Review

- Reviewer: independent-reviewer (a fresh agent, did not write the change)
- Diff range: working tree on `harness_transform` after `1bd3e4a` (files listed in Spec)
- Result: pass (second review after fixes; no open findings)

## Handoff

- Next step: the human commits Level 4 and T-0003 when asked. Then the pre-commit `--staged` check is run on the commit.
- Open questions: none.
