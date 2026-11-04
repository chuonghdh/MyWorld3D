/** Traffic & Life: density, vehicle speeds and turns, walkers, life counts. */
export const trafficLife = {
  /** Lowest time-of-day density, 0-1: the quiet floor 23:00-05:00 (traffic/trafficDensity.ts). */
  densityFloor: 0.2,
  /** Active vehicle cap per lane path at trafficMultiplier 1 (traffic/vehicles/constants.ts). */
  vehiclesPerPath: 2,
  /** Shortest gap between spawn attempts at one spawn point, seconds (traffic/vehicles/constants.ts). */
  spawnMinS: 4,
  /** Longest gap between spawn attempts at one spawn point, seconds (traffic/vehicles/constants.ts). */
  spawnMaxS: 10,
  /** Junction turn odds: chance a vehicle turns left (traffic/vehicles/constants.ts). Straight is the rest. */
  turnLeftChance: 0.2,
  /** Junction turn odds: chance a vehicle turns right (traffic/vehicles/constants.ts). */
  turnRightChance: 0.2,
  /** Speed through a left turn, m/s (traffic/vehicles/constants.ts). */
  leftTurnSpeed: 5.5,
  /** Speed through a right turn, m/s (traffic/vehicles/constants.ts). */
  rightTurnSpeed: 4.5,
  /** Minimum gap between horns of one vehicle, seconds (traffic/vehicles/constants.ts). */
  hornCooldownS: 45,
  /** Minimum gap between horns in the whole city, seconds (traffic/vehicles/constants.ts). */
  hornGlobalGapS: 6,
  /** Share of honk situations that actually honk, 0-1 (traffic/vehicles/constants.ts). */
  hornChance: 0.5,
  /** Share of walkers that get a dog, 0-1 (traffic/walkers/constants.ts). */
  dogShare: 0.22,
  /** Pigeons at quality factor 1, high tier (life/birds.ts). */
  pigeonCount: 80,
  /** Cats at quality factor 1, high tier (life/pets.ts). */
  catCount: 14,
  /** Squirrels at quality factor 1, high tier (life/pets.ts). */
  squirrelCount: 10,
  /** Butterflies and bees at quality factor 1, high tier (life/pets.ts). */
  butterflyCount: 30,
  /** Film carrier bird: preferred distance from the film camera, metres (life/filmBird.ts). */
  filmBirdDistanceM: 7,
  /** Film carrier bird: closest it may come to the film camera, metres; never cuts into the view (life/filmBird.ts). */
  filmBirdMinDistanceM: 3,
  /** Film carrier bird: scale of the flyer model (life/filmBird.ts). */
  filmBirdScale: 2.6,
} as const;
