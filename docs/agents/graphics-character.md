# Graphics & Character
Created 2026-11-11 (T-0031). Seeded from the pedestrian close-up research; nothing here was re-measured in a browser.

## Owns
The rendering of people and their dogs: `src/traffic/people/**` (geometry, rig, vertex and fragment shaders, materials, instancing, LOD). Tests that cover only this code (the people mesh and rig tests in `tests/people.test.ts`) are run by this specialist, but the file belongs to Traffic & Life until it is split.

Not owned: walker behaviour and simulation (`src/traffic/walkers/**`, `src/traffic/pedestrians.ts`), vehicles, `src/life/**`. Those stay with Traffic & Life (docs/agents/traffic-life.md). The border is the per-instance data the walkers write: speed, phase, pose, amplitude.

## Key files
- `src/traffic/people/rigShaderGlsl.ts`: the procedural rig. Legs, arms, torso sway and head nod are computed in the vertex shader from per-instance gait data. Flat shaded.
- `src/traffic/people/rigShader.ts`: materials, uniforms (`uTime`), `customProgramCacheKey` (`person-rig-v3`, depth `person-rig-depth-v3`). Bump the suffix on every GLSL change.
- `src/traffic/people/peopleMeshes.ts`: instanced meshes and per-instance attributes (`aGait`, `aGait2`, dog attributes), write and `needsUpdate` per frame.
- `src/traffic/people/personGeometry.ts`, `personShape.ts`, `personParts.ts`, `personSpec.ts`, `rigBuilder.ts`, `outfit.ts`, `palettes.ts`: body parts, regions, specs per age group, outfits.
- `src/traffic/people/dogGeometry.ts`: dog model (about 130 triangles).

## Current state (research, 2026-11-11)
- 4 instanced person meshes (adult, child, elder, teen) plus dogs, leashes, umbrellas. One draw call each.
- 350 to 480 triangles per person, hidden parts included (no LOD: a person at 200 m costs the same as one at 5 m).
- Shading is flat; faces are quads on the head. Several face quads sit nearly coplanar with the head (z-fight risk close up).
- Gait: `a = uTime * omega + phase` in the vertex shader. The phase is per instance and static, so changing omega changes `a` for the whole elapsed time and the legs pop. Idle is frozen (no breathing, no weight shift).

## Conventions
- Per-instance gait fields are written by Traffic & Life (`walkers/resolve.ts`, `peopleMeshes.ts`). A new field needs a place in `peopleMeshes.ts` (create, write, `needsUpdate`) and a matching change on the walker side, agreed through the lead.
- Visual motion uses sim time only (`uTime` from the town frame), never a wall clock.
- Seeded variation only (outfit, hair, per-person phase); no random calls at render time.
- Shader patches use a versioned `customProgramCacheKey`. No GLSL identifier `patch` or other reserved words.
- No coplanar geometry: face details sit at distinct heights or move into the fragment shader.
- Gait knobs stay in `src/config/tuning/trafficLife.ts` (child stride, swing, knee, arm, bob); parity entries in `tests/tuningParity.test.ts`, rows in docs/TUNING.md.
- Budget: no draw-call or triangle regression unless the brief names it. Guard: `tests/budget.test.ts`.

## Traps
- A phase formula based on `uTime * omega` pops when omega changes. Fix is an accumulated phase per walker (T-0021), which needs a walker-side field.
- `aGait2` was added for the child gait: any new gait field must be added in `peopleMeshes.ts` too.
- Pedestrian timing tests are flaky under load: rerun alone.
- The dev server may serve a stale shader module after a multi-file edit: touch the files or restart.
- The built-in browser pane cannot paint frames. Close-up looks need connected Chrome; say what was not seen.

## Decisions
- Rejected: 2K or 4K character textures (memory and bandwidth for hundreds of instances, no way to reuse across outfits; procedural fragment detail scales better).
- Rejected: blendshapes or morph targets (per-instance morph state breaks instancing or needs a texture lookup; the face is a fragment-shader job instead).
- Rejected: skinned meshes and skeletons (per-instance bone matrices cost far more than the vertex-shader rig for a crowd).
- Chosen: keep the procedural vertex rig, add distance LOD (near and far meshes), push face, hair, ambient occlusion and rim light into the fragment shader for the near mesh only.

## Open items (backlog, order)
T-0020 close-up capture and perf baseline (Scene & QA), then T-0021 gait phase continuity, T-0022 near and far split, T-0023 near model detail, T-0024 near face shader, T-0025 surface shading, T-0026 hair and skin, T-0027 idle micro-animation, T-0028 gait mechanics, T-0029 turn, start and stop smoothing, T-0030 integration and final perf comparison (Scene & QA). Records are in `harness/tasks/backlog/`; list with `node harness/scripts/next-task.mjs`.

## How to verify
`npx tsc --noEmit`, `npx vitest run tests/people.test.ts tests/budget.test.ts tests/tuningParity.test.ts` (rerun people timing alone), then `npm run check`. For looks: connected Chrome at close range, same camera before and after, draw calls and triangles from the `__r3f` handle. State plainly what was not seen by eye.

## Baseline 2026-11-12 (T-0020, headless Chromium, software GL)
Measured with `npm run smoke:closeup` on the production build: default camera, day (12:00), default settings and seed, 1280x720. Software GL, so triangle and draw call counts are exact, frame times are not measured. Shots are saved to the OS temp dir (`myworld3d-closeup`), not the repo. Method: `docs/agents/scene-qa.md`, Update 2026-11-12.

| Mesh | Triangles per instance | Vertices per instance | Instances (capacity) |
|---|---|---|---|
| pedestrians-adult | 376 | 1128 | 240 (512) |
| pedestrians-child | 376 | 1128 | 13 (512) |
| pedestrians-elder | 376 | 1128 | 61 (512) |
| pedestrians-teen | 376 | 1128 | 39 (512) |
| dogs | 130 | 390 | 66 (256) |
| leashes | 12 | 24 | 66 (256) |
| umbrellas | 26 | 78 | 0 (512), clear sky |

All four person meshes have the same triangle count (376), so the handbook range "350 to 480" is 376 today. Non-indexed geometry: vertices = 3 x triangles.

| Frame at the default camera (all passes) | Draw calls | Triangles |
|---|---|---|
| As is | 184 | 2,377,993 |
| People shadow casting off | 179 | 2,242,179 |
| People group hidden | 173 | 2,096,955 |
| People cost (as is minus hidden) | 11 | 281,038 (11.8 percent of the frame) |
| People shadow pass (as is minus casting off) | 5 | 135,814 |

- People main pass about 145,000 triangles (353 walkers x 376 + 66 dogs x 130 + leashes), the shadow pass about 136,000 (one shadow render of the same casters). Vertices run in the vertex shader are about 3 x triangles (no index sharing), roughly 0.84 M for people per frame, all passes.
- Frame total varies with moving actors: 2.37 M to 2.38 M in these runs; smoke caps are 260 draw calls and 3.2 M triangles.
- Shots: adult, child, elder, teen and dog at 3, 8 and 25 m by day and night, and 3 and 8 m in rain (40 PNGs). The camera sits 0.6 rad off the walker's heading, 15 percent of the distance above the target, aimed at about 0.95 m (dog 0.35 m). Instance 0 is followed live, so each run may show a different walker, and a wall, tree or other walker can block it: in the last run `day-child-25m`, `night-teen-8m`, `night-elder-25m` and `rain-adult-8m` came out nearly flat (few colour buckets), judge them by eye or rerun.
- Not seen or measured: look on real hardware by eye, real GPU frame time, vertex-shader cost in milliseconds.
