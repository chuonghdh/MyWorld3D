# Feature: Video camera (film recording)

Status: plan only. Branch `feature_video_camera` (from `dev`). No code written, nothing committed.
Owner of this plan: lead (orchestrator). Specialist input: Technical Architect, UI & Camera, Audio, Traffic & Life (handbook sections dated 2026-11-04).

## 1. Goal

A camera button in the time bar, next to the photo button. It opens a picker with two modes:

- **Manual film:** the user drives the camera. The app records the city in real time, 1 s to 60 s of real time.
- **Auto film:** a simulated bird flies a fixed route and the app records it. The route is 30 s of real time.

Output: MP4 (H.264), 1080p by default or the window size (4K removed in this build). Works on desktop and phones. Files are downloaded (no save dialog).

## 2. Decisions (from the user)

| Topic | Decision |
|---|---|
| Format | MP4 (H.264) |
| Resolution | 1080p default, or the window size. No 4K option in this build (P1 follow-up). 1080p comes from Scene & QA's resize bridge |
| Manual length | Real time, 1 to 60 s. No mapping to game time: 30 s real is 30 s of film, whatever the game clock does |
| Auto length | 30 s real. The route covers 30 virtual minutes when game time is running; the game clock is frozen when the user chose a fixed time |
| Sun / moon | Not strict. Bird looks up toward the sun or the moon; if both are up, prefer the moon |
| Bird | Not a model. The bird is a camera carrier only (no visible bird mesh, no bird sounds) |
| Sound | No bird sounds in the film. Zoom attenuation is off while filming. Film sound follows the user's volume settings |
| Pause | Recording while paused is allowed: the picture freezes and there is no sound |
| Tilt-shift | Recorded as the user sees it |
| Manual ending | User presses stop (1 to 60 s limit) |
| Auto ending | Bird perches facing the cathedral, holds a few seconds, then stops. Segment durations are fitted so the whole route is exactly 30 s |
| Save | Plain browser download. No save dialog |
| Phones | Enabled. The camera button is always visible. If the browser cannot record, the picker shows the reason and Start is disabled |
| While filming | Only the 3D view (camera move and rotate) and the REC chip stay on screen. Settings, time bar, Move blocks, block edit, selection panels and help are hidden, and restored on stop or cancel. Block picking stays locked; Space (pause) stays allowed |
| Branch | `feature_video_camera`. Commits only when the user asks |

## 3. Architecture

### 3.1 Recording pipeline (Technical Architect)

- **Manual (real time):** `canvas.captureStream` + MediaRecorder. Audio: a MediaStream tap after the limiter (`src/audio/index.ts`, limiter at about line 66), so the user's volumes, Sound and Music switches apply.
- **Auto (deterministic two-pass):**
  1. Pass 1: dry-run the scene at a fixed step of 1/30 s through a new `runtime.fixedDt` override. Record poses and audio frame snapshots at 20 Hz. No rendering to video.
  2. Pass 2: step the simulation per frame (`state.advance(t)`), render, and encode with `VideoEncoder` (H.264) and a lazily loaded MP4 muxer chunk. Audio is re-rendered with `OfflineAudioContext` from the recorded snapshots.
- **Fallback:** if `VideoEncoder.isConfigSupported` fails, use MediaRecorder for manual, and hide auto (its audio needs the offline path).
- Capture reads the canvas in the same frame (as `ScreenshotRequest.tsx` does), because `preserveDrawingBuffer` is false.

### 3.2 Resolution and sharpness

- Film renders at pixel ratio 1 with the chosen size (1080p or the window size). Optional 2x supersampling only on the high tier after measurement.
- 4K is not offered in this build (the picker has no 4K option). The GPU memory note (about 265 MB for the HalfFloat MSAA target) stays as a reason to keep it out of phones.
- No 4K detection in this build. If 4K returns, it needs a frame-time measurement and a deny-list, decided in a new phase.
- Shadow frustum already tightens with zoom (`townShadow.ts`).
- Budgets in `tests/budget.test.ts` stay unchanged: main triangles <= 1.9 M, shadow <= 605 k, draw calls <= 140 (about 132 measured). The bird adds at most one draw call and is only present in film mode.

### 3.3 Camera and bird (UI & Camera, Traffic & Life)

