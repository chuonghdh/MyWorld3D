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
| Delivery | `harness/workflows/delivery.md`, `harness/config/policies.json` | Request in, merged pull request to `dev` out. What the agent may do alone is data (`autonomy`). ADR 0014. |

## Enforcement

| Layer | Where | When it runs | Output on success |
|---|---|---|---|
| Edit hook | `.claude/settings.json` (`PostToolUse`, matcher `Edit\|Write`) | After each Edit/Write of a `.ts`/`.tsx` file under `src/` or `tests/`: runs `npx tsc --noEmit` | Silent |
| Full check | `package.json` script `check` (`tsc --noEmit && npm run lint && vitest run && vite build`) | On demand, before a commit or merge | Silent except the failing step |
| CI | `.github/workflows/ci.yml` | Push and pull request on `dev` and `master`: `npm ci`, `npm audit --omit=dev --audit-level=high` (gating), then `npm run check` (Node 20, npm cache). Job `smoke`: `npm run build`, then `npm run smoke` (headless Chromium: console errors, non-blank canvas day and night, renderer counts). Also `drift.yml`, `evals.yml`, `pr-checklist.yml` | Job log; fails on any step. A failing drift or eval run opens a GitHub issue labelled `harness` (one open issue per title), which the improve loop picks up |
| Git guard (enforced once the hook is applied by the human) | `harness/scripts/guard-git.mjs`, as a `PreToolUse` hook on `Bash` in `.claude/settings.json` | Before each Bash call: blocks `git commit` on `dev` or `master`; a `git push` that is not `origin task/...` (bare, `HEAD`, refspec, force); `gh pr create` without `--base dev`; `gh pr merge` with `--admin` or on a pull request whose base is not `dev`; `git switch` that discards work | Silent; exit 2 with one line on a block |
| Permissions (enforced once applied by the human) | `.claude/settings.json` (`permissions.allow`, `permissions.deny`) | Every Bash call: the pipeline's commands run without a prompt; force push, push to `master` or `dev`, refspec pushes, `git reset --hard`, `git stash`, `git checkout --`, `git branch -D` and `gh pr merge --admin` are denied | Silent |
| Policy | `harness/config/policies.json` (`autonomy`) | Read by the lead at Land and Escalate (`harness/workflows/delivery.md`) | None: data, guarded by `tests/delivery.test.ts` |

- The hook exits 2 on a type error, so the error text goes back to the agent. Other edits (docs, CSS, JSON) do not trigger it.
- The hook costs about 8 s per relevant edit (`tsc --noEmit`, measured on this repo). Vitest is not in the hook: the full suite is too slow for every edit; run `npm run check` or the targeted tests instead.
- The hook runs under Git Bash on Windows, with `tsc` run in `CLAUDE_PROJECT_DIR`. Its command has no backslashes: Windows paths are normalised in JS. Backslashes in the command were lost when Node spawned Git Bash.
- CI has been written but not yet run on GitHub. Treat its first run as unverified until it passes.
- `.claude/agents/`, `.claude/skills/` and `.claude/settings.json` are tracked in git (ADR 0014), so hooks, agent definitions and skills reach CI and cloud sessions. The rest of `.claude/` is local. Agent definitions and skills load at session start. The skills are on demand only (`disable-model-invocation`).
- An agent session may not edit `.claude/settings.json` (the permission classifier refuses it). The git guard hook and the permission lists are proposed by the architect and applied by the human. Until then `tests/delivery.test.ts` fails on the permissions check, and the git rules are held by policy and workflow only.
- The guard hook command has no backslashes and runs from the project directory. Its decision is the pure function `decideGit` (unit-testable). It fails open on an unreadable payload. Its limits are listed once, under "Known gaps".
- The permission lists match command prefixes and cannot read a pull request's base; the git guard does that part.

## Guards

| Guard | File | Rule |
|---|---|---|
| Core and store layering | `tests/layers.test.ts` | core imports only core; store does not import city, weather, scene, ui |
| Tuning parity | `tests/tuningParity.test.ts`, `tests/agentRoomTuning.test.ts` | listed knobs match their parity values; knob names unique across sections; duplicate lists. Not guarded (review only): the `docs/TUNING.md` row and the config doc line for each knob |
| Dependency direction | `tests/harness.test.ts` | feature modules, core and store never import `scene` or `ui` (type imports included) |
| Determinism | `tests/harness.test.ts` | no `Math.random` in layout code (core, store, city, streets, buildings, traffic, life, environment, agentRoom) |
| No network | `tests/harness.test.ts` | no `fetch`, XHR, WebSocket or EventSource in `src`; fetch and EventSource only in `src/agentRoom/bridgeClient/` (ADR 0013) |
| localStorage | `tests/harness.test.ts` | only `src/ui/SoundMixer.tsx` and `src/ui/sectionState.ts` use `localStorage` (per-viewer UI state) |
| File size | `tests/harness.test.ts` | 350 lines max per `.ts`/`.tsx` file under `src/`, enforced as a ratchet (`tests/` not covered) |
| Docs point at files | `tests/harness.test.ts` | backticked paths in `CLAUDE.md` and this file exist |
| Performance budgets | `tests/budget.test.ts` | triangle, shadow and draw-call limits on a seeded city |
| Settings hook | `tests/harness.test.ts` | the Edit/Write hook is present in `.claude/settings.json` (tracked since ADR 0014) |
| Delegated delivery | `tests/delivery.test.ts` | agent definitions and skills exist and are well-formed; the delivery workflow has its eight sections; `autonomy` policy ids; permission allow and deny lists; backlog records (priority, type); `.gitignore` tracks the three `.claude/` paths; drift and eval workflows open an issue on failure |
| Agent Room layers | `tests/layers.test.ts` | agentRoom layer direction |
| Agent registry | `tests/agentRegistry.test.ts` | spawn ids are read from the spawn result; a registered subagent binds to its specialist before the delegation queue; SendMessage to a registered id routes to it |

