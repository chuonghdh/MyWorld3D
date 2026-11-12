# Traffic & Life specialist

Reviewed 2026-11-01 at 02b0cdc. Paths, line refs and hashes corrected 2026-11-09 (see Review 2026-11-08 and Update 2026-11-09).

**Owns:** `src/traffic/**` except `src/traffic/people/**` (vehicles, lights, pedestrian behaviour, parking, collision, car snow and headlights; people rendering moved to Graphics & Character 2026-11-11) and `src/life/**` (pigeons, flocks, cats, squirrels, butterflies, birds) with their tests.

## Key files
- `traffic/vehicles.ts`: the `VehicleSystem` class (public API, step, horns, turn-decision hook; 320 lines). `traffic/lights.ts` (signals, all-red gap), `traffic/pedestrians.ts` (the `Pedestrians` class), `collision.ts` (OBB sweep), `parking.ts`.
- `traffic/vehicleMeshes.ts`: vehicle mesh layer, headlight level, snow (`setSnow`). Shader patch (`vehicle-shader-v2`) in `traffic/vehicleShader.ts`; headlight glow pools in `traffic/vehicleGlow.ts`.
- `traffic/vehicleSurfaces.ts`: car-roof boxes, exported but not wired (see Open items).

## Module map (split for size, no behaviour change)
Hashes and tests are unchanged by the split. The class files keep their public API; methods they delegate to live in these modules as functions taking the instance (`sys`).

Vehicles (`src/traffic/vehicles/`):
- `types.ts`: render, path, vehicle and stop-line types.
- `constants.ts`: tuning constants, `VEHICLE_SPECS`, class footprints, `TURN_LEFT_CHANCE` / `TURN_RIGHT_CHANCE` (0.2 each), `HORN_*`.
- `geometry.ts`: pure lane geometry (fillets, path extension, arc length, poses, arm bits, path openness: `pathOpenness`).
- `build.ts`: `setupSystem` (lane paths, stop lines, turn connectors, junction arms via `buildArms`).
- `junctions.ts`: junction grants, movement conflicts, `gateOpen`.
- `turns.ts`: `decideTurn` (the manoeuvre roll over the moves that exist).
- `conflict.ts`: stop limits behind vehicles and the swept footprint, syncing poses.
- `motion.ts`: `advance` (the per-vehicle step), `roomBehind`, `transfer`, `resolveJam`.
- `spawn.ts`: `create`, `release`, `trySpawns`, `isFree`, class and variant picks.
- `render.ts`: `getVehicles` (render records for the mesh layer).
- `horns.ts`: `tryHorn` and `takeHorns` (cooldown, city-wide gap, queue). `VehicleSystem` methods delegate here.
- Models: `models.ts` (cars, van, scooter; 302 lines), `modelsHeavy.ts` (bus, truck; 160 lines). Also `builder.ts`, `variants.ts`.

Pedestrians (`src/traffic/walkers/`):
- `types.ts`, `constants.ts`, `density.ts` (`DENSITY_CURVE`, `crowdDensityAt`, `redRemaining`), `graph.ts` (`buildGraph`), `setup.ts`, `looks.ts` (`createPeople`, speed by age and sex, hair), `movement.ts`, `behaviour.ts` (benches, looking, chatting, doors), `resolve.ts` (per-step state resolution), `output.ts` (`getPedestrians`).
- Sizes: all new files are at most 283 lines (`walkers/movement.ts`); `vehicles.ts` is 320 lines; `pedestrians.ts` is 281 lines.

## Conventions
- Determinism: the main simulation hash must not change when optional systems change. Horns use a separate RNG (`hornRng`); read-or-not of horns must not alter vehicles (tested).
- Per-frame code allocates nothing; render structs are pooled.
- Hashes: `EXPECTED_VEHICLES` = `b0d22ec1` and `EXPECTED_PEDESTRIANS` = `63333cfb` (`tests/traffic.determinism.test.ts`). Re-capture only for intentional changes, and say why.

## Traps
- Vehicles spawn at the map border with a long edge extension (default 28 m); tests that need the old numbers pass `edgeExtension: 0`.
- Junction: first come first served with a movement-conflict matrix; a jam is broken by backing up, then a "ghost" pass (overlap accepted as a last resort).
- Lanes sit close to the road centre line to avoid overlap with parked cars.
- Pedestrian timing tests (`tests/people.test.ts` timing blocks, `tests/audioPeople.test.ts`) are flaky under load: rerun alone. The 600-walker perf test was reduced to the default crowd on 2026-11-09.
- Crowd and traffic density: see "Time-of-day density" below (replaces the old 8:30/17:30 rush-hour curve).
- Snow in three r170 `color_vertex` runs before `beginnormal_vertex`. Snow code that reads the final normal or `color` must sit in the normal chunk (`NORMAL_SPIN`), after the normal is set. Placing it earlier reads stale values or fails compile ("objectNormal undeclared", the cause of the phase 2 car-invisible bug).
- Any change to the vehicle shader interface needs a `vehicle-shader-v2` cache key bump (new `uSnow` uniform and varyings).
- Per-person triangles are about 376 in all four age groups; hidden parts still draw (they collapse to a point in the shader).

