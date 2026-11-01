# Traffic & Life specialist

**Owns:** `src/traffic/**` (vehicles, lights, pedestrians, parking, collision) and `src/life/**` (pigeons, flocks, cats, squirrels, butterflies, birds) with their tests.

## Key files
- `traffic/vehicles.ts`: the `VehicleSystem` class (public API, step, horns, turn-decision hook). `traffic/lights.ts` (signals, all-red gap), `traffic/pedestrians.ts` (the `Pedestrians` class), `collision.ts` (OBB sweep), `parking.ts`.

## Module map (split for size, no behaviour change)
Hashes and tests are unchanged by the split. The class files keep their public API; methods they delegate to live in these modules as functions taking the instance (`sys`).

Vehicles (`src/traffic/vehicles/`):
- `types.ts`: render, path, vehicle and stop-line types.
- `constants.ts`: tuning constants, `VEHICLE_SPECS`, class footprints.
- `geometry.ts`: pure lane geometry (fillets, path extension, arc length, poses, arm bits, path openness).
- `build.ts`: `setupSystem` (the old constructor: lane paths, stop lines, turn connectors, junction arms).
- `junctions.ts`: junction grants, movement conflicts, `gateOpen`.
- `turns.ts`: `decideTurn` (the manoeuvre roll over the moves that exist).
- `conflict.ts`: stop limits behind vehicles and the swept footprint, syncing poses.
- `motion.ts`: `advance` (the per-vehicle step), `roomBehind`, `transfer`, `resolveJam`.
- `spawn.ts`: `create`, `release`, `trySpawns`, `isFree`, class and variant picks.
- `render.ts`: `getVehicles` (render records for the mesh layer).
- `horns.ts`: `tryHorn` and `takeHorns` (cooldown, city-wide gap, queue). `VehicleSystem` methods delegate here.
- Existing: `builder.ts`, `models.ts` (448 lines, not split yet: model geometry), `variants.ts`.

Pedestrians (`src/traffic/walkers/`):
- `types.ts`: public render and option types, and the walking-graph types.
- `constants.ts`: poses, trait bits, body types, states and tuning. `pedestrians.ts` re-exports the public ones.
- `density.ts`: `DENSITY_CURVE`, `crowdDensityAt`, `redRemaining`.
- `graph.ts`: road rectangles and the walking graph (`buildGraph`).
- `setup.ts`: `setupSystem` (the old constructor).
- `looks.ts`: `createPeople`, walking speed by age and sex, hair style and colour.
- `movement.ts`: edges, turns, crossing rules, spawns at edges, `stepWalk` and friends.
- `behaviour.ts`: benches, looking, chatting, doors, returning, moving through doors.
- `resolve.ts`: the per-step resolution of each walker state.
- `output.ts`: `getPedestrians` (render records).
- Sizes: all new files are at most 283 lines; the two class files are 338 (vehicles) and 281 (pedestrians).

## Conventions
- Determinism: the main simulation hash must not change when optional systems change. Horns use a separate RNG (`hornRng`); read-or-not of horns must not alter vehicles (tested).
- Per-frame code allocates nothing; render structs are pooled.

## Traps
- Vehicles spawn at the map border with a long edge extension (default 28 m); tests that need the old numbers pass `edgeExtension: 0`.
- Junction: first come first served with a movement-conflict matrix; a jam is broken by backing up, then a "ghost" pass (overlap accepted as a last resort).
- Lanes sit close to the road centre line to avoid overlap with parked cars.
- Pedestrian timing test is a known flake under load: rerun it alone.
- Crowd density: busy until 22:00, a few by 23:00, minimum 05:00, building up from 06:00.

## Decisions
- Turns: 60% straight, 20% left, 20% right. Yellow: a vehicle past the stop line continues; behind it stops (queues behind a leader). Green needs a clear crosswalk.
- Horns: 45 s per-vehicle cooldown, 6 s city-wide gap, 50% coin flip, honk on pedestrians holding a green or hard braking.

- People morph: the male and female shapes must emit identical vertex counts and order (RigBuilder skips degenerate triangles, so any zero-size part breaks it; buildPerson throws). Only x/z may change: a depth change on the stooped elder torso turns into a height change (y), so torso depth is shared.
- Dog trail: a dog trailing its owner round a kerb could stand in the road. Fixed: candidate spots are tried until one is off the asphalt (test "never stands on asphalt" caught it).
- Child pairs: the adult (leader) walks at the child's own base pace, so the adult follows the child's speed, slow or fast. The child's rendered speed wobbles +-25 percent around it (render only, positions unchanged). Teen followers keep a x1.1 rate. Positions mirror the leader, so feet can slide.
- Pair ids are consecutive (follower id = leader id + 1), and a child is always a follower. The pace test relies on this.
- Hidden parts (other hair styles, garments, facial hair) are still drawn: each person is about 376 triangles in all four age groups (was 236). Hidden parts collapse to a point in the shader.

