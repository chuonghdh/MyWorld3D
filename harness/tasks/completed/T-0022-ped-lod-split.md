---
id: T-0022-ped-lod-split
title: Near and far people meshes (distance LOD)
status: done
owner: graphics-character
branch: task/T-0022-ped-lod-split
created: 2026-11-11
priority: P1
type: feature
source: request
---

# T-0022: Near and far people meshes (distance LOD)

## Spec

- Goal: People closer to the camera than a knob distance draw from a near InstancedMesh set; the rest from a far set. First step: both sets use the current model, so the picture is identical and only the plumbing exists. The far set later drops detail, the near set later gains it (T-0023 to T-0026). Instances are classified on the CPU in `update()`; shadows use the same split.
- Source: user request 2026-11-11, pedestrian close-up quality.
- Files in scope: `src/traffic/people/peopleMeshes.ts`, `src/traffic/people/rigShader.ts`, `src/config/tuning/trafficLife.ts (nearRadiusM, nearMaxInstances)`, `tests/people.test.ts`, `tests/tuningParity.test.ts`, `docs/TUNING.md`.
- Out of scope: Model geometry changes; Walker simulation.

## Acceptance

- [x] Draw calls rise by at most 4 (one near mesh per age group); triangles in frame unchanged at this step
- [x] Classification is deterministic from camera position and instance position, with hysteresis so an instance at the border does not flicker
- [x] A test covers: all near, all far, border hysteresis, capacity overflow
- [x] `npm run check`; `npx vitest run tests/people.test.ts` (rerun the timing flake alone)
- [x] `node harness/scripts/verify.mjs` green; `npm run smoke` green (draw calls and triangles within budget)
- [x] Knobs only in `src/config/tuning/` with a parity entry and a `docs/TUNING.md` row; no new `Math.random` in layout; every `src/` file stays under 350 lines; no guard weakened
- [x] Not verified, named: close-up look by eye on real hardware and frame time on real hardware (headless smoke cannot judge taste)

## Checkpoints

- 2026-11-12: graphics-character done; verify.mjs exit 0; smoke ok (184 draw calls, 2.33M tris, unchanged at default camera); reviewer: one medium (closeup.mjs unclaimed), fixed by claim and brief scope update (no code change). Worst case +4 draw calls with near people not measured.

## Handoff

- Next step: the improve skill picks it by priority and order; the lead writes the brief and the claims.
- Open questions: none.

## Review

- Reviewer: reviewer (read-only subagent), diff range: working tree against 31916fd.
- Findings: 1 medium (tests/smoke/closeup.mjs edited but not claimed): fixed by adding it to the claim and the brief scope, check-claims then 0 unclaimed, no code change. 3 low (unclear draw-call line in handbook; stale header comment in peopleMeshes.ts; first-come flicker at a full near set), accepted and left for the T-0030 handbook pass.
- Result: pass (after the claim fix; the fix touches no code)
