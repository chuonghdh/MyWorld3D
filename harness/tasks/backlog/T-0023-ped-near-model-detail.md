---
id: T-0023-ped-near-model-detail
title: High-detail near body model
status: proposed
owner: graphics-character
branch: dev
created: 2026-11-11
priority: P1
type: feature
source: request
---

# T-0023: High-detail near body model

## Spec

- Goal: The near mesh gets a smoother body: 8-sided limbs with smooth normals, a rounder torso with shoulders, a neck, a 12x8 head, block hands with a thumb and shaped shoes. Budget per person 900-1400 triangles for the near mesh only. The far mesh drops style parts it never shows and stays at or below the current count. Procedural geometry only: no skeleton, no imported meshes.
- Source: user request 2026-11-11, pedestrian close-up quality.
- Files in scope: `src/traffic/people/personShape.ts (a detail parameter)`, `src/traffic/people/rigBuilder.ts`, `src/traffic/people/personGeometry.ts`, `tests/people.test.ts`.
- Out of scope: Shader surface work (T-0024 to T-0026); Vertex order must stay independent of sex (morph attributes).

## Acceptance

- [ ] Near and far triangle ranges asserted per age group in tests/people.test.ts (ranges documented in the file header)
- [ ] Male and female shapes keep equal vertex counts per detail level
- [ ] No coplanar geometry; seams hidden by overlap, not by equal planes
- [ ] Baseline from T-0020 compared: triangles in frame at the default camera rise by at most a documented amount, because the near set is capped
- [ ] `npm run check`; `npx vitest run tests/people.test.ts` (rerun the timing flake alone)
- [ ] `node harness/scripts/verify.mjs` green; `npm run smoke` green (draw calls and triangles within budget)
- [ ] Knobs only in `src/config/tuning/` with a parity entry and a `docs/TUNING.md` row; no new `Math.random` in layout; every `src/` file stays under 350 lines; no guard weakened
- [ ] Not verified, named: close-up look by eye on real hardware and frame time on real hardware (headless smoke cannot judge taste)

## Checkpoints

- 2026-11-11: recorded as proposed (pedestrian quality backlog). No work started.

## Handoff

- Next step: the improve skill picks it by priority and order; the lead writes the brief and the claims.
- Open questions: none.
