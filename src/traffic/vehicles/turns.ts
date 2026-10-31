// Choice of manoeuvre at a junction: straight, left or right, renormalised over the moves that exist.

import type { PathModel, Vehicle } from './types';
import { TURN_LEFT_CHANCE, TURN_RIGHT_CHANCE, DECIDE_DISTANCE } from './constants';
import type { VehicleSystem } from '../vehicles';

/** Rolls the manoeuvre for the next junction once the vehicle is close enough to it. */
export function decideTurn(sys: VehicleSystem, pm: PathModel, v: Vehicle): void {
  let pass: { junction: number; sCentre: number } | null = null;
  for (let i = 0; i < pm.passes.length; i++) {
    if (pm.passes[i].sCentre - 3 > v.s) {
      pass = pm.passes[i];
      break;
    }
  }
  if (!pass || v.decided === pass.junction || pass.sCentre - v.s > DECIDE_DISTANCE) return;
  v.decided = pass.junction;
  v.plan = -1;
  const roll = sys.rng();
  // A junction a block merge left with fewer arms, or the closed end of this lane: choose only among the
  // moves that exist, with the 60/20/20 split renormalised over them (straight is impossible at a closed end).
  const closedEnd = !pm.endOpen && pass.sCentre >= pm.length - 3;
  if (closedEnd || sys.armCount[pass.junction] < 4) {
    sys.decideAmongAllowed(pm, v, pass.junction, roll, !closedEnd);
    return;
  }
  if (roll < 1 - TURN_LEFT_CHANCE - TURN_RIGHT_CHANCE) {
    sys.turnCounts.straight++;
    return; // straight on
  }
  const want = roll < 1 - TURN_RIGHT_CHANCE ? 'left' : 'right';
  for (let i = 0; i < pm.turns.length; i++) {
    const t = pm.turns[i];
    if (t.junction === pass.junction && t.turn === want) {
      v.plan = t.model;
      v.planEntryS = t.entryS;
      sys.turnCounts[want]++;
      return;
    }
  }
  sys.turnCounts.straight++; // wanted a turn that does not exist here
}