## Decisions
- Turns: 60% straight, 20% left, 20% right. Yellow: a vehicle past the stop line continues; behind it stops (queues behind a leader). Green needs a clear crosswalk.
- Horns (`vehicles/constants.ts`, `horns.ts`): 45 s per-vehicle cooldown, 6 s city-wide gap, 50% coin flip, honk on pedestrians holding a green or hard braking.
- People morph: male and female shapes must emit identical vertex counts and order (RigBuilder skips degenerate triangles, so any zero-size part breaks it; `buildPerson` throws). Only x/z may change: a depth change on the stooped elder torso turns into a height change (y), so torso depth is shared.
- Dog trail: candidate spots are tried until one is off the asphalt (test "never stands on asphalt outside a crosswalk" in `tests/people.test.ts`; asphalt check also `tests/blockMergeTraffic.test.ts:191-193`).
- Child pairs: the adult (leader) walks at the child's own base pace; the child's rendered speed wobbles +-25 percent (render only). Pair ids are consecutive (follower id = leader id + 1), and a child is always a follower. The pace test relies on this.
- People (2026 overhaul): four age groups (adult, teen, child, elder), one mesh each, sexes by morph. Draw calls: main 6 to 7, shadow 5 to 6.
- Hair: 10 styles. Women (teens and up): 90% long, 10% short. Elders mostly grey or white.
- Outfits: pure function of season, traits and two stable values (`outfit.ts`). A coat (winter, or 60% of autumn walkers) recolours the top and sleeves and shows coat tails (a short flare from the waist to the upper thigh; not a skirt).
- Speeds (m/s): child 1.4-1.65, teen 1.4-1.6, adult men 1.15-1.43, women 1.08-1.36, elders 0.82-0.92 (women 0.78-0.88).
- Pairs: elder couples, adult couples (opposite sex), parent+child, parent+teen, teen friends.
- No dresses and no ao dai: removed at the user's final decision.
- Patterned tops: 70% of walkers, six patterns, drawn in the fragment shader from the model position (no textures, no draw calls). Coats and bare sleeves stay plain.
- The avenue-versus-street density test averages six seeds; the threshold is 1.15.
- Headlights: per-car. `headlightThreshold(id)` (`vehicleMeshes.ts:51`) is a seeded hash of the id in [0,1); a car is lit when the headlight level exceeds it. Glow pool count adds only for lit cars; brake pools unaffected.
- Windscreen frost clears a fixed disc (radius 1.0 at x = +-0.45, y = 1.45, object space); not tied to wiper state.
- Snow on cars: `setSnow(level)` on `VehicleMeshes` and `TrafficMeshes` (`traffic/meshes.ts`), called from `scene/useTownFrame.ts:111` with `wx.snow`. The module owns `uniforms.snow`; it does not import `shaders/wetSurface`.
- Horn logic lives in `vehicles/horns.ts`. `VehicleSystem` methods delegate, so the API is unchanged.
- Snow caps on cars: the snow code moved into `NORMAL_SPIN` (replaces `#include <beginnormal_vertex>`), with uniform `mat3 snowInst` and varyings `vSnowUp`, `vFrontGlass`.

## Block merges (phase 3, traffic)
- Lane paths: an end is open when it lies on the outermost junction of its grid line (`vehicles.ts` `pathOpenness`). A merge-cut end is closed: no edge extension, no spawn at a closed start, and a vehicle must turn at a closed end (`decideAmongAllowed`, straight weight 0). Without merges every end is open.
- Junction arms (`buildArms`, `vehicles/build.ts:165`): counted from lane paths through a junction; an open path end counts as an arm toward the map edge. 4 arms: old logic and random draws untouched. 3 arms (T): signal kept, the 60/20/20 split renormalised over the moves that exist (through road 75/25). 2 arms (straight or bend): stop lines lose their light (empty lightId), so vehicles only yield to pedestrians on the crosswalk and to the junction grant.
- Turns into removed arms cannot happen: no lane path exists there, and `makeConnector` rejects targets that end at the junction.
- Parking: junctions beyond a road piece's ends are ignored. Output without merges is identical.
- Pedestrians: no code change needed. The old street mouth on a boundary sidewalk becomes plain sidewalk. Doors on the merged block's new frontage sit up to about 1.5 m inside the old street area, so tests shrink the removed strips 2.5 m back from the remaining streets.
- Signal heads: `streets/furniture.ts` draws poles and heads only for real arms (`armCount` > 2), so 2-arm junctions get none. Traffic side: `lightPos` in `vehicles/build.ts` falls back to the intersection centre when a path's light id is missing, so the stop line stays.
- Tests: `tests/blockMergeTraffic.test.ts` (2x2 merge `block-2-2..3-3`, 1x3 merge `block-1-0..1-2`): arms, signals, renormalised split, closed ends, parking, and 20 simulated minutes without gridlock.

## Open items
- Car-roof leaf landing (`vehicleSurfaces`) is not wired; wire only when the user asks. Keep the boxes in `SurfaceBox` shape so leaf code does not change. Verify shader compile in a standalone renderer, not by eye (the built-in pane cannot paint frames).
- Wiper disc is static; parked wipers still clear the glass. Acceptable approximation, not verified by eye.
- Verified only by eye at street level in one close-up (faces, hair cap). Coat tails, hair variety and the morph were not checked by eye after the latest changes.
- Per-person triangles could be cut by moving hair and garments into their own instanced meshes (more draw calls). Not done.

