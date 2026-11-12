---
id: T-0034-ped-stride-foot-plant
title: Match stride to speed so stance feet stop sliding
status: proposed
owner: graphics-character
branch: dev
created: 2026-11-12
priority: P1
type: bug
source: request
---

# T-0034: Match stride to speed so stance feet stop sliding

## Spec

- Goal: the stance foot of a walking person stays planted on the ground (no visible foot slide) for all four age groups. Found in T-0028 (corrected metric in `docs/agents/graphics-character.md` and `tests/peopleGaitMech.test.ts`): the world-frame slip of the lowest sole point over the stance half cycle is about 0.69 of walking speed for adults (child 0.47, elder 0.63, teen 0.88). Root cause: the backward foot sweep over stance is `2 L sin(0.55 amp)` against a step length of `cycle / 2`: adult 0.99 m vs 0.75 m (33 percent long), teen 0.94 vs 0.61, elder 0.64 vs 0.50, child 0.58 vs 0.71 (18 percent short).
- Fix options (the owner picks with the numbers): (1) a thigh-only amplitude factor per age group (not `amp`, which also drives knees and arms; T-0028 estimated about 0.74 adult, 0.62 teen, 0.77 elder, 1.26 child) as a knob set in `src/config/tuning/trafficLife.ts`; (2) a flatter swing profile so the stance foot moves at near constant speed in the middle of stance (the sinusoid is fastest at mid-stance, so a gain alone leaves mean |slip| near 0.44 v); (3) decide whether the plantar roll gain from T-0028 stays. Target: mean |slip| over stance below 0.15 v for every age group at the walking speed, measured with the T-0028 pure TS metric (extend it, keep the TS mirror and GLSL in sync through `gaitMath.ts`).
- Also in scope (T-0028 review): the vertical bob is `abs(sin(a))`, which peaks when the legs are spread widest, the physical LOW point of the body, so the bob is in the wrong phase; correct it so the body is highest at midstance (legs together) and lowest at double support, and check the head stabilisation sign after the change.
- Side effects to check: stride length changes visibly (shorter steps for adults, teens and elders), cadence stays tied to speed (T-0021 phase), crossing and crowd feel; walking speed itself and routes are not changed (walkers untouched).
- Files in scope: `src/traffic/people/gaitMath.ts`, `src/traffic/people/rigShaderGlsl.ts`, `src/traffic/people/rigShader.ts` (cache keys, uniforms), `src/traffic/people/personGeometry.ts` (GAIT specs if the cycle length is the fix), `src/config/tuning/trafficLife.ts`, `tests/peopleGaitMech.test.ts`, `tests/tuningParity.test.ts`, `docs/TUNING.md`, `docs/agents/graphics-character.md`.
- Out of scope: walkers, walking speeds, geometry, fragment shading, dogs.

## Acceptance

- [ ] Mean |world slip| over stance below 0.15 x walking speed for adult, child, elder and teen (pure TS metric test, measured at 1.3 m/s)
- [ ] No limb self-intersection at the new swing; `tests/peopleJoints.test.ts` and `tests/peopleGaitMech.test.ts` pass
- [ ] `npm run check`; `node harness/scripts/verify.mjs` green; `npm run smoke` green
- [ ] Knobs only in `src/config/tuning/` with a parity entry and a `docs/TUNING.md` row; every `src/` file stays under 350 lines; no guard weakened
- [ ] Not verified, named: walking motion by eye over time on real hardware

## Checkpoints

- 2026-11-12: recorded as proposed from the T-0028 finding. No work started.

## Handoff

- Next step: deliver right after T-0028 (before T-0029): it is the biggest realism gap left in the walk.
- Open questions: none.
