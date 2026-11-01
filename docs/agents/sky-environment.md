# Sky & Environment specialist

**Owns:** `src/sky/**`, `src/environment/**`, `src/weather/**`, `src/aircraft/**` and their tests.

## Key files
- `sky/dome.ts` + `state.ts`: sky dome shader, sun disc (`sunRadiusFor`, `sunAppearance`), moon, stars; `MOON_RADIUS`.
- `environment/cloudSprites.ts` (low lit cumulus, layout, drift), `cloudShade.ts` (shadow mask texture + shader patch), `clouds.ts` (controller), `forest.ts`, `trees.ts`, `greenery.ts`, `parkYard.ts` (park plan for merged-block courtyards), `streetflora.ts`, `seasons.ts`, `seasonalPaint.ts`, `leaves.ts`, `wind.ts`, `sun.ts`.
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
- Merged-block courtyards are parks (`parkYard.ts`): `isParkYard` = `courtyard.merged === true` (CourtyardRect flag from city/generate.ts; replaced a fragile >= 34 m size rule), so towns without merges keep byte-identical greenery. Park = edge hedges with openings at the path ends, groves (2-5 trees: round / conifer / columnar, size 0.8-1.9, clusters = area/230), bushes round groves and along hedges, beds lining the path arms, sandbox + 2 benches (compact bench pair in narrow yards). All in the 3 existing greenery meshes (no new draw call); ~19k tris for a 2x2 yard. Park rng is keyed by the yard position, not the courtyard index.
- Park layout avoids the gravel cross + loop of `streets/surfaces.ts buildCourtyard` (formula copied in `parkKeepOut`, source checked by a test) and a 6.5 m central plaza for the fountain.
- `TAG_EVERGREEN` (seasonalPaint): conifers keep their green, only snow on top.
- Clouds: bases 70-100 m, tops <= ~140 m, drift 0.32x wind (min 1.2 m/s). Aircraft: 190-300 m, always below the highest camera (600 m).
- Sun radius 0.015 at zenith, 0.031 at horizon; moon 0.018. Sun colour: the vivid gold (3.2, 1.0, 0.12); a "deeper" variant looked red and was reverted.
- Cloud shadow darkness of the direct light 0.95 at the core.
- 2 crown variants per species (4 would add 8 draw calls).

## Open items
- Park greenery does not know the city's courtyard trees (`streetscape.ts`, 2-6 random trees per courtyard): `createCourtyardGreenery(courtyards, seed, obstacles)` accepts them, but `scene/useTownGreenery.ts` and `streets/greeneryFootprint.ts` must both pass the same list (owners: Scene, City & Streets).
- Small courtyards still take their rng from the courtyard index, so a merge reshuffles the greenery of yards after it in the list.
- 4 crown variants per species (needs approval); shadow caster height is a single value.

## Verify
`npx vitest run tests/clouds.test.ts tests/sky.test.ts tests/weather.test.ts tests/aircraft.test.ts tests/plants.test.ts tests/environment.test.ts tests/parkYard.test.ts`. Force a render in a standalone WebGLRenderer to check shader compile.

## Leaf colour variety (handover task)
- `environment/leafVariety.ts` is the shared palette: autumn red `#b8402a` -> orange `#d8792c` -> yellow `#e6b93e` by height with seeded scatter; green accents `#7fb23a` / `#2f7f5a` for hue spread.
- Procedural crowns (`forest.ts` recolorCrown): autumn is one mix for every species (no per-species autumn tones). Spring and summer get a per-island HSL spread. Per-tree differences come from `treeTint`.
- Quaternius leaves (`streets/natureTrees.ts`): `applyLeafVariety` adds a shader chained after the wind sway. Per-island randoms and height are the `aIsland` vertex attribute; per-tree randoms are the instance colour. Autumn uses a white base so the luminance-matched ramp sets the colour. Chosen over vertex-colour swapping because the leaf texture carries the alpha cut-out and vein light, and a luminance-preserving hue mix keeps both.
- Light grade: day keyframes `sun.ts` alt 16 `#fff1dc` -> `#fff7ee`, alt 60 `#fff8ef` -> `#fffbf5`. Golden stays at alt 0 and 6. Gains unchanged.
- Open: the hemisphere ground colour `#c9b48e` (`scene/Town.tsx`) is warm beige and still adds yellow fill. Owned by Scene; not changed here.
- Open: dev page (`src/dev/treeCompare`) shows per-island variety only (single meshes, no instance colour).

