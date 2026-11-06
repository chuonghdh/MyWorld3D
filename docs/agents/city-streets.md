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
- Budget headroom is tight. Last measured on seed 1 (default): main 1,581,859 against 1,900,000; shadow 592,339 against 605,000; main + shadow 2,174,198 against 2,300,000; draw calls 132 against 140 (`tests/budget.test.ts`). Re-check after any mesh or tree-count change.
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
- Street trees are placed evenly along each sidewalk (one accumulator per side, the opposite side starts half a slot later so trees stagger). No random draw; same seed, same layout. Broadleaf trees inside blocks (courtyards and plazas) are removed; conifers stay.
- Pine share ~10%: `natureSlots` picks a conifer only on plaza trees, street trees within `BORDER_DEPTH` (6 m) of `townBounds`, and courtyard trees inside merged courtyards, with `PINE_SHARE` 0.6 on those spots. Default city had 15 of 170 conifers at last count; none in merged yards at default.
- Pine snow comes from the weather shader on the existing conifer leaf material (`PINE_SNOW_UP`, `PINE_SNOW_COVER`, `natureTrees.ts:18-19`, `393-404`). No conifer geometry split for snow.
- Shadow pass: broadleaf leaves cast full shadows from the main leaf mesh (layer 0). Do not use a shadow-only copy on another layer: three.js tests layers against the main camera, so such copies are never drawn.
- `splitFoliage` moves crown-like bark islands to the leaf geometry (a geometric guess; not checked by eye).
- Pavement landing: `pavementSurfaces(layout)` (`pavementSurfaces.ts:34`) returns sidewalk and kerb boxes at `SIDEWALK_TOP`. Asphalt is not in the list, so the road is not a landing surface. Wired in `scene/Town.tsx:123-125`.

## Public buildings (monument rule)
- Rule: 1 in 5 buildable blocks is a public building. Count = round(buildable blocks x `cityStreets.monumentShare` 0.2), at least 2 and at most all blocks (a town under 5 blocks cannot hold 1 in 5 and keeps its two standard monuments). Chosen with the layout seed (`chooseMonuments`, `src/city/generate.ts`), so the same seed always gives the same town.
- Every town has exactly one `gothic-cathedral` and exactly one `city-hall` on two different seeded blocks (`STANDARD_MONUMENTS`). The other monument blocks take kinds from the rest of `buildings.monumentKinds` by seed.
- The kind is stored on `Block.monument` in the layout. `monumentBaseFor(block)` (`src/scene/townBlocks.ts`) reads it. A user block override (`blockOverrides[id].monument`) still wins.
- Trap: the old per-block 10 percent draw and hash-to-kind pick are gone. Tests that count monuments or hash block ids must read `block.monument`.
- Measured default towns (no merges): seed 1, 7, 1234 each have 16 blocks and 3 monuments, one cathedral and one City Hall (`tests/monumentLayout.test.ts`).
- Trap (found with the new monument mix): a corner house projects up to 1.2 m past its rear line (`buildings/house.ts` rear allowance). When the edge lot beyond that line stood flush, the two houses interpenetrated (geometry audit, seed 7 block-0-3). `clearCornerRears` (`src/city/blocks.ts`) now trims that edge lot by 1.2 m at the corner. Rear balconies still project into the gap, which is free.

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

## Tuning
- Rule: a City & Streets knob is a value a designer tunes for feel; geometry and algorithm literals stay in their file. Knobs live in `cityStreets` (src/config/tuning.ts) and are imported; the lab copy is `src/dev/treeCompare/labTuning.ts` (never imports config). Index: [docs/TUNING.md](../TUNING.md).
- `furniture.ts` `SIGNAL_LAMP_PITCH` stays local.
- Open: `scene/useTownGreenery.ts` still holds its own `TREE_SCALE` 1.35 (Scene & QA file).

- 2026-11-06 (scene-qa): fountain water clock now reads `runtime.simTime` (core/runtime) in `onBeforeRender`, not `performance.now()`, so it freezes on pause and follows film time in the auto film. Test: `tests/film/simClockVisuals.test.ts`.

## Update 2026-11-06 (city-streets): street surface wear
- Self-critique before the change: asphalt was flat #4a4a50 with only about 7 % grain; sidewalks were one uniform pale tone with no joints; lane and crossing paint was perfectly even and crisp.
- New `streets/streetWear.ts`: shader-only wear for the road (aggregate, block tone, worn patches, oil stains, faint seams), pavement (1.5 m slab joints, base grime on kerb faces, scuffing) and paint (fading, worn spots). No mesh, no texture, no draw call. Patched in `streets/index.ts` in place of `attachRoadGrain`.
- Road and pavement are told apart by vertex-colour luminance (no new attribute). Patterns are world-space and offset by `streetWearSeed(layout.seed)`, so the same town always looks the same.
- Knobs: `cityStreets.roadBlockTone`, `roadAggregate`, `roadWornLift`, `roadOilStain`, `roadPatchSeam`, `pavingJoint`, `pavingGrime`, `pavingWear`, `paintWear`, `paintFade` (docs/TUNING.md section 13, parity entries added).
- Budget unchanged: streetscape 8 meshes; seed 1 100,266 triangles, seed 7 102,798 (`tests/streetWear.test.ts`, baseline captured before the change).
- Open: no kerb-top edge grime (needs a per-vertex edge attribute from the builders); paint edge wear is noise, not true edge data; oil and tyre tracks along lanes come from the existing `tyreTracks` map, not new.
- Not verified by eye: the built-in pane cannot paint frames and no GL context ran the new GLSL. Check the road, kerbs and lane paint in Chrome after a reload.

