# MyWorld3D - Critic review 01

Reviewer: Critic. Date: 2026-10-27. Scope: whole current state (live at localhost:5173, code, tests).
Method: top-down, mid-height and street-level views by day (12:00), golden hour (17:30) and night (20:30); Summer, Autumn, Winter; Whole map; `gl.info` readings; `vitest`, `tsc`; code skim of Town.tsx, App.tsx, PostFX, traffic, pedestrians, audio, environment.
Not verified (be honest): fps (pane was hidden), rear elevations beyond one brick wall, monument interiors, Spring, the leaf devil in action, audio output (silent here), mobile.

## 1. Verdict

1. The static architecture is the strong part: continuous street walls, striped awnings, readable COFFEE/MUSEUM signs, recessed windows, procedural brick/stone, soft shadows. From mid-height it already reads as a miniature European city.
2. The city is lifeless. People are one grey capsule (no head, no limbs, no animation) bouncing back and forth on a sidewalk line; there are zero animals except dogs, zero birds, zero weather, no sun or moon in the sky, no stars.
3. The street-level and night looks are far weaker than the top-down day look: night is mostly pitch black with flat yellow discs for lamp light, vehicles show no headlights, the sky is a flat colour, the horizon is a hard olive table edge.
4. Budgets are already broken: about 5.6 M triangles and 408 draw calls per frame (winter, noon, whole map, shadow pass included) against the DESIGN-3D budget of under 3 M and under 400. Every new feature (weather, birds, crowds) lands on a frame that has no headroom, so Round 1 must include a performance diet.
5. Code health is good for its size (324 tests green, `tsc` clean, clear module contracts) but nothing is committed to git, selection has no visual feedback, minDistance=40 blocks real street-level viewing, and changing the Traffic slider regenerates the whole city and rebuilds every block.

## 2. Scorecard

| # | Area | Score | One-line reason |
|---|---|---|---|
| 1 | Houses and facades | 8 | Best asset. Rhythm, awnings, signs, balconies, corner buildings all convincing. Door voids black, mortar too thick up close, rooftops from above a bit samey. |
| 2 | Streets and furniture | 6 | Clean asphalt, crosswalks, signals, lamps, bins, bollards. No bus stops, kiosks, fountains, parked cars, manholes, gutters, wear. Intersections read as plain squares. |
| 3 | Vehicles | 4 | Coloured boxes with a cabin box and black wheel stubs. Four classes but no detail, no parked cars, no headlights, no turn signals, no speed variety. Scale looks slightly toy-like at street level. |
| 4 | People | 2 | Single capsule, one colour, no animation, no variety, ping-pong on a line, never cross a road, 2 per road segment. Hardly visible. |
| 5 | Animals | 1 | Dogs are capsules. Nothing else exists. |
| 6 | Trees and plants | 6 | Faceted blob crowns are charming and seasonal tint works. Trunks thin, crowns identical per species, no blossom, no flowers, hedges, window boxes visible; winter is nearly invisible from above. |
| 7 | Leaves and particles | 5 | Falling leaves and leaf devil exist but a leaf near the street camera is a giant orange slab (Leaf size x1.6). No petals, dust, snow. |
| 8 | Sky, light, atmosphere | 4 | Light colour grading and shadows are good. No sky gradient, sun, moon, stars, light shafts. Cloud shadows are hard, near-black and show hexagonal edges. Night is nearly black. |
| 9 | Weather | 0 | None exists. |
| 10 | Wind | 6 | Tree sway, leaves, smoke, cloud drift wired to one wind vector; compass UI is nice. No flags, laundry, awnings, hair, gust audio detail. |
| 11 | Audio and music | 4 | Procedural rustle, crowd, engines, random horn/bark. Non-positional (engine loudness is per class from nearest vehicle only). Music button is a dead placeholder. No birds, bells, rain, footsteps. |
| 12 | Camera, UI, interaction | 5 | Panels are well made. But: no selection highlight, settings panel covers the right 40% of the map and cannot collapse, Whole map is cropped by it, minDistance 40 prevents true street view, no keyboard or touch help. |
| 13 | Rendering, performance, code | 6 | Instancing and merged blocks are right, shader AA is careful, tests are strong. Over budget on triangles, DPR up to 2 plus bloom plus soft shadows, no LOD, per-frame allocations, no git history. |

Overall: 4.5 / 10 as a living city, 7 / 10 as a still image. Priority is liveliness and atmosphere, not more building detail.

## 3. Findings per area

Severity: B blocker, H high, M medium, P polish.

### 3.1 Houses and facades (8)
Protect: perimeter-block street walls, bay rhythm, awnings (green/white stripes), fascia signs with real text, balcony ironwork, shutters, brick and stone surface shaders with fwidth fade, lit windows at night (about 35%), chimney smoke.

| ID | Sev | Evidence | Fix idea |
|---|---|---|---|
| H-1 | M | Courtyard-side doors are pure black rectangles (brick wall view, door 1.2x2.4 black). | Give doors a lighter panel colour, a frame, a transom and a lit-at-night variant; never render an unlit black void. |
| H-2 | M | Brick mortar reads as thick horizontal bands at 5 m distance (joint contrast too high, joints look like stripes). | Reduce joint width to 8 mm or lower joint contrast by about 30%; check Brick fade distance. |
| H-3 | M | From above, many roofs are plain terracotta or grey slabs; rooftop clutter exists but is small. | Add 1-2 larger rooftop features per block (skylights, terraces with umbrellas, green roofs, solar panels), more chimney variety, and sprinkle laundry or antennas on flat roofs. |
| H-4 | P | Glass looks flat dark in golden hour at street level (little visible reflection). | Increase Fresnel and add a warm sun glint band; keep the shared material. |
| H-5 | P | No window boxes with flowers or hanging plants, no shop-front goods, no door mats or bikes against walls. | Add as merged detail (see 3.6 and Missing features). |
| H-6 | P | Night: buildings are mostly dark; lit ratio fixed by seed. | Animate a handful of windows switching on and off over the evening (shader time uniform or per-block attribute), keep seeds deterministic. |

