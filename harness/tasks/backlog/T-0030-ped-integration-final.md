---
id: T-0030-ped-integration-final
title: Integration, perf comparison and handbook
status: proposed
owner: scene-qa
branch: dev
created: 2026-11-11
priority: P3
type: docs
source: request
---

# T-0030: Integration, perf comparison and handbook

## Spec

- Goal: Final pass after T-0020 to T-0029: re-run the close-up capture, compare triangles, draw calls and shader cost with the T-0020 baseline, check all age groups, sexes, seasons, rain and night, update docs/agents/traffic-life.md, docs/REPO_MAP.md and the people file headers, and list what was never verified by eye.
- Source: user request 2026-11-11, pedestrian close-up quality.
- Files in scope: `docs/agents/traffic-life.md`, `docs/REPO_MAP.md`, `docs/TUNING.md`, `tests/people.test.ts (budget ranges only if earlier tasks left them out)`.
- Out of scope: Behaviour changes.

## Acceptance

- [ ] Before and after table (baseline vs final) in the handbook
- [ ] Full `npm run check` and `npm run smoke` green on dev
- [ ] Open items list the by-eye checks still owed to the human
- [ ] `npm run check`; `npx vitest run tests/people.test.ts` (rerun the timing flake alone)
- [ ] `node harness/scripts/verify.mjs` green; `npm run smoke` green (draw calls and triangles within budget)
- [ ] Knobs only in `src/config/tuning/` with a parity entry and a `docs/TUNING.md` row; no new `Math.random` in layout; every `src/` file stays under 350 lines; no guard weakened
- [ ] Not verified, named: close-up look by eye on real hardware and frame time on real hardware (headless smoke cannot judge taste)

## Checkpoints

- 2026-11-11: recorded as proposed (pedestrian quality backlog). No work started.

## Handoff

- Next step: the improve skill picks it by priority and order; the lead writes the brief and the claims.
- Open questions: none.