## Session 2026-11-01
- Review only (no source edits). `npx tsc --noEmit` passes.
- Trap: `leafAmount` unit mismatch. Store default `1` (`src/store/model.ts:127`) and the slider (`src/ui/SettingsCity.tsx:217-222`, 0-1 shown as %) are fractions, but `leaves.ts:218` reads percent (`MAX_LEAVES * pct / 100`). Result: 100% shows as about 6 live leaves. Open: pick one unit and fix in `leaves.ts` or the slider.
- Trap: `leafVariety.ts:73` `lvMatchLuma` lifts texels to luma `mix(lum, 0.42, 0.65)`. Red ramp luma is 0.14, so any texel above about 0.07 pushes red/orange channels above 1.0 linear (red about 2.1 at lum 1). Hue shifts toward pale yellow after clipping. Open: clamp the target to the ramp's own luma or clamp channels.
- Stale comment: `leafVariety.ts:67` says "keeps texture luminance", but line 73 now lifts it.
- Decision: `headlights = clamp(-alt / 8, 0, 1)` (`sun.ts:221`). Ramp starts at alt 0 while `lightsOn` stays at alt < 0. Good at polar edges (alt in -90..90). No guard for NaN altitude. No test covers `headlights`.
- Decision: autumn in procedural crowns (`forest.ts`) has no luma lift; only the Quaternius path (`leafVariety.ts`) does. Keep both in sync when tuning.
- Shared with City: `src/shaders/wetSurface.ts` adds `uTrackMap` (1x1 empty default) and `uTrackRect`. Note only.

