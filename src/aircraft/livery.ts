// Airline liveries: a deterministic pick per flight. The fuselage is white; the tail fin, engine cowls and a
// belly stripe change. Colours are linear-ish RGB triples that go straight into instance attributes.

export type Rgb = readonly [number, number, number];

export interface Livery {
  fin: Rgb;
  engine: Rgb;
  belly: Rgb;
}

const WHITE: Rgb = [0.93, 0.94, 0.96];
const GREY: Rgb = [0.6, 0.62, 0.66];
const RED: Rgb = [0.78, 0.1, 0.1];
const BLUE: Rgb = [0.1, 0.3, 0.78];
const GREEN: Rgb = [0.1, 0.52, 0.25];
const ORANGE: Rgb = [0.95, 0.48, 0.08];
const TEAL: Rgb = [0.04, 0.52, 0.55];
const SILVER: Rgb = [0.7, 0.72, 0.76];
const NAVY: Rgb = [0.05, 0.09, 0.26];

export const LIVERIES: readonly Livery[] = [
  { fin: WHITE, engine: GREY, belly: WHITE }, // all white
  { fin: WHITE, engine: WHITE, belly: WHITE }, // all white, white cowls
  { fin: RED, engine: RED, belly: WHITE },
  { fin: BLUE, engine: BLUE, belly: WHITE },
  { fin: GREEN, engine: GREEN, belly: WHITE },
  { fin: ORANGE, engine: ORANGE, belly: WHITE },
  { fin: TEAL, engine: TEAL, belly: WHITE },
  { fin: SILVER, engine: SILVER, belly: WHITE },
  { fin: NAVY, engine: NAVY, belly: WHITE },
  { fin: NAVY, engine: GREY, belly: RED }, // coloured belly stripe
  { fin: ORANGE, engine: WHITE, belly: ORANGE },
  { fin: TEAL, engine: GREY, belly: TEAL },
  { fin: BLUE, engine: WHITE, belly: BLUE },
];

/** Deterministic livery for flight `flightId` under `seed`. */
export function liveryFor(seed: number, flightId: number): Livery {
  let h = Math.imul(seed | 0, 2654435761) ^ Math.imul(flightId | 0, 40503);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  h ^= h >>> 16;
  return LIVERIES[(h >>> 0) % LIVERIES.length];
}
