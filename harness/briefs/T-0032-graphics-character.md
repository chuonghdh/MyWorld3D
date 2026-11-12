# Brief: T-0032 (graphics-character)

- **Task id:** T-0032-ped-knee-seam-gap
- **Owner:** graphics-character
- **Reviewer:** reviewer (read-only subagent)
- **Goal:** no hollow or white wedge at the knee (or any other swinging joint) when a limb bends, in the far and the near models. Read the task record Spec: thigh and shin are open tubes ending at `kneeY` (`personShape.ts` leg loop; `personShapeNear.ts` leg loft with a 0.02 m overlap). The same open-end problem may exist at the elbow (arm / forearm, pivot `elbowY`) and the hip/shoulder: check them all with a geometric test, not only the knee.
- **Design (lead's, change with a reason):**
  - First write the geometric test that reproduces the gap: rotate the shin vertices about the knee pivot by the maximum knee angle the shader uses (`walk*amp*0.85*kneeK*max(0,ca)` with the largest `amp` and `kneeK`, plus the sitting angle 1.45 rad) and check that the open ring of the thigh bottom is covered (every ring vertex lies inside the swept shin, or a closing element covers it). Same for the elbow (`elbow` up to about 0.55*amp plus sit 0.6 and the chat/umbrella poses 0.9). The test must fail before the fix and pass after.
  - Preferred fix: a small ellipsoid or capped sphere at each knee and elbow belonging to the CHILD part (it rotates with the lower limb, e.g. shin part for the knee) and slightly larger than the tube radius, or capping the open ends with a disc of the lower limb's part; choose the cheapest that passes the test and looks right. No coplanar geometry, no equal-plane seams.
  - Vertex order stays independent of sex; far and near keep their separate triangle ranges (far 350 to 480, near 900 to 1400). The far model changes by decision: update the far checksums and counts in `tests/peopleNear.test.ts` with the new values and the reason in a comment; keep all four age groups equal if they are equal now.
  - Part ids, regions and pivots unchanged (shared materials must stay valid).
- **Verify by eye:** `npm run smoke:closeup` adult and elder at 3 m (day) before and after if you can, VIEW the PNGs, describe the knees and elbows. The closeup camera has placed a big object (a vehicle) in front of the subject in some shots: if a shot is blocked, move on to another subject or distance and say so. Iterate up to 3 times.
- **Files in scope:** `src/traffic/people/personShape.ts`, `src/traffic/people/personShapeNear.ts`, `src/traffic/people/personDims.ts`, `src/traffic/people/rigBuilder.ts` (only if a primitive is needed), `tests/people.test.ts`, `tests/peopleNear.test.ts`, a new `tests/peopleJoints.test.ts`, `docs/agents/graphics-character.md`, `harness/briefs/T-0032-graphics-character.md`.
- **Files out of scope:** shaders, gait values, walkers, dogs, config.
- **Claims:** graphics-character entry for T-0032 in harness/state/claims.json (active).
- **Acceptance commands:** `npx tsc --noEmit`; `npm run lint`; `npx vitest run tests/people.test.ts tests/peopleGait.test.ts tests/peopleLod.test.ts tests/peopleNear.test.ts tests/peopleJoints.test.ts tests/tuningParity.test.ts tests/traffic.determinism.test.ts tests/budget.test.ts tests/harness.test.ts`; `npx vite build`; `npm run smoke`; `npm run smoke:closeup` shots. Failures only. Do not run vitest in parallel with other long jobs.
- **Report format:** at most 12 lines: files changed (line counts), new triangle numbers per detail level, gate result (failures only), what you saw by eye, not verified.
- Handbook: append a dated section.
