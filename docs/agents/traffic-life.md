# Traffic & Life specialist

Reviewed 2026-11-01 at 02b0cdc

**Owns:** `src/traffic/**` (vehicles, lights, pedestrians, parking, collision, car snow and headlights) and `src/life/**` (pigeons, flocks, cats, squirrels, butterflies, birds) with their tests.

## Key files
- `traffic/vehicles.ts`: the `VehicleSystem` class (public API, step, horns, turn-decision hook; 314 lines). `traffic/lights.ts` (signals, all-red gap), `traffic/pedestrians.ts` (the `Pedestrians` class), `collision.ts` (OBB sweep), `parking.ts`.
- `traffic/vehicleMeshes.ts`: car shader patch (`vehicle-shader-v2`), headlights, snow (`setSnow`).
- `traffic/vehicleSurfaces.ts`: car-roof boxes, exported but not wired (see Open items).

## Module map (split for size, no behaviour change)
Hashes and tests are unchanged by the split. The class files keep their public API; methods they delegate to live in these modules as functions taking the instance (`sys`).

Vehicles (`src/traffic/vehicles/`):
- `types.ts`: render, path, vehicle and stop-line types.
- `constants.ts`: tuning constants, `VEHICLE_SPECS`, class footprints, `TURN_LEFT_CHANCE` / `TURN_RIGHT_CHANCE` (0.2 each), `HORN_*`.
- `geometry.ts`: pure lane geometry (fillets, path extension, arc length, poses, arm bits, path openness).
- `build.ts`: `setupSystem` (lane paths, stop lines, turn connectors, junction arms via `buildArms`).
- `junctions.ts`: junction grants, movement conflicts, `gateOpen`.
- `turns.ts`: `decideTurn` (the manoeuvre roll over the moves that exist).
- `conflict.ts`: stop limits behind vehicles and the swept footprint, syncing poses.
- `motion.ts`: `advance` (the per-vehicle step), `roomBehind`, `transfer`, `resolveJam`.
- `spawn.ts`: `create`, `release`, `trySpawns`, `isFree`, class and variant picks.
- `render.ts`: `getVehicles` (render records for the mesh layer).
- `horns.ts`: `tryHorn` and `takeHorns` (cooldown, city-wide gap, queue). `VehicleSystem` methods delegate here.
- Existing: `builder.ts`, `models.ts` (448 lines, not split: model geometry), `variants.ts`.

Pedestrians (`src/traffic/walkers/`):
- `types.ts`, `constants.ts`, `density.ts` (`DENSITY_CURVE`, `crowdDensityAt`, `redRemaining`), `graph.ts` (`buildGraph`), `setup.ts`, `looks.ts` (`createPeople`, speed by age and sex, hair), `movement.ts`, `behaviour.ts` (benches, looking, chatting, doors), `resolve.ts` (per-step state resolution), `output.ts` (`getPedestrians`).
- Sizes: all new files are at most 283 lines (`walkers/movement.ts`); `vehicles.ts` is 314 lines; `pedestrians.ts` is 281 lines.

## Conventions
- Determinism: the main simulation hash must not change when optional systems change. Horns use a separate RNG (`hornRng`); read-or-not of horns must not alter vehicles (tested).
- Per-frame code allocates nothing; render structs are pooled.
- Hashes: `EXPECTED_VEHICLES` = `b0d22ec1` and `EXPECTED_PEDESTRIANS` = `499b5c20` (`tests/traffic.determinism.test.ts`). Re-capture only for intentional changes, and say why.

## Traps
- Vehicles spawn at the map border with a long edge extension (default 28 m); tests that need the old numbers pass `edgeExtension: 0`.
- Junction: first come first served with a movement-conflict matrix; a jam is broken by backing up, then a "ghost" pass (overlap accepted as a last resort).
- Lanes sit close to the road centre line to avoid overlap with parked cars.
- Pedestrian timing tests (`tests/people.test.ts`, `tests/audioPeople.test.ts`) are flaky under load: rerun alone.
- Crowd and traffic density: see "Time-of-day density" below (replaces the old 8:30/17:30 rush-hour curve).
- Snow in three r170 `color_vertex` runs before `beginnormal_vertex`. Snow code that reads the final normal or `color` must sit in the normal chunk (`NORMAL_SPIN`), after the normal is set. Placing it earlier reads stale values or fails compile ("objectNormal undeclared", the cause of the phase 2 car-invisible bug).
- Any change to the vehicle shader interface needs a `vehicle-shader-v2` cache key bump (new `uSnow` uniform and varyings).
- Per-person triangles are about 376 in all four age groups; hidden parts still draw (they collapse to a point in the shader).