## Decisions
- People (2026 overhaul): four age groups (adult, teen, child, elder), one mesh each, sexes by morph (aMorph/aMorphN weighted by aLook2.z). Draw calls: main 6 to 7, shadow 5 to 6.
- Hair: 10 styles (crop, side parting with fringe, curly as the cap widened in the shader, bald, long, ponytail, bun, bob, long to the waist, pigtails). Elders mostly grey or white.
- Outfits: pure function of season, traits and two stable values (outfit.ts), so one set per season, no flicker. A coat (winter, or 60% of autumn walkers) recolours the top and sleeves in the accent colour and shows coat tails: a short flare from the waist to the upper thigh (part COAT, hem at hip minus 0.2 m), so trousers show below. The coat tails are not a skirt.
- Speeds (m/s): child 1.4-1.65, teen 1.4-1.6, adult men 1.15-1.43, women 1.08-1.36, elders 0.82-0.92 (women 0.78-0.88). Gait cycle shorter for children and elders.
- Pairs: elder couples, adult couples (opposite sex), parent+child, parent+teen, teen friends.
- No dresses and no ao dai: removed at the user's final decision. Women wear trousers and the coat tails; the dress and tunic shapes and their traits are gone.
- Hair for women (teens and up): 90 percent long (shoulder, waist, long bob, pigtails), 10 percent short (crop, side parting, curly, ponytail, bun). Children and men keep their own mix.
- Patterned tops: 70 percent of walkers, six patterns (dots, hearts, horizontal, vertical, checks, diagonal), drawn in the fragment shader from the model position: no textures or draw calls. Coats and bare sleeves stay plain.
- The avenue-versus-street density test averages six seeds. Seed 8 alone dropped to 1.08 after the look rules changed (others 1.2 to 1.4), and the threshold stays at 1.15.
- Determinism hash EXPECTED_PEDESTRIANS re-captured to '499b5c20' (intentional: looks, speeds, gait, dog fix, hair, pattern and child-pace rules, and the removed dress rolls).

## Block merges (phase 3, traffic)
- Lane paths: an end is open when it lies on the outermost junction of its grid line (vehicles.ts `pathOpenness`). A merge-cut end is closed: no edge extension, no spawn at a closed start, and a vehicle must turn at a closed end (`decideAmongAllowed`, straight weight 0). Without merges every end is open, so outputs and hashes are unchanged.
- Junction arms (`buildArms`): counted from the lane paths through a junction; an open path end counts as an arm toward the map edge. 4 arms: old logic and random draws untouched. 3 arms (T): signal kept, the 60/20/20 split renormalised over the moves that exist (through road 75/25). 2 arms (straight or bend): stop lines lose their light (empty lightId), so vehicles only yield to pedestrians on the crosswalk and to the junction grant.
- Turns into removed arms cannot happen: no lane path exists there, and `makeConnector` rejects targets that end at the junction.
- Parking: junctions beyond a road piece's ends are ignored; they made spans across the removed part. Output without merges is identical (checked against the old code for 5 seeds).
- Pedestrians: no code change needed. The graph comes from the remaining roads and crosswalks; the old street mouth on a boundary sidewalk becomes plain sidewalk. Doors on the merged block's new frontage sit up to about 1.5 m inside the old street area, so tests shrink the removed strips 2.5 m back from the remaining streets.
- Tests: `tests/blockMergeTraffic.test.ts` uses a 2x2 merge (block-2-2..3-3) and a 1x3 merge (block-1-0..1-2). It covers arms, signals, the renormalised split, closed ends, parking, and 20 simulated minutes without gridlock, with nobody on removed streets or on asphalt off a crosswalk.
- Open: signal heads are drawn by `src/streets/furniture.ts` (City & Streets) for all four arms at every remaining light. It should draw only real arms, and none at 2-arm junctions.

## Open items
- Verified only by eye at street level in one close-up (faces, hair cap). Coat tails, hair variety and the morph were not checked by eye after the latest changes.
- Per-person triangles could be cut by moving hair and garments into their own instanced meshes (more draw calls). Not done.

## Verify
`npx vitest run tests/vehicle*.test.ts tests/people.test.ts tests/blockMergeTraffic.test.ts` (rerun the flake alone), then the full suite.
- 2-arm junctions have no light in `layout.trafficLights` (City & Streets, generate.ts). `lightPos` in vehicles.ts falls back to the intersection centre for the stop line when the path's light id is missing.

