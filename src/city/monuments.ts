// Monument blocks: how many there are and which kinds, chosen with the layout seed. Pure.
import { buildings, cityStreets } from '../config/tuning';
import type { MonumentKind } from '../core/types';

// Block kind. The monument blocks are chosen per seed (chooseMonuments), not per block.
export const MONUMENT_SHARE = cityStreets.monumentShare;
/** Kinds every town has exactly once, on two seeded blocks. Other monument kinds fill the rest. */
const STANDARD_MONUMENTS: readonly MonumentKind[] = ['gothic-cathedral', 'city-hall'];

/**
 * Picks the monument blocks among `total` buildable blocks, with the layout RNG. The count is round(total * share),
 * raised to the two standard monuments on a small town and capped at total (so a town of fewer than 5 blocks
 * is not 1 in 5). The first two picks take the cathedral and the City Hall; every later pick takes a kind from the
 * rest of buildings.monumentKinds. Same seed and total, same picks.
 */
export function chooseMonuments(total: number, rng: () => number): { index: number; kind: MonumentKind }[] {
  const count = Math.min(total, Math.max(STANDARD_MONUMENTS.length, Math.round(total * MONUMENT_SHARE)));
  const order = Array.from({ length: total }, (_, k) => k);
  for (let k = total - 1; k > 0; k--) {
    const j = Math.floor(rng() * (k + 1));
    [order[k], order[j]] = [order[j], order[k]];
  }
  const others = buildings.monumentKinds.filter((k) => !STANDARD_MONUMENTS.includes(k));
  return order.slice(0, count).map((index, n) => ({
    index,
    kind: n < STANDARD_MONUMENTS.length ? STANDARD_MONUMENTS[n] : others[Math.floor(rng() * others.length)],
  }));
}