**Agent registry process (2026-11-09).** Each Agent spawn writes `{agentId, name, subagent_type, description}` to `harness/runs/agent-registry.json` (gitignored) through a PostToolUse hook (`.claude/settings.json`, matcher `Agent`, runs `tools/agent-bridge/registry.mjs`). The bridge serves it at `GET /registry`; the room loads it before the live feed. Backfill from a session transcript: `node tools/agent-bridge/registry.mjs --backfill <session.jsonl>`. Hooks load at session start: after adding the hook, restart Claude Code (or reload hooks) before expecting new records.
| Ownership and ADRs | `tests/harness.test.ts` | every `src` folder is in the owner table or REPO_MAP; ADR sections present |
| Workflow records | `tests/harness.test.ts` | task records, handoff template, claims and briefs well-formed |
| Evals and CI | `tests/harness.test.ts` | eval cases, PR template, drift check, workflow shape, CODEOWNERS |
| Duplicate lists | `tests/tuningParity.test.ts` | `HOUSE_PRESETS` and `MONUMENT_KINDS` lists have no duplicates |
| Dependency sync | `tests/depsSync.test.ts` | installed direct dependencies match `package-lock.json`. After any dependency bump, or pulling a merge that changes `package-lock.json`, run `npm install`, delete `node_modules/.vite`, and restart Vite. |

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

Each actionable gap is a backlog record (`node harness/scripts/next-task.mjs`); the id is in brackets.

- Frame time, rebuild time and visual quality are measured by hand in connected Chrome (see `docs/agents/architect.md`). Console errors, a blank canvas and renderer counts are covered by `npm run smoke` (T-0010); frame time on real hardware stays manual.
- Audio is checked by tests and by ear. No automated loudness check. [T-0019]
- CSS size is not guarded. `src/ui/panels.css` is now a 12-line @import index over `src/ui/panels/*.css`. Keep each panel file small. [T-0018]
- Owner files: the ownership guard checks that each `src` folder appears in the owner table or REPO_MAP, not each file.
- `src/film/**` is not in the dependency guard (`FEATURES` in `tests/harness.test.ts`). `src/film/autoPath.ts` and `autoRun.ts` import from `src/scene`. Code fix pending. [T-0012]
- `Math.random` outside the determinism guard dirs: `src/scene/useTownFrame.ts` (the call in `src/ui/HousePanel.tsx` is gone, 2026-11-11). [T-0011]
- Delivery: the first end-to-end run of the deliver skill, the issue step in `drift.yml` and `evals.yml`, and the permission lists in a fresh session are not verified yet. The git guard hook is not verified as a live hook (only by hand, with sample payloads).
- `master` and `dev` have no GitHub branch protection. The real hold on `master` is GitHub branch protection, which the human must switch on; the local guard and deny list are a net against mistakes, not a security boundary.
- Git guard known limits (closed list, also at the top of `harness/scripts/guard-git.mjs`). Not parsed: `bash -c`, eval, aliases, scripts, a variable as the program name (`$G push`), substitutions inside an unquoted heredoc body; `sudo -u git git ...` (only the first git or gh word of a command is read); unknown value-taking git global options; other worktrees (`git -C`, a `cd` to another worktree); local-only ref moves (`git fetch . a:dev`, `git checkout -B dev`).
- Scheduled drift and eval runs execute from the default branch (`master`) only. Their issues report the state of `master`, not `dev`, until the release.

## Layout

| Path | Role |
|---|---|
| `harness/README.md` | This file: guards, enforcement, known gaps |
| `harness/config/policies.json` | Task states, transitions, retry policy, autonomy (agent may, human-only, land conditions), approval gates (data) |
| `harness/scripts/check-claims.mjs`, `drift-check.mjs`, `run-evals.mjs`, `next-task.mjs`, `guard-git.mjs` | Claim check, drift check, eval runner, backlog order and next task id, git guard hook |
| `harness/briefs/`, `harness/state/claims.json` | Specialist briefs and the claim ledger |
| `harness/config/quality-gates.json` | Gate commands in order, acceptance rules by change type (data) |
| `harness/workflows/` | WORKFLOW.md (lifecycle), delivery (request to merged pull request, improve loop), feature-development, bug-fix, release |
| `harness/tasks/` | Task records: backlog (with priority and type), active, completed; TEMPLATE.md |
| `.claude/agents/`, `.claude/skills/` | Agent definitions (nine specialists and the reviewer) and the deliver and improve skills |
| `harness/state/` | Handoffs (`handoffs/`) and what state means (`README.md`) |
| `harness/scripts/` | verify.mjs (gates, failures only), collect-evidence.mjs, validate-task.mjs |
| `harness/runs/` | Result file per verify run (not committed) |
| `harness/evals/` | Regression and test-case folders (empty) |

Human summary of acceptance: `docs/ACCEPTANCE.md`. Architecture and coding rules stay in `docs/`.
