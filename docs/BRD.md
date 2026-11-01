# MyWorld3D – BRD v1.2 (Phase 1: Foundation, as built)

Reviewed 2026-11-01 at 02b0cdc

Status checked 2026-11-01 against commit `02b0cdc`. Tags used below:
- **(added)** – exists in code, not in v1.1.
- **[partly]** – part of the requirement exists.
- **[not implemented]** – promised in v1.1 (or here) but absent in code.
- **[not verified]** – code exists but was not checked by eye or by running the app in this review.

## 1. Goal
A top-down 3D city simulation with houses, vehicles, trees, day and night, clouds, wind, weather and seasons. Phase 1 is a working foundation that can later grow into a game or simulation.

## 2. Phase 1 scope

### 2.1 Scene and camera
- Top-down view with orbit, pan and zoom. Zoom to cursor. (added)
- Map view and street view (added). Street view walks at eye height with WASD and drag. Drag the walker onto the map to start there.
- Tilt-shift mode (post-processing blur of the top and bottom of the view, miniature-model look).
- Whole map: frames the camera so the whole city is visible. Framing is offset for the settings panel.
- Camera presets (Overview, Street walk) move the camera smoothly. (added)
- Help overlay (H or ?), and Photo: saves the 3D view as a PNG without the panels. (added)
- Keyboard: Space pauses or resumes all clocks; 1 = map view, 2 = street view. (added)

### 2.2 Procedural city generation
- Generated from a `seed` and parameters: roads, block grid, lots, house volumes, street trees.
- Mid scale: a few hundred houses (target about 300–400) [not verified].
- Western European look: house types, terraces and streets all follow a European style.
- Every block is one of two kinds: **block of houses** or **monument block** (UI label: "Public building").
- **Block merging (added).** 2 to 4 neighbouring house blocks can be merged into one block with a shared courtyard. Merge and split are tap-based, in block edit mode (camera above 200 m). Merges are stored as `blockMerges` in the layout. Traffic closes at merge cuts.
- **Layout is independent of traffic density (added).** The Traffic slider changes spawn points only; the city is not regenerated.

### 2.3 Monument blocks (10 kinds)
European landmarks, built procedurally and kept simple:
Hospital, Stadium, Funfair, Swimming pool, Dinosaur park, Supermarket, Open-air theatre, Circus, Fire station, and one European landmark in place of the One Pillar Pagoda. v1.1 chose a **Gothic church** for now (can be changed); the built landmark is labelled **Gothic cathedral**. Its bell rings on the hour near it (added).

### 2.4 Houses
- 9 house presets: As the block has it, Original (Feuilles), Canal house (Amsterdam), Glass tower, Brutalist concrete, Bauhaus, Mediterranean, Brownstone (New York), Nordic timber, Shophouse (Asia).
  - Note: the Asian shophouse preset stays in the list because "all 9 presets" was chosen; say so if the set should be purely Western European.
  - "As the block has it" is not offered in the house panel; "Original" restores the block's own look.
- Every preset has a **Classic / Modern** toggle. Implemented.
- Properties: number of floors (2–8), roof type (Mansard, Flat, Gable, Hip, Cornice, Parapet, Terrace, Low tiled, Step gable), wall colour, shutter colour, New look and Original (revert to the original) buttons. Implemented.
- Rooftop extras, rear elevations of merged courtyards, and a window light schedule by hour. (added)

### 2.5 Street trees (4 kinds, European/American set)
- 4 deciduous species (Maple, Oak, Birch, Ginkgo) whose colour follows the season.
- Seasons: fresh green spring (falling petals; no blossom on street trees), deep green summer, red and yellow autumn, bare winter. Conifers (pines) keep their needles all year. (added)
- **Falling autumn leaves (added).** Broadleaf trees shed leaves from their crowns. Leaves rest on sidewalks for 10 s, then fade. A pool of 160 leaves is culled by frustum and a 100 m focus radius.
- Properties: species, amount (Street trees ×), leaf size (Leaf size), leaf share (Leaves %). Implemented.
- **Switch trees** button: changes the species of many trees at once. Implemented.
- Tree property panel: [not verified].

