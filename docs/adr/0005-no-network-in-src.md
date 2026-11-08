# ADR 0005: No network calls in src

Status: Accepted (2026-11-01); narrowed by ADR 0013 (2026-11-08): EventSource and fetch to the local bridge are allowed only in src/agentRoom/bridgeClient/

## Context
The app is a local, offline simulation. Network calls would add failure modes, privacy issues and a dependency on external services.

## Decision
No `fetch`, XHR or WebSocket in `src`. Persisted data is the JSON settings file (save and load) only. Guarded by `tests/harness.test.ts`.

## Consequences
- Models and other static files ship in `public/` (see ADR 0002).
- Any future online feature needs a new ADR that supersedes this one.
