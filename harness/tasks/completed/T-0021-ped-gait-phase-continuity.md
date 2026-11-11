---
id: T-0021-ped-gait-phase-continuity
title: Gait phase accumulates per walker (no pop on start, stop or speed change)
status: done
owner: graphics-character
branch: task/T-0021-ped-gait-phase-continuity
created: 2026-11-11
priority: P1
type: bug
source: request
---

# T-0021: Gait phase accumulates per walker (no pop on start, stop or speed change)

## Spec

- Goal: The shader computes the swing angle as `uTime * omega + phase` (rigShaderGlsl.ts `applyRig`; omega written in peopleMeshes.ts `g[o4]`). When omega changes (stop, start, rain speedMul) the angle jumps by `uTime * delta omega`, so legs and arms pop at every curb stop. The phase must be integrated on the CPU per walker (phase += omega * dt) and sent as the angle, so motion is continuous.
- Source: user request 2026-11-11, pedestrian close-up quality.
- Files in scope: `src/traffic/people/peopleMeshes.ts`, `src/traffic/people/rigShaderGlsl.ts`, `src/traffic/people/` accumulator helper (CPU angle in peopleMeshes, no walkers change)`, `tests/people.test.ts`.
- Out of scope: Walker routes, speeds, hashes (tests/traffic.determinism.test.ts unchanged); Dogs (separate task if the same defect shows).

## Acceptance

- [x] A test steps a walker through walk, stop, walk and a speed change and asserts the swing angle never jumps by more than omega * dt plus a small epsilon
- [x] Seeded layout and traffic hashes unchanged
- [x] Per-frame allocation stays zero (existing allocation test)
- [x] `npm run check`; `npx vitest run tests/people.test.ts` (rerun the timing flake alone)
- [x] `node harness/scripts/verify.mjs` green; `npm run smoke` green (draw calls and triangles within budget)
- [x] Knobs only in `src/config/tuning/` with a parity entry and a `docs/TUNING.md` row; no new `Math.random` in layout; every `src/` file stays under 350 lines; no guard weakened
- [x] Not verified, named: close-up look by eye on real hardware and frame time on real hardware (headless smoke cannot judge taste)

## Checkpoints

- 2026-11-12: graphics-character done; verify.mjs exit 0; smoke ok (184 draw calls, 2.33M tris); reviewer pass. Dog gait has the same defect (not fixed, follow-up).

## Handoff

- Next step: the improve skill picks it by priority and order; the lead writes the brief and the claims.
- Open questions: none.

## Review

- Reviewer: reviewer (read-only subagent), diff range: working tree against c12ddea.
- Findings: 4 low (misleading test expression, id % slots collision hazard undocumented but impossible today, dog gait not fixed per brief, double update call is a pause). Accepted.
- Result: pass