## Session 2026-11-01
- Trap: `vehicle-shader-v2` cache key bump is required (new `uSnow` uniform and varyings). Keep bumping it on any shader interface change.
- Decision: per-car headlights. `headlightThreshold(id)` is a Fibonacci hash of the id in [0,1); lit when `headlights > threshold`. Glow pool count adds only for lit cars; brake pools unaffected.
- Decision: windscreen frost clears a fixed disc (radius 1.0 at x = +-0.45, y = 1.45, object space). It is not tied to wiper state.
- Determinism: `EXPECTED_VEHICLES` = b0d22ec1 passes. `src/traffic/vehicles/**` and `walkers/**` match HEAD, so the hash change comes from uncommitted city/streets/environment layout edits. Confirm with those owners before commit.
- Review: no defects found in shader varyings (declared in both stages), threshold hash, or glow loop (`gn += lit`, brake slot reuses the index).
- Open: `vehicles.test.ts` only checks level 1 (600 = all lit). Add level 0 (300) and a partial-level case.
- Open: wiper disc is static; parked wipers still clear glass. Acceptable approximation, not verified by eye.
- Done: `traffic/vehicleMeshes.ts` no longer imports `shaders/wetSurface`. Snow comes in through `setSnow(level)` (VehicleMeshes, TrafficMeshes), called from `scene/useTownFrame.ts` with `wx.snow`. The shader reads the module's own `uniforms.snow`, so the value is identical to the old shared `weatherUniforms.uSnow`.
- Done: horn logic moved to `vehicles/horns.ts` (no behaviour change; determinism hash and horn tests pass).
- Note: `vehicles.ts` is 338 lines, not the 1794 quoted in the architect finding. Recheck the architect's count.
- Follow-up: added `vehicles.test.ts` cases for headlight level 0 (300 = brake pools only) and level 0.5 (300 + lit count, lit = level > threshold(id)). 27/27 pass.
- Hash b0d22ec1 holds on the current tree. Test imports `generateCity` (src/city, src/streets) and `store/model`, so it depends on the uncommitted city/streets/environment edits, not on src/traffic/vehicles/** (unchanged from HEAD).

## Phase 2 (snow, horns, handbook)
- Trap: in three r170 `color_vertex` runs before `beginnormal_vertex`. Snow code that reads the final normal or `color` must sit in the normal chunk (`NORMAL_SPIN`), after the normal is set. Placing it earlier reads stale values.
- Decision: snow is set by `setSnow(level)` (VehicleMeshes, TrafficMeshes). `scene/useTownFrame.ts` calls it with `wx.snow` after `weather.update`. The module owns `uniforms.snow`; it no longer imports `shaders/wetSurface`.
- Decision: horn logic lives in `vehicles/horns.ts` (`tryHorn`, `takeHorns`). `VehicleSystem` methods delegate, so the API is unchanged.
- Note: `vehicles.ts` is 338 lines. The architect's 1794-line figure is wrong, so recheck it.
- Open: the full vitest run timed out on module loads (15 files, "Timeout calling fetch"). Rerun the full suite on a quiet machine. Owned suites pass (76/76).
- Open: `vehicleMeshes.ts` (447 lines) is the next split candidate: shader patch and glow mesh could move to `vehicles/` modules.

## Commit 8f96b8e (Phase 2: car snow fix, horn split, vehicle surfaces)
- Bug: cars showed only shadows. Snow code in `vehicleMeshes.ts` failed shader compile with "objectNormal undeclared", so the car material was not drawn.
- Fix: snow code moved into `NORMAL_SPIN`, which replaces `#include <beginnormal_vertex>`. Adds uniforms `mat3 snowInst`, varyings `vSnowUp`, `vFrontGlass`.
- Trap: r170 MeshLambert runs `color_vertex` before `beginnormal_vertex`. Any code that reads `objectNormal` or `color` must sit after `NORMAL_SPIN`. Placing it earlier fails compile or reads stale values.
- Decision: `src/traffic/vehicles/horns.ts` holds horn logic. No behaviour change.
- Decision: `src/traffic/vehicleSurfaces.ts` exports `vehicleSurfaces(vehicles, parked?, out?)`, returning `SurfaceBox`-shaped boxes. Re-exported from `src/traffic/index.ts` (`VehicleSurfaceBox` type too). NOT wired into any consumer. Verified by grep.
- Decision: car-roof leaf landing is deferred by the user. Leaves rest on sidewalk tops only (`streets/pavementSurfaces.ts`).
- Wiring: `scene/useTownFrame.ts` calls `trafficMeshes.setSnow(wx.snow)` right after `weather.update`.
- Open: wire `vehicleSurfaces` only when the user asks for car-roof landing. Keep the boxes the same shape as `SurfaceBox` so no leaf code changes.
- Verify: check shader compile in a standalone renderer, not by eye. Built-in pane cannot paint frames.