## Session 2026-11-01 (fixes)
- `leafAmount` is now a fraction 0-1 (`leaves.ts`, `limit = floor(MAX_LEAVES * frac)`). Store default stays 1 = 600 live leaves (`src/store/model.ts:127`, not edited). Test `plants.test.ts` uses 1.
- `lvMatchLuma` (GLSL) and `matchLuma` (CPU) clamp to [0,1] linear: no pale hue clip on red/orange.
- Summer green lift in `leafVariety.ts`: `summer = smoothstep(0.8, 1.0, uVary)`. Couples to uVary (summer 1.0, spring 0.6). Open: a dedicated `uSummer` uniform needs `streets/natureTrees.ts` (City).
- Procedural winter trees: crowns hidden, bare twigs had only a baked up-face tint and no dynamic cover. `forest.ts` now wraps `twigs` in `attachWeather` (shared `uSnow`). Trunk not patched. Twigs also darken in rain (`uWet`).
- Open: procedural summer `TONES` in `forest.ts` are dark (#2c5a30 range); not changed.

## Session 2026-11-01 (lead task)
- Courtyard trees: already wired. `city/streetscape.ts` `courtyardTreeObstacles` feeds `createCourtyardGreenery` in `scene/useTownGreenery.ts` and `streets/greeneryFootprint.ts`; park groves keep clear of them. No Town.tsx change needed. Open item closed.
- Small-courtyard rng: keyed by a footprint hash (`yardKey` in `environment/greenery.ts`), not list index. A merge elsewhere no longer reshuffles other yards. One-time layout shift for every town.
- Summer tone: oak summer lifted to `#3a7438 / #44823f / #2f6a35` (`environment/forest.ts`). `uSummer` hookup already in `streets/natureTrees.ts`. Open item closed.
- Scene imports: `sky/SkyDome.tsx` imports `core/runtime`, `aircraft/schedule.ts` imports `environment/cloudSprites`. Neither imports `src/scene`. Architect finding already resolved in code.
- Trap: `tests/streetDecor.test.ts` "fountain in free courtyard space" fails after the rng change (fountain null on one layout). Owner: City & Streets / Scene. Not fixed here.
- Full `npx vitest run`: 679 pass, 1 fail (above). 4 files flagged FAIL under full run pass solo.
- Verify: `npx tsc --noEmit` passes. Owned-area suites (7 files, 112 tests) pass.

## Session 2026-11-01 (phase 2)
- Park crowns: broadleaf park crowns (round and column) moved to their own `greenery-crowns` mesh, hidden in winter (`greenery.ts` setSeason). Trunks and conifers stay in `greenery-bushes`. Trap: park crowns were TAG_FOLIAGE in the always-visible mesh, so they stayed green in winter.
- Mesh cap: a courtyard greenery group is now at most 4 meshes (hedges, beds, bushes, crowns). `tests/parkYard.test.ts` asserts 4. Winter crowns need their own mesh; do not fold them back into bushes.
- Reserved fountain disc: `ParkObstacle.reserved?: true` (`environment/parkYard.ts`). Small yards respect only reserved discs (beds and bushes via boxes, hedges via segment distance). Plain courtyard trees stay ignored for small yards, so the non-merged baseline holds. City appends the fountain disc as `{x, z, r, reserved: true}`.
- Footprint-keyed yards: `yardKey` (`greenery.ts`) hashes the rect corners. Small-yard rng, hedge and bush seeds no longer use the list index, so merges do not reshuffle other yards. One-time layout shift for every town.
- Open: summer tones (`forest.ts` TONES) still need a look against the screenshot. Hedges (`greenery.ts` addHedge, TAG_FOLIAGE) stay green in winter with a snow tint, by design; confirm with lead.
- Open: street-tree crowns in winter come from `streets/natureTrees.ts` (City). Not environment. Procedural `forest.ts` path already hides crowns in winter.
- Open: tests/streetDecor.test.ts "puts the fountain in free courtyard space" fails until City's reservation and picker land (City, a7bb761c4b40ec3c8).
- Verify: `npx tsc --noEmit`; environment suites + `tests/parkYard.test.ts` + `tests/budget.test.ts` pass.

## Session 2026-11-01 (phase 2 close-out, commit 8f96b8e)
### Falling-leaf system (`src/environment/leaves.ts`)
- Pool: `MAX_LEAVES = 160`. Rest on the ground: 10 s (`LEAF_REST_SECONDS`), then fade over the last second. When the pool is full, the oldest resting leaf is recycled. Resting leaves do not count against the seasonal density gate.
- Spawn: autumn leaves spawn inside crown discs at crown height (`setCrownDiscs`, read from the tree group with `crownDiscsFromGroup`). Other seasons keep the trunk-point spawn.
- Camera gate: `setCameraView(camera, focus, radius)` once per frame. A crown spawns only if its sphere is in the frustum and its centre is within `FOCUS_RADIUS_DEFAULT = 100` m of the focus on the ground plane. Without a call, every crown is eligible.
- Landing: `setSurfaces(SurfaceBox[])`. A leaf lands on the highest box under it (pavement top 0.15 from `streets/pavementSurfaces.ts`); road stays at `GROUND_Y`.
- Look: leaf outline with a notch, curl, lengthwise bend, brown `veinMesh` (`#6b4a2b`), scaled to 70% of the earlier size (`LEAF_SCALE = 1.3 * 0.7`).
- Decision: the wind and season behaviour are unchanged; only autumn leaves gained the crown, rest, vein and landing behaviour.
- Trap: `veinMesh` must be added to the scene next to `mesh` (Town.tsx). Without it the midrib is missing.
- Open: the user has not yet confirmed the in-game leaf look. Car-roof and bonnet landing is deferred (vehicle surfaces on hold per the lead; `traffic/vehicleSurfaces.ts` exists, not wired).
- Open: the Town.tsx `setSurfaces(pavementSurfaces(layout))` effect is with Scene (a4850c47dba776fa1); verify it is wired before judging the pavement landing in game.

### Lab wrapper rule (`src/dev/treeCompare/labLeaves.ts`)
- The lab does not have its own emitter. `LabLeafEmitter` wraps the city `LeafSystem`, so pool, rest, vein, surfaces, crowns and camera gates are the same code. Lab pool 160, culling 100 m.
- Reason: a separate lab emitter drifted from the city (pool, culling and rest values differed). Do not reintroduce a lab copy of the leaf logic. Change `leaves.ts` and the lab follows.

### Pine snow via weather shader (`src/dev/treeCompare/labNatureTrees.ts`)
- Constants: `PINE_SNOW_UP = [0.85, 0.97]` (smoothstep on the normal's y), `PINE_SNOW_COVER = 0.35`. Commit c14349b.
- Decision: pine snow comes from the weather shader on the existing conifer geometry. The user rejected the attempts that split the geometry; do not split conifers again for snow.
- Note: values are lab-side only; the city's conifer snow uses the shared weather patches (`TAG_EVERGREEN` only takes snow on top, see above).

### Shadow budget
- The budget test counts main-pass meshes only; shadow-only meshes (broadleaf shadow copies on SHADOW_LAYER) are excluded. Park crowns sit in their own mesh (cap 4 per greenery group).
- Trap: any new main-pass mesh in environment or a house can break the budget even when its geometry is fine. Check `tests/budget.test.ts` after adding a mesh.

### Open items (summary)
- User to confirm the in-game falling-leaf look.
- Car-roof and bonnet landing (deferred; needs the vehicle export and a refresh cadence decision).
- Confirm Town.tsx wiring of `veinMesh` and `setSurfaces(pavementSurfaces(layout))` with Scene.
- Street-tree winter crowns (full foliage seen in a screenshot) come from `streets/natureTrees.ts` (City), not from this area.
- Hedges stay green in winter with a snow tint, by design; confirm with lead.
