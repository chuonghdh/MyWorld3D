# City & Streets specialist

Reviewed 2026-11-01 at 02b0cdc

**Owns:** `src/city/**` (generator, layout, streetscape, layout key, block merges) and `src/streets/**` (roads, markings, furniture, decor, fountain water, falling-leaf landing surfaces) with their tests.

## Key files
- `city/generate.ts` (crosswalk filter for merges, `splitAround`), `layout.ts`, `blocks.ts`, `layoutKey.ts`, `merge.ts` (`resolveBlockMerges`), `junctionArms.ts`, `streetscape.ts` (`COURTYARD_TREE_RADIUS`, `courtyardTreeObstacles`).
- `streets/surfaces.ts` (layering constants, rounded kerbs), `builder.ts` (geometry helpers), `furniture.ts` (signal heads, bins, bollards), `decor.ts` (`planFountain`, `fountainReservations`) + `decorGeometry.ts` (`clearOfKerbCorners`), `natureTrees.ts` (street and courtyard trees, `natureItems`), `tyreTracks.ts`, `pavementSurfaces.ts`, `greeneryFootprint.ts`, `water.ts`, `index.ts` (meshes).

## Conventions
- Placement is a pure function of the layout and `layout.seed`.
- Solids sit on the building side of the sidewalk, outside the pedestrian line, clear of lamps, bins, trees, crosswalks and lanes.
- Decals use distinct heights plus the overlay material's polygonOffset; never coplanar. Use the named constants in `streets/surfaces.ts` (`GROUND_Y` 0, `ASPHALT_TOP` 0.04, `UNDERLAY_TOP` = asphalt - 0.01, `PAINT_Y` = asphalt + 0.02, `SIDEWALK_TOP` 0.15, `SIDEWALK_OVERLAY_Y` = sidewalk + 0.015), not literals.
- Layout is generated once per settings change; traffic or weather sliders must not rebuild blocks (`layoutKey`).

## Traps
- Draw-call budget: base streetscape is 6 meshes; decor adds 2 (`streets-shelter-glass`, `streets-fountain-water`, `streets/index.ts:95-96`).
- `budget.test.ts` triangle headroom is limited. Last note: main pass 1,604,879 against a 1,700,000 limit; shadow 528,583 against 605,000 (`tests/budget.test.ts`). Re-check after any mesh change.
- Fountain plaza must avoid courtyard greenery. `fountainReservations` (`decor.ts:454`) reserves one tree-free disc in the largest courtyard that fits (`r` = 3.4 + 0.3 = 3.7 m). It is appended after the tree obstacles in `greeneryFootprint.ts:18` and in `scene/useTownGreenery.ts`, so greenery keeps clear without depending on greenery's output. `planFountain` (`decor.ts:472`) still tests greenery triangles and omits the fountain where no room exists; the test allows omission.
- Tactile bars at the first crossing stripe reach into the rounded corner: `clearOfKerbCorners` (`decorGeometry.ts:118`) cuts them back to the arc.
- Sidewalk strips are 3 m (`STREET_SIDEWALK`) and 4.5 m (`AVENUE_SIDEWALK`) in `city/generate.ts`. The 0.5 m kerb radius (`KERB_RADIUS`) fits. Vertical strips are cut by the crossing sidewalk footprint (walk cut), horizontal strips by the carriageway only (carriage cut), so only horizontal strips own corners.
- Traffic reads `lanes` and `laneOffsetFor`: moving lanes changes vehicle behaviour.
- Tree snow: `snowCap` (`natureTrees.ts`) lifts each triangle along its own normal, so shared edges open a 0.05 m lip. Harmless at range; not checked by eye.

## Decisions
- Rounded kerbs (0.5 m) are built into the sidewalk surfaces (`surfaces.ts` `roundedKerbCorner`): kerb band, sidewalk patch, arc wall, open corner left as ground. No new meshes; same-facing overlap count unchanged versus baseline (1874 on surfaces).
- Fountain: placed on greenery triangles (read only) and kept clear by the reserved disc. The disc uses courtyards and street trees only, so there is no circular dependency on greenery's output. The fountain is mandatory where a courtyard fits (test expects a fountain on default town).
- Tyre tracks use `layout.seed ^ 0x7c3a9e11` and fixed path order (deterministic). The grid rect is the true town bounds; texel width is ceil-rounded.
- `COURTYARD_TREE_RADIUS = 1.5` (`city/streetscape.ts:40`), scaled by tree scale. `courtyardTreeObstacles` (`streetscape.ts:43`) is the shared export for greenery obstacles.
- City tree scale: `natureItems` ignores `TREE_SCALE` 1.35 on the city path, so city trees are about 26% smaller. Accepted by lead.
- `natureItems(layout, seed, overrides?)`: `treeScale?` replaces `TREE_SCALE` (exported, 1.35); `types?` maps tree id to type index. No overrides = default output.
- Summer lift: uniform `uSummer` (0 or 1) on the leaf material, set per season in `apply()` (`natureTrees.ts:679`); declared in the shader at `natureTrees.ts:556`; read in `environment/leafVariety.ts:68`.
- Winter: broadleaf trees are bare (leaves dropped via `thinnedLeaves` at density 0, bark snow). Conifers keep their green all year; do not hide conifer foliage in winter.
- Pine share ~10%: `natureSlots` picks a conifer only on plaza trees, street trees within `BORDER_DEPTH` (6 m) of `townBounds`, and courtyard trees inside merged courtyards, with `PINE_SHARE` 0.6 on those spots. Default city had 15 of 170 conifers at last count; none in merged yards at default.
- Pine snow comes from the weather shader on the existing conifer leaf material (`PINE_SNOW_UP`, `PINE_SNOW_COVER`, `natureTrees.ts:18-19`, `393-404`). No conifer geometry split for snow.
- Shadow pass: broadleaf foliage is half density. A shadow-only copy of the leaves sits on `SHADOW_LAYER` (1), with `SHADOW_LEAF_FRACTION` 0.5. `Town.tsx` enables `SHADOW_LAYER` on the sun's shadow camera; without that line the copies cast nothing.
- `splitFoliage` moves crown-like bark islands to the leaf geometry (a geometric guess; not checked by eye).
- Pavement landing: `pavementSurfaces(layout)` (`pavementSurfaces.ts:34`) returns sidewalk and kerb boxes at `SIDEWALK_TOP`. Asphalt is not in the list, so the road is not a landing surface. Wired in `scene/Town.tsx:123-125`.

