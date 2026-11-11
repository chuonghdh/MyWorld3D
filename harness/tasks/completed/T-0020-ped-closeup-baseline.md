---
id: T-0020-ped-closeup-baseline
title: Pedestrian close-up capture and perf baseline
status: done
owner: scene-qa
branch: task/T-0020-ped-closeup-baseline
created: 2026-11-11
priority: P1
type: feature
source: request
---

# T-0020: Pedestrian close-up capture and perf baseline

## Spec

- Goal: A headless close-up capture of walkers (day, night, rain) plus recorded baseline numbers (triangles per person, draw calls, vertices run in the vertex shader, shadow-pass cost). Every later task compares against it. The built-in pane cannot paint frames, so the evidence must come from headless Chromium.
- Source: user request 2026-11-11, pedestrian close-up quality.
- Files in scope: `tests/smoke/**`, `package.json (script only, no new dependency)`, `docs/agents/graphics-character.md (baseline table)`.
- Out of scope: src/** behaviour; budget limits in tests/budget.test.ts.

## Acceptance

- [x] `npm run smoke:closeup` (separate script; `npm run smoke` unchanged) can save close-up PNGs of an adult, child, elder, teen and a dog at 3 m, 8 m and 25 m (camera set through the app UI or an init script, no src hook)
- [x] Baseline table in `docs/agents/graphics-character.md`: triangles per person by age group, instances, draw calls, triangles in frame at the default camera
- [x] `npm run check`; `npx vitest run tests/people.test.ts` (rerun the timing flake alone)
- [x] `node harness/scripts/verify.mjs` green; `npm run smoke` green (draw calls and triangles within budget)
- [x] Knobs only in `src/config/tuning/` with a parity entry and a `docs/TUNING.md` row; no new `Math.random` in layout; every `src/` file stays under 350 lines; no guard weakened
- [x] Not verified, named: close-up look by eye on real hardware and frame time on real hardware (headless smoke cannot judge taste)

## Checkpoints

- 2026-11-12: scene-qa done; verify.mjs exit 0; smoke ok (184 draw calls, 2.33M tris); reviewer pass. Baseline: 376 tris per person, people = 11.8% of frame tris. 4 of 40 shots near-flat (rerun later).

## Handoff

- Next step: the improve skill picks it by priority and order; the lead writes the brief and the claims.
- Open questions: none.

## Review

- Reviewer: reviewer (read-only subagent), diff range: working tree against a815d23.
- Findings: 4 low (record wording fixed here; 4 near-flat shots noted in the handbook; closeup does not fail on flat shots, acceptable for a baseline tool).
- Result: pass
