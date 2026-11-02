# Public buildings review (ten monuments)

Scene & QA review, branch optimize_02. Review and planning only: no source file was changed.
Scope: `buildings.monumentKinds` in `src/config/tuning.ts`. Builders: `src/buildings/monument.ts`, `src/buildings/monuments/{kit,civic,leisure,culture}.ts`.

## Status (as of this branch state)

| Building | Status | What was done | What is left |
|---|---|---|---|
| Church (gothic-cathedral) | done | Narthex gap closed, buttress stubs reach the parapet, apse segments raised, rose glow fixed, window odds in config | By-eye check not done |
| Dinosaur park | partial | Pond raised on a stone base (not sunk), per the lawn at 0.08 m | Sinking the pond needs the lawn to be lowered; deviation from the plan, recorded here |
| Open-air theatre | done | Backdrop plinth and cornice, odds in config | By-eye check at night not done |
| Hospital | done | Rustication bands moved to a plinth, fountain as a basin (`waterBasin`), dormer odds in config | By-eye check not done |
| Supermarket | done | Solar racks given legs, car-park odds in config | By-eye check not done |
| Fire station | done | Bay doors recessed (`bayOpenings`), tower flag on the wind code, odds in config | By-eye check not done |
| City Hall (city-hall) | done (new kind) | Added as the 11th kind (`monuments/municipal.ts`) | Not checked by eye; shadows off like the others |
| School (school) | done (new kind, last in priority) | Added as the 12th kind (`monuments/education.ts`) | Not checked by eye |
| Stadium | done | Bowl raised, crest moved onto the entrance block | By-eye check not done |
| Funfair | done | Carousel column and band joined, stall awning anchored | By-eye check not done |
| Swimming pool | done | Pools as recessed basins, pool deck cut around them, cube swimmer heads replaced | By-eye check not done |
| Circus | partial | Skirt added at the wall base | Body sag NOT done |
| Swimming pool slab | done | Floating blue slab removed | Covered by the pool row above |

**Layout shift (all towns):** the monument kind now comes from the layout (`Block.monument`, `src/city/generate.ts`), not a block-id hash. Status: **monument rule applied**. Rule: 1 in 5 buildable blocks is a public building, count round(blocks x 0.2) (min 2), chosen per seed. Every town has one `gothic-cathedral` and one `city-hall` on seeded blocks; other kinds fill the rest by seed. Saved town overrides that name a monument are unaffected. Budgets re-measured, all within limits (see `docs/agents/scene-qa.md`).

## How this was checked

- Browser: Claude in Chrome connected (one local browser). `http://localhost:5173/` loaded, title MyWorld3D, one canvas, WebGL 2 available, no console errors. A far overview screenshot shows the town; a red and white striped big top (circus-style) is visible in one block. No monument was forced, and no close, medium or night view was taken for any of the ten.
- Geometry: a scratch script (not committed) ran `buildMonument(kind, { seed: 1 })` for each kind and counted triangles and meshes. Numbers below are from that run.
- Code: every builder and the kit were read. Line numbers refer to the current files.
- Budgets: not re-run in this review. Last recorded values (docs/agents/scene-qa.md): main 1,581,859 of 1,900,000; shadow 592,339 of 605,000; draw calls 132 of 140.

### Measured per monument (seed 1, default 34 x 34 m footprint)

| Monument | Main triangles | Meshes | Height (m) |
|---|---:|---:|---:|
| hospital | 11,752 | 3 | 22.5 |
| fire-station | 7,404 | 3 | 30.5 |
| funfair | 8,880 | 3 | 18.3 |
| gothic-cathedral | 7,070 | 3 | 40.0 |
| supermarket | 6,980 | 3 | 7.9 |
| circus | 6,400 | 3 | 15.2 |
| stadium | 6,128 | 2 | 22.2 |
| dinosaur-park | 5,982 | 3 | 15.3 |
| open-air-theatre | 5,540 | 3 | 12.3 |
| swimming-pool | 5,328 | 3 | 13.4 |

Every monument is capped at three meshes by `ColorBatch` (body, glass, glassLit). The ten together are about 70k main triangles, about 4% of the main budget.

## Summary