## Verify
`npx vitest run tests/vehicle*.test.ts tests/people.test.ts tests/blockMergeTraffic.test.ts tests/traffic.determinism.test.ts` (rerun the people timing flake alone), then the full suite and `npx tsc --noEmit`.

## Session 2026-11-01
- Determinism: `EXPECTED_VEHICLES` = `b0d22ec1` (`tests/traffic.determinism.test.ts`). The test imports `generateCity` and `store/model`, so it depends on city, streets and environment output, not on `src/traffic/vehicles/**`. The git tree has no uncommitted src changes at 02b0cdc.
- Tests: `vehicles.test.ts` covers headlight level 0 (300 = brake pools only), level 0.5 (lit = level > threshold), and level 1 (600 = all lit).
- Review found no defects in shader varyings (declared in both stages), the threshold hash, or the glow loop (`gn += lit`, brake slot reuses the index).

## Phase 2 notes (commits 8f96b8e, 720941d)
- Bug fixed (8f96b8e): cars showed only shadows because snow code failed shader compile. Fix: snow code moved into `NORMAL_SPIN`.
- Horn split into `vehicles/horns.ts` (no behaviour change; determinism and horn tests pass).

## Time-of-day density (shared curve)
- Module: `src/traffic/trafficDensity.ts`. `trafficDensityAt(hour)` returns 0..1, pure, wraps 0-24. `TRAFFIC_DENSITY_FLOOR = 0.2`.
- Curve [hour, value]: 0-5 flat 0.20; 6 0.35; 7 0.55; 8 0.75; 9 0.90; 10 0.97; 11 1.00 (peak); 12 0.90; 13 0.80; 15 0.70 (dip); 16 0.78; 17 0.88; 18 0.95; 19 1.00 (peak); 20 0.90; 21 0.70; 22 0.45; 23 0.20; 24 = 0.20.
- Vehicles: `VehicleSystem.density` set by `update(dt, { timeOfDay })`. Spawn timer divides by `max(0.25, multiplier) * density`. Spawn is refused while `total >= capacity * density`, so cars leave and are not replaced at night (no popping). `capacity` itself is unchanged.
- Vehicles without a clock (`timeOfDay` option or `update` env omitted) keep density 1. Vehicle determinism hash `b0d22ec1` is unchanged.
- Walkers: `crowdDensityAt` in `walkers/density.ts` is a re-export of `trafficDensityAt`. Density gates the walker rank threshold, so the visible crowd follows the curve.
- Decision: one curve for both systems, in `src/traffic` (not the store). Floor 0.2, not 0, so night still has some traffic and people.
- Decision: density is a clock input, not a stored value. `useTownFrame` passes `settings.timeOfDay` each frame.
- Determinism: pedestrian hash `EXPECTED_PEDESTRIANS` re-captured to `a8684131` (intentional: the curve changed).
- Tests: `tests/trafficDensity.test.ts` (peaks, floor, monotonic rise 05-11 and fall 19-23, wrap, 03:00 vs 11:00 vehicle count). `tests/people.test.ts` crowd-density block moved to the new peaks.
- Open: the curve values and the 0.2 floor are set by numbers, not checked by eye. Verify the night feel at street level.

## Tuning rule (step 6)
- Rule: traffic and life knobs live in `src/config/tuning/` (`trafficLife`). Feature files import them; geometry and algorithm constants stay local. Moved: density floor, vehicles per path, spawn min/max, turn odds and turn speeds, horn cooldown/global gap/chance, dog share, pigeon/cat/squirrel/butterfly counts. Each moved value has a parity entry in `tests/tuningParity.test.ts`.
- Update 2026-11-09: cruise speeds, walker caps, horn queue and distances, flock and gull counts moved to config (see the 2026-11-09 config update below). `docs/TUNING.md` location cells still point at the old files.

## Session 2026-11-04 (film bird plan)
Plan only, no source edits. Auto film mode: a carrier bird flies high over the town, circles the town and the cathedral, descends along a street, tilts to the sun or moon, returns and perches opposite the cathedral front.

**Existing birds (`src/life/birds.ts`)**
- `PigeonSystem` (line 32): 80 pigeons (`trafficLife.pigeonCount`), states PERCH/PECK/WALK/SCARED/CLIMB/CIRCLE/LAND (20-28). Ground spots from sidewalks and open space, roof spots from `roofSpots` (`spots.ts:99`, height `roofHeight` :28). Scared by any vehicle or pedestrian within 4 m in XZ (`SCARE_RADIUS` in `birds.ts:19`; scare logic in `life/pigeonMotion.ts`, `scare` :61, check around :99, every 5th frame).
- `FlockSystem` (line 182): three closed loops (`FLOCK_DEFS` :173, 25 birds each at alt 26/35/44 m) plus gulls (1 or 2, :529). Loops in `leaderAt` (`life/flockMotion.ts:10`). No disturbance input.
- Determinism: seeded RNGs (`birds.ts:84-85`, `:227-228`) and dt-integrated state (dt clamped to 0.1, :205). Pigeon RNG is drawn per frame (:215). So birds are a function of seed and frame/dt history, not of `simTime`. `life.test.ts:41-56` checks same seed plus same dt sequence only.
- Draw calls: 5 instanced meshes (`life/index.ts` stats). Pigeon 150-250 tris (`life.test.ts:226`), all life under the 40k cap (flyer tri count not measured yet). Life meshes never set `castShadow` (only monuments do, `useTownPieces.ts:69`; `buildings.ts:104` not found, unverified). `budget.test.ts:7-9` excludes birds from the static estimate.
- Ctx: `LifeContext.camera` is passed (`useTownFrame.ts`, life update call) but birds ignore it (only `pets.ts:180` reads it).

