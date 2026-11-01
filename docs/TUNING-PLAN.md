# Tuning consolidation plan

Author: Technical Architect, 2026-11-01. Source: `docs/TUNING.md` (209 rows + 28 hardcoded). Plan only; no code changed, no commit.

Goal: one module, `src/config/tuning.ts`, holds every knob. Code imports from it. Values stay identical (no behaviour change). Each duplicate has one source.

## 1. Design

- **Location:** `src/config/tuning.ts`, a new bottom-layer module. Imports only types from `src/core/types.ts` (`HousePreset`, `MonumentKind`, `TreeSpecies`, `Season`), which are erased at build. It imports nothing else. Feature modules import it; it never imports them.
- **Shape:** one exported object per section, `as const`, each value with a one-line doc comment naming unit and owner. Example: `export const traffic = { vehiclesPerPath: 2, spawnMinS: 4, ... } as const;`. Section names: `traffic`, `walkers`, `life`, `trees`, `leaves`, `lights`, `weather`, `sky`, `audio`, `buildings`, `city`, `quality`, `ui`.
- **Ownership of the file:** Lead creates the skeleton (step 0). After that, one writer at a time (serial order in section 4). Each specialist adds only its own section and removes the literal from its own source file. No two specialists edit `tuning.ts` at once.
- **Re-exports:** where a value was already exported from a module (for example `HOUSE_PRESETS`, `MONUMENT_KINDS`, `LAMP_SPACING`), keep the old export name as a re-export. That limits churn in consumers.
- **Geometry and algorithm literals stay in place.** A value is a knob if a designer tunes it for feel without changing layout hashes or budgets. Stays (not moved): city grid and block geometry (`CELL_*`, `MIN_BLOCK`, `GRID_MARGIN`, avenue/street width and sidewalk, `MIN/MAX_FRONTAGE`, `MIN/MAX_DEPTH`, `SMALL_BLOCK_DEPTH`, `MIN_COURTYARD`, `PLAZA_MARGIN`, `MERGE_MIN/MAX_BLOCKS`, `DEFAULT_MONUMENT_SIZE`, `PARTY_GAP`), lamp and signal geometry (`LAMP_HEIGHT`, `LAMP_INSET`, `SIGNAL_HEAD_Y`, `HEAD_OFFSET`, visor and bracket sizes), leaf mesh shape (`LEAF_SCALE`, curl, bend, vein, `REST_LIFT`), the leaf spawn fill time (12 s) and last-second fade (1 s), sun and moon disc sizes, sun distance, shadow far plane and normal bias, golden glow curve, `MIN_LIGHT_ELEVATION_DEG`, lightning gap formula (named constants added, formula stays), mixer storage key, and the budget thresholds in `tests/budget.test.ts` (test assertions, not knobs).
- **Duplicates, resolved:** see section 3.

## 2. Parity test (Scene & QA)

`tests/tuning.parity.test.ts`. Baseline table = the literal value and file:line of every moved constant, copied from the current code before any move (step 1). After each step, the test asserts `config.section.name === baselineValue`. It also asserts that each duplicate list (`HOUSE_PRESETS`, `MONUMENT_KINDS`, `PINE_*`) is the same array or value as the config one. Failing parity means a value changed silently; the test is the acceptance gate for "no behaviour change".

## 3. Duplicates: decisions

