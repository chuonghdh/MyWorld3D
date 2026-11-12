---
id: T-0030-ped-integration-final
title: Integration, perf comparison and handbook
status: done
owner: graphics-character
branch: task/T-0030-ped-integration-final
created: 2026-11-11
priority: P3
type: docs
source: request
---

# T-0030: Integration, perf comparison and handbook

## Spec

- Goal: Final pass after T-0020 to T-0034: consolidate the people handbook with a before/after table from existing measurements, fix stale people file headers, and list what was never verified by eye.
- Human decision 2026-11-12: the scene-qa sweep and fresh perf measurement were stopped; the human checks the look by eye. The close-up sweep, the 3 m frame cost and the final `npm run smoke` numbers are NOT part of this task.
- Source: user request 2026-11-11, pedestrian close-up quality.
- Files in scope: `docs/agents/graphics-character.md`, `docs/REPO_MAP.md`, `docs/TUNING.md`, `src/traffic/people/**` (comments only), `tests/people*.test.ts` (small guards).
- Out of scope: Behaviour changes.

## Acceptance

- [x] Before and after table (baseline vs final, from existing measurements; unmeasured cells say "not measured") in the handbook
- [x] `npm run check` green
- [x] Open items list the by-eye checks still owed to the human
- [x] `node harness/scripts/verify.mjs` green
- [x] Knobs only in `src/config/tuning/` with a parity entry and a `docs/TUNING.md` row; no new `Math.random` in layout; every `src/` file stays under 350 lines; no guard weakened
- [x] Not verified, named: close-up look by eye, motion over time, frame time on real hardware, final-build smoke counts with near people

## Checkpoints

- 2026-11-11: recorded as proposed (pedestrian quality backlog). No work started.

- 2026-11-12: done. verify.mjs failed once on the known audioPeople step-rate timing test, passed solo (15/15); no audio code touched. Reviewer pass. Sweep and fresh perf runs dropped by the human (checks by eye).
- 2026-11-12: in_progress. Scene-qa part stopped by the human; graphics-character does the handbook and comments.

## Handoff

- Next step: the improve skill picks it by priority and order; the lead writes the brief and the claims.
- Open questions: none.

## Review

- Reviewer: reviewer (read-only subagent), diff range: working tree against 728aadd.
- Findings: pass, low only (skin test copies the shader warm-edge formula so a shader-only change would not fail it; two table cells are derived, labelled not measured).
- Result: pass
