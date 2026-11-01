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
- Open: COURTYARD_TREE_RADIUS raised 1.5 to 4.7 (streetscape.ts:40, uncommitted). Undocumented here; more fountain omissions likely. Confirm with Sky & Environment owner.
- Open: snow geometries and materials live in the nature asset cache (no per-rebuild leak). Not freed on app teardown.
- Verify: `npx vitest run tests/streets.test.ts tests/streetDecor.test.ts tests/budget.test.ts`; add a test for tyre-track determinism and bounds.

## Session 2026-11-01 (fixes)
- Fixed: tyre-track texture pushed into `textures` (streets/index.ts), freed by dispose().
- Fixed: `natureItems(layout, seed, overrides?)` scales by `TREE_SCALE` (1.35, exported). `NatureOverrides`: `treeScale?` replaces TREE_SCALE, `types?` maps tree id to type index. No overrides = default output.
- Snow crowns: every type gets a leaf snow cap (`snowLeaves`) with its own `snowLeafMat` (white, alphaTest 0.5, leaf map, DoubleSide). Caps copy uv. Visible in winter only (`apply`), so bare broadleaf crowns get snow too.
- Trap: snow leaf caps add one InstancedMesh per type (draw-call budget). Budget test still passes.
- Open: COURTYARD_TREE_RADIUS 4.7 (streetscape.ts:40): no rationale in repo. Left unchanged, owner must confirm or revert to 1.5.
- Verify: `npx tsc --noEmit`, `npx vitest run tests/budget.test.ts tests/layoutKey.test.ts` (passed).
- Summer lift: uniform `uSummer` (0 or 1) on leaf material, set per season in apply(). Declared in natureTrees.ts fragment prefix. Sky must change leafVariety.ts line 68 to `float summer = uSummer;` (not done here, file not owned). Until then the shader still reads uVary.
