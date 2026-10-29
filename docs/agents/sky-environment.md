# Sky & Environment specialist

**Owns:** `src/sky/**`, `src/environment/**`, `src/weather/**`, `src/aircraft/**` and their tests.

## Key files
- `sky/dome.ts` + `state.ts`: sky dome shader, sun disc (`sunRadiusFor`, `sunAppearance`), moon, stars; `MOON_RADIUS`.
- `environment/cloudSprites.ts` (low lit cumulus, layout, drift), `cloudShade.ts` (shadow mask texture + shader patch), `clouds.ts` (controller), `forest.ts`, `trees.ts`, `greenery.ts`, `streetflora.ts`, `seasons.ts`, `seasonalPaint.ts`, `leaves.ts`, `wind.ts`, `sun.ts`.
- `weather/weatherState.ts` (kinds: clear, cloudy, rain, storm, snow, fog), `Rain.ts`, `Snow.ts`, `fog.ts`, `Lightning.ts`, `wet.ts` (uWet / uSnow patches).
- `aircraft/schedule.ts` (one flight per in-app hour, curved paths), `contrail.ts`, `planeMesh.ts`, `livery.ts`.

## Conventions
- Weather values ease over seconds (`EASE`); particles and uniforms read the eased values.
- Shared materials are patched with `onBeforeCompile`; every patch adds to `customProgramCacheKey` (`|cs1` for cloud shade).
- Cloud lifetime and aircraft schedule are pure functions of simulated time (`runtime.simTime`): paused means frozen.

## Traps
- Clouds vanished once because Round 2 replaced the meshes with a flat decal; a decal cannot shade buildings, so shadows are a mask sampled in the building, street and foliage shaders (direct light only, parallax by height).
- Orbit camera `maxPolarAngle` (PI/2.05) keeps the zenith out of view, so a midday sun is not seen from the orbit camera by design.
- `patch` is a GLSL reserved word.
- Saves with weather `drizzle` load as `cloudy` (`store/io.ts`).
- The `|cs1` / cache keys must change whenever a patched shader changes.

## Decisions
- Clouds: bases 70-100 m, tops <= ~140 m, drift 0.32x wind (min 1.2 m/s). Aircraft: 190-300 m, always below the highest camera (600 m).
- Sun radius 0.015 at zenith, 0.031 at horizon; moon 0.018. Sun colour: the vivid gold (3.2, 1.0, 0.12); a "deeper" variant looked red and was reverted.
- Cloud shadow darkness of the direct light 0.95 at the core.
- 2 crown variants per species (4 would add 8 draw calls).

## Open items
- 4 crown variants per species (needs approval); shadow caster height is a single value.

## Verify
`npx vitest run tests/clouds.test.ts tests/sky.test.ts tests/weather.test.ts tests/aircraft.test.ts tests/plants.test.ts tests/environment.test.ts`. Force a render in a standalone WebGLRenderer to check shader compile.
