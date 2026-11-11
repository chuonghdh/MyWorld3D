---
id: T-0028-ped-gait-mechanics
title: Gait mechanics: pelvis sway, torso twist, ankle roll, head stabilisation
status: proposed
owner: graphics-character
branch: dev
created: 2026-11-11
priority: P2
type: feature
source: request
---

# T-0028: Gait mechanics: pelvis sway, torso twist, ankle roll, head stabilisation

## Spec

- Goal: The walk is thigh, knee, arm and elbow rotation plus a vertical bob. Add: pelvis yaw and side sway, shoulder counter-rotation, ankle flexion with heel strike and toe-off (feet stop sliding visually), head kept level against the bob. Amplitudes scale with speed and age group. Depends on T-0021.
- Source: user request 2026-11-11, pedestrian close-up quality.
- Files in scope: `src/traffic/people/rigShaderGlsl.ts`, `src/traffic/people/personShape.ts (foot pivot part ids if needed)`, `src/traffic/people/personParts.ts`, `src/config/tuning/trafficLife.ts`, `tests/people.test.ts`, `docs/TUNING.md`.
- Out of scope: Phase accumulation (T-0021 lands first); Idle (T-0027).

## Acceptance

- [ ] Planted foot speed relative to the ground stays near zero in a test of the pure gait math
- [ ] No limb self-intersection at peak swing for all four age groups (geometric test on joint positions)
- [ ] Vertex ALU cost measured against the T-0020 baseline
- [ ] `npm run check`; `npx vitest run tests/people.test.ts` (rerun the timing flake alone)
- [ ] `node harness/scripts/verify.mjs` green; `npm run smoke` green (draw calls and triangles within budget)
- [ ] Knobs only in `src/config/tuning/` with a parity entry and a `docs/TUNING.md` row; no new `Math.random` in layout; every `src/` file stays under 350 lines; no guard weakened
- [ ] Not verified, named: close-up look by eye on real hardware and frame time on real hardware (headless smoke cannot judge taste)

## Checkpoints

- 2026-11-11: recorded as proposed (pedestrian quality backlog). No work started.

## Handoff

- Next step: the improve skill picks it by priority and order; the lead writes the brief and the claims.
- Open questions: none.
