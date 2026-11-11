---
id: T-0029-ped-turn-start-stop-smoothing
title: Smooth turns, starts and stops
status: proposed
owner: graphics-character
branch: dev
created: 2026-11-11
priority: P3
type: feature
source: request
---

# T-0029: Smooth turns, starts and stops

## Spec

- Goal: Heading turns at 7 rad/s (TURN_RATE, walkers/constants.ts), which reads as a snap. Give the render side a smoothed heading (head leads the body), a small lean into the turn, and a 0.3 s gait ramp (amplitude and swing ease in and out) on start and stop. Simulation heading and positions stay as they are; only render values change.
- Source: user request 2026-11-11, pedestrian close-up quality.
- Files in scope: `src/traffic/walkers/output.ts`, `src/traffic/walkers/resolve.ts`, `src/traffic/people/peopleMeshes.ts`, `src/traffic/people/rigShaderGlsl.ts`, `src/config/tuning/trafficWalkers.ts (visual turn rate, ramp time)`, `tests/`, `docs/TUNING.md`.
- Out of scope: Simulation turn rate and routes; Seeded hashes.

## Acceptance

- [ ] Traffic and layout hashes unchanged
- [ ] Render heading converges to the sim heading within a bounded time (test)
- [ ] No allocation per frame
- [ ] `npm run check`; `npx vitest run tests/people.test.ts` (rerun the timing flake alone)
- [ ] `node harness/scripts/verify.mjs` green; `npm run smoke` green (draw calls and triangles within budget)
- [ ] Knobs only in `src/config/tuning/` with a parity entry and a `docs/TUNING.md` row; no new `Math.random` in layout; every `src/` file stays under 350 lines; no guard weakened
- [ ] Not verified, named: close-up look by eye on real hardware and frame time on real hardware (headless smoke cannot judge taste)

## Checkpoints

- 2026-11-11: recorded as proposed (pedestrian quality backlog). No work started.

## Handoff

- Next step: the improve skill picks it by priority and order; the lead writes the brief and the claims.
- Open questions: none.
