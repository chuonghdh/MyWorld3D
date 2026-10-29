# Repo map

Read this before searching the repo. Each row names the folder, what it does, its entry file and its owner
(see [docs/agents](agents/README.md)). Open the entry file first; grep inside a folder only when needed.

| Folder | What it does | Entry / key files | Owner |
|---|---|---|---|
| `src/main.tsx`, `src/App.tsx` | Mount, Canvas, panel wiring, selection state | `App.tsx` | Lead |
| `src/core` | Seeded RNG, shared types | `rng.ts`, `types.ts` | Scene & QA |
| `src/store` | Zustand settings, JSON save/load and validation | `model.ts` (`WorldSettings`), `io.ts`, `quality.ts` | UI & Camera |
| `src/city` | Layout: blocks, lots, avenues, crosswalks, lane offsets | `generate.ts`, `layout.ts`, `layoutKey.ts` | City & Streets |
| `src/buildings` | Houses, facades, monuments, materials, wind and window lights | `index.ts`, `house.ts`, `materials.ts`, `monuments/kit.ts` | Buildings |
| `src/streets` | Roads, markings, furniture, decor, fountain | `index.ts`, `decor.ts`, `furniture.ts` | City & Streets |
| `src/traffic` | Vehicles, signals, pedestrians, parking, collisions | `vehicles.ts`, `lights.ts`, `pedestrians.ts` | Traffic & Life |
| `src/life` | Pigeons, flocks, cats, squirrels, butterflies | `index.ts` | Traffic & Life |
| `src/environment` | Trees, greenery, wind, leaves, clouds, cloud shadows, sun | `index.ts`, `clouds.ts`, `cloudShade.ts`, `forest.ts` | Sky & Environment |
| `src/sky` | Sky dome, sun and moon discs, night colours | `index.ts`, `dome.ts`, `state.ts` | Sky & Environment |
| `src/weather` | Weather kinds and intensity, rain, snow, fog, lightning | `index.ts`, `weatherState.ts` | Sky & Environment |
| `src/aircraft` | Airliner schedule, contrails, livery | `index.ts`, `schedule.ts` | Sky & Environment |
| `src/audio` | Positional procedural sound, mixer and music | `index.ts`, `systems.ts`, `bus.ts`, `frame.ts` | Audio |
| `src/ui` | Panels, time panel, settings, help, sound mixer | `index.ts`, `controls.tsx`, `TimeBar.tsx`, `panels.css` | UI & Camera (Audio owns `SoundMixer.tsx`) |
| `src/scene` | Mounts the town each frame, camera, selection, post effects | `Town.tsx`, `useTownFrame.ts`, `CameraRig.tsx` | Scene & QA (camera parts: UI & Camera) |
| `tests` | Vitest suites, one file per area | `helpers/fakeAudio.ts` | Owner of the area under test |
| `docs` | Product and design docs, audio and agent handbooks | `BRD.md`, `PLAN.md`, `REVIEW-01.md`, `AUDIO.md`, `agents/` | Scene & QA |

## Common questions: where to look

- Change a house look: `src/buildings/facade/*`, palette in `palette.ts`.
- Change a sound: `src/audio/<system>.ts`, level constants at the top of that file, slider in `src/ui/SoundMixer.tsx`.
- Change cloud or sun look: `src/environment/cloudSprites.ts`, `src/sky/dome.ts`.
- Change traffic rules: `src/traffic/vehicles.ts` (junctions, turns), `src/traffic/lights.ts` (signals).
- Add a setting: `src/store/model.ts` (default), `src/store/io.ts` (validation), `src/ui/SettingsCity.tsx` (control).
- Frame order: `src/scene/useTownFrame.ts`. Do not reorder without reading it.
