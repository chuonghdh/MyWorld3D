---
id: T-0029-ped-turn-start-stop-smoothing
title: Smooth turns, starts and stops
status: done
owner: graphics-character
branch: task/T-0029-ped-turn-start-stop-smoothing
created: 2026-11-11
priority: P3
type: feature
source: request
---

# T-0029: Smooth turns, starts and stops

## Spec

- Goal: Heading turns at 7 rad/s (TURN_RATE, walkers/constants.ts), which reads as a snap. Give the render side a smoothed heading (head leads the body), a small lean into the turn, and a 0.3 s gait ramp (amplitude and swing ease in and out) on start and stop. Simulation heading and positions stay as they are; only render values change.
- Source: user request 2026-11-11, pedestrian close-up quality.
- Files in scope: `src/traffic/people/peopleMeshes.ts`, `src/traffic/people/rigShaderGlsl.ts`, `src/config/tuning/trafficLife.ts` (walkTurnRateRad, walkRampS, walkLeanRad), `tests/`, `docs/TUNING.md`.
- Out of scope: Simulation turn rate and routes; Seeded hashes.

## Acceptance

- [x] Traffic and layout hashes unchanged (AMENDED by the lead 2026-11-12: the pedestrian render hash changes by design because it hashes the render heading; recorded in the test with the reason; vehicle and buffer hashes unchanged)
- [x] Render heading converges to the sim heading within a bounded time (test)
- [x] No allocation per frame
- [x] `npm run check`; `npx vitest run tests/people.test.ts` (rerun the timing flake alone)
- [x] `node harness/scripts/verify.mjs` green; `npm run smoke` green (draw calls and triangles within budget)
- [x] Knobs only in `src/config/tuning/` with a parity entry and a `docs/TUNING.md` row; no new `Math.random` in layout; every `src/` file stays under 350 lines; no guard weakened
- [x] Not verified, named: close-up look by eye on real hardware and frame time on real hardware (headless smoke cannot judge taste)

## Checkpoints

- 2026-11-12: graphics-character done; verify.mjs exit 0, smoke ok (184 draw calls, 2.35M tris); reviewer pass. Render heading smoothed (walkTurnRateRad 3), lean and head lead, gait ramp 0.3 s. Pedestrian determinism hash re-captured 63333cfb -> 3ea1075e on purpose (the test hashes meshes.bodies matrices that carry the heading; the agent reports that with the knob at 1000 the old hash is reproduced; I did not run that check myself). Not seen: a turning walker, lean, head lead, ramp.

## Handoff

- Next step: the improve skill picks it by priority and order; the lead writes the brief and the claims.
- Open questions: none.

## Review

- Reviewer: reviewer (read-only subagent), diff range: working tree against 739ecf3.
- Findings: pass, 3 minor (leash hand follows the sim heading while the body uses the smoothed one: a few cm for under a second in a sharp turn, cosmetic, known limit; slot collision risk same as GaitPhase; record bookkeeping done here). The lead did not run the "knob at 1000 reproduces the old hash" check.
- Result: pass
