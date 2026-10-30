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

- People morph: the male and female shapes must emit identical vertex counts and order (RigBuilder skips degenerate triangles, so any zero-size part breaks it; buildPerson throws). Only x/z may change: a depth change on the stooped elder torso turns into a height change (y), so torso depth is shared.
- Dog trail: a dog trailing its owner round a kerb could stand in the road. Fixed: candidate spots are tried until one is off the asphalt (test "never stands on asphalt" caught it).
- Child pairs: the adult (leader) walks at the child's own base pace, so the adult follows the child's speed, slow or fast. The child's rendered speed wobbles +-25 percent around it (render only, positions unchanged). Teen followers keep a x1.1 rate. Positions mirror the leader, so feet can slide.
- Pair ids are consecutive (follower id = leader id + 1), and a child is always a follower. The pace test relies on this.
- Hidden parts (other hair styles, garments, facial hair) are still drawn: each person is about 376 triangles in all four age groups (was 236). Hidden parts collapse to a point in the shader.

## Decisions
- People (2026 overhaul): four age groups (adult, teen, child, elder), one mesh each, sexes by morph (aMorph/aMorphN weighted by aLook2.z). Draw calls: main 6 to 7, shadow 5 to 6.
- Hair: 10 styles (crop, side parting with fringe, curly as the cap widened in the shader, bald, long, ponytail, bun, bob, long to the waist, pigtails). Elders mostly grey or white.
- Outfits: pure function of season, traits and two stable values (outfit.ts), so one set per season, no flicker. A coat (winter, or 60% of autumn walkers) recolours the top and sleeves in the accent colour and shows coat tails: a short flare from the waist to the upper thigh (part COAT, hem at hip minus 0.2 m), so trousers show below. The coat tails are not a skirt.
- Speeds (m/s): child 1.4-1.65, teen 1.4-1.6, adult men 1.15-1.43, women 1.08-1.36, elders 0.82-0.92 (women 0.78-0.88). Gait cycle shorter for children and elders.
- Pairs: elder couples, adult couples (opposite sex), parent+child, parent+teen, teen friends.
- No dresses and no ao dai: removed at the user's final decision. Women wear trousers and the coat tails; the dress and tunic shapes and their traits are gone.
- Hair for women (teens and up): 90 percent long (shoulder, waist, long bob, pigtails), 10 percent short (crop, side parting, curly, ponytail, bun). Children and men keep their own mix.
- Patterned tops: 70 percent of walkers, six patterns (dots, hearts, horizontal, vertical, checks, diagonal), drawn in the fragment shader from the model position: no textures or draw calls. Coats and bare sleeves stay plain.
- The avenue-versus-street density test averages six seeds. Seed 8 alone dropped to 1.08 after the look rules changed (others 1.2 to 1.4), and the threshold stays at 1.15.
- Determinism hash EXPECTED_PEDESTRIANS re-captured to '499b5c20' (intentional: looks, speeds, gait, dog fix, hair, pattern and child-pace rules, and the removed dress rolls).

## Block merges (phase 3, traffic)
- Lane paths: an end is open when it lies on the outermost junction of its grid line (vehicles.ts `pathOpenness`). A merge-cut end is closed: no edge extension, no spawn at a closed start, and a vehicle must turn at a closed end (`decideAmongAllowed`, straight weight 0). Without merges every end is open, so outputs and hashes are unchanged.
- Junction arms (`buildArms`): counted from the lane paths through a junction; an open path end counts as an arm toward the map edge. 4 arms: old logic and random draws untouched. 3 arms (T): signal kept, the 60/20/20 split renormalised over the moves that exist (through road 75/25). 2 arms (straight or bend): stop lines lose their light (empty lightId), so vehicles only yield to pedestrians on the crosswalk and to the junction grant.
- Turns into removed arms cannot happen: no lane path exists there, and `makeConnector` rejects targets that end at the junction.
- Parking: junctions beyond a road piece's ends are ignored; they made spans across the removed part. Output without merges is identical (checked against the old code for 5 seeds).
- Pedestrians: no code change needed. The graph comes from the remaining roads and crosswalks; the old street mouth on a boundary sidewalk becomes plain sidewalk. Doors on the merged block's new frontage sit up to about 1.5 m inside the old street area, so tests shrink the removed strips 2.5 m back from the remaining streets.
- Tests: `tests/blockMergeTraffic.test.ts` uses a 2x2 merge (block-2-2..3-3) and a 1x3 merge (block-1-0..1-2). It covers arms, signals, the renormalised split, closed ends, parking, and 20 simulated minutes without gridlock, with nobody on removed streets or on asphalt off a crosswalk.
- Open: signal heads are drawn by `src/streets/furniture.ts` (City & Streets) for all four arms at every remaining light. It should draw only real arms, and none at 2-arm junctions.

## Open items
- Verified only by eye at street level in one close-up (faces, hair cap). Coat tails, hair variety and the morph were not checked by eye after the latest changes.
- Per-person triangles could be cut by moving hair and garments into their own instanced meshes (more draw calls). Not done.

## Verify
`npx vitest run tests/vehicle*.test.ts tests/people.test.ts tests/blockMergeTraffic.test.ts` (rerun the flake alone), then the full suite.