### 3.2 Streets and furniture (6)
Protect: crosswalk geometry, signal poles with phase lights, lamps staggered, benches, bins, bollards, curb height 0.15, tree pits.

| ID | Sev | Evidence | Fix idea |
|---|---|---|---|
| S-1 | H | Night lamp light is a flat, hard-edged, over-bright yellow disc with a large radius that paints over facades and sidewalks identically. | Use a smaller, softer radial falloff (alpha gradient squared), warmer but less saturated, and clip or fade the decal where it meets facades; optionally a small additive strip on the wall base next to each lamp. |
| S-2 | M | Asphalt is a uniform dark slab: no patches, cracks, manholes, drains, stop lines wear, tram-style joints. | Add a low-frequency noise and decals in the road shader (one shared road material), manhole and drain instances. |
| S-3 | M | No bus stops, kiosks, newspaper stands, phone boxes, bike racks, fountains, planters, parked cars, market stalls, plazas other than the funfair. | New instanced furniture families on avenues (see Missing features). |
| S-4 | M | Intersection squares are empty; no traffic islands, corner curb radii, tactile paving. | Round the curb corners and add a pedestrian refuge; cheap geometry in `streets/surfaces.ts`. |
| S-5 | P | Sidewalk is one flat cream colour; no paving pattern except plazas. | Add a paving grid in the sidewalk shader (fwidth-faded). |
| S-6 | P | Vehicle signals work, but there are no pedestrian signal heads. | Add two-lamp pedestrian heads at crosswalks tied to the same phase. |

### 3.3 Vehicles (4)

| ID | Sev | Evidence | Fix idea |
|---|---|---|---|
| V-1 | H | Cars are a body box plus a cabin box with dark glass and wheel cylinders. Same silhouette per class. At street level the van in front of the camera is a featureless slab. | 4-5 body silhouettes (hatchback, sedan, SUV, van, taxi, delivery) with sloped windscreen (chamfered geometry), bumpers, mirrors, wheel arches, tail lights; still one InstancedMesh per variant. |
| V-2 | H | No headlights, tail lights or brake lights at night (night top-down showed none). | Emissive head and tail light parts plus a cheap additive ground cone decal; brake light on stop. |
| V-3 | M | No parked cars, so street edges are empty; no vehicle variety in speed; fixed following gap only, no overtaking, no yield on turns, no collision avoidance (documented). | Add static parked cars along avenue curbs (instances with seed), per-vehicle speed factor, slow-down at corners. |
| V-4 | M | Vehicles do not visibly turn (heading steps?), wheels never spin, no body roll. | Smooth heading along path curves, wheel-spin via instance attribute or shader. |
| V-5 | P | Bus is a long box; no route sign or door detail. | Add destination board (use the sign atlas) and windows pattern. |

### 3.4 People (2) - the biggest liveliness gap

| ID | Sev | Evidence | Fix idea |
|---|---|---|---|
| P-1 | B | Pedestrian mesh is one `CapsuleGeometry(0.25, 0.9)` in one colour (`traffic/meshes.ts`). No head, arms, legs, hair, clothes. From the top-down default view they are invisible dots. | Build 3 body types (adult, child, elder) x 8-10 clothing palettes with head, torso, hat/hair, bag; stylised, about 150-250 tris each. Vertex-colour per part plus instance colour for top and trousers. |
| P-2 | B | No animation. | Vertex-shader walk cycle (leg swing and bob driven by a per-instance phase attribute and speed), zero CPU cost. |
| P-3 | H | Walkers ping-pong on a sidewalk line per road (`pedestrians.ts`: `dir` flips at ends), 2 per road, never cross roads, never enter shops, never stop. | Graph walk: pedestrians traverse sidewalk lines, choose a new line at each intersection, cross at crosswalks only when the signal for that axis is red for cars (`traffic.lights.phaseOf`), wait at the curb. Idle behaviours: stand and chat in pairs, sit on a bench, queue at a bus stop, look at a shop window, enter a door and disappear. |
| P-4 | H | Density is low and uniform. Many are inside sidewalk-shaped dead space. | Density weighted by street hierarchy and time of day (more on avenues, near cafe terraces, fewer at night); cap total at about 600 instanced. |
| P-5 | M | Dogs are the same capsule; leash is invisible. | Dog model with head, ears, tail, wag in shader; leash as a thin line mesh instance or two-segment strip. |
| P-6 | M | Pedestrians do not react to wind, rain, or season. | Umbrellas in rain (a second instanced mesh toggled per walker), scarves/coats in winter palette, shorts palette in summer. |
| P-7 | P | Café terraces have tables and chairs but no seated people. | Seated variant poses in a small pool near terraces. |

### 3.5 Animals (1)
Only dogs. Cheapest big win per effort in the whole project.

