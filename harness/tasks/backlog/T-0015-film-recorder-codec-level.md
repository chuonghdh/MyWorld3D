---
id: T-0015-film-recorder-codec-level
title: Manual film recorder: H.264 level fits 1080p
status: proposed
owner: scene-qa
branch: dev
created: 2026-11-11
priority: P3
type: bug
---

# T-0015: Manual film recorder: H.264 level fits 1080p

## Spec

- Goal: `src/film/recorder.ts:29` asks MediaRecorder for `avc1.42E028`; `src/film/autoEncoder.ts:10` uses `avc1.640028`. Architect notes (2026-11-04, 2026-11-09) flag the recorder string as too low a level for 1920x1080. Confirm the profile and level bytes against the H.264 codec string rules first, then make the recorder ask for a level that fits `film.width1080` x `film.height1080`, with a test.
- Source: `docs/agents/README.md`, open item 4. Symptom: Chrome may reject the MP4 option or fall back to WebM without saying so. Not reproduced.
- Files in scope: `src/film/recorder.ts`, `tests/film/recorder.test.ts`, `docs/agents/scene-qa.md`.
- Out of scope: the auto encoder, the muxer, film knobs.

## Acceptance

- [ ] `npm run check`
- [ ] A test pins the codec string and states the level it encodes
- [ ] Human check: a 1080p manual recording in connected Chrome is an MP4 that plays. Mark as not verified if not done.

## Checkpoints

- 2026-11-11: recorded as proposed by the architect (T-0009 backlog seed). No work started.

## Handoff

- Next step: the improve skill picks it by priority; the lead writes the brief and the claims.
- Open questions: none.