| Building | Verdict | Top 2 fixes | Owner |
|---|---|---|---|
| Hospital | Keep. Strong Beaux-Arts massing. Polish the lower facade. | Move or drop the rustication bands that cut the lower windows (civic.ts:51). Make the forecourt fountain water a basin, not a flat disc (civic.ts:124). | Buildings |
| Stadium | Keep the bowl. Too shallow and the crest floats. | Raise the bowl (`rise` 0.6 to about 0.95, zero extra triangles) so it reads as a stadium, not a dish (leisure.ts:43-44). Attach the crest disc to the entrance block (leisure.ts:154-155). | Buildings |
| Funfair | Keep. Best mix of detail and colour. Two small floating parts. | Close the carousel canopy gap (leisure.ts:268 vs 273-274). Anchor the stall awning to its roof edge (leisure.ts:207-212). | Buildings |
| Swimming pool | Weakest. Pools read as flat blue tiles on a deck. | Give the pools a recessed basin with coping (leisure.ts:386-393). Replace the cube swimmer heads (leisure.ts:497-500) and justify or remove the floating blue slab (leisure.ts:438). | Buildings |
| Dinosaur park | Keep the whimsy. Pond is a flat disc, and vegetation counts are literals. | Sink the pond with a stone rim (culture.ts:189-196). Move vegetation counts to tuning (culture.ts:199). | Buildings (counts: Buildings + tuning) |
| Supermarket | Keep the simple hall. Solar racks float. | Support the solar racks or drop them to the roof (civic.ts:303-306). Move car-park densities to tuning (civic.ts:335, 339). | Buildings |
| Open-air theatre | Keep. Cavea and scaenae read well. Backdrop is plain. | Give the 10 m backdrop wall pilasters and a cornice shadow line (culture.ts:289-310). Move the window and audience chances to tuning (culture.ts:433-462). | Buildings |
| Circus | Keep. The striped big top reads well from afar. | Add tent sag or a scalloped skirt at the wall base (leisure.ts:561-586). Move wagon window odds to tuning (leisure.ts:609). | Buildings |
| Fire station | Keep. Brick hall and tower are right in scale. Doors are flat plates. | Recess the three bay doors into the wall face (civic.ts:184-193). Make the tower flag flutter like the others (civic.ts:220). | Buildings |
| Gothic cathedral | Keep. Best silhouette in the set. Two real geometry gaps. | Close the 4.5 m narthex gap between nave and west front (culture.ts:390, 502). Extend tower corner buttresses to the parapet (culture.ts:483-485). | Buildings |

---

## Hospital

Source: `civic.ts:30-145`. Main triangles 11,752 (largest of the ten). Height 22.5 m.

**Good (keep):** U-plan with a central 4-storey block, wings and a portico. Mansard with dormers, lantern and patina dome, red cross sign and lit lettering band. The ambulance bay with battenburg ambulances reads as a real place. The scale against houses is right.

**Fixes, ranked by impact**

1. **Rustication bands cut the lower facade.** `civic.ts:51` places 0.06 m slabs at y = 1, 2 and 3 m across the whole block. They don't line up with floor lines (`groundH` 4.2, floor 3.4) and read as stray strips on the windows. Fix: one plinth band at 0 to 1.0 m, or align the grooves to `groundH`. Cost: about 0 triangles (removes 4 boxes).
2. **Fountain water is a flat disc.** `civic.ts:123-125`: a glass disc at 0.46 m on a round plinth. Fix: a short basin with a rim, through the shared helper proposed in cross-cutting X4. Cost: about +150 triangles.
3. **Window and dormer odds are literals.** `civic.ts:62` (`k.chance(0.3)`) and `kit.ts` window defaults. Move to `buildings.monumentDetail` (see X2).
4. **Triangle budget.** The hospital is the largest. It is 4 windowed faces x 4 floors plus wings. Dropping back-face window frames (X6) saves about 1,000 to 1,500 triangles.

**Not seen by eye:** portico proportions at street level, the mansard against the sky, night lighting of the cross.

## Stadium

Source: `leisure.ts:34-190`. Main triangles 6,128 (2 meshes). Height 22.2 m including masts.

**Good (keep):** elliptical bowl with alternating team colours, canopy ring with a gap aligned to the main entrance (`leisure.ts:81-82`), striped pitch with markings, floodlight masts, lettering on the entrance block.

**Fixes, ranked**

1. **The bowl is too shallow.** `rise` 0.6 m times 8 rows = 4.8 m. It reads as a dish, not a stadium. Fix: `rise` 0.95 gives about 7.6 m. It changes only heights, so the triangle count is unchanged. Check the canopy height offsets (`yIn = H + 4.4`, `leisure.ts:78`) still clear.
2. **Crest disc floats.** `leisure.ts:154-155`: discs at `H + 2.6` with radius 0.9. The entrance block top is `H + 1.6` (`leisure.ts:148`) with cornice to `H + 2.0`. The crest hangs in the air above the cornice. Fix: put it on the front face at `H + 1.4` or mount it on a small plinth. Cost: 0 triangles.
3. **Pitch apron overlaps the riser foot.** `leisure.ts:103` radius `a0 + 0.1` vs `a0` at the bowl's inner rim (`a0` about 11.0 m). It is 0.1 m, mostly hidden. Cosmetic; fix with `a0 - 0.2` if seen.
4. **Seat colour is a flat quad per segment.** Adequate at a distance. No cost to leave.

