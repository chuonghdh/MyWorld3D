---
id: T-0027-ped-idle-micro-animation
title: Idle micro-animation: breathing, weight shift, glances
status: done
owner: graphics-character
branch: task/T-0027-ped-idle-micro-animation
created: 2026-11-11
priority: P2
type: feature
source: request
---

# T-0027: Idle micro-animation: breathing, weight shift, glances

## Spec

- Goal: Standing people (waiting at the curb, looking at a shop window) are frozen mannequins now. Add in the vertex shader, zero CPU: chest breathing, slow weight shift between legs, small head glances and arm settling, each offset by the instance phase. Seated and chatting poses get breathing too.
- Source: user request 2026-11-11, pedestrian close-up quality.
- Files in scope: `src/traffic/people/rigShaderGlsl.ts`, `src/config/tuning/trafficLife.ts (idle amplitudes)`, `tests/people.test.ts`, `docs/TUNING.md`.
- Out of scope: Walk cycle; Walker AI.

## Acceptance

- [x] A pure-math mirror of the idle terms is unit tested for bounded amplitude (feet stay on the ground, no limb penetration beyond the body)
- [x] Two people at the same spot do not move in sync (phase based)
- [x] Depth material applies the same terms so shadows match
- [x] `npm run check`; `npx vitest run tests/people.test.ts` (rerun the timing flake alone)
- [x] `node harness/scripts/verify.mjs` green; `npm run smoke` green (draw calls and triangles within budget)
- [x] Knobs only in `src/config/tuning/` with a parity entry and a `docs/TUNING.md` row; no new `Math.random` in layout; every `src/` file stays under 350 lines; no guard weakened
- [x] Not verified, named: close-up look by eye on real hardware and frame time on real hardware (headless smoke cannot judge taste)

## Checkpoints

- 2026-11-11: recorded as proposed (pedestrian quality backlog). No work started.

## Handoff

- Next step: the improve skill picks it by priority and order; the lead writes the brief and the claims.
- Open questions: none.

## Review

- Reviewer: reviewer (read-only subagent), diff range: working tree against 433dbad, then the fix diff (weight-shift sign).
- Findings: 1 minor change requested (weight-shift direction inverted: fixed, asymmetric test added, re-reviewed pass). Nits: float32 vs float64 hash in the TS mirror, thigh tops stay while the pelvis shifts a few mm, ALU numbers are estimates. The test checks the TS mirror only; GLSL confirmed by reading and by smoke compile.
- Result: pass
