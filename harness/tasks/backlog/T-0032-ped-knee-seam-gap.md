---
id: T-0032-ped-knee-seam-gap
title: Close the open seam at the knee (far and near models)
status: proposed
owner: graphics-character
branch: dev
created: 2026-11-12
priority: P2
type: bug
source: request
---

# T-0032: Close the open seam at the knee (far and near models)

## Spec

- Goal: no white or hollow wedge shows at the knee when the shin swings back. Found in the T-0025 review (rain close-up of an elder, visible in `rain-elder-3m.png`). Cause: thigh and shin are open tubes that end at `kneeY` with no overlap (`personShape.ts` leg loop; `personShapeNear.ts` leg loft with a 0.02 m overlap that is smaller than the opened wedge once the knee bends). Fix by capping the open ends, adding a knee ellipsoid, or letting the shin run higher into the thigh. Triangle counts must stay equal across the four age groups; the far checksum guard in `tests/peopleNear.test.ts` changes only with a recorded reason (the far model changes here by decision: record the new numbers).
- Source: T-0025 review finding, 2026-11-12.
- Files in scope: `src/traffic/people/personShape.ts`, `src/traffic/people/personShapeNear.ts`, `src/traffic/people/personDims.ts`, `tests/people.test.ts`, `tests/peopleNear.test.ts`, `docs/agents/graphics-character.md`.
- Out of scope: shaders, gait values, walkers.

## Acceptance

- [ ] Close-up PNGs of an elder and an adult at 3 m (day) show no gap at either knee during the swing (viewed by eye; a geometric test checks the knee joint stays covered at the maximum knee angle)
- [ ] Far triangle range 350 to 480 and near range 900 to 1400 still hold; new far checksums recorded with the reason
- [ ] `npm run check`; `node harness/scripts/verify.mjs` green; `npm run smoke` green
- [ ] No coplanar geometry; every `src/` file stays under 350 lines; no guard weakened
- [ ] Not verified, named: look on real hardware

## Checkpoints

- 2026-11-12: recorded as proposed from the T-0025 review. No work started.

## Handoff

- Next step: the improve skill picks it by priority; the lead writes the brief and the claims.
- Open questions: none.