## Decisions
- Turns: 60% straight, 20% left, 20% right. Yellow: a vehicle past the stop line continues; behind it stops (queues behind a leader). Green needs a clear crosswalk.
- Horns (`vehicles/constants.ts`, `horns.ts`): 45 s per-vehicle cooldown, 6 s city-wide gap, 50% coin flip, honk on pedestrians holding a green or hard braking.
- People morph: male and female shapes must emit identical vertex counts and order (RigBuilder skips degenerate triangles, so any zero-size part breaks it; `buildPerson` throws). Only x/z may change: a depth change on the stooped elder torso turns into a height change (y), so torso depth is shared.
- Dog trail: candidate spots are tried until one is off the asphalt (test "never stands on asphalt").
- Child pairs: the adult (leader) walks at the child's own base pace; the child's rendered speed wobbles +-25 percent (render only). Pair ids are consecutive (follower id = leader id + 1), and a child is always a follower. The pace test relies on this.
- People (2026 overhaul): four age groups (adult, teen, child, elder), one mesh each, sexes by morph. Draw calls: main 6 to 7, shadow 5 to 6.
- Hair: 10 styles. Women (teens and up): 90% long, 10% short. Elders mostly grey or white.
- Outfits: pure function of season, traits and two stable values (`outfit.ts`). A coat (winter, or 60% of autumn walkers) recolours the top and sleeves and shows coat tails (a short flare from the waist to the upper thigh; not a skirt).
- Speeds (m/s): child 1.4-1.65, teen 1.4-1.6, adult men 1.15-1.43, women 1.08-1.36, elders 0.82-0.92 (women 0.78-0.88).
- Pairs: elder couples, adult couples (opposite sex), parent+child, parent+teen, teen friends.
- No dresses and no ao dai: removed at the user's final decision.
- Patterned tops: 70% of walkers, six patterns, drawn in the fragment shader from the model position (no textures, no draw calls). Coats and bare sleeves stay plain.
- The avenue-versus-street density test averages six seeds; the threshold is 1.15.
- Headlights: per-car. `headlightThreshold(id)` (`vehicleMeshes.ts:49`) is a seeded hash of the id in [0,1); a car is lit when the headlight level exceeds it. Glow pool count adds only for lit cars; brake pools unaffected.
- Windscreen frost clears a fixed disc (radius 1.0 at x = +-0.45, y = 1.45, object space); not tied to wiper state.
- Snow on cars: `setSnow(level)` on `VehicleMeshes` and `TrafficMeshes` (`traffic/meshes.ts`), called from `scene/useTownFrame.ts:107` with `wx.snow`. The module owns `uniforms.snow`; it does not import `shaders/wetSurface`.
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
- `vehicleMeshes.ts` is the next split candidate: shader patch and glow mesh could move to `vehicles/` modules.
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
- Walkers: `crowdDensityAt` in `walkers/density.ts` is an alias of `trafficDensityAt`. Density gates the walker rank threshold, so the visible crowd follows the curve.
- Decision: one curve for both systems, in `src/traffic` (not the store). Floor 0.2, not 0, so night still has some traffic and people.
- Decision: density is a clock input, not a stored value. `useTownFrame` passes `settings.timeOfDay` each frame.
- Determinism: pedestrian hash `EXPECTED_PEDESTRIANS` re-captured to `a8684131` (intentional: the curve changed).
- Tests: `tests/trafficDensity.test.ts` (peaks, floor, monotonic rise 05-11 and fall 19-23, wrap, 03:00 vs 11:00 vehicle count). `tests/people.test.ts` crowd-density block moved to the new peaks.
- Open: the curve values and the 0.2 floor are set by numbers, not checked by eye. Verify the night feel at street level.

## Tuning rule (step 6)
- Rule: traffic and life knobs live in `src/config/tuning.ts` (`trafficLife`). Feature files import them; geometry and algorithm constants stay local. Moved: density floor, vehicles per path, spawn min/max, turn odds and turn speeds, horn cooldown/global gap/chance, dog share, pigeon/cat/squirrel/butterfly counts. Each moved value has a parity entry in `tests/tuningParity.test.ts`.
- Open: cruise speeds (`VEHICLE_SPECS`) and walker caps stay local. `docs/TUNING.md` location cells still point at the old files.

## Session 2026-11-04 (film bird plan)
Plan only, no source edits. Auto film mode: a carrier bird flies high over the town, circles the town and the cathedral, descends along a street, tilts to the sun or moon, returns and perches opposite the cathedral front.

