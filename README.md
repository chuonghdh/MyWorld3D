# MyWorld3D

Reviewed 2026-11-01 at 02b0cdc

A top-down, procedurally generated 3D city simulation. Every street, house, tree, vehicle, pedestrian and sound is built in the browser from a seed. Tree models are the only bundled 3D assets in use (glTF in `public/models/quaternius`); no audio files are used.

Built with Vite, TypeScript, Three.js, React Three Fiber and zustand.

## Features

### City generation

- **Seeded layout.** The same seed always produces the same city: blocks, lots, avenues, crosswalks and lane offsets.
- **Two block types.** Each block is either a block of houses or a public building (monument block).
- **Public buildings.** Ten procedural landmarks, including a hospital, stadium, funfair, swimming pool, dinosaur park, supermarket, open-air theatre, circus, fire station and a Gothic cathedral.
- **Merged blocks.** Zoomed out above 200 m, neighbouring blocks can be merged or split from the block edit overlay.
- **Target scale.** Around 300 to 400 houses, aimed at about 30 fps on an ordinary laptop.

### Houses

- **Nine presets:** Original, Canal house, Glass tower, Brutalist concrete, Bauhaus, Mediterranean, Brownstone, Nordic timber and Shophouse.
- **Per-house controls:** type, floors (2 to 8), roof shape, wall and shutter colours, and a Classic or Modern style.
- **Reset.** Each house can be reverted to its generated look.

### Street trees

- **Four species** that follow the season: spring green, summer green, autumn red and yellow, and bare branches in winter.
- **Trees stand on the sidewalks.** Trees are spread evenly along both sides of each street, staggered so they do not line up across the road. Broadleaf trees inside blocks are removed; only conifers stay in courtyards.
- **Falling leaves in autumn.** Leaves fall from the crowns, rest on sidewalks for about 10 seconds, then fade. Only crowns in view and within 100 m of the camera spawn leaves, from a pool of 160.
- **Pine and evergreen trees** keep their needles all year. Winter snow is applied through the weather shader.
- **Controls:** tree amount, leaf size and leaf share, plus a Switch trees button that changes the species of many trees at once.

### Weather and seasons

- **Seasons:** spring, summer, autumn and winter.
- **Weather:** clear, cloudy, rain, storm (with lightning), snow and fog, each with an intensity setting.
- **Wind:** speed in m/s and compass direction. It sways trees and leaves, and drives fallen leaves along the street.
- **Gust and Leaf devil** buttons trigger a temporary strong wind or a whirl of leaves.

### Sky, light and time

- **Day and night cycle.** A time bar controls the hour. In auto mode, one in-app day lasts 24 real minutes. Street lamps and windows light up at dusk.
- **Sun and moon** positions come from `suncalc`.
- **Clouds** drift slowly and cast shadows on the ground.
- **Aircraft** fly scheduled routes with contrails and their own sound.

### Traffic and people

- **Vehicles:** cars, buses, trucks and motorbikes follow lane paths and enter and leave at the map border.
- **Junction rules.** At each junction, vehicles go straight, turn left or turn right with weighted odds.
- **Traffic lights.** Fixed-cycle signals with an all-red gap between phases.
- **Crosswalks.** Vehicles stop for pedestrians on the crosswalk and for red or yellow lights. Jams are cleared by backing up one vehicle and, if that fails, letting the earlier one pass.
- **Pedestrians** walk the sidewalks, and some walk dogs.
- **Wildlife.** Pigeons, flocks of birds, cats, squirrels, butterflies and bees.

### Sound

Procedural audio built on the Web Audio API. No audio files are loaded.

- **Positional effects:** engines per vehicle type, horns, turn signals, voices, footsteps, dogs, cats and aircraft.
- **Nature:** birdsong, wing flaps, rustling leaves, wind, rain, thunder, and church bells on the hour.
- **Sound mixer** with a level for each category.
- **Sound** turns effects and nature sounds on or off. **Music** has its own button. Browsers allow sound only after the first click.

### View and camera

- **Map view:** orbit, pan and zoom over the whole town from above.
- **Street view:** walk the streets. Drag the street view onto the map to start there.
- **Tilt-shift** post effect for a miniature-model look.
- **Whole map** frames the entire city.
- **Graphics quality:** low, medium or high.

### Editing

- **Select** a house, block, tree or public building to open its panel.
- **Merge and split** 2 to 4 blocks from the block edit overlay (camera above 200 m). Merges are saved in the layout.
- **Photo.** Save the 3D view as a PNG without the panels.
- **Keyboard:** Space pauses or resumes everything. 1 is map view, 2 is street view. In street view, W A S D walks (Shift runs). H or ? opens the help.

Not available in the UI yet: drag-and-drop swapping (block swap is two-click), layout save and load (`src/store/io.ts` exists, but no button calls it). Undo and redo were removed (not needed).

## Getting started

Requirements: Node.js (current LTS) and Chrome or Edge on desktop.

```bash
npm install
npm run dev
```

Open the local address printed by Vite.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` | Typecheck and build for production |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run the unit tests (vitest) |
| `npm run typecheck` | Typecheck only |

## Tree compare lab

`tree-compare.html` opens a standalone lab in `src/dev/treeCompare`. It is served by the dev server only and is not in the production build. It shows a selected set of trees with season and weather controls, for tuning tree and leaf looks before changes reach the city. The lab uses its own copies of the tree code, and its falling-leaf system wraps the city one, so both use the same logic.

## Project structure

| Folder | Contents |
|---|---|
| `src/city` | Layout generation: blocks, lots, avenues, crosswalks |
| `src/buildings` | Houses, facades, public buildings, materials |
| `src/streets` | Roads, markings, street furniture, trees, fountain |
| `src/traffic` | Vehicles, signals, pedestrians, parking, collisions |
| `src/life` | Wildlife |
| `src/environment` | Trees, greenery, wind, falling leaves, clouds |
| `src/sky` | Sky dome, sun and moon, night colours |
| `src/weather` | Weather kinds, rain, snow, fog, lightning |
| `src/aircraft` | Aircraft schedule and contrails |
| `src/audio` | Procedural sound, mixer and music |
| `src/ui` | Panels, time bar, settings, help |
| `src/scene` | Scene mounting, camera, selection, post effects |
| `src/store` | Settings and layout state, save and load validation (undo and redo removed) |
| `src/core` | Shared pure modules: seeded RNG, shared types, runtime state, camera limits |
| `src/shaders` | Shared shader patches used by several features (cloud shade, wet surface) |
| `src/dev/treeCompare` | Tree lab (dev server only; not part of the city) |
| `public/models` | glTF tree models (`quaternius`) loaded at runtime |
| `tests` | Vitest suites, one file per area |

For a file-by-file guide, see [docs/REPO_MAP.md](docs/REPO_MAP.md).

## Documentation

- [Business requirements (BRD)](docs/BRD.md)
- [Design notes](docs/DESIGN-3D.md)
- [Audio](docs/AUDIO.md)
- [Specialist agent handbooks](docs/agents/README.md)