**Not seen by eye:** whether the stripes and team colours read at medium distance; floodlight glow at night.

## Funfair

Source: `leisure.ts:217-363`. Main triangles 8,880. Height 18.3 m.

**Good (keep):** Ferris wheel with gondolas, carousel with striped conical roof and horses on poles, helter-skelter spiral, stall row with awnings, entrance arch with bulbs, bunting. This is the most playful monument and the colour palette works.

**Fixes, ranked**

1. **Carousel canopy floats.** The central column is `cyl(...,3.8, cx, 0.6, cz)` (`leisure.ts:268`), top at 4.4 m. The scalloped canopy band is centred at 4.9 m with height 0.7 (`leisure.ts:273-274`), bottom at 4.55 m. There is a 0.15 m gap. Fix: column height 4.6 or band centre 4.75. Cost: 0 triangles.
2. **Stall awning floats at the back.** Slats are rotated 0.35 rad about x around `z = 1.2`, with the stated anchor at `z = 0.35` (`leisure.ts:206-211`). The stall has no wall at that depth (the back wall is at `z = -1.1`). The back edge rises about 0.3 m above the roof slab (`leisure.ts:212`). Fix: anchor the back edge to the roof slab at 2.8 m, or add a bracket. Cost: 0 triangles.
3. **Balloons float free.** `leisure.ts:357-358`: six blobs at 2.8 to 3.6 m around a pole top at 2.9 m, with no strings. Fix: tie two to the pole, or remove. Cost: negligible.
4. **Crowd and palette counts are literals.** `leisure.ts:359` (`crowd(k, 22, ...)`) and `FAIR`/stall stripe picks. Move the crowd count to tuning (X2).

**Not seen by eye:** bunting sag and colour at distance; carousel lighting at night.

## Swimming pool

Source: `leisure.ts:368-544`. Main triangles 5,328. Height 13.4 m.

**Good (keep):** Art Deco pavilion with stepped tower and porthole glass, lane ropes, diving tower with boards, cabins along both sides, parasols, lounger rows.

**Fixes, ranked**

1. **Pools read as flat blue tiles.** `pool()` (`leisure.ts:386-393`) draws water as a 6 cm glass plate sitting on the deck top (`deckY` = 0.45 m). Its bottom face coincides with the deck top (`leisure.ts:382`), and there is no basin wall or depth. Fix: lower the water to `deckY - 0.5` inside a recessed basin with side walls, or raise the coping and add a dark bottom plane. Cost: about +300 to 500 triangles (four side walls per pool, three pools).
2. **Swimmer heads are cubes.** `leisure.ts:497-500`: 0.24 m boxes poking from the water. Fix: small low-poly blob (`blob(…, detail 0)`, about 20 triangles each), or a cap-coloured dome. Cost: +100 triangles at most.
3. **Floating blue slab.** `leisure.ts:438`: a 0.5 x 2.8 m blue plate at `deckY + 0.8`. Its x expression is confusing and it reads as nothing. Fix: remove, or give it a ladder with two rails (`beam`). Cost: about 0 to +40 triangles.
4. **Loungers and cabins are fine.** Keep.

**Not seen by eye:** water colour and shine at noon; whether the basin reads at street height.

## Dinosaur park

Source: `culture.ts:121-228` plus dinosaur builders `culture.ts:41-100`. Main triangles 5,982. Height 15.3 m.

**Good (keep):** the most original concept. Brachiosaurus with long neck, T-rex, stegosaurus with plates, volcano with a lit crater and lava flow, cycads, ferns, bone-arch entrance, info boards. The scale of the dinosaurs against the park reads as intended.

**Fixes, ranked**

1. **Pond is a flat disc on the lawn.** `culture.ts:192`: a 6 cm disc at 0.11 m, on a lawn at 0.08 m, with no bank. Fix: sink the water to 0.02 m with a stone rim of 6 to 8 flattened dodecahedra (`rock`, `culture.ts:109-111`), and a shallow basin box below. Cost: about +150 triangles.
2. **Vegetation and tree counts are literals.** `culture.ts:199` (`for i < 10` ferns), `culture.ts:205-210` (cycads and cones). These are designer densities. Move to tuning (X2).
3. **Stegosaurus plate spacing is coarse.** `culture.ts:93-98`: nine plates, all 4-sided cones. Acceptable at distance; 6-sided plates cost about +90 triangles if the close view needs it.
4. **Dinosaur bodies are blobs.** `IcosahedronGeometry(1,1)` torsos. Keep the stylised look; do not add detail without a close view.

**Not seen by eye:** dinosaur silhouettes from street height, lava glow at night.

## Supermarket

Source: `civic.ts:252-369`. Main triangles 6,980. Height 7.9 m (highest roof 7.0 m plus parapet).

**Good (keep):** glass front with mullions, brand sign band with lit lettering, canopy over the entrance, car park with disabled bays and trolley shelter, totem sign.

