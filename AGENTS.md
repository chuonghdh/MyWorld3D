# Agent instructions (MyWorld3D)

For agent tools other than Claude Code. The same rules live in `CLAUDE.md`.

## Read first
1. `CLAUDE.md` (rules, verify commands, output style)
2. `docs/REPO_MAP.md` (where code lives, owners)

## Then, as needed
- `docs/ARCHITECTURE.md`: layers, data flow, determinism, rendering budget
- `docs/CODING_STANDARDS.md`: TypeScript, naming, file size, knobs, shaders
- `docs/adr/README.md`: accepted decisions (ADRs 0001 to 0014)
- `harness/README.md`: guards, hooks, check script, CI
- `harness/workflows/WORKFLOW.md`: task states, checkpoints, handoff, approval gates
- `harness/workflows/delivery.md`: request to merged pull request on `dev`, backlog, improve loop
- `docs/TUNING.md`: designer knobs and where they live
- `docs/AUDIO.md`: audio routing
- `docs/agents/README.md`: specialist owners and handbooks
- `harness/templates/brief.md` (delegation brief) and `harness/state/claims.json` (claimed globs for parallel work)

## Core rules
- Chat in Vietnamese. Code, docs and commits in English.
- Git: work on a task branch, land on `dev` by pull request. `master` and the other human-only items need the human (`harness/config/policies.json`, `autonomy`).
- Knobs only in `src/config/tuning/`. No `Math.random` in layout code. No network calls in `src`.
- Never weaken a guard test to pass. Fix the code.
- Before reporting: `npm run check`. Print only failures.
