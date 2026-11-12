# Brief: T-0026 (graphics-character)

- **Task id:** T-0026-ped-hair-skin-shading
- **Owner:** graphics-character
- **Reviewer:** reviewer (read-only subagent)
- **Goal:** near people get hair strands with a soft specular band and warmer skin, in the NEAR material variant only (`PERSON_NEAR`; see `rigShader.ts`, `rigShaderFace.ts`, `rigShaderSurface.ts`). The far program must stay identical (key `person-rig-v4`, none of the new identifiers; extend the existing `peopleLod.test.ts` identifier check).
- **Design (lead's, change with a reason):**
  - Hair (region HAIR, parts 14 to 20, 24, beard 21, moustache 22): procedural strand pattern in the fragment shader (stretched hash noise along model-space y, or along the part's long axis) modulating luminance by about +/-12 percent; a soft specular band that moves with the light: use the directional light direction exposed by three's Lambert fragment (`directionalLights[0].direction` under `NUM_DIR_LIGHTS`) and the view vector, a Kajiya-Kay-like band `pow(sqrt(1 - dot(T, H)^2), k)` with the tangent T = model-space up, small intensity, tinted by the hair colour (grey and blond hair shine more than black). Night: scale with the light level like the rim in `rigShaderSurface.ts`. Knob `hairSheen`.
  - Skin (region SKIN, excluding the face painted by `faceColour`): a warm edge (grazing-angle term `pow(1 - dot(N, V), 3)` mixing towards a warmer, more saturated version of the skin colour, cheap subsurface look), cheek and nose tint on the head (head-local coordinates from the face code: `uHeadC`, `uHeadR`), slightly darker ears and a tiny darkening in the neck crease. Hands and forearms get the warm edge too. Knob `skinWarmth`.
  - Do not touch the face painting; compose before or after in a way that keeps eyes, brows and lips crisp. Palette values unchanged; palette luminance order of skin tones must hold after the effect (add a test on the pure part if you factor any math out; otherwise a shader-side clamp and a note).
  - Knobs `hairSheen` and `skinWarmth` in `src/config/tuning/trafficLife.ts` with doc lines, parity entries in `tests/tuningParity.test.ts`, rows in `docs/TUNING.md`. Say in the TUNING row what range is meaningful (the shader gains from T-0025 made 0-1 stronger than it reads: be explicit this time).
  - Cost: near only; state the added instruction count in the handbook.
- **Verify by eye:** `npm run smoke:closeup`, day and rain 3 m for adult, child, elder, teen (dark, blond, grey hair, beards if present); VIEW the PNGs; describe hair sheen, skin warmth, any plastic, noisy or sparkling look. Iterate up to 3 times.
- **Files in scope:** `src/traffic/people/**`, `src/config/tuning/trafficLife.ts`, `tests/people.test.ts`, `tests/peopleLod.test.ts`, `tests/peopleNear.test.ts`, `tests/tuningParity.test.ts`, `tests/smoke/closeup.mjs`, `tests/smoke/closeupHook.mjs`, `docs/TUNING.md`, `docs/agents/graphics-character.md`, `harness/briefs/T-0026-graphics-character.md`.
- **Files out of scope:** the face, cloth, AO and rim terms (leave as is), geometry, walkers, far material.
- **Claims:** graphics-character entry for T-0026 in harness/state/claims.json (active).
- **Acceptance commands:** `npx tsc --noEmit`; `npm run lint`; `npx vitest run tests/people.test.ts tests/peopleGait.test.ts tests/peopleLod.test.ts tests/peopleNear.test.ts tests/tuningParity.test.ts tests/traffic.determinism.test.ts tests/budget.test.ts tests/harness.test.ts`; `npx vite build`; `npm run smoke` (no console error); `npm run smoke:closeup` shots. Run `npm run smoke` AFTER your final shader tuning. Failures only.
- **Report format:** at most 12 lines: files changed (line counts), gate result (failures only), what you saw by eye, not verified.
- Handbook: append a dated section.
