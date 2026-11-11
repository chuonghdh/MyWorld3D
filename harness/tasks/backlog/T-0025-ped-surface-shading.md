---
id: T-0025-ped-surface-shading
title: Fake ambient occlusion, rim light and fabric detail (near)
status: proposed
owner: graphics-character
branch: dev
created: 2026-11-11
priority: P2
type: feature
source: request
---

# T-0025: Fake ambient occlusion, rim light and fabric detail (near)

## Spec

- Goal: Lambert shading looks flat from close. Add in the person fragment shader, near material only: a height and part based ambient occlusion (under arms, under chin, crotch, shoe tops), a soft rim light tied to the sun colour, a procedural woven-cloth micro pattern (hash noise on model position, fades with distance) and fold darkening at elbow and knee. No texture maps (2K or 4K textures rejected: no UVs, per-instance palettes, memory and bandwidth for 480 tiny instances).
- Source: user request 2026-11-11, pedestrian close-up quality.
- Files in scope: `src/traffic/people/rigShader.ts`, `src/traffic/people/rigShaderGlsl.ts`, `src/config/tuning/trafficLife.ts (aoStrength, rimStrength, clothDetail)`, `tests/`, `docs/TUNING.md`.
- Out of scope: Face (T-0024); Scene lighting rig.

## Acceptance

- [ ] The far material has none of the new terms, so the default camera view is unchanged
- [ ] Night: rim term follows the light level, no extra bloom
- [ ] Added fragment cost measured in the smoke; near fragment count is bounded by the near cap
- [ ] `npm run check`; `npx vitest run tests/people.test.ts` (rerun the timing flake alone)
- [ ] `node harness/scripts/verify.mjs` green; `npm run smoke` green (draw calls and triangles within budget)
- [ ] Knobs only in `src/config/tuning/` with a parity entry and a `docs/TUNING.md` row; no new `Math.random` in layout; every `src/` file stays under 350 lines; no guard weakened
- [ ] Not verified, named: close-up look by eye on real hardware and frame time on real hardware (headless smoke cannot judge taste)

## Checkpoints

- 2026-11-11: recorded as proposed (pedestrian quality backlog). No work started.

## Handoff

- Next step: the improve skill picks it by priority and order; the lead writes the brief and the claims.
- Open questions: none.
