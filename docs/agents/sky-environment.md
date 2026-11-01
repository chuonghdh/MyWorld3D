# Sky & Environment specialist

Reviewed 2026-11-01 at 02b0cdc

**Owns:** `src/sky/**`, `src/environment/**`, `src/weather/**`, `src/aircraft/**` and their tests.

## Key files
- `sky/dome.ts` + `state.ts`: sky dome shader, sun disc (`sunRadiusFor`, `sunAppearance`), moon (`MOON_RADIUS`), stars.
- `environment/cloudSprites.ts` (low lit cumulus, `CLOUD_BASE_MIN/MAX`, drift), `cloudShade.ts` (shadow mask texture + shader patch), `clouds.ts` (controller), `forest.ts` (procedural trees, winter twigs), `trees.ts`, `greenery.ts` (courtyard greenery, `yardKey`, `greenery-crowns` mesh), `parkYard.ts` (park plan for merged-block courtyards, `isParkYard`), `streetflora.ts`, `seasons.ts`, `seasonalPaint.ts` (`TAG_EVERGREEN`), `leaves.ts` (falling leaves), `leafVariety.ts` (shared leaf palette and GLSL), `wind.ts`, `sun.ts` (light grade, `headlights`).
- `weather/weatherState.ts` (kinds: clear, cloudy, rain, storm, snow, fog), `Rain.ts`, `Snow.ts`, `fog.ts`, `Lightning.ts`, `wet.ts` (uWet / uSnow patches).
- `aircraft/schedule.ts` (one flight per in-app hour, curved paths), `contrail.ts`, `planeMesh.ts`, `livery.ts`.

## Conventions
- Weather values ease over seconds (`EASE`); particles and uniforms read the eased values.
- Shared materials are patched with `onBeforeCompile`; every patch adds to `customProgramCacheKey` (`|cs1` for cloud shade and foliage sway, e.g. `environment/trees.ts:159`).
- Cloud lifetime and aircraft schedule are pure functions of simulated time (`runtime.simTime`): paused means frozen.

## Traps
- Clouds vanished once because a flat decal replaced the meshes; a decal cannot shade buildings. Shadows are a mask sampled in the building, street and foliage shaders (direct light only, parallax by height).
- Orbit camera `maxPolarAngle` (`Math.PI / 2.05`, `scene/CameraRig.tsx:258`) keeps the zenith out of view, so a midday sun is not seen from the orbit camera by design.
- `patch` is a GLSL reserved word.
- Saves with weather `drizzle` load as `cloudy` (`store/io.ts:115`).
- The `|cs1` / cache keys must change whenever a patched shader changes.
- Winter: broadleaf park crowns are TAG_FOLIAGE and must sit in their own mesh (`greenery-crowns`), or they stay green in winter. Hedges stay green with a snow tint by design.

## Decisions
- Merged-block courtyards are parks (`parkYard.ts`): `isParkYard` = `courtyard.merged === true` (`CourtyardRect` flag from `city/generate.ts`), so towns without merges keep byte-identical greenery. Park = edge hedges with openings at the path ends, groves (2-5 trees: round, conifer, columnar), bushes, beds along the path arms, sandbox and benches. All in the greenery meshes (cap: 4 per group; `tests/parkYard.test.ts` asserts it).
- Park layout avoids the gravel cross and loop of `streets/surfaces.ts buildCourtyard` (formula copied in `parkKeepOut`) and keeps a clear central plaza for the fountain. The city reserves the fountain disc (`ParkObstacle.reserved`, `fountainReservations`).
- Park rng and small-yard rng are keyed by footprint (`yardKey`, `greenery.ts:207`), not by list index: a merge elsewhere does not reshuffle other yards. One-time layout shift for every town.
- Park greenery takes the city's courtyard trees as obstacles (`courtyardTreeObstacles`, passed by `scene/useTownGreenery.ts` and `streets/greeneryFootprint.ts`). Plain courtyard trees are ignored by small yards so the non-merged baseline holds.
- `TAG_EVERGREEN` (`seasonalPaint.ts:13`): conifers keep their green, only snow on top.
- Clouds: bases 70-100 m (`CLOUD_BASE_MIN/MAX`), tops <= ~140 m, drift 0.32x wind (min 1.2 m/s). Aircraft: 190-300 m, always below the highest camera (600 m).
- Sun radius shrinks from horizon to zenith (`SUN_HORIZON_RADIUS`, `SUN_ZENITH_RADIUS`); moon radius = old 0.045 x `DISC_SCALE` 0.4 = 0.018. Sun colour at zenith: vivid gold (3.2, 1.0, 0.12) in `state.ts`; a "deeper" variant looked red and was reverted.
- Cloud shadow darkness of the direct light 0.95 at the core.
- 2 crown variants per species (4 would add 8 draw calls).
- Headlights ramp: `headlights = clamp(-alt / 8, 0, 1)` (`sun.ts:221`). Ramp starts at alt 0; no guard for NaN altitude; no test covers it.

