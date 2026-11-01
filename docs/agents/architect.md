# Technical Architect

**Owns:** cross-cutting structure, not feature code. Module boundaries, the asset pipeline, the performance budget, the
build and test toolchain, and dependency hygiene. Writes no feature geometry; it reviews, proposes and sets standards that
the specialists implement. Edits docs and budgets/guard tests only, and only when the owning specialist agrees.

## Role
- Keep the dependency direction clean: `core` and `store` at the bottom, `city` and `buildings`/`streets`/`traffic`/`environment`
  as feature modules, `scene` as the composition layer, `ui` at the top. Flag any feature module importing `scene` or `ui`.
- Keep layouts pure: anything generated from `settings` plus `layout.seed` is a pure function (no `Math.random`, no
  wall-clock time). Hashes in tests are the contract.
- Review each merge that crosses owners (for example block merging touched city, streets, traffic, buildings and scene).
  Check file ownership in `docs/agents/README.md` and REPO_MAP before approving.
- Track size limits (for example `src/scene` files ≤ 350 lines) and split a file before it grows past the rule.

## Asset pipelines
- **Procedural first.** Geometry, textures and shader patches are generated in code from seeds. New binary assets need a
  reason and a budget line; the default answer is procedural.
- **Geometry.** Repeated parts use instanced meshes (`MeshBuilder`, `placeMatrix`). A new mesh counts against the draw-call
  budget; prefer merging into an existing mesh of the same material.
- **Textures and shaders.** Shared canvas textures are created once and cached. Shader patches go through
  `onBeforeCompile` with a `customProgramCacheKey` that is versioned. The reserved GLSL name `patch` must not be used.
- **Audio.** Sound assets and routing follow `docs/AUDIO.md`. The Audio specialist owns the bus and emitters.
- **Fonts, icons, UI assets.** Inline SVG in TSX or small CSS; no network fetches at runtime.
- **Caching.** Anything that depends on layout is keyed by `layoutKey`; traffic and weather settings must not rebuild
  blocks. Pieces are cached per layout signature (`useTownPieces`).
- **Save files.** JSON settings are the only persisted state. Every new field needs a default, validation in `io.ts`,
  and a migration note if old saves change meaning.

## Performance standards
- **Frame budget.** 60 fps target on a mid-range desktop GPU at the default quality tier; 30 fps floor on phones at the
  lowest tier. Frame time is measured, not guessed.
- **Draw calls and triangles.** The guard tests (`budget.test.ts`) are the limit. Raising a limit needs a measured reason
  written in the handbook and approval from Scene & QA.
- **Rebuild cost.** A user action that rebuilds the town has a time budget. Current reference: 1×1 to 1×2 merge ~1 s,
  1×2 to 2×2 ~2.4 s (accepted for now; speed-up is backlog). A new feature may not make these worse without a note.
- **Determinism.** Same seed and settings produce byte-identical output. Changes that alter output without a settings
  change must update the hashes deliberately, never silently.
- **No coplanar geometry.** Decals use distinct heights plus polygon offset.
- **Visual quality is not traded silently.** A cheaper path needs side-by-side evidence and a note.
- **Measurement.** Use the `__r3f` dev handle (draw calls, triangles) and `performance.now()` around layout builds. The
  built-in browser cannot paint frames; use the connected Chrome for visual or timing checks and say what was not seen.

## Traps
- Vite can serve a stale transform of a module after a multi-file edit. A `ReferenceError` in a module that looks correct
  means the server is stale: touch the file or restart the dev server, then recheck the served source.
- An error inside the R3F Canvas unmounts the whole React tree, which looks like a blank page. Boot screen and error
  boundary exist for this (`src/ui/boot.ts`, `src/ui/ErrorBoundary.tsx`).
- Node-only APIs (`node:fs`) in tests break `tsc` unless node types are configured. Use Vite `?raw` imports instead.

## Decisions
- Specialists own their directories; the architect does not edit feature code. Cross-owner changes go through the owner.
- Budgets live in tests, not in prose, so they fail loudly.

## Open items
- First full review of repository structure, asset patterns and budgets (assigned; findings to be appended here).

## How to verify
`npx tsc --noEmit`, `npx vitest run` (rerun pedestrian flake alone), `npx vite build`. For performance claims, measure in
Chrome with the scene graph and draw-call counts, and state plainly what was not checked by eye.

## Assignments (lead decision, open)

