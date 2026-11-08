# Harness engineering

How this repo is set up so that agents (the lead and the specialists) work correctly without being told each time.
The idea: the agent is only as good as the environment around it. Put the knowledge in the repo, make the rules
mechanical, and make every failure loud and cheap to see.

## The four parts

| Part | Where | Role |
|---|---|---|
| Map | `CLAUDE.md` | Short. Rules, verify commands, pointers. Loaded every session, so keep it short. |
| Records | `docs/` (`docs/REPO_MAP.md`, `docs/TUNING.md`, `docs/AUDIO.md`, `docs/agents/`) | The system of record. Facts and decisions live here, not in chat. |
| Guards | `tests/` (see below) | Rules that cannot be broken silently. A rule that is only in prose will drift. |
| Feedback loop | Hook, `npm run check`, CI | Three layers, see "Enforcement" below. Only failures are printed. |

## Enforcement

| Layer | Where | When it runs | Output on success |
|---|---|---|---|
| Edit hook | `.claude/settings.json` (`PostToolUse`, matcher `Edit\|Write`) | After each Edit/Write of a `.ts`/`.tsx` file under `src/` or `tests/`: runs `npx tsc --noEmit` | Silent |
| Full check | `package.json` script `check` (`tsc --noEmit && npm run lint && vitest run && vite build`) | On demand, before a commit or merge | Silent except the failing step |
| CI | `.github/workflows/ci.yml` | Push and pull request on `dev` and `master`: `npm ci`, `npm audit --omit=dev --audit-level=high` (gating), then `npm run check` (Node 20, npm cache). Also `drift.yml`, `evals.yml`, `pr-checklist.yml` | Job log; fails on any step |

- The hook exits 2 on a type error, so the error text goes back to the agent. Other edits (docs, CSS, JSON) do not trigger it.
- The hook costs about 8 s per relevant edit (`tsc --noEmit`, measured on this repo). Vitest is not in the hook: the full suite is too slow for every edit; run `npm run check` or the targeted tests instead.
- The hook runs under Git Bash on Windows, with `tsc` run in `CLAUDE_PROJECT_DIR`. Its command has no backslashes: Windows paths are normalised in JS. Backslashes in the command were lost when Node spawned Git Bash.
- CI has been written but not yet run on GitHub. Treat its first run as unverified until it passes.

## Guards

| Guard | File | Rule |
|---|---|---|
| Core and store layering | `tests/layers.test.ts` | core imports only core; store does not import city, weather, scene, ui |
| Tuning parity | `tests/tuningParity.test.ts` | every knob is in `src/config/tuning/`, documented in `docs/TUNING.md`, no duplicates |
| Dependency direction | `tests/harness.test.ts` | feature modules, core and store never import `scene` or `ui` (type imports included) |
| Determinism | `tests/harness.test.ts` | no `Math.random` in layout code (core, store, city, streets, buildings, traffic, life, environment, agentRoom) |
| No network | `tests/harness.test.ts` | no `fetch`, XHR, WebSocket or EventSource in `src`; fetch and EventSource only in `src/agentRoom/bridgeClient/` (ADR 0013) |
| localStorage | `tests/harness.test.ts` | only `src/ui/SoundMixer.tsx` and `src/ui/sectionState.ts` use `localStorage` (per-viewer UI state) |
| File size | `tests/harness.test.ts` | 350 lines max per `.ts`/`.tsx` file under `src/`, enforced as a ratchet (`tests/` not covered) |
| Docs point at files | `tests/harness.test.ts` | backticked paths in `CLAUDE.md` and this file exist |
| Performance budgets | `tests/budget.test.ts` | triangle, shadow and draw-call limits on a seeded city |
| Settings hook | `tests/harness.test.ts` | the Edit/Write hook is present in `.claude/settings.json` (skipped in CI: `.claude/` is gitignored locally) |
| Agent Room layers | `tests/layers.test.ts` | agentRoom layer direction |
| Ownership and ADRs | `tests/harness.test.ts` | every `src` folder is in the owner table or REPO_MAP; ADR sections present |
| Workflow records | `tests/harness.test.ts` | task records, handoff template, claims and briefs well-formed |
| Evals and CI | `tests/harness.test.ts` | eval cases, PR template, drift check, workflow shape, CODEOWNERS |
| Duplicate lists | `tests/tuningParity.test.ts` | `HOUSE_PRESETS` and `MONUMENT_KINDS` lists have no duplicates |

## File size ratchet

Files over 350 lines are recorded in `OVERSIZED` in `tests/harness.test.ts` with their current count.

- A new file over 350 lines fails.
- A listed file that grows past its recorded count fails.
- A listed file that gets to 350 lines or fewer fails until its entry is deleted.

To shrink a file, split it by responsibility (no behaviour change) and lower or remove its entry. Do not raise a number.

## Adding a rule

1. Write the rule in one sentence in `CLAUDE.md` or the relevant handbook.
2. Add the check to `tests/harness.test.ts` (or a new `tests/*.test.ts`) so that it fails on violation.
3. Run the guard on the current tree. If existing code breaks it, fix the code in the same change, or record the
   exception with a reason next to the rule. An exception without a reason is not allowed.
4. Add the guard to the table above.

## When a guard fails

- Read the message: it names the file and the rule.
- Fix the root cause. Do not weaken the guard, skip it, or add a file to an allowlist to make it pass.
- Only the size ratchet's `OVERSIZED` map is edited as a normal part of the work (lower the count or delete the entry).

## Known gaps (not yet automated)

- Frame time, rebuild time and visual quality are measured by hand in connected Chrome (see `docs/agents/architect.md`).
- Audio is checked by tests and by ear. No automated loudness check.
- CSS size is not guarded. `src/ui/panels.css` is now a 12-line @import index over `src/ui/panels/*.css`. Keep each panel file small.
- Owner files: the ownership guard checks that each `src` folder appears in the owner table or REPO_MAP, not each file.
- `src/film/**` is not in the dependency guard (`FEATURES` in `tests/harness.test.ts`). `src/film/autoPath.ts` and `autoRun.ts` import from `src/scene`. Code fix pending.
- `Math.random` outside the determinism guard dirs: `src/scene/useTownFrame.ts`, `src/ui/HousePanel.tsx`. Decide per owner.

## Layout

| Path | Role |
|---|---|
| `harness/README.md` | This file: guards, enforcement, known gaps |
| `harness/config/policies.json` | Task states, transitions, retry policy, approval gates (data) |
| `harness/config/quality-gates.json` | Gate commands and acceptance rules by change type (data) |
| `harness/scripts/check-claims.mjs`, `drift-check.mjs`, `run-evals.mjs` | Claim check, drift check, eval runner |
| `harness/briefs/`, `harness/state/claims.json` | Specialist briefs and the claim ledger |
| `harness/config/quality-gates.json` | Gate commands in order, acceptance rules by change type (data) |
| `harness/workflows/` | WORKFLOW.md (lifecycle), feature-development, bug-fix, release |
| `harness/tasks/` | Task records: backlog, active, completed; TEMPLATE.md |
| `harness/state/` | Handoffs (`handoffs/`) and what state means (`README.md`) |
| `harness/scripts/` | verify.mjs (gates, failures only), collect-evidence.mjs, validate-task.mjs |
| `harness/runs/` | Result file per verify run (not committed) |
| `harness/evals/` | Regression and test-case folders (empty) |

Human summary of acceptance: `docs/ACCEPTANCE.md`. Architecture and coding rules stay in `docs/`.