**Fixes, ranked**

1. **Solar racks float.** `civic.ts:303-306`: 2.2 x 1.6 m tilted panels (`-0.3` rad) centred at `H + 0.55`, with no frame or legs. They hover above the flat roof. Fix: add two legs per panel row (`beam`, about 24 triangles per leg) and centre the panel at `H + 0.9`, or move them down to sit on a 0.4 m frame. Cost: about +300 triangles for 3 rows x 6 panels.
2. **Car-park odds are literals.** `civic.ts:335` (`chance(0.6)`), `civic.ts:339` (`chance(0.55)`, `chance(0.7)`). Move to tuning (X2).
3. **Hall is a plain box.** `civic.ts:265` is one 28 x 13 x 7 m box. Add a deeper parapet cap or a 0.3 m eave line to break the roof edge. Cost: about +24 triangles.
4. **Shoppers are in a 6-person cluster.** `civic.ts:362`. Fine.

**Not seen by eye:** whether the sign band reads from the street; night lighting of the car park poles.

## Open-air theatre

Source: `culture.ts:233-342`. Main triangles 5,540. Height 12.3 m.

**Good (keep):** semicircular stone cavea with 10 rows, colonnade with lights strung between columns, scaenae frons with two storeys of columns and a pediment, stage with footlights, lighting towers, seated audience. This is the calmest monument and it works.

**Fixes, ranked**

1. **Backdrop is a plain 10 m wall.** `culture.ts:289`: one box with openings and a cornice, but the columns are thin relative to the wall. Fix: add a plinth course at 0 to 1.1 m and a stronger cornice shadow line (`culture.ts:290`). Cost: about +40 triangles.
2. **Window and audience odds are literals.** `culture.ts:433`, `461`, `492`. Move to tuning (X2).
3. **Colonnade top is light.** `culture.ts:262-263` strings bulbs at every second bay; fine at night. Keep.

**Not seen by eye:** stage lighting at night, whether the cavea reads from far.

## Circus

Source: `leisure.ts:549-651`. Main triangles 6,400. Height 15.2 m.

**Good (keep):** the big top is the most readable silhouette from afar. Striped red and white wedges, scalloped valance, king pole with a flag, bunting to rim poles, entrance porch with a lit sign, wagons, ticket booth and popcorn cart.

**Fixes, ranked**

1. **Big top is a hard cone.** `leisure.ts:561-568`: 20 wedges, each a flat segment. No sag, no skirt line at the base. Fix: a slight scalloped skirt at the wall base (the existing valance, `leisure.ts:569-572`, can be raised 0.2 m and given a shadow band), and a lower wall sag of 0.3 m. Cost: about +40 triangles.
2. **Wagon window odds are literals.** `leisure.ts:609`. Move to tuning (X2).
3. **Flags use the shared wind code.** Good. Keep.

**Not seen by eye:** how the striped tent reads from the camera's usual altitude; wagons at street level.

## Fire station

Source: `civic.ts:150-247`. Main triangles 7,404. Height 30.5 m (tower plus flagstaff).

**Good (keep):** brick hall and tower in the right scale for a Victorian-style station. Three red bay doors with stone frames, lit sign band, hip roof with bell cupola, belvedere and pyramid roof, apron with lane markings, two fire engines and a command car.

**Fixes, ranked**

1. **Bay doors are flat plates.** `civic.ts:184-193`: red boxes 0.12 deep at z 0.02, so the doors stand 8 cm proud of the wall with no recess. Fix: cut the wall (a dark recessed panel behind each door) or add a 0.25 m inner reveal. Cost: about +30 triangles per door.
2. **Tower flag is rigid.** `civic.ts:220`: a box flag, not wrapped in `withWind(WIND.FLAG, …)`. The other flags in the set move. Fix: use the flag helper with the same anchor (`kit.ts:530-538`). Cost: 0 triangles.
3. **Tower window odds are literal.** `civic.ts:210` (`chance(0.25)`). Move to tuning (X2).
4. **Apron markings sit on the apron top.** `civic.ts:226-228`: marking bottoms at 0.03 m, apron top at 0.03 m. Coplanar only on hidden faces. Safe.

**Not seen by eye:** whether the doors read as doors from the street; the hose tower against the sky.

## Gothic cathedral

Source: `culture.ts:376-529`. Main triangles 7,070. Height 40.0 m (spire tip and cross).

**Good (keep):** strongest silhouette in the set: two west towers with spires to 40 m, crossing flèche, flying buttresses, pointed lancets and portals with hoods, rose windows, parvis with steps. It is the one monument that needs no change to read at distance.

**Fixes, ranked**