**Recommendation: dedicated film carrier, reuse only the visuals**
- Do not reuse `PigeonSystem` or `FlockSystem`: they are stateful, consume RNG per frame, scare-test against vehicle and pedestrian lists, and have closed loops, not a film path.
- Add `src/life/filmBird.ts` (or src/scene/filmCarrier.ts (planned)): pure `poseAt(filmT) -> {position, heading, pitch, roll}` from a piecewise path (Catmull-Rom or analytic arcs) built once from the layout. No RNG, no `dt` integration.
- Visual: `buildFlyerGeometry` + `createAnimalMaterial('flyer')` + `attachAnim` + `setPose` (`common.ts`) into one `InstancedMesh(count 1)` that lives outside `life.group`. This keeps the life test (`<= 6` meshes, `life.test.ts:236`) intact. Perch: `buildPigeonGeometry` at a larger scale. Carrier casts no shadow (`fitSunShadow` reads the camera, `useTownFrame.ts:120`, so camera jumps already move the shadow frustum).
- Trade-off: a separate rig costs 1 draw call in film mode only, is replayable from the film clock, and touches no existing RNG. Reusing the bird would tie film timing to frame dt and to the life RNG.

**Traffic and pedestrians**
- The carrier is not added to `ctx.vehicles` or `ctx.pedestrians` (birds.ts :222-263 would scare on it) and is not in any traffic or walker input.
- Path clearance: the street descent must clear roofs (`roofHeight` = 3.6 + (floors-1) x 3.1, up to about 25 m at 8 floors), lamps, street trees, benches and signal heads. Check clearance per segment against layout lots, `lamps`, `streetTrees`, `benches`, `trafficLights`.
- Normal play: film code runs only when film mode is on. No store writes, no writes into vehicles, walkers or life. Verify by hashing `EXPECTED_VEHICLES` (`b0d22ec1`) and `EXPECTED_PEDESTRIANS` with film mode off (unchanged), and by a life snapshot after a film run.

**Perch opposite the cathedral front (from layout)**
- Cathedral: `blocks` entry with `monument === 'gothic-cathedral'` (`city/generate.ts:280-282`), its single lot from `lots` (`blocks.ts:274-304`): centre `position`, `facing` (front edge direction, avenue preferred), `width`, `depth`, `seed`. Placed at `lot.position`, `rotation.y = lot.facing`, entrance on local +z (`useTownPieces.ts:59-80`, `monument.ts` fit scales the building down if the lot is smaller than 30 m).
- Front point: `position + (sin(facing), cos(facing)) x (depth/2 + frontOffset)`. Use the real fitted bounding box (compute once from `buildMonument` with the lot dims), not design constants: nave eaves 15 m and aisles 8 m (`culture.ts:440-460`) are design-scale values.
- Opposite perch: the road in front (`roads`, orientation and width, `sidewalkWidth`), then the lot on the far side whose `facing` points back at the cathedral. Pick the roof-edge point the way `roofSpots` does (`spots.ts:109-114`) with `roofHeight(lot)+0.35`. Deterministic tie-break by lot `id`. Fallback: a sidewalk spot from `sidewalkSpots` on the far curb.
- Data needed: `blocks` (id, kind, monument, bounds), `lots` (id, blockId, position, facing, width, depth, floors), `roads`, `intersections`, `lamps`, `streetTrees`, `trafficLights`, `townBounds`.

**Knobs (new section src/config/tuning/ (planned filmBird section), owner Traffic & Life for the carrier, UI & Camera for the lens; index in `docs/TUNING.md`)**
- Start altitude above the town (m), town circle radius (m), cathedral orbit radius (m), street descent height above roofs (m), minimum street clearance (m), sky tilt angle (deg), perch hold time (s), segment durations (s). Geometry and the path shape stay local.

**Tests to add**
- `tests/film/filmBird.test.ts`: same film time gives the same pose; the path stays inside `townBounds` minus a margin; street segment clearance vs roofs and furniture; perch lies on the opposite lot's roof edge and faces the cathedral; film mode off leaves life and traffic counts and hashes unchanged.
- `tests/tuningParity.test.ts`: one entry per new knob.

**Phases and acceptance**
1. Layout queries (pure): cathedral front point, opposite perch picker. Test: deterministic, inside lot bounds, facing check. Gate: `vitest run` for the new file.
2. Path module (pure `poseAt`) and clearance check. Gate: bounds and clearance tests green; no RNG import.
3. Carrier mesh behind a dev flag; triangles and draw call +1 measured in a standalone renderer; no shadow. Gate: shader compile, no console errors.
4. Film mode integration with CameraRig (UI & Camera owns the camera). Gate: hashes unchanged with film off; `tsc`, `vitest`, `vite build` pass; look checked in connected Chrome (built-in pane cannot paint frames).