### 2.6 Configuration panels
- **Settings – City:** Light (time of day, 0–24 h), Season, Weather (added, see 2.8) with Intensity (added), Wind (speed in m/s, compass direction), Town width/depth, Traffic & people (×), Street trees (×), Leaves %, Leaf size, Graphics (quality tier Low/Medium/High, added), Sound mixer (per-category levels, added). Buttons: Gust, Leaf devil, Sound, Music, Tilt-shift, Switch trees, Whole map, Move blocks, Reset blocks, Reset houses. Implemented.
- **House panel:** as in section 2.4. Implemented.
- **Monument block panel** (titled "Public building"): pick one of the 10 landmarks. Implemented.
- Clicking a house, block or tree opens the matching property panel. Selection and hover highlight for houses, blocks and trees. (added)

### 2.7 Editing
- **Swap two blocks:** partly. Two-click swap in **Move blocks** mode, not drag and drop. [not implemented] Drag and drop.
- **Swap two houses:** [not implemented]. Only blocks can be swapped.
- **Undo / Redo:** [removed] Not needed; the store no longer keeps history. Merge and split are plain actions.
- **Save / load the layout as a JSON file:** [not implemented] in the UI. The module exists (`src/store/io.ts`), but no button or file dialog calls it.
- **Save/load validation (added).** `importLayout` never throws. It checks the version (1), every settings field and range, enums (season, weather, quality, presets, roofs, monuments, species), floors 2–8, `#rrggbb` colours and id lists. Files without `weather`, `quality` or `blockMerges` load with defaults. Bad input returns an error message. Tests: `tests/store.test.ts`.

### 2.8 Day and night, clouds, wind, weather, seasons
- The day and night cycle is driven by the **Light** slider and the time bar. Street lamps and windows light up when it gets dark. Sun and moon discs (`suncalc`). (added)
- **Auto time (added):** one in-app day lasts 24 real minutes. Pause freezes every clock; the camera still moves.
- **Clouds** drift slowly. Low cumulus clouds float over the town. (added)
- **Cloud shadows (added):** one shared cloud mask darkens buildings, streets and foliage, with parallax by height. Cloud amount follows the weather.
- **Wind:** one wind vector sways trees, leaves, smoke, clouds, awnings, laundry, flags and blade signs. (added) Strong wind carries fallen leaves along the street.
- **Gust:** a simulated gust that temporarily raises the wind.
- **Leaf devil:** a random whirl of leaves on the streets.
- **Weather (added):** clear, cloudy, rain (wet surfaces, puddles), storm (lightning with thunder delayed by distance), snow, fog (fog banks). Each has an intensity from 0 to 1. Old saves with "drizzle" load as cloudy.
- **Snow (added):** in winter, snow on roofs, bark, conifers and vehicles. Up to 12,000 flakes in the weather system.
- **Aircraft (added):** see 2.11.

### 2.9 Sound (full set)
Procedural sound on the Web Audio API. Every source is positional (no audio files).
- **Rustling leaves:** intensity follows wind speed. Implemented.
- **Vehicles:** engine sound per vehicle type (car, bus, truck, motorbike), turn signals. Implemented.
- **Horns:** occasional, from vehicles near the listener. Implemented.
- **Pedestrians:** a soft murmur of talking, lighter at night. Implemented.
- **Dogs barking:** random, from pedestrians walking dogs, only within earshot of the listener. Implemented.
- **Added:** birdsong, wing flaps, cats, rain, thunder, church bell, wind whistle, jet pass with Doppler, footsteps. Cafe clatter and sirens: [not implemented].
- **Sound** button (all sound on/off) and a per-category **Sound mixer**. Implemented.
- **Music** button: generative ambient music (day, golden hour, night moods, Web Audio, no samples). Implemented (added; v1.1 had a placeholder).
- Note: browsers block autoplay, so sound only starts after the first user click.

