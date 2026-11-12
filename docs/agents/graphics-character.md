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

## Update 2026-11-12 (T-0026 hair and skin, near)
- Decision: new `rigShaderHair.ts` (near only, key `person-rig-near-v6`; far stays `person-rig-v4`, the identifier test in `peopleLod.test.ts` now also checks `uHairK`, `uSkinK`, `hairColour`, `skinTint`). `vSurf.w` (from `setSurface`) marks hair (1, region HAIR) and skin (2, region SKIN, bare shins, short sleeves).
- Hair: strand noise (stretched hash, fine across and coarse along model y, +/- 19 percent at hairSheen 1, faded 3 to 9 m) before the face stage; Kajiya-Kay-like band from `directionalLights[0].direction`, the view vector and an upright tangent, added to indirect diffuse (Lambert ignores direct specular), tinted by hair colour, gain `0.3 + 2.2 * luminance` so grey and blond shine more than black, coloured by the sun colour so it follows the light level.
- Skin: cheek and nose blush, darker ears and neck crease (head-local q, applied BEFORE `faceColour`, so eyes, brows, lips stay crisp); warm grazing edge `pow(1 - n.v, 3)` from sky and sun colour with a more saturated skin colour. The warm colour is a monotonic function of each channel, so the order of skin palette luminance holds (no separate test, nothing factored out).
- Knobs: `hairSheen` 0.6, `skinWarmth` 0.6 (meaningful range 0 to 1.5, 1 = strong; the shader gains were raised after a first pass that was invisible, as in T-0025).
- Cost, rough: fragment +about 35 ALU on hair and +about 30 on skin pixels (hash x2, pow x2, sqrt), near only; vertex +3. No GPU timing.
- Seen by eye (software GL, 3 m): blush on pale faces, a warm edge on dark skin that is a little orange at the highest gain, elder faces warm, hair highlight faint on dark hair; hair strands are too small on screen to judge at 3 m.

## Update 2026-11-12 (T-0032 joint seams)
- Bug: thigh and upper arm ended in open tubes at the knee and elbow pivots; the shin and forearm swing about them (up to 1.45 rad sitting, 0.9 chatting), so a bend opened a see-through wedge (seen in `rain-elder-3m.png`).
- Test first: `tests/peopleJoints.test.ts` rotates the open end (rim) of the upper limb about the pivot (aRig.zw of the lower limb, stoop shift included) in the lower limb's frame, both directions, and casts a ray from the pivot through each rim point; the farthest crossing of the lower limb's triangles must reach the rim point (2 mm slack). It failed for both detail levels before the fix (every age group, both sexes) and passes now. It covers knees and elbows; hip and shoulder were not tested (upper-arm top is closed, thigh top sits inside the pelvis).
- Fix, no new parts: the shin and forearm run above the pivot and are closed on top. Far: shin box up to knee + 0.058 m (top 0.1135 W wide, 0.1225 deep), forearm box up to elbow + 0.045 m. Near: shin loft with a ring at the knee and one 0.065 m above (radii a little above the thigh end) plus top cap, forearm the same at 0.045 m. A swept rim stays inside such a prism or cylinder. The lower limb is a few millimetres proud of the upper one at the joint (small knee and elbow step), by design.
- Numbers: far 376 -> 384 triangles, near 1296 -> 1328, equal for all four age groups. Far checksums re-recorded in `tests/peopleNear.test.ts` (adult 70527.2836, child 45450.398, elder 73187.0221, teen 61400.13). Pivots, part ids and regions unchanged.
- Seen by eye (3 m, rain elder and day adult): no white wedge at knees or elbows; a slight step at the knee. Hip and shoulder swing by eye not checked.