| Name | Where | Check | Decision |
|---|---|---|---|
| `HOUSE_PRESETS` | `src/store/model.ts:39`, `src/buildings/house.ts:44` | Both lists identical (10 entries, same order) | Config owns the list. `store/model.ts` and `buildings/house.ts` re-export it. Buildings and UI edit only their own file. |
| `MONUMENT_KINDS` | `src/store/model.ts:52`, `src/buildings/monument.ts:13` | Both identical (10 entries) | Same as above. |
| `PINE_SHARE` 0.6, `PINE_SNOW_UP` [0.85, 0.97], `PINE_SNOW_COVER` 0.35 | `src/streets/natureTrees.ts:18-19, 90`, `src/dev/treeCompare/labNatureTrees.ts:20-22, 93` | Values identical today. Lab is a clone of city code | City value is canonical and moves to config. **Decided:** the lab keeps its own copy in `src/dev/treeCompare/labTuning.ts` (new). The lab must not import from `src/config`, so a lab edit cannot touch the city. The parity test asserts lab copy equals config value. |
| `LAMP_SPACING` | `src/city/streetscape.ts:52` (18 m), `src/streets/furniture.ts:126` (0.28) | Not a duplicate. Street lamp spacing along the sidewalk (18 m) vs. vertical pitch of the three lamp discs on a traffic-light head (0.28 m, used at `furniture.ts:186`) | Two different values. **Decided:** street lamp 18 m moves to config. The furniture constant is renamed `SIGNAL_LAMP_PITCH` in `furniture.ts` and stays local. TUNING.md row 143 and trap line 322 need the same correction (docs owner). |
| `TRAFFIC_DENSITY_FLOOR` 0.2 | `src/traffic/trafficDensity.ts:4` | Exported but unused by `trafficDensityAt`; the curve's 0.2 values set the floor | **Decided:** wire it in. Config holds one `densityFloor`; `trafficDensity.ts` uses it in the curve. Values unchanged. |

## 4. Order and per-specialist work

Steps are serial because they share `src/config/tuning.ts`. A step may start only when the previous step is merged into the working tree.

| Step | Owner | Work | Files touched |
|---|---|---|---|
| 0 | Lead | Create `src/config/tuning.ts` skeleton only: one empty `as const` section per owner (`sceneQa`, `buildings`, `uiCamera`, `cityStreets`, `trafficLife`, `audio`, `skyEnvironment`), type-only re-export from `core/types`. No values moved. Run tsc. | 1 (new) |
| 1 | Scene & QA | Parity baseline test with literal values from current code; then Scene's own knobs (quality tiers, lighting gains, night bloom, shadow-side constants, cloud count literal) | 6 (incl. new test, shared quality file) |
| 2 | Buildings | Remove list duplicates in `house.ts`, `monument.ts` (import from config); lit-window shares, night emissive, lit colour, sign emissive, floor range | 9 |
| 3 | UI & Camera | `store/model.ts`: slider defaults and re-exports from config; `ui/SettingsCity.tsx`: slider ranges and intensity lift literal | 2 |
| 4 | City & Streets | `city/blocks.ts` (`FLOOR_RANGE`), `city/generate.ts` (`MONUMENT_CHANCE`, `TRAFFIC_SPAWN_SPACING`, `LIGHT_TIMING`), `city/streetscape.ts` (lamp, tree, courtyard, plaza, bench knobs), `streets/index.ts` (lamp glass, signal gains), `streets/natureTrees.ts` (pine, tree scale, cluster, border, shadow fraction), `streets/furniture.ts` (rename `SIGNAL_LAMP_PITCH` only), lab copy `labNatureTrees.ts` (import from `labTuning.ts`, not config) | 7 (+ new `labTuning.ts`) |
| 5 | Traffic & Life | `traffic/trafficDensity.ts`, `traffic/vehicles/constants.ts` (speeds, turns, spawns, horns), `traffic/walkers/constants.ts`, `traffic/vehicleMeshes.ts` (glow cap), `life/birds.ts`, `life/pets.ts`, `life/common.ts` (quality factors) | 7 |
| 6 | Audio | `audio/aircraft.ts`, `animals.ts`, `bus.ts`, `listener.ts`, `music.ts`, `nature.ts`, `people.ts`, `rain.ts`, `vehicles.ts`, `weather.ts`, `ui/SoundMixer.tsx` (mixer defaults) | 11 |
| 7 | Sky & Environment | `aircraft/schedule.ts`, `environment/cloudSprites.ts`, `clouds.ts`, `leafVariety.ts`, `leaves.ts`, `seasons.ts`, `sun.ts`, `wind.ts`, `sky/state.ts`, `weather/Lightning.ts`, `Rain.ts`, `Snow.ts`, `fog.ts`, `weatherState.ts`. The 28 hardcoded rows get named constants here, or stay if they are geometry | 14 |
| 8 | Scene & QA | Finish: `scene/Town.tsx` (cloud count literal, shadow far plane stays), `scene/townBlocks.ts` (import path only), final parity run, `tests/budget.test.ts` unchanged | included above; final pass only |