**Risks and mitigations**
1. Path clips roofs or street furniture in narrow streets: per-segment clearance test with a margin, altitude fallback to a higher route.
2. Carrier looks like it hits flocks (23-44 m) or pigeons: route the descent below the flock band, or time the crossing away from flock loops.
3. Determinism drift if film code uses life or sim RNG: separate module, no shared RNG, hash tests in CI.
4. Sun or moon tilt fights the shadow frustum (`fitSunShadow`, `useTownFrame.ts:120`) and causes shimmer: clamp the tilt, keep the carrier out of the shadow pass.
5. Cathedral perch points wrong when the lot is small (fit scale): compute from the fitted bounding box, test on a small and a large lot.
6. Flock counts are local literals (`birds.ts:173-180`, `:529`), against the tuning rule: move them to `trafficLife` if the film work touches them, with parity entries.
7. Doc drift: resolved 2026-11-09 (Conventions now `63333cfb`, the value in `traffic.determinism.test.ts:135`).

**Open questions**
- Is the carrier visible in shot, or only a camera rig? Visible means the mesh and close-range look matter.
- Film clock: fixed path time that pauses with the sim, or real time?
- Night: moon path only when lights are on, or always?
- Perch on a roof edge (visible from the front) or on the far sidewalk?

**Verify (when built)**: `npx vitest run tests/film/filmBird.test.ts tests/life.test.ts tests/traffic.determinism.test.ts`, then full suite, `npx tsc --noEmit`, `npx vite build`.

## Update 2026-11-04 (lead): film bird carrier (P5, not wired yet)

- **New file:** `src/life/filmBird.ts`. `birdPoseAt(t, pathPose)` returns position, heading and pitch of the bird; `createFilmBird()` returns `{group, update, dispose}` with one `InstancedMesh` (count 1, no shadow). Mesh uses `buildFlyerGeometry` and `createAnimalMaterial('flyer')` from `material.ts`. Flap time is the film time, never the wall clock.
- **Not part of traffic:** the bird never enters traffic, pedestrian, pigeon, flock or audio systems and makes no sound. A source test forbids those imports.
- **Knobs:** `trafficLife.filmBirdDistanceM` (7), `filmBirdMinDistanceM` (3), `filmBirdScale` (2.6). Documented in `docs/TUNING.md` section 2.
- **Open:** the bird sits on a fixed side and height relative to the camera; it is not guaranteed to be in frame. Roll is 0 (no bank yet). Needs a screenshot check after FilmRig is wired (Scene & QA).
- **Interface:** `FilmPathPose` (`x, y, z, tx, ty, tz`) mirrors `AutoPose` in `film/autoPath.ts`. When `scene/filmPath.ts` lands, import the type and keep the sampler pure.

## Update 2026-11-04 (traffic-life)

- **Contract check (`birdPoseAt` / `FilmRig`):** bird distance from camera is `max(filmBirdDistanceM, filmBirdMinDistanceM)` = 7 m, exact on every sampled path. Lead decision: bird centred on the look direction at the preferred distance (side offset and sway removed). Knob values unchanged.
- **Draw calls:** `createFilmBird()` group holds exactly one `InstancedMesh` (count 1, no shadow). `tests/budget.test.ts` excludes moving actors by design, so no budget change.
- **Dispose:** `buildFlyerGeometry()` and `createAnimalMaterial()` build new objects per call (no cache), so dispose frees only the bird's own resources. Added test: dispose twice does not throw, group left empty.
- **Isolation:** `scene/FilmRig.tsx` imports `filmBird` (wired; see Review 2026-11-08 item 15). Test guards against traffic, pedestrian, pigeon, flock, audio imports and RNG/clock use.
- **Knobs:** unchanged (7, 3, 2.6). Parity and TUNING.md rows already present.
- **Open:** bird look unchanged, awaiting lead OK. FilmRig mount is done (stale note; see Review 2026-11-08 item 15).

## Update 2026-11-06 (lead): auto film speed
- Cars and pedestrians looked ~5x fast in the auto film. Not a traffic bug: the R3F loop fell back to 'always' and the town ran on wall time. Fixed in `src/film/loopHold.ts` (2f99377). Sim per step stays exact (vehicles and walkers move speed x dt).
- Keep all motion on the `dt` from `useTownFrame`; no wall clocks in `src/traffic` or `src/life`.

## Update 2026-11-06 (traffic-life): child walk gait
- Child walk made calmer. Cycle 0.8 to 0.95 m (slower cadence; speed unchanged, so feet keep pace), swing 1.25 to 0.9 of adult size, eased swing (`eased` in `rigShader.ts`: dwell at the turnaround, peaks kept), knee bend x1.3, arm counter-swing x0.8, step-rate body bob x1.6.
- Knobs: `trafficLife.childStrideCycleM`, `childSwingAmp`, `childSwingEase`, `childKneeK`, `childArmK`, (`childBobK` was removed in T-0034) (config, parity, `docs/TUNING.md`). Adults, teens and elders keep their values (ease 0, multipliers 1 via new per-instance attribute `aGait2`).
- Trap: `aGait2` is a new per-instance attribute; any new gait field needs a place in `peopleMeshes.ts` (create, write, needsUpdate).
- Open: child stride rate still wobbles +-25 percent (`walkers/resolve.ts`); this may still read as jittery. Not checked by eye.

