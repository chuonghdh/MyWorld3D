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

## Update 2026-11-12 (T-0021 gait phase continuity)
- Decision: the walk-cycle angle is integrated on the CPU in `src/traffic/people/gaitPhase.ts` (`GaitPhase`, per-slot Float32Array, `begin(time)` once per frame, `step(id, omega)` per walker) and written to `aGait.x`. The shader now uses `a = aGait.x + aGait.y`. No walker-side change. Reason: `uTime * omega` jumps by `uTime * delta omega` on every stop, start or speed change.
- Trap: `aGait.x` is now an ANGLE in [0, 2pi), no longer omega. Anything reading it as omega is wrong. `aGait.y` stays the per-walker phase offset (chat and nod terms use it). Cache keys bumped to `person-rig-v4` / `person-rig-depth-v4`.
- Slots: `PedestrianRender.id` is assigned once per slot (1..cap, `walkers/looks.ts`), stable. Table maps `id % slots` and resets when another id takes the slot. dt clamped to 0.25 s, zero on pause or rewind.
- Open: the dog has the same defect (`DOG_DECL` in `rigShaderGlsl.ts`: `a = uTime * aDog.x + aDog.y`, omega written in `peopleMeshes.ts`). Not fixed. Same `GaitPhase` can be reused (key by dog owner id).
- Not seen: close-up look by eye, real-GPU behaviour.

## Update 2026-11-12 (T-0022 near and far people meshes)
- Decision: each age group has a far mesh (`pedestrians-<kind>`, `meshes.bodies`) and a near mesh (`pedestrians-near-<kind>`, `meshes.nearBodies`). Both use the current model and materials; they share geometry attribute objects (`peopleSets.ts shareGeometry`, no second GPU upload) and own only the instanced attributes. Routing is `lod.ts NearClassifier` (enter at `nearRadiusM`, leave at `+ nearHysteresisM`, cap `nearMaxInstances` per group, first come in list order). Per-person writing moved to `peopleSets.ts` (`writePerson`) so both sets use one code path.
- Trap, camera lag: `update()` has no camera. The camera position is captured in `onBeforeRender` (`readCamera`), so classification uses the previous frame's camera. Until the first perspective render everything is far (determinism and unit tests rely on this). Shadow passes use orthographic cameras and are ignored.
- Trap: consumers of `bodies` now see only the far set. Anything that must count or follow all people sums `bodies` and `nearBodies`. `tests/smoke/closeup.mjs` follows the near mesh when it has instances.
- Knobs (trafficLife.ts, parity entries, TUNING.md rows): `nearRadiusM` 30, `nearMaxInstances` 64, `nearHysteresisM` 4.
- Draw calls: up to +4 (near meshes with count 0 still issue a call in three only if rendered; measure with smoke).