## Update 2026-11-12 (T-0027 idle micro-animation)
- Design: `idleMath.ts` is the single source. It holds the constants, the TypeScript mirror `idleOffsets(time, phase, pose, amps)` and `idleGlsl()`, which builds the GLSL helper functions (`idleBreath`, `idleShift`, `idleYaw`, `idlePitch`, `idleArm`, `idleFidget`, `idleFidgetSide`) from those constants; `PERSON_DECL` includes the result. SYNC RULE: if a formula changes, change the TS function and the template in `idleGlsl()` together; `tests/peopleIdle.test.ts` checks bounds on the mirror and that `PERSON_DECL` contains the generated GLSL, but it cannot run GLSL.
- Terms in `applyRig` (shared by far, near and depth): pose 0 (walking) gets exact zeros (all idle terms are `+ 0.0` or skipped, so walking is bit-identical); pose 1 (stand, and a walker that stopped) gets everything; pose 2 (chat) and 3 (sit) only breathing. Breathing lifts the upper body 0 to `idleBreathMm` (torso fades in from hip to shoulder; legs and coat stay). Weight shift moves everything above the legs sideways by up to `idleShiftMm`; the leg that loses the weight swings forward by `5 rad/m * shift` and its knee flexes 2x as much, which keeps the foot planted (tested: foot drift under 4 mm, rise under 3 mm). Head glance yaws about the vertical axis through the neck (new `rotHeadYaw`) by up to `idleGlanceDeg`, pitch 0.4 of that. Arms drift by `idleArmRad`; every 9 to 15 s one forearm bends 0.1 rad for 1 s. All terms use `uTime` and `aGait.y`, so people are out of sync.
- Knobs: `idleBreathMm` 4, `idleShiftMm` 6, `idleGlanceDeg` 8, `idleArmRad` 0.03 (meaningful maxima 8, 10, 15, 0.1 are the test limits). Uniform `uIdle` (vec4) is per material.
- Cache keys bumped: far `person-rig-v5`, near `person-rig-near-v7`, depth `person-rig-depth-v5`. The far program changed by design; the far-has-no-near-identifiers test still holds.
- Cost, rough: standing people +about 60 ALU per vertex (10 sin, hash x4, 2 rotations), seated and chatting about +8, walking one branch. No GPU timing.
- Tool: `CLOSEUP_IDLE=1 npm run smoke:closeup` follows an idle person (aGait.z 1, else 2 or 3) at 3 m and saves `idle-1..4.png` to the OS temp dir. The person is keyed by ground position (`shot.stick` in `closeupHook.mjs`, re-selected every render among all people meshes, because the list order changes); if it starts walking the run locks on another. `window.__closeup.simTime()` reads uTime. Trap: software GL frames advance sim time by seconds each, so frames are far apart in sim time and breathing (4 s) is aliased; use several shots, not a smooth sequence.
- Seen by eye (same standing person in two shots about 10 s of sim time apart): legs straight, feet planted, no lift or slide; head yaw differs a few degrees between the shots (face turned a bit more in the second); arms hang with a small different offset; no clipping. Breathing (4 mm) and the fidget are below what a single frame shows.
- Fix (review): the relaxed leg is the one the pelvis shifts away from (left parts at +x); tested in peopleIdle.test.ts.