## Update 2026-11-06 (traffic-life): child cadence 50% slower
- Child stride cycle 0.95 to 1.425 m (`trafficLife.childStrideCycleM`): gait cycle time about 1.5x longer at the same walk speed, feet keep pace (phase rate = speed / cycle, `peopleMeshes.ts`). Adults, teens and elders unchanged.
- Child gait-rate wobble +-25 percent to +-5 percent (new knob `trafficLife.childCadenceWobble`, `walkers/resolve.ts`, render only). Per-person phase offset kept.
- Tests: `people.test.ts` child defaults and wobble bounds read the knobs; `tuningParity.test.ts` entries added. Pedestrian determinism hash `EXPECTED_PEDESTRIANS` likely changes (child `speed` output); not re-captured yet.

## Harness refactor (2026-11-06)
- `people/`: `personGeometry.ts` (build, gait lookup), `personShape.ts`, `personParts.ts` (PART, REGION), `personSpec.ts` (specs); `rigShader.ts` (materials), `rigShaderGlsl.ts` (chunks, order unchanged).
- `vehicleMeshes.ts` (meshes), `vehicleShader.ts` (patch, snow stays in NORMAL_SPIN), `vehicleGlow.ts` (headlight pools).
- `vehicles/models.ts` (cars, van, scooter), `vehicles/modelsHeavy.ts` (bus, truck).
- `birds.ts` (classes, constants, flock defs), `pigeonMotion.ts` and `flockMotion.ts` (update and helpers as functions of the instance).
- `pets.ts` (cats, count helpers, roofHeight), `squirrels.ts`, `butterflies.ts`; `life/index.ts` imports them directly.
- Counts, bee share and child gait knob stay in the files the parity test names (`birds.ts`, `pets.ts`, `personGeometry.ts`).

## Review 2026-11-08 (Traffic & Life)

Applied 2026-11-09: corrections 1-15 and 17 are applied in the body above; 18 and 19 corrected as noted.

Checked against the working tree (branch feat/agent-working-room). No tests run. Line numbers below are current; where the body above gives an older number, the number here wins.

**Still valid**
- Key files and module map: every file under `src/traffic/vehicles/`, `src/traffic/walkers/`, `src/traffic/people/`, and `src/life/` exists as listed. Note: `people/` means `src/traffic/people/`.
- Knob list: all 22 `trafficLife` keys exist in `src/config/tuning/trafficLife.ts`. Moved-knob list (Tuning rule) matches the imports in `vehicles/constants.ts`, `walkers/constants.ts`, `life/pets.ts`, `life/birds.ts`, `people/personGeometry.ts`, `walkers/resolve.ts`. All have parity entries in `tests/tuningParity.test.ts` (lines 53-74, 344-352).
- Shader: `vehicle-shader-v2` cache key (`vehicleShader.ts:122`); `NORMAL_SPIN` replaces `#include <beginnormal_vertex>` (`:112`); `snowInst`, `vSnowUp`, `vFrontGlass` present. Trap confirmed: three 0.170.0 `meshlambert` runs `color_vertex` (line 23) before `beginnormal_vertex` (line 28).
- `setSnow` chain: `traffic/meshes.ts:50-51` and `vehicleMeshes.ts:187`.
- Horns: `hornRng` seeded in `vehicles/build.ts:18`; `tryHorn`/`takeHorns` in `vehicles/horns.ts`; `HORN_PED_HOLD_S`, `HORN_COOLDOWN_S`, `HORN_GLOBAL_GAP_S`, `HORN_CHANCE` present. Tests in `tests/vehicleHorns.test.ts` (45 s, 6 s, half, main-sim unchanged) match the Decisions.
- Turns: `decideTurn` (`vehicles/turns.ts:8`), `gateOpen` (`junctions.ts:191`), `decideAmongAllowed` (`vehicles.ts:290`). Turn chances are aliases of `trafficLife` (`constants.ts:25-27`).
- Edge extension: `EDGE_EXTENSION = 28` (`vehicles/constants.ts:19`); tests pass `edgeExtension: 0` (`tests/traffic.test.ts:110`, plus `vehicles.test.ts`, `vehicleOverlap.test.ts`).
- Density: `trafficDensity.ts` and `tests/trafficDensity.test.ts` (peaks, dip, floor, monotonic, wrap, 03:00 vs 11:00).
- Block merges: `tests/blockMergeTraffic.test.ts` covers `block-2-2..3-3` and `block-1-0..1-2`, the renormalised T split, closed ends, and the 20-minute run.
- Life: `SCARE_RADIUS = 4` (`birds.ts:19`); `roofHeight` (`spots.ts:28`, 3.6 + (floors-1) x 3.1); `roofSpots` (`spots.ts:99`); `FLYER_SCALE = 2.6` (`birds.ts:178`); no life mesh sets `castShadow` (only `filmBird.ts:133` sets it false). `tests/life.test.ts` determinism at `:41`.
- Budget: `tests/budget.test.ts:7-9` says moving actors (vehicles, walkers, birds) are excluded from the static estimate.
- Hashes: `EXPECTED_VEHICLES = 'b0d22ec1'` (`tests/traffic.determinism.test.ts:125`).
- Guards: 350-line limit (`harness.test.ts:127-148`, `OVERSIZED` is empty; largest traffic/life file is `life/birds.ts` at 333 lines). No `Math.random` in `traffic` and `life` (`harness.test.ts:85, 87-93`). Feature modules do not import `scene` or `ui` (`harness.test.ts:56-81`; grep of `src/traffic` and `src/life` finds no such import).
- `vehicleSurfaces.ts` is exported from `traffic/index.ts` only; no consumer. Still unwired.
- Verify command paths (`tests/vehicle*.test.ts`, `people.test.ts`, `blockMergeTraffic.test.ts`, `traffic.determinism.test.ts`) exist.
- People: adult-walks-at-child-pace and wobble test (`tests/people.test.ts:314-345`); six-seed avenue test (`people.test.ts:385-389`).
- Film bird (`src/life/filmBird.ts`): knobs 7, 3, 2.6 (`trafficLife.ts:36-40`) and parity rows (`tuningParity.test.ts:70-72, 348-350`). It has no import of traffic, walkers, pigeons, flocks or audio. Test `tests/film/filmBird.test.ts:155` enforces this.

