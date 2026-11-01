# City & Streets specialist

**Owns:** `src/city/**` (generator, layout, streetscape, layout key) and `src/streets/**` (roads, markings, furniture, decor, fountain water) with their tests.

## Key files
- `city/generate.ts`, `layout.ts`, `blocks.ts`, `layoutKey.ts`: perimeter blocks, lots, avenues, crosswalks, lane offsets.
- `streets/builder.ts` (geometry helpers), `furniture.ts`, `decor.ts` + `decorGeometry.ts` (bus stops, kiosks, bike racks, manholes, road wear, paving, kerb corners, tactile bars, fountain), `water.ts`, `index.ts` (meshes).

## Conventions
- Placement is a pure function of the layout and `layout.seed`.
- Solids sit on the building side of the sidewalk, outside the pedestrian line, clear of lamps, bins, trees, crosswalks and lanes.
- Decals use distinct heights plus the overlay material's polygonOffset; never coplanar.
- Layout is generated once per settings change; traffic or weather sliders must not rebuild blocks (`layoutKey`).

## Traps
- Draw-call budget: base streetscape is 6 meshes, decor adds 2 (`streets-shelter-glass`, `streets-fountain-water`).
- `budget.test.ts` has limited triangle headroom (~46k main pass at the time of writing).
- The fountain plaza must avoid courtyard greenery: planFountain reads the greenery triangles (greeneryFootprint.ts, same generator and seed as the scene) and rejects any centre whose plaza disc (+0.3 m) touches one. Courtyards are 10 to 23 m and hedges plus beds fill most of them, so on some towns (seeds 1 and 1234 at 300 m) no fountain fits and it is omitted.
- Tactile bars at the first crossing stripe reach into the rounded corner: clearOfKerbCorners cuts them back to the arc.
- Sidewalk strips are 3 m (street) and 4.5 m (avenue); the 0.5 m kerb radius fits. Vertical strips are cut by the crossing sidewalk footprint (walk cut), horizontal strips by the carriageway only (carriage cut), so only horizontal strips own corners.
- Traffic reads `lanes` and `laneOffsetFor`: moving lanes changes vehicle behaviour.

## Decisions
- Rounded kerbs (0.5 m) are built into the sidewalk surfaces (surfaces.ts roundedKerbCorner): kerb band, sidewalk patch, arc wall, open corner left as ground. Replaces the painted stone. No new meshes; same-facing overlap count unchanged versus baseline (1874 on surfaces).
- Fountain placement uses greenery triangles (read only) instead of tree positions alone. No edit in src/environment.

## Open items
- Environment request: keep one courtyard clear (or reserve a disc) so the fountain fits on dense seeds (1 and 1234 at 300 m). Without it the fountain is omitted there.
- Open: the open corner shows the 4 cm asphalt underlay as a gutter strip (intended, not checked by eye up close).
- Coplanar audit tolerance (2 cm) flags many pre-existing underlay/ground pairs; not fixed here.

## Verify
`npx vitest run tests/streets.test.ts tests/streetDecor.test.ts tests/kerbCorners.test.ts tests/budget.test.ts`.

## Block merging (phase 1: data and geometry)
- Input: `blockMerges` in the settings (default none). Each group lists 2 to 4 house block ids forming one full rectangle of grid cells (`city/merge.ts`, `resolveBlockMerges`). Other groups are rejected and ignored.
- Ids: houses `block-<c>-<r>`; merged `merged-<c0>-<r0>-<c1>-<r1>` from the covered cell range. Splitting = removing the group.
- Geometry: merged bounds = union of members; lots = perimeter of the merged bounds; courtyard = interior of the merged bounds (this includes the seams, not only the member courtyards).
- Streets: an interior grid line of a merge is cut between the two outer streets that bound it (`splitAround`). Road pieces get ids `road-v-<i>-<k>` / `road-h-<j>-<k>`; untouched lines keep `road-v-<i>`. Junctions, crosswalks, lights, lamps, benches and street trees inside the merge are dropped.
- Traffic paths are built per piece and end at the outer junction; Traffic (phase 3) handles turns, T and 2-arm junctions.
- Junction arms: `city/junctionArms.ts` (same rule as traffic buildArms: piece continues past the centre, or ends there at the map edge). Signal heads are drawn only for real arms; junctions with 2 arms or fewer get no pole. generateCity drops their light from `trafficLights` (only when merges exist); vehicles.ts falls back to the intersection centre for a path light id without a light, so the crosswalk stop line stays. No merges: 4 arms everywhere, output unchanged.
- Layout key appends merges only when present; no merges keeps the old key and output (hashes checked in tests/blockMerge.test.ts).
- Crossings: with merges, a crosswalk is kept only if both ends land on a sidewalk corner (perpendicular arms E+W for a crossing over a vertical road, N+S over a horizontal one). Tactile bars follow.
- Merged courtyards carry `courtyard.merged = true` (`CourtyardRect`). Courtyard tree obstacles for greenery: `courtyardTreeObstacles` in city/streetscape.ts (used by greeneryFootprint; Scene can reuse it).

