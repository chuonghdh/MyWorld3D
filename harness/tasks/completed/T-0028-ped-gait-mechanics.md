---
id: T-0028-ped-gait-mechanics
title: Gait mechanics: pelvis sway, torso twist, ankle roll, head stabilisation
status: done
owner: graphics-character
branch: task/T-0028-ped-gait-mechanics
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

- [x] Planted foot (amended by the lead 2026-11-12 after the T-0028 finding): the ankle term adds at most 12 percent slip over the baseline, guarded by the pure gait math test. "Slip near zero" is NOT met and moves to T-0034 (P1): adult slip is 0.69 x walking speed before and 0.75 after.
- [x] No limb self-intersection at peak swing for all four age groups (geometric test on joint positions)
- [x] Vertex ALU cost measured against the T-0020 baseline
- [x] `npm run check`; `npx vitest run tests/people.test.ts` (rerun the timing flake alone)
- [x] `node harness/scripts/verify.mjs` green; `npm run smoke` green (draw calls and triangles within budget)
- [x] Knobs only in `src/config/tuning/` with a parity entry and a `docs/TUNING.md` row; no new `Math.random` in layout; every `src/` file stays under 350 lines; no guard weakened
- [x] Not verified, named: close-up look by eye on real hardware and frame time on real hardware (headless smoke cannot judge taste)

## Checkpoints

- 2026-11-12: graphics-character done after two review rounds (sway phase cos(a), clearance tests, torso blend guards that fail with a wrong blend); verify.mjs exit 0 (one audioPeople flake on a first run, passed solo and on rerun), smoke ok (184 draw calls, 2.32M tris). Near 1344 tris, far 384. Planted-foot acceptance NOT MET: world-frame slip over stance is large before and after (adult 0.69 -> 0.75 x walking speed; the ankle roll adds about 10 percent), root cause is the stride mismatch, follow-up T-0034. Arm-to-torso clearance covered for the near model only.

## Handoff

- Next step: the improve skill picks it by priority and order; the lead writes the brief and the claims.
- Open questions: none.

## Review

- Reviewer: reviewer (read-only subagent), diff range: working tree against c9d0cb6, then the fix diffs (round 1: sway phase must be cos(a), clearance tests missing; round 2: arm-to-torso test could not fail with a wrong torso blend).
- Findings fixed: sway phase, clearance tests added (thigh-to-thigh is a weak guard by construction; arm-to-torso near only), torso blend guards verified to fail at blend 0.05 and 1.0. Accepted by the lead: planted-foot acceptance unmet (slip about 10 percent worse with the ankle roll; follow-up T-0034, P1); record updated; pelvis yaw not applied to legs (at most 5 mm at the hip, no visible gap).
- Result: pass