| # | Finding | Owner | Status |
|---|---|---|---|
| 1 | Feature modules import scene: `sky/SkyDome.tsx:7`, `aircraft/schedule.ts:7`. Move `runtime` state and `MAX_DISTANCE` to `src/core` | Sky & Environment (imports); Scene & QA (`runtime.ts`); UI & Camera (`cameraMath.ts`) | Assigned, not started |
| 2 | Store imports city and weather: `store/index.ts`, `store/merges.ts:3`, `store/io.ts:17`. Move `parseMergedBlockId` and `WEATHER_KINDS` to `core` | UI & Camera (store); City & Streets (`merge.ts`); Sky & Environment or Scene & QA (`weatherState`) | Assigned, not started |
| 3 | Draw-call guard: 130 of 140, dead 400 limit at `tests/budget.test.ts:266` | Scene & QA | Assigned, not started |
| 4 | 29 files over 350 lines. Each owner splits its own large files, only where safe and with no behaviour change. `traffic/vehicles.ts` now 338 lines (Traffic split horns into `vehicles/horns.ts`), so no longer over the limit; the 1794 figure is stale | Each owner | Assigned, not started |

| 5 | Save version check is strict equality, no migration path (`store/io.ts:208`). Low priority, after #2. Add migration only if a test needs it | UI & Camera | Assigned, not started |

Also rejected: `vehicleMeshes.ts` importing `shaders/wetSurface`. Done by Traffic: import removed, `setSnow` added. Closed by lead.

Git state (checked 2026-11-01): no untracked files. Modified, uncommitted: `docs/agents/README.md`, `docs/agents/architect.md`, `docs/agents/audio.md`, `docs/agents/city-streets.md`, `src/city/streetscape.ts`, `src/scene/useNatureTrees.ts`, `src/traffic/vehicleMeshes.ts`. `public/`, `src/shaders/`, `src/dev/treeCompare/` and `tree-compare.html` are already committed (lead confirmed). Lead decision: no commits from architect; the earlier "uncommitted" list is stale.

Architect role for these: review diffs when owners report; update this section and close items. No feature code by architect. No commits without user request.

## Review findings (first pass)

Scope: repo structure, module graph, asset pipeline, caching, budgets. Measured with grep, wc and git ls-files. Not measured:
frame time and rebuild time (need connected Chrome). No feature code edited. Not committed.

### Healthy

| Area | Evidence |
|---|---|
| Binary assets | None tracked. No `public/`, no fonts, no audio files. Tracked total 240 files, 2.18 MB; largest is `package-lock.json` (106 KB). Audio and textures are procedural. |
| Runtime network | No `fetch`, XHR or WebSocket in `src`. `index.html` loads only the local module. Storage: `localStorage` only in `src/ui/SoundMixer.tsx:76`. |
| Shader cache keys | 14 of 14 `onBeforeCompile` sites have a `customProgramCacheKey` (versioned, e.g. `building-body-v4`, `person-rig-v3`). Chained patches append a suffix (`weather.ts:98`, `cloudShade.ts:173`). |
| GLSL `patch` name | No GLSL identifier `patch` found. Only JS names (`patchBody`, `HousePanel` `patch()`). |
| Layout caching | `cityLayoutKey` (`src/city/layoutKey.ts:13`) ignores `trafficMultiplier`. `createLayoutProvider` is single-entry. `retargetTraffic` shares everything but spawns. |
| Piece cache | `useTownPieces.ts:30-55` caches per block by signature. `useMemo` deps `[layout, order, base, blockOverrides, houseOverrides, cache]`. |
| Determinism | No `Math.random` in city, streets, buildings, traffic, environment, life layout or store. `life/spots.ts` and `life/birds.ts` use seeded RNG. |
| Feature to ui | Zero imports from any feature folder into `src/ui`. |
| Scene file size | Every `src/scene` file is at or under 350 lines (largest `CameraRig.tsx` 344). |
| Build output | `dist/` is gitignored and not tracked. |

Per-folder LOC (src .ts/.tsx/.css): buildings 8639 (29 files), traffic 6262 (19), audio 4869 (16), environment 3576 (14), scene 2783 (23), ui 2739 (15), life 2268 (7), streets 2037 (8), city 1506 (8), weather 1181 (7), aircraft 992 (5), store 773 (5), sky 652 (5), App 199, core 86, main 12.

