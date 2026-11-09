/** City & Streets: lamp and tree spacing, pine knobs, light timing, monument share. */
export const cityStreets = {
  /** Floors per street class, inclusive [min, max] (city/blocks.ts). */
  floorRange: { avenue: [5, 7], street: [3, 6] },
  /** Share of buildable blocks that are public buildings (monuments), 0-1. Exact per seed: round(blocks x share), min 2 (city/monuments.ts). */
  monumentShare: 0.2,
  /** Metres of path per traffic spawn point at trafficMultiplier 1 (city/spawnPoints.ts). */
  trafficSpawnSpacing: 60,
  /** Traffic light cycle: seconds per phase and total cycle (city/trafficPlan.ts). */
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
  /** Share of conifer spots that get a pine, 0-1 (streets/natureLayout.ts). */
  pineShare: 0.6,
  /** Pine snow cover ramp start and full, as upward normal y (streets/natureTypes.ts, used by streets/natureAsset.ts). */
  pineSnowUp: [0.85, 0.97],
  /** Maximum snow on pines, 0-1 (streets/natureTypes.ts, used by streets/natureAsset.ts). */
  pineSnowCover: 0.35,
  /** City tree scale on top of the layout scale, multiplier (streets/natureTypes.ts). */
  treeScale: 1.35,
  /** Extra leaf clusters per broadleaf tree, fraction (streets/natureGeometry.ts). */
  clusterExtra: 0.5,
  /** Width of the tree border belt from the town edge, metres (streets/natureLayout.ts). */
  borderDepth: 6,
  /** Brightness spread of asphalt per 24 m block, 0-1 (streets/streetWear.ts). */
  roadBlockTone: 0.04,
  /** Fine aggregate speckle strength on asphalt, 0-1 (streets/streetWear.ts). */
  roadAggregate: 0.05,
  /** Extra lightness of worn asphalt patches, 0-1 (streets/streetWear.ts). */
  roadWornLift: 0.2,
  /** Darkness of oil stains on asphalt, 0-1 (streets/streetWear.ts). */
  roadOilStain: 0.16,
  /** Darkness of faint patch seam lines on asphalt, 0-1 (streets/streetWear.ts). */
  roadPatchSeam: 0.12,
  /** Darkness of the joints between stone pavers on pavement, 0-1 (streets/streetWear.ts). */
  pavingJoint: 0.16,
  /** Width of the joints between stone pavers, metres (streets/streetWear.ts). */
  pavingJointWidth: 0.012,
  /** Darkness of faint edge wear along each paver, 0-1 (streets/streetWear.ts). */
  pavingEdgeWear: 0.05,
  /** Brightness spread from stone to stone on pavement, 0-1 (streets/streetWear.ts). */
  pavingStoneTone: 0.05,
  /** Share of pavers that take an accent colour (about 1 in 20), 0-1 (streets/streetWear.ts). */
  pavingAccentShare: 0.05,
  /** Accent paver colours: warm grey, light grey-brown, pale ochre-grey, low contrast (streets/streetWear.ts). */
  pavingAccentColours: ['#b3aca4', '#a79d90', '#b7b09a'],
  /** Darkness of grime at the base of kerb faces, 0-1 (streets/streetWear.ts). */
  pavingGrime: 0.22,
  /** Darkness of scuffed pavement, 0-1 (streets/streetWear.ts). */
  pavingWear: 0.07,
  /** Darkness of bicycle tyre tracks (a thin pair, 0.55 m apart) on pavement, 0-1 (streets/streetWear.ts). */
  pavingBikeTrack: 0.07,
  /** Darkness of pedestrian footprint traces on pavement, 0-1 (streets/streetWear.ts). */
  pavingFootprint: 0.08,
  /** Darkness of dirty stains on pavement, 0-1 (streets/streetWear.ts). */
  pavingStain: 0.12,
  /** Darkness of gum-like spots on pavement, 0-1 (streets/streetWear.ts). */
  pavingGumSpot: 0.12,
  /** Darkness of dry puddle rings on pavement, 0-1 (streets/streetWear.ts). */
  pavingPuddleMark: 0.05,
  /** Darkness of dirt grouped in zones per 24 m block, 0-1 (streets/streetWear.ts). */
  pavingDirtZone: 0.06,
  /** Share of paint lost in worn spots, 0-1 (streets/streetWear.ts). */
  paintWear: 0.6,
  /** Uniform dimming of lane and crossing paint, 0-1 (streets/streetWear.ts). */
  paintFade: 0.12,
} as const;