- New pure module `src/scene/filmPath.ts`: keyframes and a Catmull-Rom spline for position and look-at, arc-length parametrised, ease in and out, capped speed. No randomness, no wall-clock time.
- Driver `src/scene/FilmRig.tsx`: owns the camera while filming. `CameraRig` skips orbit and clip updates while the film is active (as it does in street mode), then tweens back when the film ends.
- Bird: a dedicated carrier (`src/life/filmBird.ts`), not the pigeon or flock systems (those are stateful with per-frame RNG). It returns position and heading from the path. Its look is a plain flyer mesh drawn with the existing `flyer` material key. It never casts shadows and never enters the traffic or pedestrian lists.
- Route (30 s real, fitted segments):
  1. High overview above the town.
  2. Circle the town inside `townBounds`.
  3. Circle the Gothic cathedral (`gothic-cathedral` monument, lot from `city/blocks.ts`).
  4. Descend along a deterministic street (seeded choice among straight segments with enough length and clearance), skimming close to the road.
  5. Tilt up and look toward the sun or moon (`sun.ts` direction helpers), staying inside the town.
  6. Fly back and perch on a house in the block opposite a monument, with the camera looking at that monument. The monument is the cathedral when it is present (monument entrance is on +z, apply the lot rotation). If the town has no monument, the bird perches on a house at the central intersection and looks down at it. Flight speed is slow: the route is paced for smooth offline audio, not for speed.
  7. Hold a few seconds looking at the cathedral, then stop.
- Height floor: `y >= floor(x, z) + clearance`. Roof heights come from the building pieces (roof geometry), not from the layout.

### 3.4 Clocks

- Film runs on its own clock: each rendered frame advances the film time by 1/fps (manual is 1/fps of real frames; auto is fixed-step). Wall time is not used for auto.
- Game clock during film:
  - Auto with running game time: 30 s real = 30 virtual minutes.
  - Auto with fixed time: the game clock is frozen at the chosen time for the whole film.
  - Manual: game clock runs as the user has it (not mapped).
- `useTownFrame.ts` (dt) and `PostFX.tsx` (own dt) must use the same film clock.

### 3.5 Audio (Audio)

- Film bird has no sound. Nature and wind sounds follow the normal listener rules.
- Listener override for film: smooth transitions, no jump at the 8 m street switch (`listener.ts`), and the 45 m aerial gate becomes a fade with hysteresis instead of a step.
- Zoom attenuation (`math.ts`, `zoomAttenuation`) is disabled while filming.
- Manual recording tap after the limiter. Auto audio via the offline re-render (decided: more work, exact result). Because of this the auto flight is slow, so the offline audio stays smooth.
- Suspended AudioContext: recording starts only from a click (existing init pattern). A state change to suspended stops recording and shows a message.

### 3.6 UI (UI & Camera)

- `src/ui/FilmButton.tsx` (button next to `PhotoButton`) and `src/ui/FilmPicker.tsx` (Manual / Auto, duration slider for manual, resolution shown, Start). `TimeBar.tsx` is 325 lines, so the new code lives in its own files.
- Phone window: `COUNT` in `TimeBar` goes from 5 to 6. The picker is a bottom sheet on narrow screens.
- While recording: REC chip, elapsed time, Stop. Canvas-only capture, so UI overlays are not in the video.
- Store: film state is transient in `UiToggles` (`store/model.ts`) and is not saved. No change to `io.ts` needed for v1.
- While recording, everything except the 3D view and the REC chip is hidden (`html.mw-filming` in `src/ui/film.css`: time bar, settings, Move blocks, block edit, selection panels, help) and restored on stop or cancel. Block picking and selection also stay locked in code. Space (pause) stays allowed.

## 4. Tuning knobs

New section `src/config/tuning/film.ts`, re-exported from `index.ts`. Each knob gets a line in `docs/TUNING.md` and an entry in `tests/tuningParity.test.ts`.

| Knob | Default | Meaning |
|---|---|---|
| `autoSeconds` | 30 | Auto film length, real seconds |
| `autoVirtualMinutes` | 30 | Game minutes covered by an auto film when game time runs |
| `manualMinSeconds` / `manualMaxSeconds` | 1 / 60 | Manual length limits, real seconds |
| `fps` | 30 | Frame rate |
| `resolution1080` | 1920x1080 | Output size (1080p). No 4K option in this build |
| `skyTiltDeg` | to be measured | How far the bird looks up |
| `perchHoldSeconds` | 3 | Hold at the cathedral before stop |
| `cruiseClearanceM` | to be measured | Height above the roof floor |
| `streetClearanceM` | to be measured | Side clearance on the descent street |

Values marked "to be measured" are set in phase P5 with screenshots and frame timing.

## 5. Phases

| Phase | Work | Acceptance |
|---|---|---|
| P0 | Spec: keyframes, knobs, parity entries, roof-height query design | Agreed with user |
| P1 | Manual real-time recording (MediaRecorder path to MP4 where supported), picker, REC chip | 30 s clip, no DOM in frame, silent at zero volume, clap-marker sync within 40 ms, tsc / vitest / build green |
| P2 | Fixed-step dry run for auto (no render) | Two runs with the same seed give identical pose and audio hashes |
| P3 | Encoder and muxer for auto; lazy-loaded chunk | Frame count = duration x fps; file decodes; chunk loads only when used |
| P4 | Offline audio re-render | Same audio hash across runs; within 1 dB of live; group volumes respected |
| P5 | Auto path and bird | Path tests (start height, cathedral radius, skim height, perch faces the front); bird adds at most one draw call |
| P6 | Sharpness check | Side-by-side frames at three zoom levels in connected Chrome; budgets unchanged |
| P7 | UI polish, cancel, HMR cleanup | No live encoder or offline context after cancel or unmount |
| P8 | QA | `npx tsc --noEmit`, `npx vitest run` (rerun the pedestrian flake alone), `npx vite build`; low tier at 720p; phone check |