1. **Narthex gap.** The nave ends at `naveZ1 = front - tw` (`culture.ts:390`, front - 5.5). The west facade is at `front - 1.0` to `front` (`culture.ts:502`). The 4.5 m slot between them (x within about 4 m) has no roof, no walls, no aisle. From the air it is a notch; from the parvis it looks like a screen. Fix: set `naveZ1 = front - 1.0` so the nave meets the facade. Check the gable roof end (`culture.ts:401`) and the aisle roofs (`culture.ts:402-403`). Cost: about +40 triangles.
2. **Tower buttress stubs stop 1 m short.** `culture.ts:483-485`: buttress columns run from 0 to `th - 6 + 5 = th - 1`, but the tower-top platform is at `th` (`culture.ts:495`). Fix: buttress height `th - 6` plus 6 for the stub, so the top meets the platform. Cost: 0 triangles.
3. **Apse faceting.** `culture.ts:423-427`: apse and ambulatory use 7 and 9 segments over 180 degrees. At a 4 m and 7.5 m radius the facets show. Fix: 12 segments for both. Cost: about +50 triangles.
4. **Rose windows always glow at night.** `culture.ts:349` uses `glassLit` for the rose disc. At night every rose is lit at 100%, while the lancets follow the window share. Fix: use `glass` (or a lit share from tuning) for the rose disc. Cost: 0 triangles.
5. **Window odds are literals.** `culture.ts:433`, `446`, `461`, `492`. Move to tuning (X2).

**Not seen by eye:** the narthex gap from the street; spire colours (roof vs dark) against the sky; night rose glow.

---

## Cross-cutting issues

Ordered by impact. Items marked "shared" touch files used by several monuments.

**X1. Shadow budget has almost no headroom (shared, highest risk).** Shadow triangles are 592,339 of 605,000, about 12.7k left. A single monument's full main triangle count is 5k to 12k. If monument meshes cast shadows, adding any monument triangle eats the whole shadow headroom. **A3 decision (checked in code, measured with a scratch script).** Monument body meshes DO cast shadows. Path: `ColorBatch.build()` sets `castShadow = true` on the `body` mesh only (`src/buildings/geometry.ts:175`). Monuments are not merged by `mergeByMaterial`, so no detail split applies; `useTownPieces.ts:64` calls `buildMonument` and `Town.tsx:266-268` renders `piece.object` directly. The sun light casts (`Town.tsx:255`), and the shadow pass draws every mesh with `castShadow` on layer 0. Measured shadow-casting triangles per monument (seed 1): hospital 9,536; funfair 6,696; circus 5,548; dinosaur-park 5,566; fire-station 5,460; gothic-cathedral 5,786; stadium 5,228; supermarket 5,228; open-air-theatre 4,784; swimming-pool 4,644. Each is about 75 to 90% of that monument's main triangles. Against the 12.7k shadow headroom, one monument fits and two or three break the 605k ceiling. It is not known whether seed 1 already contains a monument (the 592k figure may include one), so this has not been checked against the test.

**DECIDED (user): monument bodies stop casting shadows.** Done in `src/scene/useTownPieces.ts` (traverse of the monument group after `buildMonument`, `castShadow = false` on every mesh). Houses, streets and trees unchanged. Budget test on seed 1: main 1,581,859 of 1,900,000; shadow 592,339 of 605,000 (headroom 12,661, unchanged). CORRECTION: seed 1 DOES have a monument (swimming-pool). tests/budget.test.ts counts all monument bodies as shadow casters, so the 592k total still includes about 4.9k of pool shadow that the real render no longer draws. The test is conservative for monuments.

Original recommendation (now applied): cut monument bodies from the shadow pass in the scene layer: `useTownPieces.ts` after line 64, traverse the monument group and set `castShadow = false` on meshes named `body`. This costs 0 main triangles and drops each monument's shadow cost to 0. Visual cost: monuments stop casting long shadows onto the streets. Alternative if the look matters more: keep casting only for the cathedral and hospital (about 15k shadow triangles, which needs a shadow-budget decision first). Do not add monument shadow triangles before this is settled. Owner: Scene & QA (`useTownPieces.ts`, `townShadow.ts`), with the architect.

**X2. Density and lit-window literals in monuments (shared tuning).** The tuning rule says designer values live in `tuning.ts`. Monument code has many literal odds: `kit.ts` window default uses `buildings.litWindowShareMonument`, but builders use their own odds: `civic.ts:62` (0.3), `civic.ts:188` (0.6), `civic.ts:210` (0.25), `civic.ts:283` (0.85), `civic.ts:335` (0.6), `civic.ts:339` (0.55, 0.7), `leisure.ts:237`, `leisure.ts:246`, `leisure.ts:471` (0.4), `leisure.ts:513` (0.5), `leisure.ts:609` (0.5), `culture.ts:433` (0.4), `culture.ts:446`, `culture.ts:461` (0.35), `culture.ts:492` (0.4), and crowd counts `civic.ts:142`, `leisure.ts:180`, `leisure.ts:359`, `culture.ts:521`. Proposed knobs in `buildings` (tuning.ts): `monumentDetail` with `litWindowCivic`, `litWindowLeisure`, `carParkOccupancy`, `crowdHospital`, `crowdStadium`, `crowdFunfair`, `crowdCathedral`, `vegetationFerns`. Each knob gets one doc line, a parity entry (tests/tuningParity.test.ts) and a row in docs/TUNING.md. Cost: 0 triangles. Note: changing the RNG call order changes all later picks in that monument (see X8).

