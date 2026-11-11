---
id: T-0026-ped-hair-skin-shading
title: Hair strands and skin warmth (near)
status: proposed
owner: graphics-character
branch: dev
created: 2026-11-11
priority: P2
type: feature
source: request
---

# T-0026: Hair strands and skin warmth (near)

## Spec

- Goal: Hair gets a procedural strand pattern along the hair direction plus a soft specular band that moves with the light; skin gets a warm edge (cheap subsurface look at grazing angles), a cheek and nose tint and slightly darker ears. All in the near fragment shader, driven by the existing hair and skin palettes.
- Source: user request 2026-11-11, pedestrian close-up quality.
- Files in scope: `src/traffic/people/rigShaderGlsl.ts`, `src/traffic/people/rigShader.ts`, `src/config/tuning/trafficLife.ts (hairSheen, skinWarmth)`, `tests/`, `docs/TUNING.md`.
- Out of scope: Palette values; Face shapes (T-0024).

## Acceptance

- [ ] Hair sheen readable for dark, blond and grey hair without clipping
- [ ] Skin tones in the palette keep their order of luminance (palette test)
- [ ] Far material unchanged
- [ ] `npm run check`; `npx vitest run tests/people.test.ts` (rerun the timing flake alone)
- [ ] `node harness/scripts/verify.mjs` green; `npm run smoke` green (draw calls and triangles within budget)
- [ ] Knobs only in `src/config/tuning/` with a parity entry and a `docs/TUNING.md` row; no new `Math.random` in layout; every `src/` file stays under 350 lines; no guard weakened
- [ ] Not verified, named: close-up look by eye on real hardware and frame time on real hardware (headless smoke cannot judge taste)

## Checkpoints

- 2026-11-11: recorded as proposed (pedestrian quality backlog). No work started.

## Handoff

- Next step: the improve skill picks it by priority and order; the lead writes the brief and the claims.
- Open questions: none.
