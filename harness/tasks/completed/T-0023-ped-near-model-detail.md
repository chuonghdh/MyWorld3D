---
id: T-0023-ped-near-model-detail
title: High-detail near body model
status: done
owner: graphics-character
branch: task/T-0023-ped-near-model-detail
created: 2026-11-11
priority: P1
type: feature
source: request
---

# T-0023: High-detail near body model

## Spec

- Goal: The near mesh gets a smoother body: 8-sided limbs with smooth normals, a rounder torso with shoulders, a neck, a 12x8 head, block hands with a thumb and shaped shoes. Budget per person 900-1400 triangles for the near mesh only. The far mesh stays exactly as it is (decision in the brief: same triangles, same checksum). Procedural geometry only: no skeleton, no imported meshes.
- Source: user request 2026-11-11, pedestrian close-up quality.
- Files in scope: `src/traffic/people/personShape.ts (a detail parameter)`, `src/traffic/people/peopleSets.ts`, `src/traffic/people/peopleMeshes.ts`, `src/traffic/people/rigBuilder.ts`, `src/traffic/people/personGeometry.ts`, `tests/people.test.ts`, `src/traffic/people/personDims.ts`, `personShapeNear.ts`, `tests/peopleNear.test.ts`, `tests/peopleLod.test.ts`.
- Out of scope: Shader surface work (T-0024 to T-0026); Vertex order must stay independent of sex (morph attributes).

## Acceptance

- [x] Near and far triangle ranges asserted per age group in tests/people.test.ts (ranges documented in the file header)
- [x] Male and female shapes keep equal vertex counts per detail level
- [x] No coplanar geometry; seams hidden by overlap, not by equal planes
- [x] Baseline from T-0020 compared: triangles in frame at the default camera rise by at most a documented amount, because the near set is capped
- [x] `npm run check`; `npx vitest run tests/people.test.ts` (rerun the timing flake alone)
- [x] `node harness/scripts/verify.mjs` green; `npm run smoke` green (draw calls and triangles within budget)
- [x] Knobs only in `src/config/tuning/` with a parity entry and a `docs/TUNING.md` row; no new `Math.random` in layout; every `src/` file stays under 350 lines; no guard weakened
- [x] Not verified, named: close-up look by eye on real hardware and frame time on real hardware (headless smoke cannot judge taste)

## Checkpoints

- 2026-11-12: graphics-character done; verify.mjs exit 0; smoke ok (184 draw calls, 2.33M tris at default camera); reviewer pass. Near 1312 tris per person, far 376 unchanged. Worst case near full: about +479k tris (main + shadow). Not run: full smoke:closeup sweep, draw calls with near people.

## Handoff

- Next step: the improve skill picks it by priority and order; the lead writes the brief and the claims.
- Open questions: none.

## Review

- Reviewer: reviewer (read-only subagent), diff range: working tree against aeb0936.
- Findings: 6 low (stale Spec text and file list fixed here; cosmetic comment and blank-line nits; near face quads proud of the head by a few mm until T-0024). Far checksums rebuilt independently from HEAD: equal.
- Result: pass (conditional on tsc, lint, build, smoke: run by the lead, all green via verify.mjs and npm run smoke)