**X3. Floating or unsupported parts (shared pattern).** Solar racks (`civic.ts:303-306`), stadium crest (`leisure.ts:154-155`), carousel canopy band (`leisure.ts:268` vs `273-274`), stall awning (`leisure.ts:207-212`), balloons (`leisure.ts:357-358`), tower buttress stubs (`culture.ts:483-485`), narthex gap (`culture.ts:390, 502`), the pool slab (`leisure.ts:438`). Fix each in its own builder; no shared code needed. Cost: near 0 triangles except solar legs (about +300).

**X4. Water as flat planes (shared, needs one helper).** Water appears as a flat glass disc or plate in three places: hospital fountain (`civic.ts:123-125`), swimming pools (`leisure.ts:386-393`, paddling pool `leisure.ts:443-444`), dinosaur pond (`culture.ts:192`). A `waterBasin(k, rim, depth, colour)` helper in `kit.ts` would give a recessed basin with a coping rim using only the existing body and glass targets. Must not add a mesh. Owner: Buildings. Run before any of the three building fixes.

**X5. Glass and lit meshes at night (not verified).** Monuments add glass target boxes for windows and `glassLit` for lamps and signs. The night look has not been seen. Specific concern: the rose windows (`culture.ts:349`) are fully lit at night. Lettering bands (`kit.ts:369-389`) are random strokes that read as noise at medium distance and are lit at night. Action: a night check in Chrome for one monument (suggest the cathedral) at the next visual pass.

**X6. Window frame cost on hidden faces (shared, kit).** `windowAt` (`kit.ts:280-297`) adds about 5 boxes per window (two jambs, head, sill, glass). The hospital alone has 100+ windows. Back-face windows are rarely seen from the street or the overview. Option: skip sills and jambs on `back` faces (a `faces` option or a LOD flag). Saves about 1,000 to 1,500 triangles on the hospital and about 500 on the cathedral. Risk: the overview camera (`overviewDirection` `[0, 1.75, 0.45]`) may look at back faces from the far side; check first.

**X7. Round counts (shared, low).** Stone cylinders at 6 to 8 sides (`civic.ts:99`, `culture.ts:423-427`, pillars and lamp posts) and 4-sided cones for pinnacles are fine at distance. Only the apse (culture.ts:423-427) needs more sides. Do not raise counts globally: cost multiplies across ten monuments.

**X8. RNG stream stability (shared, process).** Each monument uses one `Kit` RNG seeded from kind and seed (`monument.ts:63`). Adding or removing a `chance()` call shifts all later colours and picks in that monument. Determinism hashes may exist in tests; check `tests/monuments*` before any task that changes call order. Tasks that change odds should say so in the acceptance check.

**X9. Draw-call headroom (shared).** Seed 1 measured 132 of 140 draw calls, 8 left. Each monument adds at most three main meshes. Any task that adds a new material or separate mesh (for example a separate water mesh) can break the cap. Rule for all tasks: reuse the existing body, glass and glassLit targets. Owner: Scene & QA.

**X10. Ground darkening (kit-wide, keep).** `monument.ts:66` darkens the bottom half metre of every monument. It is a cheap ground occlusion stand-in. Keep. Note it also darkens water basins at ground level if X4 lowers water below 0.5 m.

---

## Priority order (update, supersedes lane order below)

Focus is beauty first. Church is the `gothic-cathedral` kind (it is the source of the church bell, `Town.tsx:158`). Order of focus:

1. **Church** (`gothic-cathedral`): B8.
2. **City Hall** (new kind `city-hall`): N2 below.
3. **Hospital**: B1.
4. **Supermarket**: B3.

Everything else follows, in the order in the lanes below: fire station, stadium, funfair, pool, circus, dinosaur park, theatre. **School** (new kind `school`) is last: N1.

**Not yet in the game:** `school` and `city-hall` are not in `MonumentKind` (`src/core/types.ts:22-32`), not in `buildings.monumentKinds` (`tuning.ts:77-89`), and have no builder. Adding them is a feature, not a polish task. Scope and risk:

