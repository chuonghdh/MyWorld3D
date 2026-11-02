/** City & Streets: lamp and tree spacing, pine knobs, light timing, monument chance. */
export const cityStreets = {
  /** Floors per street class, inclusive [min, max] (city/blocks.ts). */
  floorRange: { avenue: [5, 7], street: [3, 6] },
  /** Share of blocks that become monuments, 0-1 (city/generate.ts). */
  monumentChance: 0.1,
  /** Metres of path per traffic spawn point at trafficMultiplier 1 (city/generate.ts). */
  trafficSpawnSpacing: 60,
  /** Traffic light cycle: seconds per phase and total cycle (city/generate.ts). */
  lightTiming: { cycleSeconds: 40, nsGreenSeconds: 16, ewGreenSeconds: 16, yellowSeconds: 2, allRedSeconds: 2 },
  /** Distance between street lamps along one sidewalk, metres (city/streetscape.ts). */
  streetLampSpacing: 18,
  /** Tree density per slot, by class, at streetTreeMultiplier 1. Trees are spread evenly: one per whole unit of running rate per sidewalk side (city/streetscape.ts). */
  treeRate: { avenue: 0.44, street: 0.44 },
  /** Fewest trees per courtyard (city/streetscape.ts). */
  courtyardTreeMin: 2,
  /** Most trees per courtyard (city/streetscape.ts). */
  courtyardTreeMax: 6,
  /** Footprint radius of a courtyard tree before its scale, metres, used as greenery obstacle (city/streetscape.ts). */
  courtyardTreeRadius: 1.5,
  /** Spacing of plaza trees along a plaza edge, metres (city/streetscape.ts). */
  plazaTreeSpacing: 8,
  /** Chance per plaza tree slot at multiplier 1 (city/streetscape.ts). */
  plazaTreeRate: 0.7,
  /** Chance a bench spot gets a bench, 0-1 (city/streetscape.ts). */
  benchChance: 0.6,
  /** Glow multiplier of street lamp glass at night (streets/index.ts). */
  lampGlassNightIntensity: 2.4,
  /** Traffic light lamp gain when lit (streets/index.ts). */
  signalOnGain: 2.2,
  /** Traffic light lamp gain when unlit (streets/index.ts). */
  signalOffGain: 0.1,
  /** Share of conifer spots that get a pine, 0-1 (streets/natureTrees.ts). */
  pineShare: 0.6,
  /** Pine snow cover ramp start and full, as upward normal y (streets/natureTrees.ts). */
  pineSnowUp: [0.85, 0.97],
  /** Maximum snow on pines, 0-1 (streets/natureTrees.ts). */
  pineSnowCover: 0.35,
  /** City tree scale on top of the layout scale, multiplier (streets/natureTrees.ts). */
  treeScale: 1.35,
  /** Extra leaf clusters per broadleaf tree, fraction (streets/natureTrees.ts). */
  clusterExtra: 0.5,
  /** Width of the tree border belt from the town edge, metres (streets/natureTrees.ts). */
  borderDepth: 6,
} as const;
