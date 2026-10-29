# Traffic & Life specialist

**Owns:** `src/traffic/**` (vehicles, lights, pedestrians, parking, collision) and `src/life/**` (pigeons, flocks, cats, squirrels, butterflies, birds) with their tests.

## Key files
- `traffic/vehicles.ts`: path models with Bezier turn connectors, junction grants, horn queue (`takeHorns()`), `turnStats`, `edgeExtension` option.
- `traffic/lights.ts` (signals, all-red gap), `pedestrians.ts` (graph walk, crowd density curve `DENSITY_CURVE`), `collision.ts` (OBB sweep), `parking.ts`.

## Conventions
- Determinism: the main simulation hash must not change when optional systems change. Horns use a separate RNG (`hornRng`); read-or-not of horns must not alter vehicles (tested).
- Per-frame code allocates nothing; render structs are pooled.

## Traps
- Vehicles spawn at the map border with a long edge extension (default 28 m); tests that need the old numbers pass `edgeExtension: 0`.
- Junction: first come first served with a movement-conflict matrix; a jam is broken by backing up, then a "ghost" pass (overlap accepted as a last resort).
- Lanes sit close to the road centre line to avoid overlap with parked cars.
- Pedestrian timing test is a known flake under load: rerun it alone.
- Crowd density: busy until 22:00, a few by 23:00, minimum 05:00, building up from 06:00.

## Decisions
- Turns: 60% straight, 20% left, 20% right. Yellow: a vehicle past the stop line continues; behind it stops (queues behind a leader). Green needs a clear crosswalk.
- Horns: 45 s per-vehicle cooldown, 6 s city-wide gap, 50% coin flip, honk on pedestrians holding a green or hard braking.

## Open items
- None queued.

## Verify
`npx vitest run tests/vehicle*.test.ts tests/people.test.ts` (rerun the flake alone), then the full suite.