## Update 2026-11-12 (T-0028 gait mechanics)
- Design: `gaitMath.ts` is the single source, as `idleMath.ts` is: constants, the TS mirror (`gaitBody`, `gaitAnkle`, `gaitAnkleUnit`, `gaitLegSway`) and `gaitGlsl()` (uniforms `uGait` vec4 and `uGaitHead`, functions `gaitAnkleUnit`, `gaitAnkleY`, `gaitBody`), included in `PERSON_DECL`. SYNC RULE: change a formula in both; `tests/peopleGaitMech.test.ts` checks the mirror, that `PERSON_DECL` contains the generated GLSL, and the geometry, but cannot run GLSL. `applyRig` grew only 5 lines (264 -> 269). Everything is gated by `walk` (pose 0): idle, chat and sit are untouched.
- Terms (all times the person's `amp`, phase `a = aGait.x + aGait.y`): pelvis yaw `-yaw * sin a` (pelvis part and coat), torso, arms, head and carried items counter-twist `+twist * sin a` (the torso blends from the pelvis value at the hip to the torso value at the shoulder), sideways sway `-sway * cos a` of everything above the legs (the legs sway with it at the hip and fade to 0 at the ankle, so feet stay put and the thigh tops stay inside the pelvis), ankle roll on the shoe vertices (region FIXED of the shin parts, rotated about the ankle pivot at 0.08/0.95 of the hip height): toe up `ss` at heel strike, plantar `1.667 * ss^2` at toe-off (the 1.667 is a hidden gain, stated in the TUNING row; T-0034 replaced it by 0.41), and head stabilisation (head twist times `1 - stabilise`, bob cancelled by `stabilise`).
- Knobs: `gaitPelvisYawDeg` 3, `gaitPelvisSwayMm` 8, `gaitTorsoTwistDeg` 4, `gaitAnkleDeg` 12, `gaitHeadStabilise` 0.6.
- Cache keys: far `person-rig-v6`, near `person-rig-near-v8`, depth `person-rig-depth-v6`.
- Geometry: near shoe upper widened (0.05 / 0.048 W half-width, 0.072 deep) and capped (near 1328 -> 1344 triangles) so the shin end stays covered at the largest ankle flexion; the test `ankle joint coverage` is the same ray method as `peopleJoints.test.ts`. Far shoe needed no change.
- Planted foot: superseded by T-0034 (see its section below). Before T-0034 the world-frame slip over stance (mean |ground speed| / walking speed, 1.3 m/s) was adult 0.75, child 0.48, elder 0.68, teen 0.97.
- Cost, rough: walking vertices +about 30 ALU (sin, mix, smoothstep, one rotation for the head and body, one more for foot vertices); no GPU timing.
- Seen by eye (3 m, day, adult, child, elder; single frames only): feet show toe-up and plantar roll, no hip pop, no leg crossing, no limb clipping. Motion cannot be judged from single frames.
- T-0028 review fixes: (1) sway is now `-sway * cos a` (left leg in stance when cos a < 0, mid-stance at a = pi, pelvis farthest toward it there), in `gaitBody`, `gaitLegSway` and the GLSL; pelvis yaw stays on `sin a`. (2) The torso twist now reaches full strength 60 percent of the way from the hip to the shoulder (`GAIT_MECH.torsoBlend`, `gaitTorsoWeight`, same constant in the GLSL), so the torso beside the hanging arms turns with them; before, the arm turned fully while the torso at the same height turned only partly. (3) New clearance tests in `tests/peopleGaitMech.test.ts`: thigh to thigh at the widest sway (far and near, all ages, both sexes; the legs sway together so the gap does not change), and arm to torso in the frame that turns with the torso (near only, gap stays at least 3 mm; the far torso is one box with corner vertices only, whose sheared corner extents say nothing about the flat side beside the arm, so far is not covered by this test). The knob defaults were not changed.

## Update 2026-11-12 (T-0034 stride fit, grounded bob)
- Metric (pure TS, `tests/peopleGaitMech.test.ts` `walkChain`): world-frame ground speed of the lowest sole point (heel or toe) through ankle, knee, hip and bob, mean of |speed| over the stance half cycle (cos a < 0), divided by the walking speed (1.3 m/s); 0 is a planted foot, signed negative means it slides backward.
- Result, mean |slip| / v, before (T-0028 shader) -> after: adult 0.75 -> 0.047 (women 0.049), child 0.48 -> 0.063, elder 0.68 -> 0.053 (0.056), teen 0.97 -> 0.040 (0.042). Target 0.15. The test asserts it for both sexes, and that the old swing chain is above 0.3 so the test can fail.
- What changed (single source `gaitMath.ts`, GLSL generated, `rigShaderGlsl.ts` 264 -> 275 lines): (1) thigh amplitude = mix(old 0.55 amp, `asin(cycle / (4 L))`, `gaitStrideFit`), L the leg length in the world from the hip height and the instance scale (`length(instanceMatrix[0].xyz)`), cycle from a per-material `uStride` (men, women); so the backward sweep over stance equals the step length. Adult 0.37 rad (was 0.55), teen 0.38 (0.61), elder 0.27 (0.36), child 0.60 (0.50). (2) thigh profile = mix(eased sine, triangle `asin(sin x) 2/pi`, `gaitStanceFlat`), so the stance foot moves back at constant speed (a gain alone left mean slip near 0.44). Both knobs default 1; 0 and 0 gives back the old swing. (3) The ankle now turns the foot back by the thigh angle (and 0.8 of the knee flexion): the foot pitch in the world is the heel-strike, flat, toe-off curve, clamped to +/- 0.5 rad relative to the shin. Plantar flexion at toe-off is 0.41 of the toe-up angle (was 1.667, i.e. 20 degrees): with a rigid foot (ankle 0.08, heel -0.07, toe 0.17) both feet reach the ground at double support only if 0.08 + 0.07 phiH = 0.08 + 0.17 phiT; 20 degrees would need a bent knee. (4) Bob: the body is lowered so the lower of the two feet touches the ground (`gaitBob`): highest at mid-stance, lowest at double support (checked in the test: extremes within 20 degrees of a = pi and a = pi / 2; amplitudes 22 to 78 mm; the old bob was `abs(sin a)`, a quarter cycle off and lifting the feet). `bobK` and the `childBobK` knob were removed in T-0034 (aGait2.w is reserved, written 0).
- Known limit: a stance foot can float a few cm at the end of stance when the leading foot reaches farther down than the trailing one (children up to about 25 mm); neither foot is ever below the ground (test, 5 mm). Head stabilisation still cancels the bob with the same sign (bob is now a lowering, the head is lifted back).
- Cache keys: far `person-rig-v7`, near `person-rig-near-v9`, depth `person-rig-depth-v7`. Cost, rough: walking vertices +about 150 ALU (two feet x two sole points x three rotations, asin, pow-free); no GPU timing.
- Side effect to watch: adult, teen and elder strides are visibly shorter (the old swing overshot the step length by 28 to 54 percent); the child stride is longer. Knobs `gaitStrideFit` and `gaitStanceFlat` go back toward the old look.