## Session 2026-11-01
- Traps: tyre-track `DataTexture` (streets/index.ts:177) is not pushed to `textures`, so streetscape dispose() leaks it on every layout rebuild. Fix: push it.
- Traps: evergreen snow caps (`snowLeaves`, natureTrees.ts:232) ignore leaf alpha, so opaque white slabs cover needle gaps. Needs an alpha-aware cap or a leaf-texture mask.
- Traps: `snowCap` lifts each triangle along its own normal, so shared edges open a 0.05 lip. Harmless at range, not checked by eye.
- Decision: tyre tracks use layout.seed ^ 0x7c3a9e11 and fixed path order (deterministic). Grid rect is the true town bounds; texel width is ceil-rounded (under 0.5 m stretch, accepted).
- Decision: winter snow caps are hidden outside winter (`apply`); evergreen leaves stay at density 1.
- Decision: COURTYARD_TREE_RADIUS = 1.5 (streetscape.ts:40). The committed 4.7 had no rationale in the repo and caused extra fountain omissions. Lead decided 1.5. Fewer greenery exclusion discs means fewer omissions; seeds 1 and 1234 at 300 m may now fit a fountain (not re-checked by eye).
- Open: snow geometries and materials live in the nature asset cache (no per-rebuild leak). Not freed on app teardown.
- Verify: `npx vitest run tests/streets.test.ts tests/streetDecor.test.ts tests/budget.test.ts`; add a test for tyre-track determinism and bounds.

## Session 2026-11-01 (fixes)
- Fixed: tyre-track texture pushed into `textures` (streets/index.ts), freed by dispose().
- Fixed: `natureItems(layout, seed, overrides?)` scales by `TREE_SCALE` (1.35, exported). `NatureOverrides`: `treeScale?` replaces TREE_SCALE, `types?` maps tree id to type index. No overrides = default output.
- Snow crowns (SUPERSEDED in phase 2, see below): this built a leaf snow cap for every type. It caused the winter trap below.
- Decision: city tree scale. `natureItems` ignores TREE_SCALE 1.35 on the city path, so city trees are ~26% smaller. ACCEPTED by lead; no restore needed.
- Verify: `npx tsc --noEmit`, `npx vitest run tests/budget.test.ts tests/layoutKey.test.ts` (passed).
- Summer lift: uniform `uSummer` (0 or 1) on leaf material, set per season in apply() (natureTrees.ts:478). Declared in the fragment prefix (natureTrees.ts:379). leafVariety.ts:68 already reads `float summer = uSummer;`. Sky tunes the colour there.
- Courtyard tree export: `courtyardTreeObstacles(trees)` (streetscape.ts:43) is the module-level list for greenery obstacles. Consumers: streets/greeneryFootprint.ts, scene/useTownGreenery.ts. Sky park greenery should use the same export.
- Trap: tests/people.test.ts and tests/audioPeople.test.ts are timing-sensitive. They fail in the full run and pass solo (flake, not a regression).

## Phase 2 (winter, pines, shadows)
- Trap (winter green crowns): `snowLeafMat` keeps the leaf map, so white snow caps on full leaf geometry draw green. Fixed: leaf snow caps exist for conifers only (`asset.type.evergreen`). Broadleaf trees get bark snow and are bare in winter (their leaves are hidden by `thinnedLeaves` at density 0).
- Decision: conifers keep their green all year (phase 1 design; the user confirmed the green crowns are not pines). Do not hide conifer foliage in winter.
- Decision: pine share ~10%. `natureSlots` picks a conifer only on plaza trees, street trees within `BORDER_DEPTH` (6 m) of `townBounds` (outer ring), and courtyard trees inside merged courtyards (`courtyard.merged`), with `PINE_SHARE` 0.6 on those spots. Default city: 15 of 170 (8.8%), all on border street and plaza, none in merged yards (0 merged at default). Five seeds: 8.8%.
- Decision: broadleaf foliage in the shadow pass is half density. A shadow-only copy of the leaves sits on `SHADOW_LAYER` (1), with `SHADOW_LEAF_FRACTION` 0.5 of the seasonal density. The main pass draws the full leaves (castShadow off). `Town.tsx` enables `SHADOW_LAYER` on the sun's shadow camera. Without that line the shadow copies cast nothing.
- Budget test (tests/budget.test.ts): the main count skips meshes whose layers exclude 0; `shadowOnly` counts their triangles in the shadow total. Shadow 528,583 (limit 605,000), main 1,604,879 (limit 1,700,000).
- Trap: `splitFoliage` (bark islands not touching the trunk, >= 2.5 m, compact clusters) moves crown-like bark islands to the leaf geometry. It is a geometric guess; not checked by eye. The dev page (tree-compare) uses its own name-based split and does not run this path.
- Fountain: `fountainReservations(layout)` (streets/decor.ts) reserves one tree-free disc in the largest courtyard that fits, with `reserved: true`. It is appended to the obstacles in `greeneryFootprint.ts` and `useTownGreenery.ts`, so greenery keeps clear without depending on greenery's output. Seed 98765 at 217 m had no free courtyard before this; the fountain now appears on all four SEEDS.
- Open: the fountain test expects a fountain on every SEEDS seed. It passes now, but the reserved site depends on courtyards and trees only.
- Open: shadow-only copies are visible only in the sun's shadow pass; check by eye in the game that the thinner shadows look right.
- Open: the `splitFoliage` cluster rule (30+ vertices, sides <= 3 m, shortest >= 40% of longest) needs a visual check in winter.
- Open: `tests/people.test.ts` timing flake (see above).