Budget guard (`tests/budget.test.ts`): main tris ≤ 1,430,000 (measured 1,383,853); blocks main 1.10M-1.14M; shadow tris ≤ 450,000 (measured 421,859); main+shadow ≤ 1,900,000 (measured 1,805,712); draw calls ≤ 140 (measured 130).

### Issues (ranked by impact)

1. **Draw-call guard has 10-call headroom and a dead second limit.** `tests/budget.test.ts:265` caps at 140, measured 130. Line 266 caps at 400 and never binds. Impact: next feature adding static meshes fails CI, or the second limit hides a real regression. Action: delete line 266, or make it the moving-actor estimate. Owner: Scene & QA. Measure the 140 headroom with the next merge.
2. **Feature module imports scene.** `src/sky/SkyDome.tsx:7` imports `runtime` from `../scene/runtime`. `src/aircraft/schedule.ts:7` imports `MAX_DISTANCE` from `../scene/cameraMath`. Impact: inverted dependency; `scene/runtime.ts` also imports `../environment` and `./cameraMath`, which creates cycle risk and drags R3F into sky and aircraft tests. Action: move `runtime` state and `MAX_DISTANCE` to `src/core` (pure constants or plain objects). Owner: Sky & Environment for the two imports, Scene & QA for `runtime.ts`, UI & Camera for `cameraMath.ts`.
3. **Store sits above feature modules.** `src/store/index.ts:2-3` imports `city/layoutKey` and `city/merge`. `src/store/merges.ts:3` imports `city/merge`. `src/store/io.ts:17` imports `weather/weatherState`. `src/store/model.ts:13` is type-only. Impact: store is documented as bottom layer; no cycle today (city does not import store), but any future city-to-store import makes one. Action: move `parseMergedBlockId` and `WEATHER_KINDS` into `src/core/types.ts` or a new `core` module. Owner: UI & Camera (store), City & Streets (`merge.ts`), Sky & Environment or Scene & QA for `weatherState`.
4. **Shader ownership split across feature folders.** `src/weather/wet.ts:5` imports `attachWeather` from `../buildings/materials`. `src/buildings/materials.ts:24` imports `patchCloudShade` from `../environment/cloudShade`. Impact: weather depends on buildings, buildings depend on environment; shader edits cross owners. Action: move shared patches (`cloudShade`, `weather`) to a shared shader folder, e.g. `src/core/shaders/`, and keep the owner list in REPO_MAP. Owner: Buildings, Sky & Environment, Scene & QA for the move. **Status (done, uncommitted):** moved to `src/shaders/` (`wetSurface.ts`, `cloudShade.ts`). Cache keys unchanged; compiled shader output byte-identical. `environment/cloudShade.ts` re-exports the names.
5. **Oversized files.** 29 files exceed 350 lines. Worst: `src/traffic/vehicles.ts` 1794, `src/traffic/pedestrians.ts` 1511, `src/buildings/facade/roof.ts` 1070, `src/ui/panels.css` 930, `src/life/birds.ts` 801, `src/audio/vehicles.ts` 770. Impact: merge hotspots (vehicles.ts already touched by block merge and signal arms). Action: split by concern when next touched, not now. Owner: Traffic & Life (vehicles, pedestrians, birds), Buildings (roof), Audio (vehicles), UI & Camera (panels.css).
6. **Unseeded random persisted to saves.** `src/App.tsx:91` sets species for every street tree with `Math.random`. The result lands in `treeOverrides`, which is saved. Impact: low; the same save reloads identically, but "randomize" is not reproducible from seed. Action: use a seeded RNG from `core/rng.ts`, or keep and document it as a user action. Owner: UI & Camera (App is lead).
7. **Save version check is strict equality.** `src/store/io.ts:208` rejects any `version !== LAYOUT_VERSION`. There is no migration path. Impact: any future save-format change makes all old saves unloadable, against the handbook rule "migration note". Action: add a `migrate` step keyed by version before bumping. Owner: UI & Camera.
8. **Signature stringifies every lot on each layout change.** `src/scene/useTownPieces.ts:50` runs `JSON.stringify` of `lots` and `houseOv` for every block on each memo run. Impact: unmeasured; expected to be small against the 1-2.4 s rebuild budget. Action: measure with `performance.now()` before changing. Owner: Scene & QA.

### Next steps (not done here)

- Owners respond to issues 1-4 before any move. Architect does not edit feature code.
- Measure frame time and rebuild time in connected Chrome to close the performance section.

## Harness research

