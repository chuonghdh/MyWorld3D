---
id: T-0024-ped-near-face-shader
title: Procedural face in the fragment shader (near)
status: done
owner: graphics-character
branch: task/T-0024-ped-near-face-shader
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

- [x] No face quad in the near geometry; face visible from the front, never through the back of the head
- [x] Blink period and phase are per instance and deterministic from the walker phase
- [x] Shader compiles in the smoke (no console error)
- [x] `npm run check`; `npx vitest run tests/people.test.ts` (rerun the timing flake alone)
- [x] `node harness/scripts/verify.mjs` green; `npm run smoke` green (draw calls and triangles within budget)
- [x] Knobs only in `src/config/tuning/` with a parity entry and a `docs/TUNING.md` row; no new `Math.random` in layout; every `src/` file stays under 350 lines; no guard weakened
- [x] Not verified, named: close-up look by eye on real hardware and frame time on real hardware (headless smoke cannot judge taste)

## Checkpoints

- 2026-11-12: graphics-character done; verify.mjs exit 0; smoke ok (184 draw calls, 2.32M tris, no shader error); reviewer pass. Near 1296 tris, far 376. Face seen at 3 m (adult, elder, teen, child). Not seen: blink, moustache, night, rain.

## Handoff

- Next step: the improve skill picks it by priority and order; the lead writes the brief and the claims.
- Open questions: none.

## Review

- Reviewer: reviewer (read-only subagent), diff range: working tree against 94e72cc.
- Findings: 4 low (head centre maths duplicated between shape and shader constants; hard-coded region and flag values match existing convention; spec file list narrower than the brief; compile risk covered by the lead running verify.mjs and npm run smoke, both green).
- Result: pass