## Lab clones (tree-compare)
The tree-compare page is a lab. It reads only these clones, so lab edits never change the city until the user approves a merge.
- `src/dev/treeCompare/labNatureTrees.ts`: clone of `src/streets/natureTrees.ts` (natureAssetFromGltf, splitFoliage, natureSlots, createNatureTreeField, TREE_SCALE, SHADOW_LAYER, NATURE_TYPES). Its imports from environment, shaders, core and city are the shared modules, not cloned.
- `src/dev/treeCompare/labLoader.ts`: clone of `loadNatureAssets` from `src/scene/useNatureTrees.ts`, without the React hook.
- City files left untouched by the lab: `src/streets/natureTrees.ts`, `src/scene/useNatureTrees.ts`. No city file imports the lab.
- Not cloned (shared): `environment/trees.ts`, `environment/forest.ts`, `environment/leafVariety.ts`, `environment/wind.ts`, `shaders/wetSurface.ts`, `weather/*`. Lab edits there would reach the city.

## Phase 2 review (commit 8f96b8e, dev)
- Pavement landing: `pavementSurfaces(layout)` (streets/pavementSurfaces.ts:34) returns `SurfaceBox[]` for sidewalks and kerbs by running `buildSurfaces` with a `PavementRecorder`. Top at `SIDEWALK_TOP` 0.15. Used so falling autumn leaves rest on sidewalks (reported ~284 boxes at default; not re-counted).
- Constants (streets/surfaces.ts:10-21): `GROUND_Y` 0, `ASPHALT_TOP` 0.04, `UNDERLAY_TOP` = asphalt - 0.01, `PAINT_Y` = asphalt + 0.02, `SIDEWALK_TOP` 0.15, `SIDEWALK_OVERLAY_Y` = sidewalk + 0.015. Use these names, not literals.
- Note: `pavementSurfaces` lists sidewalk and kerb boxes only. Asphalt is not in the list, so the road is not a landing surface (not checked in game).
- Decision: `fountainReservations(layout)` (streets/decor.ts:454) returns `{x, z, r: FOUNTAIN_PLAZA_RADIUS + GREENERY_CLEARANCE = 3.4 + 0.3 = 3.7, reserved: true}` for the largest courtyard that fits `need` = 4.3 m on each side. Centre = tree-free point closest to the courtyard centre. Appended after the tree obstacles in `greeneryFootprint.ts:18` (`[...courtyardTreeObstacles, ...fountainReservations]`), before greenery fills courtyards. Reason: fountain test failed on seed 98765 when greenery filled courtyards. The user chose a mandatory fountain. Reserved disc uses courtyards and street trees only, so no circular dependency on greenery.
- Decision: `COURTYARD_TREE_RADIUS = 1.5` (city/streetscape.ts:40). Used by `courtyardTreeObstacles` (streetscape.ts:46), scaled by tree scale.
- Decision: small-yard rng keyed by footprint hash (`yardKey` in environment/greenery.ts:207, from commit 720941d, not 8f96b8e). Key = rounded (0.1 m) min/max corners, mixed with `Math.imul`. Yard output no longer depends on list index, so a merge elsewhere does not reshuffle other yards. Park yards (`isParkYard`) keep their own recipe.
- Open: car-roof landing is deferred and not wired. `src/traffic/vehicleSurfaces.ts` (added in 8f96b8e, wired via `src/traffic/index.ts`) belongs to Traffic & Life, not City & Streets. Leaves on cars do not rest yet.
- Open: fountain reservation covers the seeds in the test, but not checked by eye.
- Verify: `npx vitest run tests/streets.test.ts tests/streetDecor.test.ts tests/budget.test.ts`; a leaf-rest test on `pavementSurfaces` is not yet written.