Source: https://github.com/revfactory/harness (README via WebFetch; Apache-2.0). Related: harness-100 (separate collection of
100 prebuilt team setups), v1 A/B repo `revfactory/claude-code-harness`, project site `revfactory.github.io/harness/`.
Not accessed: `docs/migration-v1-to-v2.md`, `skills/` source files, the v1 A/B data (only the README summary was read).

What it does: a meta-skill. From a domain description it generates `.claude/agents/*.md` (who) and `.claude/skills/*`
(how), one orchestrator skill sets order, data passes via files, schemas, messages or tasks. Modes: workflow scripts,
persistent named agents with SendMessage, one-shot sub-agents. Six patterns (pipeline, fan-out/fan-in, expert pool,
producer-reviewer, supervisor, hierarchical). Progressive disclosure for context. Phases 0-7; `/harness:evolve` for upkeep.

Token claim: none. README claims quality only (v1 A/B, n=15: mean 49.5 to 79.3, 15/15 wins; author-measured, README
recommends own pilot). No savings or cost figures. A multi-agent team spends more tokens per task, not fewer.
Conflict in sources: a secondary article says Agent Teams needs `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`; the README says no flags. Unverified.

Overlap with our setup: 8 fixed specialists with handbooks (= agents/skills split); SendMessage reuse (= persistent
collaboration mode); REPO_MAP entry-file-first (= progressive disclosure); slim CLAUDE.md (= generated minimal pointer);
shared-file coordination via dashboard (= data passing).

New, and where it conflicts with our rules:
- Auto-generate team from description: conflicts with fixed specialist roster and "reuse, do not respawn". Generation costs tokens up front.
- `/harness:evolve` maintenance loop: rewrites agent/skill files; conflicts with "specialist owns its directory" and "commit only on request".
- CLAUDE.md change-history section: conflicts with slim CLAUDE.md; history belongs in git.
- Plugin install / copy into `~/.claude/skills`: a settings-level change; needs user approval, not done here.
- Generated prompts are English-default and not CAVEMAN; output style rule (terse, no fluff) would need re-stating in every generated skill.

Verdict per idea:

| Idea | Verdict | Token effect | Risk | Concrete change |
|---|---|---|---|---|
| Meta-generator (build team from text) | Skip | Adds setup tokens, no measured saving | High: replaces roster we already tuned | None |
| Orchestrator skill with phases and handoff schema | Adapt | Small: lead stops re-deriving file ownership per task | Low | Add a 10-line "cross-owner handoff" checklist to `docs/agents/README.md` (files, acceptance, what must not change) |
| Progressive disclosure for context | Already have, keep | Keeps reads small | None | Keep REPO_MAP as sole index; no new skills |
| Sub-agent one-shot for parallel searches | Adapt | Saves lead context on wide greps | Low | Use Explore agent for broad scans (already allowed by Agent tool); note in README rules |
| Evolve/maintenance command | Skip | None | Conflicts with owner rule and commit rule | Keep handbook upkeep manual |
| Agent Teams experimental flag | Skip | Unknown | Unverified feature, may break | None |
| Minimal CLAUDE.md pointer with trigger rule | Already have | Keeps session start cheap | None | None |

Recommendation: adopt nothing wholesale. Adapt the handoff checklist and the Explore-for-scans rule. Revisit only if the
roster grows past 8 or a measured pilot (same task, with and without) shows fewer tokens. Pilot needs token counts from
session usage, not present here.

## Graphity research

Source status: https://github.com/Graphity-Labs/graphity returned HTTP 404 (not found, private, or renamed). No README read.
Closest matches read instead: CodeGraph (github.com/colbymchenry/codegraph, README via WebFetch) and Graphify (graphify.com
blog page, via WebFetch). Public write-ups found via WebSearch (secondary, not fetched in full): mindstudio, hackernoon,
levelup, enterprisedna, braindetox. If "Graphity" means another project, the name needs confirming.

What the tools do (CodeGraph; Graphify is similar):
- Parse code with tree-sitter into symbol and edge graph (calls, imports, extends). Local SQLite at `.codegraph/codegraph.db`.
- Query via MCP tool `codegraph_explore` (returns symbol source, call paths, blast radius) or CLI (`query`, `callers`, `impact`).
- Graphify stores `graphify-out/graph.json` plus HTML and a report; hooks nudge Claude to check the graph before grep or file reads.
- Install: PowerShell installer or npm; `codegraph init` per project. Windows-capable.