**Corrections (value or path)**
1. `vehicles.ts` is 320 lines, not 314.
2. `vehicles/models.ts` is 302 lines and is no longer "448 lines, not split". The heavy models (bus, truck) moved to `vehicles/modelsHeavy.ts`.
3. `pathOpenness` lives in `vehicles/geometry.ts:68` (called from `vehicles/build.ts:54`), not `vehicles.ts`.
4. `buildArms` is at `vehicles/build.ts:167` (was :165).
5. `headlightThreshold` is at `vehicleMeshes.ts:51` (was :49).
6. `setSnow` call site is `scene/useTownFrame.ts:111` (was :107).
7. `EXPECTED_PEDESTRIANS` is now `63333cfb` (`tests/traffic.determinism.test.ts:135`, re-captured 2026-11-06 for the child gait). Conventions still says `499b5c20` and the 11-04 film note says `a8684131`. Both are stale.
8. `DENSITY_CURVE` no longer exists in `walkers/density.ts`. The curve is `TRAFFIC_DENSITY_CURVE` in `src/traffic/trafficDensity.ts:9`. `walkers/density.ts` only aliases `crowdDensityAt` (line 3) and exports `redRemaining`.
9. `TRAFFIC_DENSITY_FLOOR` is `trafficLife.densityFloor` (`trafficDensity.ts:6`), not a literal 0.2.
10. Life line numbers: `PigeonSystem` at `birds.ts:32` (was 30); `FlockSystem` at `birds.ts:182` (was 469 in an older layout); `FLOCK_DEFS` at `birds.ts:173` (was 460); `leaderAt` is in `life/flockMotion.ts:10` (was `:604` in birds.ts); seeded RNGs at `birds.ts:84-85` and `:227-228`.
11. The scare logic moved out of `birds.ts`. The check and scatter code is in `life/pigeonMotion.ts` (`scare` at :61, `SCARE_RADIUS` use at :99). The "check :222-263" pointer is stale.
12. `tests/life.test.ts` draw-call and triangle test is at `:226` (was :236).
13. Monument castShadow is at `scene/useTownPieces.ts:69` (was :66). `buildings.ts:104` not found; treat as unverified.
14. `pets.ts` reads `ctx.camera` at `:179` (was :180).
15. Film bird is wired. `scene/FilmRig.tsx:20` imports `createFilmBird` and `birdPoseAt`, and `:71` mounts the bird at run start. `scene/filmLook.ts:109` uses `filmBirdMinDistanceM`. The "no src file imports filmBird yet" and "FilmRig mount pending" lines are stale.
16. Film bird test lives in the film test folder (tests/film/).
17. The film plan's `scene/filmPath.ts` is still not present. The sampler lives in `src/film/autoPath.ts`.
18. Pedestrian "never stands on asphalt" test exists: `tests/people.test.ts` (signal-aware crossing block). The asphalt check is also in `tests/blockMergeTraffic.test.ts:191-193`. (Reviewer note was wrong; corrected 2026-11-09.)
19. The "1.15" ratio is in `tests/people.test.ts:407` (`perMetreAvenue > perMetreStreet * 1.15`). (Reviewer note was wrong; corrected 2026-11-09.)
20. `tests/layers.test.ts` guards only core, store and agentRoom. The feature rule lives in `tests/harness.test.ts:56-81`. CLAUDE.md cites `layers.test.ts` for it; the citation is wrong.

**Stale items removed (from the body above; body text left as is, superseded by this section)**
- "Vehicle `models.ts` (448 lines, not split)".
- "`vehicleMeshes.ts` is the next split candidate": already split (`vehicleShader.ts`, `vehicleGlow.ts`, Harness refactor section). Remove from Open items.
- "no src file imports `filmBird` yet" and "FilmRig mount pending".
- Conventions hash `499b5c20` (superseded: `63333cfb`).

**Rules: status**
- 350-line ratchet: valid and enforced (`OVERSIZED` empty; no traffic/life file over 333).
- No `Math.random` in layout code: valid and enforced for traffic and life.
- Feature/scene/ui import ban: valid, enforced by `harness.test.ts`, not by `layers.test.ts`.
- Determinism hashes: valid, enforced by `traffic.determinism.test.ts`.
- Tuning rule for knobs: enforced only for listed knobs (`tuningParity.test.ts`). No guard checks for knob-like literals in feature code. Candidates that look like designer knobs under CLAUDE.md's definition but stay local: flock counts, altitudes and speeds (`birds.ts:173-180`); walker caps (`walkers/constants.ts` MAX_WALKERS, WALKERS_PER_ROAD, MAX_DOGS, PAIR_CHANCE 0.2 share); `DECIDE_DISTANCE = 40` (`vehicles/constants.ts:30`); `HORN_PED_HOLD_S = 5` (`:53`); `HORN_QUEUE_MAX = 8` (`:69`). The Tuning rule says these stay local, so the rule and the CLAUDE.md definition conflict. Lead to decide.

