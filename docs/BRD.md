# MyWorld3D – BRD v1.1 (Phase 1: Foundation)

## 1. Goal
A top-down 3D city simulation with houses, vehicles, trees, day and night, clouds and wind. Phase 1 is a working foundation that can later grow into a game or simulation.

## 2. Phase 1 scope

### 2.1 Scene and camera
- Top-down view with orbit, pan and zoom.
- Tilt-shift mode (post-processing blur of the top and bottom of the view, miniature-model look).
- Whole map: frames the camera so the whole city is visible.

### 2.2 Procedural city generation
- Generated from a `seed` and parameters: roads, block grid, lots, house volumes, street trees.
- Mid scale: a few hundred houses (target about 300–400).
- Western European look: house types, terraces and streets all follow a European style.
- Every block is one of two kinds: **block of houses** or **block of monument**.

### 2.3 Monument blocks (10 kinds)
European landmarks, built procedurally and kept simple:
Hospital, Stadium, Funfair, Swimming pool, Dinosaur park, Supermarket, Open-air theatre, Circus, Fire station, and one European landmark in place of the One Pillar Pagoda (**a Gothic church for now**; can be changed).

### 2.4 Houses
- 9 house presets: As the block has it, Original (Feuilles), Canal house (Amsterdam), Glass tower, Brutalist concrete, Bauhaus, Mediterranean, Brownstone (New York), Nordic timber, Shophouse (Asia).
  - Note: the Asian shophouse preset stays in the list because "all 9 presets" was chosen; say so if the set should be purely Western European.
- Every preset has a **Classic / Modern** toggle.
- Properties: number of floors (2–8), roof type (Mansard, Flat, Gable, Hip, Cornice, Parapet, Terrace, Low tiled, Step gable...), wall colour, shutter colour, New look and Original (revert to the original) buttons.

### 2.5 Street trees (4 kinds, European/American set)
- 4 deciduous species whose colour follows the season.
- Seasons: fresh green spring, deep green summer, red and yellow autumn, bare winter.
- Properties: species, amount (Street trees ×), leaf size (Leaf size), leaf share (Leaves %).
- **Switch trees** button: changes the species of many trees at once.

### 2.6 Configuration panels
- **Settings – City:** Light (golden hour to dusk), Season, Wind (speed in m/s, compass direction), Town width/depth, Traffic & people (×), Street trees (×), Leaves %, Leaf size. Buttons: Gust, Leaf devil, Sound, Music, Tilt-shift, Switch trees, Whole map, Move blocks, Reset blocks, Reset houses.
- **House panel:** as in section 2.4.
- **Monument block panel:** pick one of the 10 landmarks.
- Clicking a house, block or tree opens the matching property panel.

### 2.7 Editing
- Drag and drop to swap two blocks or two houses.
- Undo / Redo (Ctrl+Z / Ctrl+Y) for swaps and property changes.
- Save / load the layout as a JSON file.

### 2.8 Day and night, clouds, wind
- The day and night cycle is driven by a slider; street lamps and windows light up when it gets dark.
- Slowly drifting clouds.
- **Gust:** a simulated gust that temporarily raises the wind.
- **Leaf devil:** a random whirl of leaves on the streets.
- Wind sways trees and leaves (vertex shader); strong wind carries fallen leaves along.

### 2.9 Sound (full set)
- **Rustling leaves:** intensity follows wind speed.
- **Vehicles:** engine sound per vehicle type (car, bus, truck, motorbike).
- **Horns:** random and occasional.
- **Pedestrians:** a soft murmur of talking, light background.
- **Dogs barking:** random, from pedestrians walking dogs.
- A **Sound** button (all sound on/off) and a **Music** button (placeholder in phase 1).
- Note: browsers block autoplay, so sound only starts after the first user click.

### 2.10 Traffic and pedestrians
- Cars, buses, trucks and motorbikes follow lane paths; at each junction they go straight (60 %), turn left (20 %) or turn right (20 %). Vehicles enter and leave at the border of the map.
- Fixed-cycle traffic lights at junctions, with an all-red gap between phases.
- Vehicles stop in front of the crosswalk on yellow or red, keep going once any part of them is past it, wait while pedestrians are on the crosswalk, and pass a junction first come, first served. Jams are broken by backing up one vehicle and, if that fails, letting the earlier one push through.
- Pedestrians on the sidewalks, some walking dogs.

## 3. Non-functional requirements
- Chrome / Edge desktop.
- Target about 30 fps with 300–400 houses on an ordinary laptop.
- Use `InstancedMesh` and merged geometry to keep draw calls low.
- UI, code, comments and documentation are all in English.

## 4. Technology
- TypeScript, Vite, Three.js, React + React Three Fiber.
- `@react-three/drei` (helpers: OrbitControls, Sky, Cloud...).
- `zustand` (layout and settings state).
- `suncalc` (sun position by time of day).
- `three-mesh-bvh` (if click picking is slow).
- `vitest` (tests for the city generation logic).
- Web Audio API (procedural sound, no external audio files in phase 1).

## 5. Out of scope for Phase 1
- Real OSM data.
- Full vehicle collision avoidance and complex traffic AI (phase 2).
- Multiplayer, mobile, cloud saves.
- Background music (Music is only a placeholder).

## 6. Acceptance criteria
1. The same seed gives the same city.
2. Every slider in the settings changes the scene immediately.
3. Houses, blocks and trees can be selected and their properties edited.
4. Two blocks or houses can be swapped by drag and drop; Undo/Redo works.
5. Saving to JSON and loading it again restores the layout.
6. Day and night, clouds, wind, tree leaves and the leaf devil work.
7. The rustling sound grows with the wind; the Sound button turns it on and off.
8. Vehicles, traffic lights and pedestrians work with no console errors.
9. The fps target is met on an ordinary machine.

## 7. Assumptions (can change)
- Street trees: Maple, Oak, Birch, Ginkgo – a European/American set.
- The monument replacing the Pagoda: a Gothic church.
- Git: local `git init`; commits only when requested.