- **Draw calls:** each monument adds up to 3 main meshes. Seed 1 is at 132 of 140. Two new kinds means 138 at most, with 2 left for the rest. Any extra mesh in B-tasks breaks the cap. Tasks must reuse body, glass and glassLit only.
- **Shadow budget:** a new monument is 5k to 12k main triangles. If its meshes cast shadows, the 12.7k shadow headroom is gone after one building. A3 must decide the shadow policy before N1 or N2 starts.
- **Layout shift:** monuments are picked from `monumentKinds` per monument block. Adding kinds changes which kind every seeded monument block gets, so every town layout changes once. Note it in the handbook, as for the earlier merge change.
- **Knobs:** each new kind needs a rate or weight knob in the `buildings` section and a parity entry.

**N1 School (new, last).** Files: `src/core/types.ts`, `src/config/tuning.ts`, `src/buildings/monuments/civic.ts` (or a new `education.ts` if civic.ts grows past 400 lines, which it will not if the school stays short), `monument.ts`. Work: one-storey and two-storey hall, bell-less tower or cupola, playground greenery (counts to knob). Acceptance: tests `monuments` and `geometry`; budget C1; by-eye at medium range. Budget: about +6k main; blocked until A3 and the draw-call check. Risk: high (new kind, layout shift, shadow).

**N2 City Hall (new, second).** Files: `src/core/types.ts`, `src/config/tuning.ts`, `src/buildings/monuments/civic.ts`, `monument.ts`. Work: stone civic hall with a central clock tower, colonnade, flag on a `withWind(WIND.FLAG)` pole, steps. Reuse existing kit parts (columns, cornice, clock face material). Acceptance: tests `monuments`, `geometry`, `budget`; by-eye from the street and the overview. Budget: about +8k main; blocked until A3. Risk: high. Must land in the civic lane after B1 and B3 are planned, but is built first in that lane because of priority.

**Civic lane order (revised):** N2 City Hall, then B1 Hospital, then B3 Supermarket, then B2 Fire station, then N1 School.

**Culture lane order (revised):** B8 Church first, then B9 Dinosaur park, then B10 Theatre.

**Leisure lane order (revised):** B4 Stadium, B5 Funfair, B6 Pool, B7 Circus.

Phase A and Phase C stay as written below. Lanes stay parallel after A3. Only the internal order changed, and N1 and N2 wait for the A3 shadow decision.

## Implementation plan

Ordering rules: tasks marked **[SHARED]** edit a file used by several monuments and must run alone, never in parallel with another task that touches the same file. Tasks in one file lane run in order. Lanes by file: civic.ts (hospital, fire station, supermarket), leisure.ts (stadium, funfair, pool, circus), culture.ts (dinosaur park, theatre, cathedral). Lanes can run in parallel only after the shared tasks finish. Every task: `npx tsc --noEmit` (print failures only) and the targeted vitest files. Full budget run once at the end.

**Phase A (serial, shared)**

**Task A1 [SHARED] Monument tuning knobs.** Files: `src/config/tuning.ts` (`buildings` section only), `tests/tuningParity.test.ts`, `docs/TUNING.md`. Work: add the knobs in X2 with one doc line each; no feature behaviour change yet, defaults set to current literal values so output is byte-identical. Acceptance: `tests/tuningParity.test.ts` passes with the new entries; `npx tsc --noEmit`; output of the ten monuments unchanged (vitest monuments suite). Budget effect: 0. Risk: low. Owner: Buildings, with Scene & QA on parity.

**Task A2 [SHARED] Water basin helper and window LOD.** Files: `src/buildings/monuments/kit.ts` (add `waterBasin`, optional back-face skip in `windowAt`/`wing`). Work: helper only; no caller changes yet. Acceptance: the helper compiles and is unit-tested with a small geometry check (`tests/monuments*`); back-face skip is off by default so output is unchanged. Budget effect: 0 until used. Risk: medium (kit is used by all ten; `uv` wind rule in Buildings handbook must hold). Owner: Buildings.

**Task A3 [SHARED] Shadow policy decision (no code).** Files: none to edit; read `src/scene/townShadow.ts` and the shadow-pass traversal. Work: confirm which monument meshes cast shadows and whether glass or lettering enter the shadow pass. Decide whether monuments need a shadow cut before any task adds triangles. Acceptance: written decision in this file's X1. Budget effect: none. Owner: Scene & QA + architect.

**Phase B (three lanes in parallel, after A1-A3; each lane serial inside)**

**Lane civic.ts**

- **B1 Hospital.** Files: `civic.ts` (hospital), uses `waterBasin` (A2) for the fountain, knobs from A1 for dormer odds. Work: rustication bands to a plinth band or to `groundH` (civic.ts:51); fountain basin. Acceptance: tests `monuments` and `buildings` suites; `tests/budget.test.ts`; by-eye check of the front at close and medium range (Chrome). Budget: about +150 main triangles, minus about 4 boxes. Risk: low.
- **B2 Fire station.** Files: `civic.ts` (fire station). Work: recessed bay doors (civic.ts:184-193), tower flag through `withWind(WIND.FLAG)` (civic.ts:220), window odds to knob. Acceptance: as B1; check flag moves in wind. Budget: about +90 triangles. Risk: low.
- **B3 Supermarket.** Files: `civic.ts` (supermarket). Work: solar racks with legs (civic.ts:303-306); car-park odds to knob. Acceptance: as B1; check racks against the roof edge at close range. Budget: about +300 triangles. Risk: medium (shadow: X1).