| ID | Sev | Evidence | Fix idea |
|---|---|---|---|
| A-1 | H | No birds anywhere, no pigeons on roofs and plazas. | Pigeon flocks: instanced low-poly birds that peck on plazas and sidewalks, scatter when a pedestrian, vehicle or the leaf devil gets close, then circle and land on roofs. Wing flap in shader. About 80 instances. |
| A-2 | H | No flying birds in the sky from the top-down view. | Distant flocks of 20-40 as a single instanced mesh with boids-lite motion (path plus noise), visible over the city, with a bird-calls audio layer. |
| A-3 | M | No cats, ducks, squirrels. | Cats on walls and window ledges (static pose with occasional tail flick, instanced, at night eyes), ducks in the fountain or pond when added, squirrels on trees in autumn (very low cost, 10 instances). |
| A-4 | P | No butterflies or bees near flowers in spring/summer. | 30 butterfly instances, shader flutter, only visible when close. |

### 3.6 Trees, plants, flowers (6)
Protect: instanced per species, bare-winter variant, shader sway, vertex-colour season recolour, per-tree click selection, `TriBuilder`.

| ID | Sev | Evidence | Fix idea |
|---|---|---|---|
| T-1 | M | Trunks are thin sticks relative to crowns (street view, Autumn). Crowns share two variants per species so tree rows repeat. | Add 2 more crown variants and a per-instance scale or hue jitter; thicker trunk and root flare. |
| T-2 | M | Leaf colour per species is similar in summer; maple/oak/birch/ginkgo are hard to tell apart from above. | Differentiate crown silhouette and hue per species (ginkgo yellow in autumn, birch light-green, oak dark), per-instance hue jitter. |
| T-3 | M | No spring blossom, no flowers, no hedges outside courtyards, no window boxes, no flower beds on avenues. | Blossom season variant (pink/white speckle on spring crown colours plus petals particle), flower beds at tree pits and plazas (instanced coloured quads/low-poly bouquets), hedges along plazas. |
| T-4 | P | Winter: bare branches nearly vanish from above, snow absent. | Thicker branch geometry, snow cap tint on crowns/roofs when winter weather is on. |
| T-5 | P | Courtyard grass and trees are small; the map outside the town has a few stray trees (visible "forest" is practically absent). | Ring of instanced forest beyond the town edge, with fog fade. |

### 3.7 Leaves and particles (5)

| ID | Sev | Evidence | Fix idea |
|---|---|---|---|
| L-1 | H | Street-level screenshot: a leaf at 1-2 m from the camera is an orange slab covering a quarter of the frame (Leaf size x1.6, default). | Fade leaf scale with distance to camera (smaller than 2 m: shrink and fade by dithering), cap size near camera, lower default size to x1.0. |
| L-2 | M | Particles are leaves only (seen in Autumn); there is no seasonal particle variety. | Spring petals (pink), summer: pollen and dust motes, autumn: leaves, winter: snow (see weather). One system, one InstancedMesh, per-season colour/shape. |
| L-3 | P | Leaf devil is spawned at random point; no dust shading. | Add a dust column of semi-transparent sprites and small ground swirl decal. |

### 3.8 Sky, light, atmosphere (4)

| ID | Sev | Evidence | Fix idea |
|---|---|---|---|
| K-1 | H | Sky is `<color attach="background">` (flat beige/olive). No gradient, no horizon haze, no sun disc, no moon, no stars. From a low camera the sky is a flat wall. | Sky dome shader (zenith/horizon gradient from `getLightingForTime`), sun disc and glow, moon with phase, stars (instanced points or shader) fading with `lightsOn`, optional low-poly distant hills silhouette. |
| K-2 | H | Whole-map zoom: the town floats on a flat olive plane with a hard edge and the horizon line; the beyond-town ground is a flat colour. | Large ground disc with a noise-tinted shader, soft fog blend into the horizon, field patches and a river or sea strip optional. |
| K-3 | H | Night: 90% of the scene is black; street lamp pools are flat; vehicle lights absent; only a few windows lit. No moonlight fill. | Add a cool moonlight hemisphere and a dim blue directional (no shadow) at night, raise ambient floor, bloom threshold tuning, headlights and lit shop fronts (see V-2, S-1). |
| K-4 | M | Cloud shadows are very dark, hard-edged, and hexagonal at map edges (shadow-only icospheres). | Use fewer, larger clouds with subdivided geometry (IcosahedronGeometry detail 1) to remove the hexagonal outlines, and cap how dark they can make the ground (for example a soft multiply decal that follows the clouds instead of true shadow casting); add a cloud amount control. |
| K-5 | M | Golden-hour min light elevation is clamped at 24 degrees (deliberate), so shadows never get really long. | Keep, but let the Light slider drive a gentler, longer shadow near sunset and add a warm rim; document the cheat. |
| K-6 | P | No fog banks, no light shafts, no sun glow haze, no heat shimmer. | Fog bank (cheap alpha planes near the ground, see weather), god-ray quads at golden hour optional. |

### 3.9 Weather (0) - nothing exists, decisions are in section 5 (Round 2)

### 3.10 Wind (6)

| ID | Sev | Evidence | Fix idea |
|---|---|---|---|
| W-1 | M | Wind reads on trees, leaves, smoke and clouds only. Nothing else moves: no flags, laundry, awnings, banners, signs, long grass, hair. | Add flags on monuments and rooftops, laundry lines on rear elevations, awning flutter (vertex shader on a tagged vertex attribute, shared material), swinging blade signs. All from the existing wind uniforms. |
| W-2 | P | Wind sound is a filtered noise only. | Add gust whistle layer and per-gust swell synced to `gustStrength`. |
| W-3 | P | Umbrellas, hats and scarves do not respond. | See P-6. |

