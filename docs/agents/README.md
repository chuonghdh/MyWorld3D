# Specialist agents
Reviewed 2026-11-01 at 02b0cdc

MyWorld3D is built by a small, fixed team of specialists (eight, including the architect who reviews structure and standards) coordinated by the lead (the main Claude session).
Each specialist owns directories, keeps a handbook in this folder, and is **reused** for every new task in its area
instead of spawning a fresh agent. That way what it learned (traps, decisions, conventions) carries over.

| # | Specialist | Owns | Handbook |
|---|---|---|---|
| 1 | Buildings | `src/buildings/**` | [buildings.md](buildings.md) |
| 2 | City & Streets | `src/city/**`, `src/streets/**` | [city-streets.md](city-streets.md) |
| 3 | Traffic & Life | `src/traffic/**`, `src/life/**` | [traffic-life.md](traffic-life.md) |
| 4 | Sky & Environment | `src/sky/**`, `src/environment/**`, `src/weather/**`, `src/aircraft/**` | [sky-environment.md](sky-environment.md) |
| 5 | Audio | `src/audio/**`, `src/scene/audioBridge.ts`, `src/ui/SoundMixer.tsx`, `docs/AUDIO.md`, audio tests (`tests/audio*.test.ts`, `tests/helpers/fakeAudio.ts`) | [audio.md](audio.md) |
| 6 | UI & Camera | `src/ui/**` (except SoundMixer), `src/store/**`, `src/scene/CameraRig.tsx`, `cameraInput.ts`, `cameraDom.ts`, `cameraMath.ts`, `Selection.tsx`, `selectionMath.ts`, block edit (`BlockEditor.tsx`, `blockEditMath.ts`, `blockEditAnchors.ts`) | [ui-camera.md](ui-camera.md) |
| 7 | Scene & QA | `src/scene/**` (rest), `src/core/**`, `src/App.tsx`, `src/main.tsx`, `src/dev/treeCompare/**`, `tree-compare.html`, `dashboard/`, `public/models/**`, `tests/helpers/**`, perf budgets, docs | [scene-qa.md](scene-qa.md) |
| 8 | Technical Architect | Cross-cutting structure, asset pipeline, performance standards, toolchain (no feature code). Reviews `src/shaders/**` | [architect.md](architect.md) |

Shared, no single owner: `src/shaders/**` (cloud shade and wet surface patches). Buildings and Sky & Environment both use it; changes need both owners and an architect review.

Tunable values in one place (owners per row): [docs/TUNING.md](../TUNING.md)

**Tuning rule (all specialists):** every knob a designer may change lives in `src/config/tuning.ts` in your section.
Import it, never re-type it. Geometry and shader constants stay local. No duplicate values; lab copies only in
`src/dev/treeCompare/labTuning.ts`. Add each new knob to `tests/tuningParity.test.ts` and to `docs/TUNING.md`.
When a change touches a knob, the owner updates the config, the parity test and the index in the same task.

## Rules for the lead

1. **Reuse, do not respawn.** Send follow-up work to the specialist that owns the area with `SendMessage`. Spawn a new
   agent only when the specialist is gone from the session, and then paste its handbook into the brief.
2. **Disjoint files.** Two specialists never edit the same file at once. A cross-cutting feature gets one lead specialist
   who may touch a few files outside its area (name them in the brief and report them back).
3. **Briefs are complete.** Name the files, the acceptance checks and what must not change (visual quality, draw calls,
   determinism). The specialist reads its handbook first.
4. **Handbook upkeep.** At the end of every task the specialist appends what it learned to its handbook:
   new traps, decisions with the reason, and what is left undone. The lead reviews that diff.
5. **Dashboard upkeep.** The "MyWorld3D Agent Office" dashboard shows one card per specialist. The lead updates its
   status when a task is assigned, started and finished, and adds an event to the log.
6. **Verification before reporting.** `npx tsc --noEmit`, `npx vitest run`, `npx vite build`. The built-in browser pane
   cannot paint frames: check the scene graph, uniforms, shader compile (force a render in a standalone renderer) and
   console errors, and say plainly what was not seen by eye.
7. **Project rules.** Commits, code comments and docs are in English. Commit only when the user says so. Root-cause
   fixes, no coplanar geometry, no loss of visual quality or performance.

## Handbook template

```
# <Specialist>
Owns / Key files / Conventions / Traps (what bit us, why) / Decisions (and the reason) / Open items / How to verify
```

## Update 2026-11-04 (lead): where changes go

- After every commit or new dependency, add a dated "Update" section to each affected handbook. Include: new rules, new libraries (with version and why), tuning knobs moved, and open items.
- The Technical Architect keeps the cross-cutting list (dependencies, budgets, codec rules) and reviews the other handbooks.
- Dashboard: follow the standby rule (memory `feedback_dashboard-status-labels`).

## Update 2026-11-06 (lead): today's rules
- Visual motion uses sim time only (see architect.md, 2026-11-06). Canvas `frameloop` is a controlled prop (`src/film/loopHold.ts`).
- Dev check of the R3F loop: `window.__r3f` is a snapshot from `onCreated`; read live state with `window.__r3f.get()`.
- UI changes today (owner UI & Camera, see ui-camera.md): film picker is "Follow You" / "Follow a Bird" + Record; Settings panel cleanup, collapsible sections, Golden Hour button.
- Vite stale module (2026-11-06): the dev server kept serving an old `HousePanel.tsx` after an agent edit, so the user saw a fixed bug. Check with `fetch('/src/<file>').then(r => r.text())` in the page; fix by touching the changed files (or restarting Vite), then the user reloads.
- Ownership rule (2026-11-06, user): every file change goes to the owner of its directory, even a small helper. Notes go only in the owner's handbook. Reason: cross-owner edits scatter notes across handbooks and make later fixes read many .md files (more tokens).