Why this order: Lead first because every other step imports the module. Scene & QA second because its parity baseline must capture the current literals before anyone moves them. Buildings third because it removes two of the duplicate lists, so UI can re-export from config. Remaining steps have no code dependency on each other, only on the config file, so their order only sets who writes to `tuning.ts` first.

## 5. Shared files (one named lead each)

| File | Lead | Reviewer | Reason |
|---|---|---|---|
| `src/store/quality.ts` | Scene & QA | UI & Camera | Tier table is performance (DPR, shadow, bloom, MSAA) |
| `src/scene/Town.tsx` | Scene & QA | Sky & Environment | Cloud count literal is Sky's knob, file is Scene's |
| `src/traffic/vehicles/constants.ts` | Traffic & Life | Audio | Horn values read by Audio; Traffic edits |
| `src/dev/treeCompare/labNatureTrees.ts` | City & Streets | Scene & QA | Lab rule applies; imports `labTuning.ts`, never `src/config` |
| `src/dev/treeCompare/labTuning.ts` (new) | City & Streets | Scene & QA | Lab copies of PINE_* and tree knobs; parity test checks equal to config |
| `src/buildings/house.ts`, `monument.ts` | Buildings | UI & Camera | Duplicates are removed here; store owns the sliders |
| `src/config/tuning.ts` | Lead | all | Serial writes per section order |

## 6. Totals

- New files: `src/config/tuning.ts` (lead), `tests/tuning.parity.test.ts` (Scene & QA), `src/dev/treeCompare/labTuning.ts` (City & Streets).
- Existing files edited, per specialist: Scene & QA 5 (PostFX, Town, townShadow, quality, townBlocks), Buildings 9, UI & Camera 2, City & Streets 7, Traffic & Life 7, Audio 11, Sky & Environment 14. Total 55 existing files.
- Shared files are counted once, under their lead. Import-only edits are counted, because each one is a change.

## 7. Acceptance

1. `npx tsc --noEmit`, `npx vitest run` (rerun pedestrian flake alone), `npx vite build` all pass.
2. `tests/tuning.parity.test.ts` passes: every moved value equals its baseline, every duplicate has one source.
3. Determinism: city layout hashes unchanged (the existing hash tests pass with no edit).
4. Budgets unchanged: `tests/budget.test.ts` passes with no threshold edit.
5. No `Math.random` added. No new feature import from scene or ui.
6. Commit only on user request.

## 8. Decisions (2026-11-01, delegated by user)

- Lab keeps its own copy (`labTuning.ts`); no lab import from `src/config`. Parity test checks lab copy equals config.
- Stays list accepted (section 1).
- `TRAFFIC_DENSITY_FLOOR` wired in, values unchanged.
- `LAMP_SPACING`: signal one renamed `SIGNAL_LAMP_PITCH`; street lamp 18 m goes to config.

## 9. File size rule (user)

- `src/config/tuning.ts` stays a single file while under 400 lines (174 at step 0).
- Past 400 lines: split into one file per section under `src/config/` (for example `traffic.ts`, `trees.ts`, `audio.ts`), and `src/config/index.ts` re-exports every section so existing imports do not change.
- Not split now.

## 10. Open items

- Docs owner: TUNING.md row 143 and trap line 322 (LAMP_SPACING) still describe the old state.
- Step 0 done (skeleton only). Steps 1-8 pending.