## Block merging
- Input: `blockMerges` in the settings (default none). Each group lists 2 to 4 house block ids forming one full rectangle of grid cells (`city/merge.ts`, `resolveBlockMerges` at `merge.ts:56`). Other groups are rejected and ignored.
- Ids: houses `block-<c>-<r>`; merged `merged-<c0>-<r0>-<c1>-<r1>` from the covered cell range. Splitting = removing the group.
- Geometry: merged bounds = union of members; lots = perimeter of the merged bounds; courtyard = interior of the merged bounds (includes the seams). Merged courtyards carry `courtyard.merged = true` (`CourtyardRect`).
- Streets: an interior grid line of a merge is cut between the two outer streets that bound it (`splitAround`, `city/generate.ts:161`). Road pieces get ids `road-v-<i>-<k>` / `road-h-<j>-<k>`; untouched lines keep `road-v-<i>`. Junctions, crosswalks, lights, lamps, benches and street trees inside the merge are dropped.
- Junction arms: `city/junctionArms.ts` (same rule as traffic `buildArms`). Signal heads are drawn only for real arms (`streets/furniture.ts:153-165`); junctions with 2 arms or fewer get no pole. `generateCity` drops their light from `trafficLights` (only when merges exist). With no merges: 4 arms everywhere, output unchanged.
- Crossings: with merges, a crosswalk is kept only if both ends land on a sidewalk corner (`generate.ts:372`). Tactile bars follow.
- Layout key appends merges only when present; no merges keeps the old key and output (`tests/blockMerge.test.ts`).
- Courtyard tree obstacles for greenery: `courtyardTreeObstacles` in `city/streetscape.ts`.

## Phase 2 notes
- Winter snow on broadleaf trees: bark snow only. The leaf snow cap is not drawn (see Open items).
- Falling leaves: `pavementSurfaces` gives leaves a landing on sidewalk tops. Roads stay at `GROUND_Y`.
- Decision: small-yard rng keyed by footprint hash (`yardKey` in `environment/greenery.ts:207`), so a merge elsewhere does not reshuffle other yards. One-time layout shift for every town.
- Lab clones (`src/dev/treeCompare`): `labNatureTrees.ts` (clone of `streets/natureTrees.ts`), `labLoader.ts` (clone of `loadNatureAssets` without the hook), `labLeaves.ts` (wraps the city `LeafSystem`, no lab copy of leaf logic). City files untouched by the lab: `streets/natureTrees.ts`, `scene/useNatureTrees.ts`. No city file imports the lab.
- Shared, not cloned (lab edits there reach the city): `environment/trees.ts`, `environment/forest.ts`, `environment/leafVariety.ts`, `environment/wind.ts`, `shaders/wetSurface.ts`, `weather/*`.

## Open items
- Code mismatch: `natureTrees.ts:436` builds `snowLeaves` only for broadleaf (`type.evergreen ? null : snowCap(leaves)`), but `natureTrees.ts:640` pushes it only for evergreen. Result: no leaf snow cap is drawn for any tree. Broadleaf being bare is intended; the dead geometry and condition need an owner decision (remove or fix). Not changed here.
- Open corner shows the 4 cm asphalt underlay as a gutter strip (intended, not checked by eye up close).
- Coplanar audit tolerance (2 cm) flags many pre-existing underlay/ground pairs; not fixed.
- Car-roof leaf landing is deferred. `traffic/vehicleSurfaces.ts` exists but no consumer calls it.
- Fountain placement on dense seeds (1 and 1234 at 300 m) and the reserved-disc look: not re-checked by eye.
- Street-tree winter crowns (full foliage seen in a screenshot): not re-checked after phase 2.
- `snowLeaves` and snow geometries live in the nature asset cache; not freed on app teardown.

## Verify
`npx vitest run tests/streets.test.ts tests/streetDecor.test.ts tests/kerbCorners.test.ts tests/budget.test.ts tests/layoutKey.test.ts tests/blockMerge.test.ts`. No test covers `pavementSurfaces` leaf rest yet.

## Tuning (step 4, docs/TUNING-PLAN.md)
- Rule: a City & Streets knob is a value a designer tunes for feel; geometry and algorithm literals stay in their file. Knobs live in `cityStreets` (src/config/tuning.ts) and are imported; the lab copy is `src/dev/treeCompare/labTuning.ts` (never imports config).
- Moved (values unchanged): floorRange, monumentChance, trafficSpawnSpacing, lightTiming, streetLampSpacing, treeRate, courtyardTreeMin/Max/Radius, plazaTreeSpacing/Rate, benchChance, lampGlassNightIntensity, signalOnGain/OffGain, pineShare/SnowUp/SnowCover, treeScale, clusterExtra, borderDepth, shadowLeafFraction.
- Renamed: furniture.ts `LAMP_SPACING` (0.28) is now `SIGNAL_LAMP_PITCH`, stays local.
- Open: `scene/useTownGreenery.ts` still holds its own `TREE_SCALE` 1.35 (Scene & QA file, not moved).
