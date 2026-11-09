# Sky & Environment

## Owns
- `src/sky/**`: sky dome, sun and moon discs, ground disc, night colours.
- `src/environment/**`: trees, greenery, forest, wind, falling and street leaves, seasons, clouds, cloud shadows, sun and moon position, smoke, park yard, street flora.
- `src/weather/**`: weather kinds and intensity, rain, snow, fog, lightning, wet surfaces.
- `src/aircraft/**`: airliner schedule, contrails, livery, aircraft mesh.
- Shared, no single owner: `src/shaders/cloudShade.ts` and `src/shaders/wetSurface.ts`. Buildings also uses them. Changes need both owners and an architect review (`docs/agents/README.md`).

## Key files
- Sky: `src/sky/index.ts` (barrel), `SkyDome.tsx`, `dome.ts` (`createSkyDome`), `state.ts` (`computeSkyState`, `GROUND_COLORS`), `ground.ts` (`createGroundDisc`).
- Environment: `sun.ts` (`DEFAULT_LOCATION`, `DEFAULT_DATE`), `seasons.ts` (`PROFILES`), `leaves.ts` (`LeafSystem` class), `leafMotion.ts`, `leafShapes.ts`, `leafState.ts`, `leafDevil.ts`, `leafSurfaces.ts`, `leafCrowns.ts`, `leafVariety.ts`, `forest.ts` (`createTreeField`), `treeBuilder.ts`, `treeSpecies.ts`, `treeCrown.ts`, `treeTrunk.ts`, `greenery.ts`, `greeneryPieces.ts`, `parkYard.ts` (park plan), `parkGeometry.ts`, `cloudSprites.ts` and `cloudLayout.ts` (layout, re-exported), `clouds.ts`, `cloudShade.ts`, `wind.ts`, `smoke.ts`, `seasonalPaint.ts`, `streetflora.ts`.
- Weather: `weatherState.ts` (kind targets, eased values), `Rain.ts`, `Snow.ts`, `fog.ts`, `Lightning.ts`, `wet.ts`, `index.ts`.
- Aircraft: `schedule.ts`, `contrail.ts`, `planeMesh.ts`, `livery.ts`, `aircraftShaders.ts` (`VERT`, `FRAG` for the aircraft mesh), `index.ts`.
- Config: `src/config/tuning/skyEnvironment.ts` (sections `leaves`, `weather`, `clouds`, `sky`, `lights`, `aircraft`).

## Conventions
- Knobs (designer-changeable amounts such as caps, counts, distances, altitudes, time windows) live only in `src/config/tuning/skyEnvironment.ts`. Feature code imports from `../config/tuning` (the index), never from the section file.
- Geometry, shader and algorithm constants stay local (for example `REST_LIFT` in `leaves.ts`, `LEAF_CURL`/`LEAF_BEND`/`VEIN_LIFT` in `leafShapes.ts`, `FLIGHTS_PER_DAY_MIN/MAX` in `aircraft/schedule.ts`).
- Layers (guarded by `tests/harness.test.ts`, `dependency direction`): `sky`, `environment`, `weather` and `aircraft` must not import `scene` or `ui`, type imports included.
- Determinism: `environment` is in the layout guard (no `Math.random`, `tests/harness.test.ts`). `sky`, `weather` and `aircraft` are not in that guard.
- Files: no file in this area is over 350 lines. Largest: `contrail.ts` 326, `smoke.ts` 322, `leaves.ts` 321, `aircraft/index.ts` 315. `OVERSIZED` in the harness test is empty.
- Tree and leaf module split (harness refactor, 2026-11-06): `forest.ts`, `leaves.ts`, `greenery.ts`, `parkYard.ts`, `cloudSprites.ts` and `aircraft/index.ts` were split by responsibility, with the old exports kept as re-exports. The former `aircraft/index.ts` shaders moved to `aircraftShaders.ts`.

