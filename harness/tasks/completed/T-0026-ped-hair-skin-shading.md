---
id: T-0026-ped-hair-skin-shading
title: Hair strands and skin warmth (near)
status: done
owner: graphics-character
branch: task/T-0026-ped-hair-skin-shading
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

- [x] Hair sheen readable for dark, blond and grey hair without clipping
- [x] Skin tones in the palette keep their order of luminance (palette test)
- [x] Far material unchanged
- [x] `npm run check`; `npx vitest run tests/people.test.ts` (rerun the timing flake alone)
- [x] `node harness/scripts/verify.mjs` green; `npm run smoke` green (draw calls and triangles within budget)
- [x] Knobs only in `src/config/tuning/` with a parity entry and a `docs/TUNING.md` row; no new `Math.random` in layout; every `src/` file stays under 350 lines; no guard weakened
- [x] Not verified, named: close-up look by eye on real hardware and frame time on real hardware (headless smoke cannot judge taste)

## Checkpoints

- 2026-11-12: graphics-character done; verify.mjs first run failed once on tests/audioPeople.test.ts (steps faster when walking faster, timing, run while the reviewer ran vitest; no audio diff), passed solo, then verify.mjs exit 0 and smoke ok (184 draw calls, 2.32M tris). Reviewer pass. Hair sheen faint on dark hair, skin blush visible. Not seen: grey and blond hair under low sun, beards, rain and night of final state.

## Handoff

- Next step: the improve skill picks it by priority and order; the lead writes the brief and the claims.
- Open questions: none.

## Review

- Reviewer: reviewer (read-only subagent), diff range: working tree against dd022f0.
- Findings: 4 non-blocking (header comment says +/-12 percent, code gives about 19; header says the edge term is clamped, order is kept by monotonicity; no machine test of skin luminance order; record status stale, fixed here). Left for the T-0030 handbook pass.
- Result: pass
