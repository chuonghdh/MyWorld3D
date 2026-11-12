---
id: T-0033-dog-gait-phase
title: Dog gait angle accumulates per dog (no pop on start or stop)
status: done
owner: graphics-character
branch: task/T-0033-dog-gait-phase
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

- [x] A test steps a dog through trot, stop, trot and asserts the angle never jumps by more than omega * dt plus epsilon
- [x] `npm run check`; `node harness/scripts/verify.mjs` green; `npm run smoke` green
- [x] No per-frame allocation; every `src/` file stays under 350 lines; no guard weakened
- [x] Not verified, named: look by eye

## Checkpoints

- 2026-11-12: graphics-character done; verify.mjs failed twice on the known pedestrian timing test (first run concurrent with the reviewer, second under load: median 0.79 ms vs the 0.5 ms bound), passed solo and on the third verify run (exit 0); smoke ok (184 draw calls). Reviewer pass. Dog angle now accumulated on the CPU, keys dog-rig-v2 and dog-rig-depth-v2. Not seen by eye.

## Handoff

- Next step: the improve skill picks it by priority; the lead writes the brief and the claims.
- Open questions: none.

## Review

- Reviewer: reviewer (read-only subagent), diff range: working tree against 99cd871.
- Findings: pass, minor (no test for capacity overflow or a dog leaving and returning, safe by construction; step tolerance 1e-3 loose but adequate).
- Result: pass
