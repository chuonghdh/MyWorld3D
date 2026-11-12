# Brief: T-0033 (graphics-character)

- **Task id:** T-0033-dog-gait-phase
- **Owner:** graphics-character
- **Reviewer:** reviewer (read-only subagent)
- **Goal:** the dog trot angle is continuous. `DOG_DECL` (rigShaderGlsl.ts) computes `a = uTime * aDog.x + aDog.y` with omega in `aDog.x`, so any omega change (the dog stops or starts) jumps the angle by `uTime * delta omega`: the same defect T-0021 fixed for people. Fix as in T-0021: integrate the angle on the CPU with `GaitPhase` (`src/traffic/people/gaitPhase.ts`), keyed by the id of the walker that owns the dog (a dog has no id of its own: check `DogRender` in `src/traffic/walkers/types.ts`; if it has none, key by `ped.id` and note that a walker has at most one dog), send the angle in `aDog.x` and make the shader use `a = aDog.x + aDog.y`. Update comments that call `aDog.x` omega, bump the dog shader cache keys (`dog-rig-v1`, `dog-rig-depth-v1`).
- **Also check, same defect class:** the dog's tail wag and nod already use `uTime` only (fine). Do not change dog geometry or gait amplitudes.
- **Files in scope:** `src/traffic/people/peopleMeshes.ts`, `src/traffic/people/peopleSets.ts` (if dog writing lives there), `src/traffic/people/rigShaderGlsl.ts` (DOG_DECL), `src/traffic/people/rigShader.ts` (dog cache keys, header), `tests/peopleGait.test.ts`, `tests/people.test.ts` (only if it pins the old dog attribute meaning), `tests/peopleLod.test.ts` (if it pins dog keys), `docs/agents/graphics-character.md`, `harness/briefs/T-0033-graphics-character.md`.
- **Files out of scope:** walkers, people gait, dog geometry, config (no knob).
- **Claims:** graphics-character entry for T-0033 in harness/state/claims.json (active).
- **Test:** a pure test (in `tests/peopleGait.test.ts`) steps a dog through trot, stop, trot with a speed change and asserts the angle never jumps by more than omega * dt plus epsilon, as for people; no per-frame allocation. The determinism hash test changes only if the dog matrices are hashed with `aDog`: report if it fails; do NOT edit it without asking the lead.
- **Acceptance commands:** `npx tsc --noEmit`; `npm run lint`; `npx vitest run tests/people.test.ts tests/peopleGait.test.ts tests/peopleLod.test.ts tests/traffic.determinism.test.ts tests/budget.test.ts tests/harness.test.ts`; `npx vite build`; `npm run smoke` after your final change. Failures only. One vitest run at a time.
- **Report format:** at most 8 lines: files changed (line counts), gate result (failures only), what you saw by eye if anything, not verified.
- Handbook: append a short dated section.
