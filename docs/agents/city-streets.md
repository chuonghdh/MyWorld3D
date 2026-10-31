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
