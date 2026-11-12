---
id: T-0033-dog-gait-phase
title: Dog gait angle accumulates per dog (no pop on start or stop)
status: proposed
owner: graphics-character
branch: dev
created: 2026-11-12
priority: P3
type: bug
source: request
---

# T-0033: Dog gait angle accumulates per dog (no pop on start or stop)

## Spec

- Goal: the dog trot angle is continuous. `DOG_DECL` computes `a = uTime * aDog.x + aDog.y` (omega in `aDog.x`), the same defect T-0021 fixed for people. Reuse `GaitPhase` (`src/traffic/people/gaitPhase.ts`) keyed by the walker id that owns the dog.
- Source: T-0021 finding, 2026-11-12.
- Files in scope: `src/traffic/people/peopleMeshes.ts`, `src/traffic/people/rigShaderGlsl.ts` (DOG_DECL), `src/traffic/people/rigShader.ts` (dog cache keys), `tests/peopleGait.test.ts`, `docs/agents/graphics-character.md`.
- Out of scope: people gait, dog geometry, walkers.

## Acceptance

- [ ] A test steps a dog through trot, stop, trot and asserts the angle never jumps by more than omega * dt plus epsilon
- [ ] `npm run check`; `node harness/scripts/verify.mjs` green; `npm run smoke` green
- [ ] No per-frame allocation; every `src/` file stays under 350 lines; no guard weakened
- [ ] Not verified, named: look by eye

## Checkpoints

- 2026-11-12: recorded as proposed from the T-0021 report. No work started.

## Handoff

- Next step: the improve skill picks it by priority; the lead writes the brief and the claims.
- Open questions: none.
