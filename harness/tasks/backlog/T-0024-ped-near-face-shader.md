---
id: T-0024-ped-near-face-shader
title: Procedural face in the fragment shader (near)
status: proposed
owner: graphics-character
branch: dev
created: 2026-11-11
priority: P2
type: feature
source: request
---

# T-0024: Procedural face in the fragment shader (near)

## Spec

- Goal: Replace the near mesh flat eye, brow, mouth and moustache quads (offsets of 0.004 to 0.012 m in front of the head: near-coplanar, can z-fight at range) with a face drawn in the fragment shader from head-local coordinates: eye white, iris, pupil highlight, lid, brow, nostril shadow, lips. Blink and a slow gaze drift come from uTime and the instance phase. No texture, no extra draw call. The far mesh keeps cheap quads or none.
- Source: user request 2026-11-11, pedestrian close-up quality.
- Files in scope: `src/traffic/people/rigShader.ts`, `src/traffic/people/rigShaderGlsl.ts`, `src/traffic/people/personShape.ts`, `src/config/tuning/trafficLife.ts (blink interval)`, `tests/people.test.ts`, `tests/tuningParity.test.ts`, `docs/TUNING.md`.
- Out of scope: Hair and skin shading (T-0026).

## Acceptance

- [ ] No face quad in the near geometry; face visible from the front, never through the back of the head
- [ ] Blink period and phase are per instance and deterministic from the walker phase
- [ ] Shader compiles in the smoke (no console error)
- [ ] `npm run check`; `npx vitest run tests/people.test.ts` (rerun the timing flake alone)
- [ ] `node harness/scripts/verify.mjs` green; `npm run smoke` green (draw calls and triangles within budget)
- [ ] Knobs only in `src/config/tuning/` with a parity entry and a `docs/TUNING.md` row; no new `Math.random` in layout; every `src/` file stays under 350 lines; no guard weakened
- [ ] Not verified, named: close-up look by eye on real hardware and frame time on real hardware (headless smoke cannot judge taste)

## Checkpoints

- 2026-11-11: recorded as proposed (pedestrian quality backlog). No work started.

## Handoff

- Next step: the improve skill picks it by priority and order; the lead writes the brief and the claims.
- Open questions: none.
