---
id: T-0021-ped-gait-phase-continuity
title: Gait phase accumulates per walker (no pop on start, stop or speed change)
status: proposed
owner: graphics-character
branch: dev
created: 2026-11-11
priority: P1
type: bug
source: request
---

# T-0021: Gait phase accumulates per walker (no pop on start, stop or speed change)

## Spec

- Goal: The shader computes the swing angle as `uTime * omega + phase` (rigShaderGlsl.ts `applyRig`; omega written in peopleMeshes.ts `g[o4]`). When omega changes (stop, start, rain speedMul) the angle jumps by `uTime * delta omega`, so legs and arms pop at every curb stop. The phase must be integrated on the CPU per walker (phase += omega * dt) and sent as the angle, so motion is continuous.
- Source: user request 2026-11-11, pedestrian close-up quality.
- Files in scope: `src/traffic/people/peopleMeshes.ts`, `src/traffic/people/rigShaderGlsl.ts`, `src/traffic/walkers/** (a phase array, no allocation per frame)`, `tests/people.test.ts`.
- Out of scope: Walker routes, speeds, hashes (tests/traffic.determinism.test.ts unchanged); Dogs (separate task if the same defect shows).

## Acceptance

- [ ] A test steps a walker through walk, stop, walk and a speed change and asserts the swing angle never jumps by more than omega * dt plus a small epsilon
- [ ] Seeded layout and traffic hashes unchanged
- [ ] Per-frame allocation stays zero (existing allocation test)
- [ ] `npm run check`; `npx vitest run tests/people.test.ts` (rerun the timing flake alone)
- [ ] `node harness/scripts/verify.mjs` green; `npm run smoke` green (draw calls and triangles within budget)
- [ ] Knobs only in `src/config/tuning/` with a parity entry and a `docs/TUNING.md` row; no new `Math.random` in layout; every `src/` file stays under 350 lines; no guard weakened
- [ ] Not verified, named: close-up look by eye on real hardware and frame time on real hardware (headless smoke cannot judge taste)

## Checkpoints

- 2026-11-11: recorded as proposed (pedestrian quality backlog). No work started.

## Handoff

- Next step: the improve skill picks it by priority and order; the lead writes the brief and the claims.
- Open questions: none.