Token-savings basis:
- CodeGraph headline: 62% fewer tokens, 88% fewer tool calls, on 7 open-source repos, median 4 runs per arm, claude -p, Opus. Maintainer-measured.
  Savings ranged 13% (Django) to 78% (Excalidraw). Control arm reached the CLI in 26 of 28 runs until blocked, so early numbers were inflated.
  Caveat: about 80% more retrieval context stays in the window late in multi-turn sessions (67k vs 18k on VS Code).
- Graphify headline up to 70x is vs pasting whole repo, which almost nobody does. One independent test: 113k vs 120k tokens (about 7%) on a 10-question session.
  Secondary reviewer: grep won the real-time comparison on simple string lookups.
- Verdict on evidence: CodeGraph's numbers are measured but self-reported with small N; Graphify's 70x is not a fair baseline. Both anecdotal for our case.

Our setup and size:
- 166 TS/TSX files in src (38.1k LOC), 53 test files (10.9k LOC), 15 md docs, REPO_MAP 33 lines, CLAUDE.md 30 lines.
- Repo is mid-sized. The hand-written REPO_MAP plus handbooks already route agents to the entry file per folder, so most lookups are one hop.
- Pay-off would come from cross-folder questions (who calls what across city/streets/traffic), which our specialists handle by handbook and grep.

Options:

| Option | Token effect (expected) | Setup cost | Risk | Effect on our rules |
|---|---|---|---|---|
| A. Adopt CodeGraph as MCP (or Graphify skill + hooks) | Maybe 10-30% on cross-folder questions; little on per-folder edits. Unmeasured here | Install, per-project index, hook config in `.claude/settings.json` (needs approval) | Index staleness; hooks changing agent behavior; extra MCP surface; Graphify writes to `~/.claude/CLAUDE.md` (conflicts with slim CLAUDE.md rule) | Writes outside repo and settings: needs user approval. `.codegraph/` must be gitignored. Windows install is supported |
| B. Use only the idea: generated graph report refreshed by script, committed or gitignored | Small; a generated `docs/CALLGRAPH.md` cuts repeated grep for imports | Low: one Node script under `tests/` or `scripts/` run on demand | Map drifts unless regenerated; generated file must be marked and not hand-edited | Fits handbooks as source of truth; output English; no commit unless asked |
| C. Skip, keep REPO_MAP plus handbooks, add grep-first rule | None | None | Cross-folder questions stay slower | Fully compliant |

Recommendation: B, but only if a measured problem shows up. Today the repo is small enough that a graph index is unlikely to
pay back the setup and the staleness risk. Concrete next step, no install: note in `docs/agents/README.md` that cross-folder
questions go to the Explore agent. Revisit A only if a pilot on one real cross-folder task shows a token drop of 25% or more,
with the session usage numbers recorded. No pilot run here.

## Session 2026-11-01
- Checks: `tsc --noEmit` exit 0. `vite build` exit 0, index JS 1,650.63 kB (gzip 507.56 kB), over Vite's 500 kB warning (no baseline measured). dist 4.4 MB.
- `public/` (2.8 MB; 56 GLB, 5 PNG, 1 JPG; Quaternius and Kenney, both CC0, LICENSE.txt present). Runtime dependency: `src/scene/useNatureTrees.ts:22,37`, `src/streets/natureTrees.ts:1`. Also read by `tests/budget.test.ts:85`. Recommend COMMIT with LICENSE files. Do not gitignore: a clean checkout loses city trees and fails the budget test.
- `src/dev/treeCompare/` (700 lines). Not in bundle (0 matches in dist), type-checked via tsconfig `include`. Recommend COMMIT as dev harness. 6 console lines are dev-only.
- `tree-compare.html` (root): dev-server-only second entry, not built (no multi-page input in vite.config.ts). Open: move next to `src/dev/` before commit. Do not gitignore.
- Trap: `weatherUniforms` is shared by reference. Swap `.value` only, never replace the uniform object (`streets/index.ts:178-179`, `wetSurface.ts:91-92`).
- Trap: `tests/budget.test.ts:81` hides `node:fs` behind string concat so tsc passes. Keep that pattern.
- No `Math.random` in new tree, track or leaf files.
- Open: measure GLB tree draw calls and tris against budget (140 calls, measured 130 before this session). Open: frame and rebuild cost need connected Chrome.
- Open: code-split or raise `chunkSizeWarningLimit` with a measured reason.
