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
- The fountain sits in the largest tree-free courtyard; hedges are not avoided, so check overlap with courtyard greenery.
- Traffic reads `lanes` and `laneOffsetFor`: moving lanes changes vehicle behaviour.

## Decisions
- Kerb corners are a painted rounded stone over the square corner (a real rounded corner would mean carving the sidewalk box).

## Open items
- Truly rounded kerb corners; fountain plaza vs courtyard hedge overlap.

## Verify
`npx vitest run tests/streets.test.ts tests/streetDecor.test.ts tests/budget.test.ts`.