### 2.10 Traffic and pedestrians
- Cars, buses, trucks and motorbikes follow lane paths; at each junction they go straight (60 %), turn left (20 %) or turn right (20 %). Vehicles enter and leave at the border of the map. Implemented.
- Fixed-cycle traffic lights at junctions, with an all-red gap between phases. Two-arm junctions have no signals. (added)
- Vehicles stop in front of the crosswalk on yellow or red, keep going once any part of them is past it, wait while pedestrians are on the crosswalk, and pass a junction first come, first served. Jams are broken by backing up one vehicle after 3 s and, if that fails, letting the earlier one push through. Implemented.
- **Parked cars** along avenue curbs. (added)
- Pedestrians walk the sidewalks and cross at signals, in groups and with children; some walk dogs. Idle behaviours (sitting, standing) exist. Density follows street type and time of day; cap 480 walkers. (added)
- **Vehicle collision avoidance:** [not implemented] beyond jam breaking (phase 2).

### 2.11 Aircraft (added)
- 24 airliners per in-app day (one per hour slot) fly gently curved routes between the cloud tops and the highest camera.
- Contrails, per-flight liveries, positional jet pass with Doppler, and an Aircraft slider in the sound mixer.

### 2.12 Developer tools (added, dev only)
- **Tree compare lab:** `tree-compare.html` at `src/dev/treeCompare`. Served by the dev server only; not part of the production build. Shows representative trees with season and weather controls. It uses cloned tree code and does not change the city.

## 3. Non-functional requirements
- Chrome / Edge desktop. A narrow-screen layout (side panels fold to icons, phone time panel) exists [partly]; mobile is not a target.
- Target about 30 fps with 300–400 houses on an ordinary laptop [not verified]. A budget test (`tests/budget.test.ts`) guards triangle and draw-call budgets (main pass about 1.9 M triangles, shadow pass about 0.6 M).
- Quality tiers Low / Medium / High (added). The auto-detect only suggests a tier; it never applies one.
- Use `InstancedMesh` and merged geometry to keep draw calls low. Implemented: blocks are merged by material; trees, leaves, vehicles, people, birds and lamps are instanced.
- UI, code, comments and documentation are all in English.

## 4. Technology
- TypeScript, Vite, Three.js, React + React Three Fiber. Implemented.
- `@react-three/drei` (helpers). In `package.json`.
- `zustand` (layout and settings state). Implemented.
- `suncalc` (sun and moon position by time of day). Implemented.
- `three-mesh-bvh`: [not implemented]. Not a dependency; click picking uses `lotAt` and `treeIdAt`.
- `vitest` (tests for city generation, traffic, audio, store and more). Implemented.
- Web Audio API (procedural sound, no external audio files). Implemented.

## 5. Out of scope for Phase 1
- Real OSM data.
- Full vehicle collision avoidance and complex traffic AI (phase 2). Jam breaking only.
- Multiplayer, mobile as a target, cloud saves.
- Background music: no longer out of scope; see 2.9 (generative music exists).

## 6. Acceptance criteria
1. The same seed gives the same city. **Implemented** (determinism tests in `tests/traffic.determinism.test.ts` and `tests/layoutKey.test.ts`).
2. Every slider in the settings changes the scene immediately. **[not verified]**.
3. Houses, blocks and trees can be selected and their properties edited. **Partly**: houses and blocks verified in code; tree panel [not verified].
4. Two blocks or houses can be swapped by drag and drop; Undo/Redo was removed (not needed). **[partly]**: two-click block swap only; houses and drag and drop [not implemented].
5. Saving to JSON and loading it again restores the layout. **[not implemented] in the UI**; the module and its validation exist (2.7).
6. Day and night, clouds, wind, tree leaves and the leaf devil work. **Implemented** (code check; not seen by eye in this review).
7. The rustling sound grows with the wind; the Sound button turns it on and off. **Implemented** in code.
8. Vehicles, traffic lights and pedestrians work with no console errors. **Implemented** in code; console not checked in this review.
9. The fps target is met on an ordinary machine. **[not verified]**.
10. (added) Block merges of 2 to 4 blocks can be made and split; traffic respects merge cuts (`tests/blockMerge.test.ts`, `tests/blockMergeTraffic.test.ts`).
11. (added) Layout JSON with wrong version or invalid fields is rejected with a message; older files load with defaults (2.7).

## 7. Assumptions (can change)
- Street trees: Maple, Oak, Birch, Ginkgo, a European/American set. Pines are added as a conifer rule.
- The monument replacing the Pagoda: a Gothic church (built as "Gothic cathedral").
- Git: a repository with history; commits only when requested.