Verification limits: the built-in browser pane cannot paint frames. Visual and timing checks run in connected Chrome. Phone behaviour is not yet tested on hardware.

## 6. Tests

- `tests/film/filmPath.test.ts` (node): no NaN across seeds; endpoints match waypoints; samples inside bounds minus margin; `y >= floor + clearance`; step <= max speed x dt; tangent continuity; determinism; sun below horizon gives the moon.
- Film clock: auto frame count equals `autoSeconds x fps`; game minutes covered equal `autoVirtualMinutes`.
- Audio: listener step per 1/60 s bounded across 7.5 to 8.5 m and 44 to 46 m; ground gate ramp endpoints; suspended context makes update a no-op; distance gain monotone along the path.
- Store: film state is not in `exportLayout`.
- Budgets: `tests/budget.test.ts` unchanged.
- Offline: peak below 0.5 and no NaN in the offline render (run in the dev page).

## 7. Risks and mitigations

| # | Risk | Likelihood / impact | Mitigation |
|---|---|---|---|
| 1 | Frame drops during real-time manual recording | M / M | 30 fps cap; 720p on low tier; auto uses the deterministic path |
| 2 | Encoder not supported on some browsers (notably iOS Safari) | M / M | Feature-detect; hide the button and say why; MediaRecorder fallback for manual |
| 3 | Memory growth: unclosed VideoFrames, MSAA targets | M / H | Close frames; cap the encode queue; dispose targets; no 4K on phones |
| 4 | Non-determinism: `Math.random` in lightning and audio | H / M | Film-only seeded RNG; determinism test on the dry run |
| 5 | HMR leaks (recorder, offline context, audio tap) | M / M | Dispose in `dispose()` and `import.meta.hot.dispose`; reset `runtime.fixedDt` |
| 6 | Shader cache keys | M / M | Reuse existing keys; versioned key for any new patch; warm up when the picker opens |
| 7 | Phone performance unknown | H / H | Blind spot: no phone tested yet. 720p preset; measure with `__r3f` before enabling 4K |
| 8 | Audio drift in real-time capture | M / M | Clap-marker test; report measured drift |
| 9 | Shimmer when zoomed out | M / M | Mipmaps; audit anisotropy (only `signs/atlas.ts` sets it today); supersampling only if measured |
| 10 | Draw-call headroom (140 cap, about 132 used) | M / H | Bird is one mesh, present in film mode only |
| 11 | Aerial quiet frame hides film audio above 45 m | H / M | Film exemption; gate becomes a fade |
| 12 | Snapshot memory for the two-pass path | M / M | Sample at 20 Hz; store only fields the audio reads |
| 13 | Cathedral facade orientation not verified in code | M / L | Check the monument `Site` in `buildings/monuments/culture.ts` before scripting the perch |
| 14 | Clipping into buildings and trees on descent | M / H | Clearance check on the chosen street; height floor from roof heights; tree clearance margin |
| 15 | Near / far planes at low altitude | M / M | Compute near from the nearest surface; far >= 1200 m in film |
| 16 | Aircraft (up to 300 m) crosses the bird | L / L | Visual only; accepted |
| 17 | Pause during manual recording | L / L | Frozen picture, no sound (decided) |
| 18 | Tab hidden during recording (rAF stops, audio runs) | M / M | Stop recording when the tab is hidden and say so |

## 8. Open items (to confirm before code)

Resolved by the user:

1. Monument missing or merged: the perch rule in 3.3 step 6 applies. With a monument, perch opposite it and look at it. With no monument, perch on a house at the central intersection and look down at it.
2. Roof heights come from the building pieces.
3. Auto film with fixed game time: the game clock is frozen for the whole film.
4. 4K: removed from this build (P1 follow-up). Output is 1080p or the window size.
5. Auto-film audio: offline re-render, with a slow flight.
6. Scene & QA owns `FilmRig.tsx`, `filmPath.ts`, and the clock change in `useTownFrame.ts` and `PostFX.tsx`.

No open items remain. Code starts only after the user approves this plan.

## 9. Token measurement

Method and running log: `feature_video_camera token log` in the session scratchpad. Subagent tokens are exact (from each agent's report). Lead tokens are estimates, because the harness does not report them exactly. The planning phase used 452,893 subagent tokens across 4 agents.

## 10. Conventions

- Code, comments and docs in English. Chat in Vietnamese.
- Commit only when the user asks.