### 3.11 Audio and music (4)

| ID | Sev | Evidence | Fix idea |
|---|---|---|---|
| U-1 | H | Music toggle does nothing (placeholder). | Procedural ambient music (generative pads, a soft piano or marimba loop, three moods: day, golden hour, night) via Web Audio; no assets. |
| U-2 | H | No positional audio: engine loudness is "nearest vehicle per class within 150 m" (Town.tsx), horns and barks fire from a random timer with no position. | Use a `PannerNode` per event, positioned at a chosen vehicle or dog; listener = camera. Distance-based gain and lowpass. |
| U-3 | M | No birds, church bells, footsteps, cafe clatter, rain, thunder, wind in gusts, distant sirens. | Time-of-day ambience bed: morning birds, midday crowd, evening cicadas/crickets in summer, church bell on the hour from the Gothic church monument. |
| U-4 | P | `playHorn`, `playBark` are fired by `tick()` randomly even if no car or dog is near the camera. | Trigger from nearest vehicle or dog in the camera's neighbourhood. |

### 3.12 Camera, UI, interaction (5)

| ID | Sev | Evidence | Fix idea |
|---|---|---|---|
| C-1 | B | `minDistance={40}` in App.tsx: you cannot get close to anything; the street-level view only works by pitching to the horizon at 40 m orbit radius around the target. No pan target change (no right-drag pan?), so you can only orbit the centre of the map. | Make the orbit target follow the cursor/click (zoom-to-cursor, `screenSpacePanning`, pan enabled), minDistance 4, near plane 0.1, and add a "street walk" camera preset (eye height 1.7 m, WASD plus drag look). |
| C-2 | H | The settings panel covers the right 300 px of every frame; the whole-map button centres the town under it (the right-most column of blocks hides under the panel). | Collapsible panel (tab button and key H), and offset the camera framing by the panel width in `wholeMap`. |
| C-3 | H | No selection feedback: clicking a house opens a panel on the left but nothing highlights the house, block, or tree. | Outline or tinted emissive on the selected lot (draw an additive footprint decal plus a bounding frame or use `OutlinePass` on a selection proxy), hover highlight, cursor change. |
| C-4 | M | Whole map is a single hard jump (no smooth tween); camera `Whole map` uses y=1.75x townSize. | Tween the camera (500 ms ease), add presets: Overview, Golden hour, Night, Street. |
| C-5 | M | No photo mode, no screenshot button, no time-lapse (auto day cycle). | Add "Auto day" play toggle and a screenshot button (hides panels). |
| C-6 | M | Mobile: one `max-width: 480px` rule only; no touch gestures documented; DPR up to 2 with bloom will be heavy. | Set a mobile quality tier (DPR 1, shadow 1024, no bloom, traffic x0.5). |
| C-7 | P | Discoverability: Move blocks, Whole map, Gust and Leaf devil are text buttons without hints. | Tooltips and a first-run hint strip; keyboard help overlay (`?`). |

### 3.13 Rendering, performance, code health (6)

Measured (dev build, winter, noon, Whole map, shadows on, bloom on, hidden pane):
`gl.info` per frame: 408 draw calls, 5,619,472 triangles (includes the shadow pass), 93 geometries, 15 textures, 29 programs, 145 meshes, 25 instanced meshes, 92 shadow casters, DPR 1.5. Tone mapping 4 (ACES). `vitest`: 10 files, 324 tests, all pass, about 5.5 s. `tsc --noEmit`: clean.