**Existing birds (`src/life/birds.ts`)**
- `PigeonSystem` (line 30): 80 pigeons (`trafficLife.pigeonCount`), states PERCH/PECK/WALK/SCARED/CLIMB/CIRCLE/LAND (20-28). Ground spots from sidewalks and open space, roof spots from `roofSpots` (`spots.ts:99`, height `roofHeight` :28). Scared by any vehicle or pedestrian within 4 m in XZ (`SCARE_RADIUS` :17, check :222-263, every 5th frame).
- `FlockSystem` (line 469): three closed loops (`FLOCK_DEFS` :460, 25 birds each at alt 26/35/44 m) plus gulls (1 or 2, :529). Loops in `leaderAt` (:604). No disturbance input.
- Determinism: seeded RNGs (:82-83, :515) and dt-integrated state (dt clamped to 0.1, :205). Pigeon RNG is drawn per frame (:215). So birds are a function of seed and frame/dt history, not of `simTime`. `life.test.ts:41-56` checks same seed plus same dt sequence only.
- Draw calls: 5 instanced meshes (`life/index.ts` stats). Pigeon 150-250 tris (`life.test.ts:236`), all life under the 40k cap (flyer tri count not measured yet). Life meshes never set `castShadow` (only monuments do, `useTownPieces.ts:66`, `buildings.ts:104`). `budget.test.ts:7-9` excludes birds from the static estimate.
- Ctx: `LifeContext.camera` is passed (`useTownFrame.ts:157`) but birds ignore it (only `pets.ts:180` reads it).

**Recommendation: dedicated film carrier, reuse only the visuals**
- Do not reuse `PigeonSystem` or `FlockSystem`: they are stateful, consume RNG per frame, scare-test against vehicle and pedestrian lists, and have closed loops, not a film path.
- Add `src/film/filmBird.ts` (or `src/scene/filmCarrier.ts`): pure `poseAt(filmT) -> {position, heading, pitch, roll}` from a piecewise path (Catmull-Rom or analytic arcs) built once from the layout. No RNG, no `dt` integration.
- Visual: `buildFlyerGeometry` + `createAnimalMaterial('flyer')` + `attachAnim` + `setPose` (`common.ts`) into one `InstancedMesh(count 1)` that lives outside `life.group`. This keeps the life test (`<= 6` meshes, `life.test.ts:236`) intact. Perch: `buildPigeonGeometry` at a larger scale. Carrier casts no shadow (`fitSunShadow` reads the camera, `useTownFrame.ts:116`, so camera jumps already move the shadow frustum).
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

**Knobs (new section `src/config/tuning/filmBird.ts`, owner Traffic & Life for the carrier, UI & Camera for the lens; index in `docs/TUNING.md`)**
- Start altitude above the town (m), town circle radius (m), cathedral orbit radius (m), street descent height above roofs (m), minimum street clearance (m), sky tilt angle (deg), perch hold time (s), segment durations (s). Geometry and the path shape stay local.

**Tests to add**
- `tests/filmBird.test.ts`: same film time gives the same pose; the path stays inside `townBounds` minus a margin; street segment clearance vs roofs and furniture; perch lies on the opposite lot's roof edge and faces the cathedral; film mode off leaves life and traffic counts and hashes unchanged.
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
4. Sun or moon tilt fights the shadow frustum (`fitSunShadow`, `useTownFrame.ts:116`) and causes shimmer: clamp the tilt, keep the carrier out of the shadow pass.
5. Cathedral perch points wrong when the lot is small (fit scale): compute from the fitted bounding box, test on a small and a large lot.
6. Flock counts are local literals (`birds.ts:460-464`, `:529`), against the tuning rule: move them to `trafficLife` if the film work touches them, with parity entries.
7. Doc drift: Conventions still says `EXPECTED_PEDESTRIANS` = `499b5c20`. The test (`traffic.determinism.test.ts:132`) says `a8684131`. Fix Conventions when the next traffic doc edit happens.

**Open questions**
- Is the carrier visible in shot, or only a camera rig? Visible means the mesh and close-range look matter.
- Film clock: fixed path time that pauses with the sim, or real time?
- Night: moon path only when lights are on, or always?
- Perch on a roof edge (visible from the front) or on the far sidewalk?

**Verify (when built)**: `npx vitest run tests/filmBird.test.ts tests/life.test.ts tests/traffic.determinism.test.ts`, then full suite, `npx tsc --noEmit`, `npx vite build`.