**Open items**
- Flock rows in `docs/TUNING.md` cite `birds.ts:460-462` (now `:173-180`). Owner to fix with the index. Not edited here (outside this file).
- Film bird look is not verified by eye. Needs a connected-Chrome check after FilmRig mount (Scene & QA).
- Car-roof leaf landing (`vehicleSurfaces`) still unwired.
- Walker speed ranges (`looks.ts` `speedFor`) and per-person triangle count (~376) not re-measured.
- Pedestrian timing tests flaky under load: not re-run here.

**Not verified in this review**
- Hair style count, outfit colours, the 70% patterned-top share (test at `people.test.ts:250` exists), draw-call counts 6-7 and 5-6 for people, the frost disc radius (centre offsets confirmed at `vehicleShader.ts:96-97`), and `VehicleSystem.density` set by `update(dt, { timeOfDay })`.

## Update 2026-11-09 (traffic-life): perf test at default crowd
- Request (user): a 600-person crowd is not needed. Perf test flaked when the full suite runs under load (passes solo).
- `tests/people.test.ts` "simulates ... walkers" test now runs at the scene default density (`uiCamera.defaultTrafficMultiplier` 1.75): capacity 385 walkers (`floor(1.75 * WALKERS_PER_ROAD 22 * 10 roads)`), down from the 480 cap. Test name changed to "simulates the default crowd fast enough".
- Asserts: capacity > 0 and < `MAX_WALKERS`; 200-step warm-up before timing; per-frame bound still `< 0.5 ms` over 1500 frames.
- No production change: `MAX_WALKERS` (480), `MAX_DOGS` (120), `WALKERS_PER_ROAD` (22) and all knobs unchanged. No guard test weakened. No new knobs.
- Test file only: `tests/people.test.ts` (import `uiCamera` added).

## Update 2026-11-09 (traffic-life): walker, horn, vehicle, life knobs to config
- New section `src/config/tuning/trafficWalkers.ts` (`trafficWalkers`): `maxWalkers` 480, `maxDogs` 120, `walkersPerRoad` 22, `pairChance` 0.2, `crossMarginS` 2.0, `giveUpWaitS` 150. Feature constants in `walkers/constants.ts` alias them (no duplicate literals).
- `trafficLife` additions: `decideDistanceM` 40, `hornPedHoldS` 5, `hornQueueMax` 8, `hornHardBrakeMps2` -3, `carCruiseMps` 11, `busCruiseMps` 8, `truckCruiseMps` 9, `motorbikeCruiseMps` 13, `scareRadiusM` 4, `flockBirdsPerLoop` 25, `flockAltM` [26, 35, 44], `flockSpeedMps` [9, 10.5, 8.5], `gullsHigh` 2, `gullsLow` 1, `beeShare` 0.2.
- Feature code: `vehicles/constants.ts`, `life/birds.ts` (`FLOCK_DEFS`, `SCARE_RADIUS`, gulls), `life/pets.ts` (`beeCountFor`) read config. Values unchanged, so determinism hashes are unchanged.
- Parity: `tests/tuningParity.test.ts` entries switched to the config properties; use-checks updated for the moved fragments.
- Stays local (algorithm or geometry, not designer knobs): `GHOST_S`, `STUCK_PUSH_S`, `HELD_BACKUP_S`, `REQUEST_RANGE`, `GRANT_EXPIRY_STEPS`, `JUNCTION_SPEED`, `ONCOMING_REACH`, `CROSSWALK_REACH`, `WAIT_DIST`, `TURN_RATE`, `HORN_HARD_BRAKE_RATE`, walker speed ranges (`looks.ts speedFor`), quality tier factors (`life/common.ts`), vehicle footprints and accel/gap.

## Update 2026-11-09 (traffic-life): people perf test measurement
- Before: one warm-up of 200 steps, then a single timed loop of 1500 frames, mean per frame, bound 0.5 ms. Under full-suite load it read 0.65 to 0.71 ms and failed; solo it passed.
- After: fixed warm-up of 300 steps, then nine timed batches of 200 frames. The assertion is on the median of the nine per-frame means, bound unchanged at 0.5 ms. Median ignores batches hit by load or GC pauses.
- Same walker count (385 at the default multiplier) and same guard meaning. No production change.

## Update 2026-11-11 (architect): ownership split (T-0031)
- `src/traffic/people/**` (geometry, rig, shaders, materials, instancing, LOD of people and dogs) now belongs to Graphics & Character: see docs/agents/graphics-character.md. The people items in this handbook (child gait rendering, `aGait2`, `rigShader.ts`, `peopleMeshes.ts`, the people draw-call counts) are history; new work on them goes to that specialist.
- Still here: walker behaviour and simulation (`src/traffic/walkers/**`, `src/traffic/pedestrians.ts`), vehicles, `src/life/**`, and the gait knobs in `trafficLife.ts` (config stays in this section).
- Border: per-instance gait data (speed, phase, pose, amplitude) is written by the walkers and read by the rig. A change on either side of it is agreed through the lead.
