# Repo map

Reviewed 2026-11-01 at 02b0cdc

Read this before searching the repo. Each row names the folder, what it does, its entry file and its owner
(see [docs/agents](agents/README.md)). Open the entry file first; grep inside a folder only when needed.

| Folder | What it does | Entry / key files | Owner |
|---|---|---|---|
| `index.html`, `tree-compare.html`, `dashboard/` | Vite entry for the app; dev-only tree lab page; agent office dashboard (not built into the app) | `index.html`, `tree-compare.html`, `dashboard/agents-dashboard.html` | Scene & QA |
| `public/models` | Static glTF nature assets loaded at runtime (`quaternius/` for city trees; `kenney-nature/` is not referenced by `src`) | `public/models/` | Scene & QA |
| `src/main.tsx`, `src/App.tsx`, `src/vite-env.d.ts` | Mount, Canvas, panel wiring, selection state, boot | `App.tsx` | Scene & QA (lead edits App) |
| `src/core` | Shared pure modules below features: seeded RNG, shared types, runtime state (gusts, camera requests), block ids, weather kinds. Tunable values: `src/config/tuning.ts` | `types.ts`, `rng.ts`, `runtime.ts`, `blockIds.ts`, `weatherKinds.ts` | Scene & QA |
| `src/store` | Zustand settings, JSON save/load and validation, merges (undo/redo removed) | `index.ts`, `model.ts` (`WorldSettings`), `io.ts`, `merges.ts`, `quality.ts` | UI & Camera |
| `src/city` | Layout: blocks, lots, avenues, junction arms, streetscape, block merge, layout key | `index.ts`, `generate.ts`, `layout.ts`, `layoutKey.ts`, `blocks.ts`, `merge.ts`, `streetscape.ts` | City & Streets |
| `src/buildings` | Houses, facades, monuments (civic, culture, leisure, kit), materials, palette, signs, window and wind shaders | `index.ts`, `house.ts`, `materials.ts`, `palette.ts`, `monument.ts`, `monuments/kit.ts`, `facade/*`, `signs/*`, `shaders/*` | Buildings |
| `src/streets` | Roads, markings, sidewalks, furniture, decor, fountain, street and courtyard trees, water, tyre tracks | `index.ts`, `builder.ts`, `surfaces.ts`, `pavementSurfaces.ts`, `decor.ts`, `furniture.ts`, `natureTrees.ts`, `greeneryFootprint.ts`, `water.ts` | City & Streets |
| `src/traffic` | Vehicles (build, junctions, turns, spawn, motion, horns), traffic lights, pedestrians and walkers, people meshes, parking, collisions, vehicle surfaces | `index.ts`, `vehicles.ts`, `vehicles/*`, `lights.ts`, `pedestrians.ts`, `walkers/*`, `people/*`, `collision.ts`, `parking.ts`, `vehicleSurfaces.ts` | Traffic & Life |
| `src/life` | Pigeons, flocks, cats, squirrels, butterflies, bees | `index.ts`, `birds.ts`, `pets.ts`, `spots.ts`, `geometry.ts` | Traffic & Life |
| `src/environment` | Trees, greenery, forest, wind, leaves (falling and street), seasons, clouds, cloud shadows, sun, smoke | `index.ts`, `trees.ts`, `greenery.ts`, `leaves.ts`, `wind.ts`, `clouds.ts`, `cloudSprites.ts`, `cloudShade.ts`, `sun.ts`, `seasons.ts` | Sky & Environment |
| `src/sky` | Sky dome, sun and moon discs, ground disc, night colours | `index.ts`, `SkyDome.tsx`, `dome.ts`, `state.ts`, `ground.ts` | Sky & Environment |
| `src/weather` | Weather kinds and intensity, rain, snow, fog, lightning, wet surfaces | `index.ts`, `weatherState.ts`, `Rain.ts`, `Snow.ts`, `fog.ts`, `Lightning.ts`, `wet.ts` | Sky & Environment |
| `src/aircraft` | Airliner schedule, contrails, livery, aircraft mesh | `index.ts`, `schedule.ts`, `contrail.ts`, `planeMesh.ts`, `livery.ts` | Sky & Environment |
| `src/shaders` | Shared shader patches used by several features (cloud shade, wet surface); moved here by the architect | `cloudShade.ts`, `wetSurface.ts` | Shared (Buildings, Sky & Environment; architect review) |
| `src/audio` | Positional procedural sound (no files), mixer, music, per-system sources, voice budget | `index.ts`, `systems.ts`, `bus.ts`, `frame.ts`, `vehicles.ts`, `people.ts`, `weather.ts`, `music.ts` | Audio |
| `src/ui` | Side panels, city and house settings, block edit panels, time bar, help, error boundary, boot | `index.ts`, `controls.tsx`, `TimeBar.tsx`, `SettingsCity.tsx`, `HousePanel.tsx`, `BlockPanel.tsx`, `HelpOverlay.tsx`, `panels.css` | UI & Camera (Audio owns `SoundMixer.tsx`) |
| `src/scene` | Mounts the town each frame, per-frame update order, camera rig and input, selection, block edit, post effects, screenshot | `Town.tsx`, `useTownFrame.ts`, `CameraRig.tsx`, `Selection.tsx`, `PostFX.tsx`, `audioBridge.ts` | Scene & QA (camera, selection, block edit: UI & Camera; `audioBridge.ts`: Audio) |
| `src/dev/treeCompare` | Standalone tree lab (`tree-compare.html`): cloned tree and leaf code for tuning, never imported by the city | `main.ts`, `labNatureTrees.ts`, `labLoader.ts`, `labLeaves.ts`, `bushBefore.ts` | Scene & QA |
| `tests` | Vitest suites, one file per area | `helpers/fakeAudio.ts`, `helpers/cityBuild.ts`, `helpers/geometryAudit.ts`, `budget.test.ts` | Owner of the area under test |
| `docs` | Product and design docs, audio and agent handbooks | `BRD.md`, `DESIGN-3D.md`, `REVIEW-01.md`, `AUDIO.md`, `REPO_MAP.md`, `agents/` | Scene & QA |

## Common questions: where to look

- Change a house look: `src/buildings/facade/*`, palette in `src/buildings/palette.ts`.
- Change a sound: `src/audio/<system>.ts`, level constants at the top of that file, slider in `src/ui/SoundMixer.tsx`.
- Change cloud or sun look: `src/environment/cloudSprites.ts`, `src/sky/dome.ts`.
- Change traffic rules: `src/traffic/vehicles/junctions.ts` and `src/traffic/vehicles/turns.ts` (junctions, turns), `src/traffic/lights.ts` (signals).
- Change tree or leaf look: tune in `src/dev/treeCompare` first (lab), then port to `src/streets/natureTrees.ts`, `src/environment/leaves.ts`.
- Add a setting: `src/store/model.ts` (default), `src/store/io.ts` (validation), `src/ui/SettingsCity.tsx` (control).
- Frame order: `src/scene/useTownFrame.ts`. Do not reorder without reading it.