## Falling leaves (`environment/leaves.ts`)
- Pool: `MAX_LEAVES = 160`. Rest on the ground for `LEAF_REST_SECONDS` = 10, then fade over the last second. When the pool is full, the oldest resting leaf is recycled. Resting leaves do not count against the seasonal density gate.
- Live count: `leafAmount` is a fraction 0-1 (`limit = floor(MAX_LEAVES * frac)`). Store default 1 = the full 160-leaf pool (`store/model.ts:127`). The slider (`ui/SettingsCity.tsx:217-222`, 0-1 shown as %) matches.
- Spawn: autumn leaves spawn inside crown discs at crown height (`setCrownDiscs`, from `crownDiscsFromGroup`). Other seasons keep the trunk-point spawn.
- Camera gate: `setCameraView(camera, focus, radius)` once per frame (`scene/useTownFrame.ts`). A crown spawns only if its sphere is in the frustum and its centre is within `FOCUS_RADIUS_DEFAULT` = 100 m of the focus on the ground plane. Without a call, every crown is eligible.
- Landing: `setSurfaces(SurfaceBox[])`, called from `scene/Town.tsx:125` with `pavementSurfaces(layout)`. A leaf lands on the highest box under it (sidewalk top 0.15). Road stays at `GROUND_Y` (local const 0.05 in leaves.ts).
- Look: leaf outline with a notch, curl, lengthwise bend, brown `veinMesh` (`#6b4a2b`), `LEAF_SCALE` = 1.3 x 0.7. `veinMesh` must be added to the scene next to `mesh` (`Town.tsx:288`), or the midrib is missing.
- Wind and season behaviour unchanged; only autumn leaves have crown spawn, rest, vein and landing.

## Leaf colour variety
- `environment/leafVariety.ts` is the shared palette: autumn red `#b8402a` -> orange `#d8792c` -> yellow `#e6b93e` by height with seeded scatter; green accents `#7fb23a` / `#2f7f5a`.
- Procedural crowns (`forest.ts` recolorCrown): autumn is one mix for every species. Spring and summer get a per-island HSL spread. Per-tree differences come from `treeTint`.
- Quaternius leaves (`streets/natureTrees.ts`): `applyLeafVariety` shader chained after the wind sway. Autumn uses a white base so the luminance-matched ramp sets the colour. Luminance matching (`lvMatchLuma` in GLSL, `matchLuma` on CPU) clamps to [0,1] linear, so red and orange do not clip to pale yellow.
- Summer: `uSummer` (0 or 1) set per season in `streets/natureTrees.ts:679`, read in `leafVariety.ts:68` (slight brightness and saturation lift). Procedural summer tones in `forest.ts` (oak `#3a7438 / #44823f / #2f6a35`).
- Light grade: day keyframes in `sun.ts` alt 16 `#fff1dc` -> `#fff7ee`, alt 60 `#fff8ef` -> `#fffbf5`. Golden stays at alt 0 and 6. Gains unchanged.
- Keep procedural (`forest.ts`) and Quaternius (`leafVariety.ts`) autumn in sync when tuning; procedural autumn has no luma lift.

## Winter and evergreens
- Procedural winter trees: crowns hidden; bare twigs wrapped in `attachWeather` (shared `uSnow`, also darken in rain via `uWet`). Trunk not patched.
- Park crowns (broadleaf round and column) live in `greenery-crowns`, hidden in winter (`greenery.ts` `setSeason`). Trunks and conifers stay in `greenery-bushes`.
- Pine snow: weather-shader snow on the conifer leaf material (`PINE_SNOW_UP`, `PINE_SNOW_COVER` in `streets/natureTrees.ts:18-19`). Do not split conifer geometry for snow (user rejected it).

## Shared with other areas
- `src/shaders/wetSurface.ts` adds `uTrackMap` (1x1 empty default) and `uTrackRect`; City uses them for tyre tracks.
- `src/dev/treeCompare` (lab) wraps the city leaf system (`labLeaves.ts`): pool, rest, vein, surfaces and gates are the same code. Change `leaves.ts` and the lab follows.

## Open items
- User to confirm the in-game falling-leaf look (not yet confirmed).
- Car-roof and bonnet landing: deferred (`traffic/vehicleSurfaces.ts` exists, not wired).
- Hemisphere ground colour `#c9b48e` (`scene/Town.tsx`) is warm beige and adds yellow fill. Owned by Scene; not changed.
- Procedural summer `TONES` in `forest.ts` still need a look against a screenshot.
- Lab instance-colour fix landed in c14349b; re-check the dev page variety by eye.
- Shadow caster height is a single value; 4 crown variants per species needs approval.
- Street-tree winter crowns come from `streets/natureTrees.ts` (City), not from this area.

## Verify
`npx vitest run tests/clouds.test.ts tests/sky.test.ts tests/weather.test.ts tests/aircraft.test.ts tests/plants.test.ts tests/environment.test.ts tests/parkYard.test.ts tests/budget.test.ts`. Force a render in a standalone WebGLRenderer to check shader compile. Do not rely on the built-in pane for frames.

## Session 2026-11-01 (review)
- Fixed since the last review: `leafAmount` unit (fraction now); GLSL and CPU luma clamp; `uSummer` hookup; courtyard tree obstacles wired; small-yard rng keyed by footprint; park crowns in their own mesh; reserved fountain disc.
- Test status: `tests/streetDecor.test.ts` passed 11/11 in this review (the earlier "fountain test fails" trap is stale).
- Not re-run in this review: the rest of the listed suites, and the full `npx vitest run`.

## Tuning rule (step 8)
- Sky & Environment knobs live in `skyEnvironment` in `src/config/tuning.ts` (leaves, dusk ramps, weather caps, sun and moon disc sizes, clouds). Modules import them; geometry and shader algorithm constants stay in their files. Parity is checked in `tests/tuningParity.test.ts`.