**Lane leisure.ts**

- **B4 Stadium.** Files: `leisure.ts` (stadium). Work: `rise` 0.6 to about 0.95 (new knob or local geometry constant: the rise is a shape constant, keep local); crest on the entrance face (leisure.ts:154-155). Acceptance: tests `monuments` suite; by-eye: bowl height from medium distance. Budget: 0. Risk: low; check canopy offsets.
- **B5 Funfair.** Files: `leisure.ts` (funfair). Work: carousel column/band gap (leisure.ts:268, 273-274); stall awning anchor (leisure.ts:206-211); balloons tied (leisure.ts:357-358); crowd count to knob. Acceptance: tests `monuments`; by-eye carousel roof and stall awning at close range. Budget: 0 to +20. Risk: low.
- **B6 Swimming pool.** Files: `leisure.ts` (pool, swimmer heads, slab), uses `waterBasin` (A2). Work: recessed basins; swimmer heads as small blobs; remove or fix the slab (leisure.ts:438). Acceptance: tests `monuments`; by-eye pools at close and medium range. Budget: about +400 triangles. Risk: medium: deck top coplanar with water bottom is the trap (leisure.ts:382, 388); lower water below the deck top, not at it.
- **B7 Circus.** Files: `leisure.ts` (circus). Work: skirt and sag on the big top (leisure.ts:561-586); wagon odds to knob. Acceptance: tests `monuments`; by-eye silhouette from far. Budget: about +40. Risk: low.

**Lane culture.ts**

- **B8 Gothic cathedral.** Files: `culture.ts` (gothic). Work: narthex gap (culture.ts:390); buttress stub height (culture.ts:483-485); apse segments 12 (culture.ts:423-427); rose glow (culture.ts:349); window odds to knob. Acceptance: tests `monuments`, `geometry` (slow, about 2 min); by-eye: silhouette from the parvis, the narthex from above (overview camera). Budget: about +50. Risk: medium (gap fix changes the nave gable end; check for coplanar faces with the facade at z = front).
- **B9 Dinosaur park.** Files: `culture.ts` (dinosaur), uses `waterBasin` (A2). Work: sunken pond with a rim (culture.ts:192); vegetation counts to knob. Acceptance: tests `monuments`; by-eye pond at medium range; night check of the volcano. Budget: about +150. Risk: low.
- **B10 Open-air theatre.** Files: `culture.ts` (theatre). Work: backdrop plinth and cornice (culture.ts:289-290); window and audience odds to knob. Acceptance: tests `monuments`; by-eye backdrop from the cavea, at night for stage footlights. Budget: about +40. Risk: low.

**Phase C (serial, after all lanes)**

**Task C1 [SHARED] Budget and determinism check.** Files: none to edit unless a test needs a fresh number (not allowed: do not raise the 140 draw-call cap). Work: `npx vitest run tests/budget.test.ts` (rerun the pedestrian flake solo if it fails), `npx vitest run tests/geometry.test.ts` (slow), `npx vite build`. Acceptance: main <= 1.9M, shadow <= 605k, draw calls <= 140. Expected total of B1-B10: about +1,400 main triangles, shadow depends on A3. Owner: Scene & QA.

**Task C2 [SHARED] Handbook and TUNING index.** Files: `docs/agents/buildings.md` (Buildings appends), `docs/TUNING.md`, `docs/agents/scene-qa.md` (budget numbers, if measured). Work: record the new knobs, the water helper, the shadow decision and what was not seen by eye. Owner: Buildings and Scene & QA. Risk: none.

**Parallel-safe summary**

- Serial: A1, A2, A3 (shared, first). Then C1 and C2 (shared, last).
- Parallel: the three lanes (civic, leisure, culture), each internally serial. Only after A1-A3 and before C1.
- Do not run any two tasks in the same lane at once. Do not run a task that edits `tuning.ts` or `kit.ts` in parallel with a lane.

## Not seen by eye

- No monument was forced or inspected up close; only the far overview of the town (one striped big top visible).
- Night looks, shadow behaviour, wind on cloth parts, and scale against neighbouring houses are from code only.
- Triangle counts are from a scratch script (seed 1, default footprint). Other seeds and block sizes (smaller blocks scale down, `monument.ts:78`) were not measured.
- Budget tests, determinism tests and the geometry audit were not re-run in this review.
