/** Traffic & Life, walkers: crowd caps, density per road, pairs and crossing timing (traffic/walkers/constants.ts). */
export const trafficWalkers = {
  /** Hard cap on walkers. Walkers plus dogs never exceed 600 rendered instances. */
  maxWalkers: 480,
  /** Hard cap on dogs (traffic/walkers/constants.ts). */
  maxDogs: 120,
  /** Walkers per road segment at trafficMultiplier 1 at full density (traffic/walkers/constants.ts). */
  walkersPerRoad: 22,
  /** Share of walkers that walk as a pair, 0-1 (traffic/walkers/looks.ts). */
  pairChance: 0.2,
  /** Seconds of red that must remain after a crossing is finished (traffic/walkers/movement.ts). */
  crossMarginS: 2.0,
  /** Seconds after which a waiting walker turns back (traffic/walkers/movement.ts). */
  giveUpWaitS: 150,
} as const;
