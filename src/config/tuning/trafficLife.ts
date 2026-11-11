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
  /** People LOD: a person closer than this to the camera (3D, metres) draws from the near mesh set. Close-ups are 3 to 25 m (traffic/people/lod.ts). */
  nearRadiusM: 30,
  /** People LOD: most near instances per age group; the rest draw from the far set (traffic/people/lod.ts). */
  nearMaxInstances: 64,
  /** People LOD: a near person leaves the near set only beyond nearRadiusM plus this margin, metres, so the border does not flicker (traffic/people/lod.ts). */
  nearHysteresisM: 4,
  /** Child walk: metres per full gait cycle (two steps), both sexes. Longer than before = slower cadence; feet keep pace with speed (traffic/people/personGeometry.ts). */
  childStrideCycleM: 1.425,
  /** Child walk: leg and arm swing amplitude multiplier, 1 = adult swing (traffic/people/personGeometry.ts). */
  childSwingAmp: 0.9,
  /** Child walk: swing ease 0-1; 0 is a plain sine, higher dwells longer at the turnaround (traffic/people/rigShader.ts). */
  childSwingEase: 0.35,
  /** Child walk: knee bend multiplier in the swing phase, 1 = adult (traffic/people/rigShader.ts). */
  childKneeK: 1.3,
  /** Child walk: arm counter-swing multiplier, 1 = adult (traffic/people/rigShader.ts). */
  childArmK: 0.8,
  /** Child walk: hip and body bob multiplier at step rate, 1 = adult (traffic/people/rigShader.ts). */
  childBobK: 1.6,
  /** Child walk: gait-rate wobble as a fraction of speed (0.05 = plus or minus 5 percent), render only (traffic/walkers/resolve.ts). */
  childCadenceWobble: 0.05,
  /** Metres ahead of the junction centre where a vehicle picks its manoeuvre (traffic/vehicles/constants.ts). */
  decideDistanceM: 40,
  /** Seconds a pedestrian must hold a vehicle on green before it honks (traffic/vehicles/constants.ts). */
  hornPedHoldS: 5,
  /** Horns queued at once in the city before new ones are dropped (traffic/vehicles/constants.ts). */
  hornQueueMax: 8,
  /** Smoothed deceleration, m/s^2, below which a braking vehicle counts as braking hard (traffic/vehicles/constants.ts). */
  hornHardBrakeMps2: -3,
  /** Cruise speed of a car, m/s (traffic/vehicles/constants.ts VEHICLE_SPECS). */
  carCruiseMps: 11,
  /** Cruise speed of a bus, m/s (traffic/vehicles/constants.ts VEHICLE_SPECS). */
  busCruiseMps: 8,
  /** Cruise speed of a truck, m/s (traffic/vehicles/constants.ts VEHICLE_SPECS). */
  truckCruiseMps: 9,
  /** Cruise speed of a motorbike, m/s (traffic/vehicles/constants.ts VEHICLE_SPECS). */
  motorbikeCruiseMps: 13,
  /** Pigeon scare radius in XZ, metres: vehicles and pedestrians this close scatter pigeons (life/birds.ts). */
  scareRadiusM: 4,
  /** Birds per flock loop at quality factor 1 (life/birds.ts FLOCK_DEFS). */
  flockBirdsPerLoop: 25,
  /** Altitude of the three flock loops, metres, in flock order (life/birds.ts FLOCK_DEFS). */
  flockAltM: [26, 35, 44],
  /** Speed of the three flock loops, m/s, in flock order (life/birds.ts FLOCK_DEFS). */
  flockSpeedMps: [9, 10.5, 8.5],
  /** Gulls at high quality (life/birds.ts). */
  gullsHigh: 2,
  /** Gulls at low quality (life/birds.ts). */
  gullsLow: 1,
  /** Share of the butterfly count that becomes bees, 0-1 (life/pets.ts beeCountFor). */
  beeShare: 0.2,
} as const;