## Update 2026-11-12 (T-0023 near body model)
- Decision: `buildPerson(kind, detail)` with `detail` `'far'` (unchanged, 376 triangles, checksum-tested in `tests/peopleNear.test.ts`) or `'near'` (`personShapeNear.ts`, 1312 triangles for every age group). Both read `personDims.ts` (joint heights, widths, stoop), so hip, shoulder, neck, seatDrop and headTop are identical and one material per age group (built from the far model) serves both sets. The near set owns its geometry (T-0022's shared-buffer trick is gone: the near geometry differs).
- New primitive `RigBuilder.loft(cx, rings, sides, topCap, bottomCap)`: elliptical rings with smooth normals from neighbouring ring points. Used for limbs (8 sides), pelvis and torso (10), coat (12), neck, hair, hat, scarf, beard. Head is a 12x8 ellipsoid, ears small ellipsoids, hands palm plus fingers plus thumb boxes, shoes sole plus heel plus upper loft plus toe-cap ellipsoid.
- Seams: each limb ring ends inside the next part (torso starts inside the pelvis, shin top ring inside the thigh, neck inside head and torso, hand top inside the sleeve). No equal planes.
- Trap: face quads were placed at a fixed z for the 6x4 head. On the 12x8 head they would be buried, so near face quads take z from the ellipsoid surface at each vertex (`zAt`) plus a few millimetres. T-0024 replaces them with a shader face; remove `zAt` then.
- Trap: far shape numbers moved into `personDims.ts`; the far checksum test guards that nothing shifted.
- Cost: near minus far is 936 triangles per person. Worst case with every near mesh full (64 per group, 4 groups) is 239,616 extra triangles in the main pass and the same again in the shadow pass, about 479,000 in total on top of the T-0020 baseline of 2,377,993.
- Not seen by eye on real hardware.

## Update 2026-11-12 (T-0024 near face shader)
- Decision: `createPersonMaterials(model, uniforms, near)`. The near variant sets `defines.PERSON_NEAR`, its own cache key `person-rig-near-v1`, and appends `rigShaderFace.ts` (vertex `setFace`, fragment `faceColour`). The far material is the original program (`person-rig-v4`, no define). Depth materials are unchanged. Near materials are in the night emissive list and in dispose.
- Face: drawn on part 9 region SKIN from head-local q = (vPatPos - uHeadC) / uHeadR; vPatPos is the pre-rig model position, so the face follows nod and stoop. `PersonModel.head` (centre with stoop shift, radii) comes from the shapes. Painted only where q.z > 0.5 (front). 2D shapes in q.xy with soft edges (no derivatives): eye white, iris (five colours by phase hash), pupil, highlight, lid rim, brow (hair colour, tilt and thickness per person), nostrils, lips (redder for women), moustache by flag 1024. Near geometry lost the eye, pupil, brow, mouth and moustache quads (1312 -> 1296 triangles); nose wedge and ears stay.
- Blink and gaze: period `trafficLife.blinkIntervalS` (4 s) times 0.6 to 1.4 by hash of `aGait.y`, per-person offset, 0.15 s. Gaze drift is 12 percent of eye size.
- Trap: the moustache part (id 22) has no near geometry now; `partShows` still gates it harmlessly.
- Seen by eye (software GL, 3 m): eyes with irises (blue, brown), brows (white on elders, black on children), elder and teen faces read well, no face on the sides or the back. Lips are subtle at 3 m.

## Update 2026-11-12 (T-0025 near surface shading)
- Decision: near material only (`PERSON_NEAR`, key `person-rig-near-v3`, far stays `person-rig-v4`; a test checks the far sources hold none of the new identifiers). New file `rigShaderSurface.ts`:
  - AO: `setSurface()` in the vertex shader makes `vSurf.z` from part id, region and model height (s = hip height / 0.95): chin and neck base, hair and hat undersides, crotch, inner thighs, inner upper arm, shoe tops and soles, torso bottom against the coat flare. Diffuse is multiplied by `1 - 1.6 * aoStrength * occ`.
  - Cloth: weave (two sine stripes, pitch about 6 mm) plus coarse hash on regions TOP, PANTS, ACCENT, shin and sleeve unless bare; faded between 4 and 14 m; fold darkening at the elbow (1.14 s) and knee (0.51 s) heights. It runs before `patternColour`, so dots, hearts and stripes stay on top. Scaled by `clothDetail`.
  - Rim: `pow(1 - n.v, 2.5) * 3` added to `reflectedLight.indirectDiffuse`, coloured by `hemisphereLights[0].skyColor` and `directionalLights[0].color` (both pre-multiplied by intensity, so it follows the day and night light level). Scaled by `rimStrength`.
- Knobs (trafficLife.ts, parity, TUNING.md): `aoStrength` 0.35, `rimStrength` 0.25, `clothDetail` 0.5. First pass at the brief's gains was invisible, so the shader gains were raised (weave 0.2 and 0.16, rim x3, AO x1.6); the knobs keep the brief's defaults.
- Trap: `vViewPosition` is not declared where `#include <common>` sits in the fragment shader, so helpers take the distance as an argument and the call site in main passes `length(vViewPosition)`.
- Cost, rough: vertex +about 60 ALU per near vertex (3,888 vertices per person); fragment +about 40 ALU (sin x2, hash, pow, light colour reads) for near pixels only. At most 256 near instances. No GPU timing available.
- Seen by eye (software GL): weave reads as fine fabric at 3 m and fades by 14 m, AO and elbow or knee folds are subtle, rim is hard to see in overcast and rain, night shows no glow.