## Traps
- `contrail.ts` keeps its own inline `VERT` and `FRAG` (lines 88 and 148). They are not in `aircraftShaders.ts`. Do not assume the aircraft shaders are all in one file.
- `src/weather/Lightning.ts` defaults to `Math.random` (line 188, `constructor(random = Math.random)`), documented as visual only and not tied to the city seed. This is allowed because `weather` is outside the determinism guard. Do not move weather into a layout path without replacing it.
- `docs/TUNING.md` line references for leaves are stale after the split: it cites `leaves.ts:27, 31, 33, 35` (now `leaves.ts:29`, `leafShapes.ts:11, 13, 15`) and `leaves.ts:415` and `:634` (the file is now 321 lines; the spawn divisor is at `leaves.ts:213` and the rest timer is in `leafMotion.ts:10`).
- `tests/tuningParity.test.ts` entries use the path `src/config/tuning/`, which no longer exists (the config is the folder `src/config/tuning/`). How the test resolves that path is not verified.
- Shared shaders (`src/shaders/cloudShade.ts`, `src/shaders/wetSurface.ts`) are also used by Buildings (`src/buildings/materials.ts`) and by `src/streets` and `src/dev/treeCompare`. A change there affects several owners.

## Decisions
- 2026-11-06 harness refactor: split by responsibility with no behaviour change; re-exports keep the old import paths (reason: file size ratchet, 350 lines).
- Tuning knobs for sky, weather, clouds, lights and aircraft moved to `src/config/tuning/skyEnvironment.ts` (reason: one place for designer knobs, CLAUDE.md).
- Leaf fade, rest time and near-fade are read from `skyEnvironment.leaves` (for example `leafMotion.ts:10`).

## Open items
- Fix the stale line references in `docs/TUNING.md` rows for leaves (owner: Sky & Environment for the rows; the file is shared).
- Confirm the `tests/tuningParity.test.ts` path for the config folder entries, or update it (not checked by running the test).
- The area has no per-section tuning parity test (only the rows in `tests/tuningParity.test.ts`).
- `src/shaders/**` change process: confirm with the architect before any edit.

## How to verify
- `npx tsc --noEmit` after edits under `src/` or `tests/`.
- Targeted tests: `npx vitest run tests/harness.test.ts tests/layers.test.ts tests/tuningParity.test.ts`.
- Grep check for knob literals in feature code: `Grep` for numeric literals in `src/sky`, `src/environment`, `src/weather`, `src/aircraft` against `src/config/tuning/skyEnvironment.ts`.
- Visual checks (sky, leaves, clouds, rain) need connected Chrome; the built-in pane cannot paint frames.

## Review 2026-11-08 (Sky & Environment)
- Verified in code: owned directories and file layout as listed above; the harness refactor re-exports (`cloudSprites.ts:21`, `forest.ts:25-26`, `parkYard.ts:313`, `leaves.ts:19-21`, `greenery.ts:15`); `aircraft/index.ts` imports `VERT`/`FRAG` from `aircraftShaders.ts:8`.
- Verified: layer rule (no `scene` or `ui` import in these directories); `environment` is in the layout determinism guard; `skyEnvironment` section is used by `sun.ts`, `Lightning.ts`, `Rain.ts`, `Snow.ts`, `fog.ts`, `leafMotion.ts`, `schedule.ts`.
- Verified: no `src` file is over 350 lines (`OVERSIZED` is empty, so the ratchet is satisfied).
- Found stale (not edited, outside this handbook): TUNING.md leaf line references and the parity test path (see Traps and Open items).
- Not verified: whether the `tests/tuningParity.test.ts` entries for the config folder pass; test results were not run (no `npx vitest run` in this review).

## Update 2026-11-08
- Trap: stale `node_modules` after a dependency bump flips units silently. suncalc 1.9 returns radians with azimuth from south; 2.x returns degrees with azimuth from north. `sun.ts` assumes v2. With a stale 1.9 install, midnight altitude -1.21 rad is read as -1.21 deg, so night looks like dusk. Typecheck and lockfile do not catch it.
- Guard: `tests/sunUnits.test.ts` (Hanoi, equinox): 0h altitude < -45 and phase `night`; 12h altitude > 45; 6h azimuth ~90, 18h ~270. Failure message: "suncalc returned v1 units - run npm install".
- Verify: `npm ls suncalc` matches `package.json`; run `npx vitest run tests/sunUnits.test.ts`. After `npm install`, clear `node_modules/.vite` and restart dev server.
- Moon: `tests/moonUnits.test.ts` guards `getMoonDirection` (degree range, |alt| > 2*PI at some hour, unit vector, moonrise has x > 0 = east), `getNightMoonDirection(0)` (opposite the sun, alt > 45) and `getMoonPhase` (in [0,1), ~0.02 on 2026-03-20). `src/sky/state.ts` only uses sun altitude (degrees) and the unit-free phase, so no other v1 assumption.