## Update 2026-11-06 (city-streets): pavement feedback
- Paving recoloured to a light blue-grey natural stone (subtle): sidewalk `#c6cbcf` (was `#ddd6c8`), sidewalkBand `#b8bec3`, plazaLight `#cad0d3`, plazaDark `#b9c0c4`, plazaBorder `#a9b0b5`; fountain plaza `decorGeometry.ts` plazaA/plazaB/plazaBorder match. Curb unchanged.
- New shader patterns on pavement, seeded per 40 m cell (bicycle tracks), per 2.5 m cell (footprints) and world-space (stains): knobs `cityStreets.pavingBikeTrack` 0.1, `pavingFootprint` 0.08, `pavingStain` 0.12 (TUNING.md section 13, parity entries). No new geometry; budget unchanged.
- Colour values are local constants in `surfaces.ts` COLORS (not knobs). Not verified by eye.

## Update 2026-11-06 (city-streets): car tracks and bicycle track fix
- Car-like tracks on pavement came from `streets/tyreTracks.ts`: its mask (snow-cover, read by the surface material's weather patch) was stamped on every road path and also reached sidewalks. Fix: `onCarriageway` gates every stamp to road pieces and junction squares (0.2 m slack). Test: `tests/streetWear.test.ts` (no marked texel off the carriageway).
- Bicycle track is now a thin pair: lines 0.55 m apart, about 3.6 cm wide each, 1.5 m segments with 1.5 m gaps, seeded angle per 40 m cell. `pavingBikeTrack` 0.07 (was 0.1). Footprints and stains unchanged.

## Update 2026-11-06 (city-streets): kerb strip paving
- Kerb strip reverted to the sidewalk treatment: `COLORS.curb` now equals the sidewalk colour (`#c6cbcf`), so the strip is paved like the slabs with the same joints and slab tone. The kerb-only shader path and its knobs were removed; no separate kerb texture remains.

## Update 2026-11-06 (city-streets): removed the furniture-zone strips
- The two light-grey strips along the road edges were the decorative "furniture zone" paving band (`surfaces.ts` `buildSidewalks`, overlay `sidewalkBand`). Not structural: no drainage, kerb height or shadow role. Removed with its tree-pit cuts and the `sidewalkBand` colour; `buildSidewalks` no longer takes `overlay`.
- Kerb boxes (kerb faces and top) stay as geometry and use the sidewalk paving colour. Streetscape after removal: seed 1 99,890 triangles, seed 7 102,422 (down from 100,266 / 102,798); 8 meshes unchanged (`tests/streetWear.test.ts` baseline updated).

## Update 2026-11-06 (city-streets): removed tan paving slabs
- The large tan/beige tiles (1.5 m, two shades, avenue sidewalks near the shopfronts) came from the decor "paving variation" layer: `planPaving` in `streets/decor.ts`, drawn in `decorGeometry.ts` with `slabDark`/`slabLight`. Not a structural element (no loading or ramp role). Removed the planner, the `paving` plan field, the draw loop, the two colours and the decor test assertions. Other decor (furniture, manholes, patches, tactile bars, fountain) is unchanged; its rng is separate, so their placement is unchanged.
- Sidewalk paving is now only the 0.40 x 0.15 m stone pavers from `streetWear.ts`. Streetscape after removal: seed 1 99,076 triangles, seed 7 101,658 (8 meshes unchanged).

## Update 2026-11-06 (city-streets): accent pavers
- About 1 in 10 pavers (`cityStreets.pavingAccentShare` 0.1) take one of three accent colours (`cityStreets.pavingAccentColours`: dark grey `#4f5458`, light brown `#b59a78`, yellow-brown ochre `#c4a14e`), chosen per paver by a seeded hash in `streetWear.ts`. The light blue-grey stays the main tone. Shader only, no new geometry; budget unchanged.
- Accent pavers revised: density 1 in 20 (`pavingAccentShare` 0.05); colours now warm, low-contrast greys: `#b3aca4` warm grey, `#a79d90` light grey-brown, `#b7b09a` pale ochre-grey (was dark grey, light brown and saturated ochre).

## Update 2026-11-06 (city-streets): pavement dirt
- Added shader-only dirt on pavement: gum-like spots (`cityStreets.pavingGumSpot` 0.12, one candidate per 1.2 m cell), dry puddle rings (`pavingPuddleMark` 0.05, noise contours) and dirt zones per 24 m block (`pavingDirtZone` 0.06, seeded). Soft dark patches are the existing `pavingStain` (0.12).
- Not done: grouping dirt near the kerb, shopfronts, bins and benches needs per-vertex distance or facade data that the surface builder does not carry; the per-block zones stand in for it.

## Update 2026-11-06 (city-streets): road dirt and lane wear doubled
- Knob values doubled (defaults only, no shader or geometry change): `roadWornLift` 0.1 to 0.2, `roadOilStain` 0.08 to 0.16, `roadPatchSeam` 0.06 to 0.12, `paintWear` 0.3 to 0.6, `paintFade` 0.06 to 0.12. Sidewalk pavement knobs unchanged. Parity entries, `tests/streetWear.test.ts` expectations and `docs/TUNING.md` rows updated.