| ID | Sev | Evidence | Fix idea |
|---|---|---|---|
| R-1 | H | Triangle and draw-call budgets from DESIGN-3D section 7 (under 3 M, under 400) are exceeded; a large share is shadow pass geometry. | Split casters: only large silhouettes (walls, roofs) cast; exclude tiny details, signs, balcony railings, interiors from the shadow pass via a separate geometry or `layers`; LOD for far blocks (drop facade modules above 120 m distance); frustum culling per block (one Group per block already, check `frustumCulled`); target main pass under 2 M and shadow pass under 1 M. |
| R-2 | H | `generateCity` is called in both `App.tsx` and `Town.tsx`, and both list `trafficMultiplier` in the memo deps. The Traffic slider regenerates the layout (new object) and so rebuilds the streetscape and every block (cache key is `layout`). | Make spawn points independent of the layout (`trafficMultiplier` leaves `generate`'s inputs, spawn by `VehicleSystem`), generate once and pass `layout` down (or store it), keep the block cache across layout identity when geometry inputs are unchanged. |
| R-3 | M | `getPedestrians()` allocates a new array and objects each frame; `paint()` creates `new THREE.Color` per call; `Town` recreates `Color` objects every render and `useWorldStore.getState()` twice per frame. | Pool render structs, reuse colour scratch, read settings once per frame, cache lighting. |
| R-4 | M | Shadow map is a fixed 2048 over about 257 m (12.5 cm/texel); street-level shadows look blocky; cloud shadows share it. | Cascade-lite: a second tighter shadow camera that follows the orbit target when the camera is below 80 m; or tighten the frustum to the camera's view. |
| R-5 | M | DPR [1, 2] with UnrealBloom plus two tilt-shift passes and an `OutputPass`, MSAA state unclear (the composer render target is not multisampled, so edges alias at DPR 1). | Use `samples: 4` render targets or SMAA/FXAA pass; bloom at half resolution (already 256 px, good) and skip the passes when disabled by day. |
| R-6 | M | No adaptive quality; no FPS display. | `PerformanceMonitor` (drei) driving DPR and shadow quality; a dev-only stats overlay (`window.__stats`). |
| R-7 | M | No git commits: the whole project is untracked. One bad edit loses everything. | Commit a baseline now, then one commit per round. |
| R-8 | P | `Town.tsx` is 494 lines and does composition, simulation loop, selection, audio feed and lighting. | Split into `useLighting`, `useTraffic`, `Selection`, `AudioBridge` hooks/components without changing behaviour. |
| R-9 | P | `roof.ts` (883 lines) and `forest.ts` (645) are large; fine for now. | Split only when touched. |
| R-10 | P | Tests cover geometry and logic well but nothing guards performance budgets or the `aSurface` contract at the scene level. | Add a budget test (triangle count of a seeded generated city under a threshold) and a smoke test for scene composition. |

## 4. Missing features (value versus cost)

Value: how much liveliness or beauty per user glance. Cost: S under 1 day, M 1-3 days, L more than 3 days of one agent.

| Feature | Value | Cost | Notes |
|---|---|---|---|
| Real pedestrian models plus walk animation and graph walking and crossing | Very high | M-L | P-1..P-4; the single most visible fix. |
| Pigeons and flying bird flocks plus bird sounds | Very high | S-M | Instanced, shader flap, cheap. |
| Sky dome, sun disc, moon, stars | High | M | Fixes every low and night shot. |
| Night pass (moon fill, soft lamp pools, headlights, lit shop fronts) | High | M | Night looks broken now. |
| Rain (particles, wet surface shader, puddles, ripples, umbrellas) | Very high | M | Dramatic mood change. |
| Thunder and lightning (flash light, bolt mesh, delayed thunder by distance) | High | S-M | Needs rain first. |
| Snow (particles, white roofs/ground, footprints optional) | High | M | Fixes weak winter. |
| Fog banks and mist | Medium-high | S | Reads very well with tilt-shift. |
| Positional audio and generative music | High | M | Dead Music button now. |
| Parked cars, varied car models, lights | High | M | Street edges look empty. |
| Flowers, window boxes, hedges, blossom, petals | High | M | Spring and summer charm. |
| Selection highlight, panel collapse, zoom-to-cursor camera | High | S-M | Pure UX, cheap. |
| Flags, laundry, awning flutter, blade signs swinging | Medium | S-M | Wind reads everywhere. |
| Street furniture: bus stops with queue, kiosks, fountain plus ducks, phone boxes, bike racks | Medium-high | M | Plazas become destinations. |
| Cats on ledges, squirrels, butterflies | Medium | S | Charming extras. |
| Trams on one avenue, boats on a canal | Medium | L | Later. |
| Fireworks, street market, Christmas lights in winter | Medium | M | Seasonal events. |
| Auto day-night cycle plus time-lapse | Medium | S | Sells the lighting work. |
| Photo mode and screenshot | Medium | S | Share-ability. |
| Church bells, cafe clatter, sirens | Medium | S | Audio detail. |
| Mobile quality tier | Medium | S-M | Needed before sharing. |

## 5. Rolling optimisation plan

Principles: each round is shippable alone; tasks own disjoint files so agents run in parallel; every round ends with the measurements in section 6. Ordering is by visible payoff per effort.

File ownership key (so agents never collide):
- `src/traffic/*` = Traffic. `src/environment/*` = Environment. `src/audio/*` = Audio. `src/buildings/*`, `src/buildings/facade/*` = Buildings. `src/streets/*` and `src/city/*` = City and Streets (Streets may edit `src/streets` only; City `src/city` only). `src/store/*`, `src/ui/*`, `src/App.tsx` = UI. `src/scene/*` = Scene (only one agent per round touches `Town.tsx`; others add new files and a one-line mount request handed to Scene).
- New modules go in new folders: `src/life/` (animals), `src/weather/`, `src/sky/`.

### Round 1 - Lifeless streets: people, animals, ambient life (highest payoff)

Goal: from the default view, you see tiny people moving, birds, parked cars, lit vehicles.

| # | Task | Owner | Files | Effort | Deps | Acceptance | Perf impact |
|---|---|---|---|---|---|---|---|
| 1.1 | Pedestrian models (3 body types, 10 palettes, head/hair/hat/bag), vertex-shader walk cycle | Traffic-People | `src/traffic/meshes.ts`, new `src/traffic/people/*` | M | none | Screenshot at street level shows distinct people with legs moving; at default view people are visible as coloured dots; triangles per person under 250; one instanced mesh per body type; no per-frame CPU animation | Budget +0.1 M tris at 600 people |
| 1.2 | Pedestrian behaviour: graph walk across intersections, signal-aware crossing, density by street hierarchy and time of day, idle (chat, bench, bus stop, shop window) | Traffic-People | `src/traffic/pedestrians.ts` (+ tests in `tests/traffic.test.ts`) | L | 1.1 for visual check | Walkers never stand on asphalt during a green car phase (test over 10 min simulated); crossing count over 5 minutes greater than 0; no walker outside bounds (existing test kept); at least 3 idle behaviours observable; cap 600 | CPU under 0.5 ms/frame; pool structs, no per-frame allocation (Chrome allocation timeline shows no growth) |
| 1.3 | Birds: pigeons on plazas/roofs with scatter, flying flocks, wing flap in shader | Life-Animals | new `src/life/birds.ts`, `src/life/index.ts`; mount line in Town (Scene agent) | M | none | 80 pigeons plus 3 flocks of 25; scatter when a vehicle or walker comes within 4 m; one InstancedMesh each; 2 draw calls; deterministic from seed | +2 draw calls, +20 k tris |
| 1.4 | Dogs and cats: dog model with wag and visible leash, cats on ledges, squirrels in autumn | Life-Animals | `src/life/pets.ts`, dog geometry in `src/traffic/meshes.ts` coordinated with 1.1 (Traffic-People owns the file; Animals supplies geometry from a new file `src/life/dogGeometry.ts`) | S-M | 1.1 | Dog silhouette differs from capsule; leash visible; wag animation; no new draw call per dog | negligible |
| 1.5 | Vehicle variety and lights: 5 silhouettes, parked cars on avenue curbs, emissive head/tail/brake lights, wheel spin | Traffic-Vehicles | `src/traffic/vehicles.ts`, `src/traffic/meshes.ts` sections for cars (coordinate: split meshes.ts into `meshes.ts` plus `vehicleMeshes.ts` in the first commit of this round to avoid collisions) | M | split of meshes.ts agreed with 1.1 | 5 car silhouettes visible in one screenshot; at night lights visible from top-down; at least 40 parked cars; vehicles per class still bounded by multiplier test | +1-3 instanced meshes |
| 1.6 | Quick hygiene: commit baseline to git; fix leaf near-camera giant slab (L-1); default Leaf size x1.0 | Scene-Hygiene | `src/environment/leaves.ts`, repo | S | none | `git log` has a baseline commit; leaf at 2 m from camera under 25 cm on screen; tests green | none |

### Round 2 - Atmosphere: sky, night, weather

Goal: it can rain, snow, storm, and the sky and night look beautiful.

| # | Task | Owner | Files | Effort | Deps | Acceptance | Perf impact |
|---|---|---|---|---|---|---|---|
| 2.1 | Sky dome with gradient, sun disc, moon, stars; ground disc beyond the town with fog blend; replace flat background | Sky | new `src/sky/*` (`SkyDome.tsx`, `ground.ts`); read `getLightingForTime` only | M | none | Street-level screenshot shows gradient, sun glow at golden hour, stars at 20:30 and moon; no hard olive edge in Whole map; bundle plus 0 textures | 1 draw call, no shadow |
| 2.2 | Night pass: moon fill light, soft lamp pools, window lit schedule, lit shop fronts, headlights glow | City-Streets | `src/streets/*` lamp decals, `src/buildings/materials.ts` night uniforms (Buildings owner approves, one function), `src/scene/Town.tsx` lights (Scene agent, 6 lines) | M | 1.5 for headlights | Night screenshot: street readable without bloom; no disc has a visible hard edge; average luminance of the frame greater than 8% of day | +0 draw calls |
| 2.3 | Weather state and rain: store `weather` setting (clear, drizzle, rain, storm, snow, fog) plus intensity; rain streak particles in the camera volume, wet material (roughness darker, specular boost, puddle noise), splash/ripple decals, umbrellas on walkers | Weather | new `src/weather/*` (`weatherState.ts`, `Rain.ts`, `wet.ts`), `src/store/model.ts` (UI agent adds the field), shared materials expose one `uWet` uniform (Buildings and Streets owners add it) | L | 1.1, 1.2 (umbrellas) | Rain slider 0-1; at 1.0 under 15 k live streaks, 1 draw call; surfaces visibly darker and glossier; ripples under 300 instances; umbrellas on 50%+ of walkers; fps drop under 15% | +2-3 draw calls |
| 2.4 | Thunder and lightning: flash (hemisphere boost plus sky flash), bolt mesh, thunder audio delayed by distance (distance/340 s), lightning only in storm | Weather and Audio | `src/weather/lightning.ts`, `src/audio/thunder.ts` | M | 2.3 | Flash lasts 150-400 ms; thunder delay matches distance within 0.1 s (unit test); no flash in clear weather | negligible |
| 2.5 | Snow particles plus white roof/ground tint, fog banks | Weather | `src/weather/Snow.ts`, `src/weather/fog.ts`, snow tint via `uSnow` uniform on shared materials | M | 2.3 | Winter plus snow shows white-capped roofs and ground; fog bank visible at dawn in Whole map; particles bounded | +2 draw calls |
| 2.6 | Cloud shadows softened (K-4) and cloud control | Environment | `src/environment/clouds.ts` | S | none | No hexagonal edges visible at Whole map; shadow darkness at most 35% | negative (fewer meshes) |

### Round 3 - Performance and rendering diet (stability before more content)

| # | Task | Owner | Files | Effort | Deps | Acceptance | Perf impact |
|---|---|---|---|---|---|---|---|
| 3.1 | Shadow caster diet and per-block LOD (R-1) | Buildings-Perf | `src/scene/mergeBlock.ts` (split casters/non-casters), `src/buildings/*` flags | M | none | Main plus shadow triangles under 3.0 M at Whole map and under 2 M at default zoom; visual diff minor | large win |
| 3.2 | Layout once, traffic out of layout (R-2) | City | `src/city/generate.ts`, `src/store`, `src/App.tsx`, `src/scene/Town.tsx` | S-M | coordinate with Scene | Moving the Traffic slider triggers no block rebuild (assert `buildHouse` call count in a test); `generateCity` called once per settings change | removes long stalls |
| 3.3 | Allocation hygiene and pooled render structs (R-3) | Scene-Perf | `src/traffic/*`, `src/scene/Town.tsx` | S | 1.2 | Allocation timeline flat over 60 s | smoother frames |
| 3.4 | Follow-cam shadow cascade and AA (R-4, R-5) | Scene-Perf | `src/scene/PostFX.tsx`, `src/scene/Town.tsx` lights | M | 3.1 | Street-level shadows crisp; edges antialiased at DPR 1 | +0.3 ms |
| 3.5 | Adaptive quality plus mobile tier (R-6, C-6) | UI-Perf | `src/ui/*`, `src/App.tsx`, `src/scene/PostFX.tsx` | M | 3.4 | Quality tiers Low/Med/High in settings; Low: DPR 1, shadow 1024, no bloom, traffic x0.5; stable 30 fps on a 2019 integrated GPU | -40% GPU on Low |
| 3.6 | Budget tests (R-10) | QA | `tests/*` | S | 3.1 | A seeded city has triangle count under X (set after 3.1) and draw-call estimate under 400 | guard rail |

### Round 4 - Camera, UI and interaction

| # | Task | Owner | Files | Effort | Deps | Acceptance |
|---|---|---|---|---|---|---|
| 4.1 | Camera: zoom-to-cursor, pan, minDistance 4, near 0.1, tween presets (Overview, Street walk, Golden hour, Night), whole-map framing aware of panel (C-1, C-2, C-4) | UI-Camera | `src/App.tsx`, new `src/ui/CameraRig.tsx` | M | none | You can reach any street corner at 1.7 m eye height in under 10 s; Whole map shows all 3 columns of blocks |
| 4.2 | Selection highlight and hover (C-3) | UI-Selection | new `src/scene/Selection.tsx`, `src/scene/Town.tsx` (Scene owner mount) | M | none | Selected house/block/tree has a visible outline or tint; hover cursor; panel closes clears it |
| 4.3 | Collapsible settings panel, auto-day toggle, screenshot, help overlay (C-2, C-5, C-7) | UI-Panels | `src/ui/*` | S-M | none | Panel collapses with H; auto-day cycles in 60 s; PNG without UI saved |
| 4.4 | Weather and quality controls in the panel | UI-Panels | `src/ui/SettingsCity.tsx`, `src/store/model.ts` | S | 2.3 | Buttons for Clear/Rain/Storm/Snow/Fog plus intensity slider, persists in JSON io |
| 4.5 | Mobile touch and layout pass | UI-Panels | `src/ui/panels.css` | S | 3.5 | Usable at 390 px width; two-finger orbit works |

### Round 5 - Sound and music

| # | Task | Owner | Files | Effort | Deps | Acceptance |
|---|---|---|---|---|---|---|
| 5.1 | Positional audio bus (panner per source, listener = camera, distance lowpass) | Audio | `src/audio/index.ts` split into `src/audio/bus.ts`, `engine.ts`, `ambience.ts` | M | none | Horn/bark/engine pan left or right as the camera moves; unit tests on gain-by-distance |
| 5.2 | Ambience: birds by time of day, crickets in summer night, church bell on the hour, crowd by density, rain, thunder, wind gust | Audio | `src/audio/ambience.ts` | M | 2.3, 1.3 | Each source fades with its driving variable; bell rings on the hour only near the church |
| 5.3 | Generative music (day, golden, night) with Music button | Audio | `src/audio/music.ts` | M | none | Button toggles; no clicks or pops; CPU under 3% |
| 5.4 | Footsteps and rain-on-umbrella near camera | Audio | `src/audio/ambience.ts` | S | 1.2 | Only the nearest 5 walkers produce sound |

### Round 6 - Detail pass: plants, wind, street life, polish

| # | Task | Owner | Files | Effort | Deps | Acceptance |
|---|---|---|---|---|---|---|
| 6.1 | Flowers, window boxes, hedges, blossom plus petals, tree variety (T-1..T-3, L-2) | Environment-Plants | `src/environment/forest.ts`, `greenery.ts`, `leaves.ts`, `src/buildings/facade/*` window boxes (Buildings approves) | M-L | none | Spring street view shows blossom and window boxes; four species distinguishable from above |
| 6.2 | Wind-reactive details: flags, laundry, awning flutter, blade signs | Buildings-Detail | `src/buildings/facade/*`, shared body shader | M | none | Gust visibly moves flags and awnings; no extra draw calls |
| 6.3 | Street furniture families: bus stop with queue, kiosk, fountain with ducks/pigeons, bike racks, manholes, road wear, paving, curb corners | City-Streets | `src/streets/furniture.ts`, `surfaces.ts`, `src/city/streetscape.ts` | L | 1.2 | At least 6 new furniture types on avenues; one fountain plaza |
| 6.4 | Facade polish: door fix, mortar contrast, rooftop clutter, courtyard doors lit, window schedule (H-1..H-6) | Buildings-Detail | `src/buildings/facade/*`, `shaders/surface.ts` | M | none | No black void doors; brick screenshot at 5 m shows fine joints |
| 6.5 | Optional: tram on one avenue, canal and boats, seasonal events | Backlog | - | L | all | Decide after Round 5 |
| 6.6 | Refactor Town.tsx into hooks/components (R-8) | Scene | `src/scene/*` | M | after 4.2 | Behaviour identical, tests green, no file over 350 lines in `src/scene` |

## 6. Risks and measurement plan

### Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Triangle and draw-call budget gets worse with every round (already over) | High | High | Round 3 follows Round 2 immediately; add the budget test in 3.6; each task states its added tris and draw calls |
| Weather shaders (`uWet`, `uSnow`) touch the shared body material patched by `onBeforeCompile` and the `aSurface` pipeline | Medium | High | One agent edits `materials.ts` and `shaders/surface.ts` per round; add uniforms with defaults of 0; run `materials.test.ts` |
| Pedestrian graph walking and crossing makes sim logic complex and breaks the bounds test | Medium | Medium | Keep plain-logic module (no Three), extend `traffic.test.ts` first |
| Merge conflicts in `Town.tsx`, `meshes.ts`, `store/model.ts` | High | Medium | One Scene agent per round owns `Town.tsx`; others deliver a component and one mount line; split `meshes.ts` first (task 1.5) |
| Rain particles and bloom on integrated GPUs | Medium | Medium | Quality tiers (3.5), particle counts tied to tier |
| No git history | High | High | Baseline commit in 1.6 before any other work |
| Hidden or background pane gives bad fps data | Medium | Low | Measure with a visible window; rely on draw calls and triangles when hidden |
| Audio autoplay and mobile Safari quirks | Medium | Low | Keep `audio.init()` on first pointerdown; test on iOS later |

### Measure after every round (record in a table appended to this file or `docs/PLAN.md`)
| Metric | How | Target |
|---|---|---|
| Draw calls, triangles (full frame and main pass only) | `gl.info` with `autoReset=false`, `reset()`, two rAFs, read `render`; also with `scene.traverse` counting | at most 400 calls; at most 3.0 M tris full frame at Whole map (Round 3 target 2.0 M) |
| Block build time | `performance.now()` around `pieces` memo in dev; log once per layout | under 1.5 s for the default 217 m town; slider changes under 100 ms (except Seed/Size) |
| fps (visible window) | rAF counter over 10 s, 3 views (Whole map, mid, street) | 60 on desktop GPU, 30 on integrated; record hardware |
| JS heap growth | Chrome memory snapshot at 0 and 60 s | under 5 MB growth in 60 s |
| Programs and textures | `gl.info.programs.length`, `memory.textures` | programs under 40, textures under 25 |
| Test count and time | `npx vitest run`, `npx tsc --noEmit` | at least 324 plus new tests; all green; under 15 s |
| Screenshots | day 12:00, golden 17:30, night 20:30 x Whole map, mid, street; Summer and Winter; plus weather states | saved under `docs/shots/round-N/` (do not commit big files, ok to keep local) |
| Console | `read_console_messages` onlyErrors | zero errors or warnings |

## 7. Do not break (decisions and invariants)

1. Contracts in `docs/DESIGN-3D.md` section 3.1: `buildHouse(params)` returns a Group, base y = 0, front +z, footprint exactly width x depth, protrusion at most 1.5 m only on facade sides, at most 3 (now 4 with `sign`) meshes with shared materials `body`, `glass`, `glassLit`, `sign`.
2. `src/city/layout.ts` is the contract between City, Traffic, Streets, UI. Fields may be added, never renamed or removed. Keep road centre lines 6 m inside bounds (pedestrians test relies on it), SIDEWALK = 3, street 8 m, avenue 11 m, curb 0.15.
3. Shared materials from `src/buildings/materials.ts` (single instances), `setNightLights`, `setGlassEnvironment`, `getSignMaterial`. Do not create per-house materials.
4. The per-vertex `aSurface` attribute (ids in `src/buildings/surface.ts`), object-space pattern coordinates (no UVs), and `fwidth` anti-aliasing fade of every pattern. New patterns must fade; check top-down shimmer.
5. Determinism: same seed gives the same city (BRD acceptance 1). All randomness through `src/core/rng.ts` `createRng`; no `Math.random()` in generation. Animal, weather and life systems may use runtime randomness only for non-persistent motion, never for placement derived from the seed.
6. `src/store` is the single source of layout and settings; the scene only reads it. Save/load JSON (`io.ts`) must round-trip new settings (weather, quality) with defaults for old files.
7. Block merge and cache: `mergeByMaterial` per block, cache keyed by block signature. Do not make a block rebuild on slider changes that do not affect geometry (season, light, wind, weather, traffic).
8. Instancing: street trees, lamps, furniture, vehicles, pedestrians, leaves are instanced; one InstancedMesh for all leaves; one draw call for smoke. New life systems follow the same rule (no per-entity Mesh).
9. Wind: one wind vector and `WindUniforms` drive trees, leaves, smoke, clouds. New wind reactions must read these uniforms, not add a second wind.
10. Season recolour of trees is vertex-colour only (no geometry rebuild); winter bare branches variant stays.
11. Selection: block click raycast uses `lotAt` on merged geometry; trees use `treeIdAt`. Any selection rework must keep Move blocks swap behaviour and Undo/Redo.
12. Post chain order: RenderPass, bloom, tilt-shift (optional), OutputPass; tone mapping ACES, sRGB output. Do not move tone mapping into materials.
13. File ownership per PLAN.md and per round table above; do not edit another owner's files, hand over a request instead.
14. Keep `npx vitest run` and `npx tsc --noEmit` green before every handoff; add tests for any new logic module.
15. UI and code are English; no emojis; no image textures for buildings (procedural only) unless a decision is recorded here.
