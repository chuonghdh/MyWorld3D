// Central tuning values (one source of truth). Index and owners: docs/TUNING.md.
// This module imports nothing except types from core; feature modules import it, never the reverse.

import type { HousePreset, MonumentKind } from '../core/types';

export type { HousePreset, MonumentKind, TreeSpecies, Season } from '../core/types';

/** Scene & QA: quality tiers, lighting gains, night bloom, shadow-side constants, cloud count. */
export const sceneQa = {
  /** Sun light brightness multiplier on the 0-1.2 sun-module scale (scene/townShadow.ts SUN_GAIN). */
  sunGain: 3.4,
  /** Sky fill (hemisphere) light multiplier (scene/townShadow.ts HEMI_GAIN). */
  hemiGain: 3,
  /** Ambient light multiplier (scene/townShadow.ts AMBIENT_GAIN). */
  ambientGain: 0.5,
  /** Night bloom for windows and lamps: strength, threshold and radius for night and day (scene/PostFX.tsx). */
  nightBloom: {
    /** Bloom strength at night, before the tier multiplier. */
    strengthNight: 0.5,
    /** Bloom strength by day, before the tier multiplier. */
    strengthDay: 0.15,
    /** Bloom luminance threshold at night. */
    thresholdNight: 0.7,
    /** Bloom luminance threshold by day. */
    thresholdDay: 0.92,
    /** Bloom radius at night. */
    radiusNight: 0.6,
    /** Bloom radius by day. */
    radiusDay: 0.4,
  },
  /** Graphics tiers (store/quality.ts QUALITY_PRESETS): pixel ratio cap, shadow map, bloom, MSAA, traffic factor. */
  qualityTiers: {
    /** Reference look: pixel ratio cap 2, shadow map 4096, full bloom, 4 MSAA samples, full traffic. */
    high: { dprMax: 2, shadowMap: 4096, bloom: 1, msaa: 4, traffic: 1 },
    /** Opt-in: pixel ratio cap 1.5, shadow map 2048, bloom 0.6, 4 MSAA samples, traffic 0.75. */
    medium: { dprMax: 1.5, shadowMap: 2048, bloom: 0.6, msaa: 4, traffic: 0.75 },
    /** Opt-in: pixel ratio cap 1, shadow map 1024, no bloom, 2 MSAA samples, traffic 0.5. */
    low: { dprMax: 1, shadowMap: 1024, bloom: 0, msaa: 2, traffic: 0.5 },
  },
} as const;

/** Buildings: lit-window shares, night emissive, lit colour, sign emissive, floor range, preset and monument lists. */
export const buildings = {
  /** Probability per pane that a house-facade window is lit (0-1). Default for facade/parts.ts. */
  litWindowShare: 0.35,
  /** Probability per window that a monument window is lit (0-1). monuments/kit.ts. */
  litWindowShareMonument: 0.35,
  /** Probability per ground-floor pane that it is lit (0-1). facade/ground.ts. */
  litWindowShareGround: 0.55,
  /** Probability per tower-lobby pane that it is lit (0-1). facade/ground.ts. */
  litWindowShareGroundAlt: 0.6,
  /** Probability per roof-level window that it is lit (0-1). facade/roof.ts. */
  litWindowShareRoof: 0.4,
  /** Night emissive multiplier for house walls and lit glass (materials.ts). */
  nightEmissive: 1.15,
  /** Colour of lit windows (hex, materials.ts). */
  litWindowColor: '#ffcf7a',
  /** Night emissive multiplier for shop signs (signs/index.ts). */
  signNightEmissive: 1.0,
  /** Minimum floors of a house (facade/layout.ts). */
  minFloors: 2,
  /** Maximum floors of a house (facade/layout.ts). */
  maxFloors: 8,
  /** House preset choices, in panel order (store and buildings re-export). */
  housePresets: [
    'as-block',
    'original-feuilles',
    'canal-amsterdam',
    'glass-tower',
    'brutalist-concrete',
    'bauhaus',
    'mediterranean',
    'brownstone-ny',
    'nordic-timber',
    'shophouse-asia',
  ] as readonly HousePreset[],
  /** Monument kinds, in panel order (store and buildings re-export). */
  monumentKinds: [
    'hospital',
    'stadium',
    'funfair',
    'swimming-pool',
    'dinosaur-park',
    'supermarket',
    'open-air-theatre',
    'circus',
    'fire-station',
    'gothic-cathedral',
  ] as readonly MonumentKind[],
} as const;

/** UI & Camera: store defaults, slider ranges and the weather-lift rule (store/model.ts, ui/SettingsCity.tsx). */
export const uiCamera = {
  /** Default city seed (integer). */
  defaultSeed: 1,
  /** Default time of day in hours (0-24). */
  defaultTimeOfDay: 17.5,
  /** Default wind speed in m/s. */
  defaultWindSpeed: 5,
  /** Default wind direction in degrees. */
  defaultWindDirection: 315,
  /** Default town width in metres. */
  defaultTownWidth: 217,
  /** Default town depth in metres. */
  defaultTownDepth: 217,
  /** Default traffic and people multiplier (0-3). */
  defaultTrafficMultiplier: 1.75,
  /** Default street tree multiplier (0-3). */
  defaultStreetTreeMultiplier: 1,
  /** Default falling-leaf amount, 0-1 fraction. */
  defaultLeafAmount: 1,
  /** Default leaf size multiplier. */
  defaultLeafSize: 1,
  /** Default weather strength, 0-1. */
  defaultWeatherIntensity: 0.6,
  /** Default graphics tier at start. */
  defaultQuality: 'high',
  /** Real seconds one in-app day lasts in auto time (24 minutes). */
  dayLengthS: 24 * 60,
  /** Time-of-day slider maximum (hours). */
  timeMax: 24,
  /** Time-of-day slider step (hours). */
  timeStep: 0.25,
  /** Wind speed slider maximum (m/s). */
  windSpeedMax: 20,
  /** Wind speed slider step (m/s). */
  windSpeedStep: 0.1,
  /** Wind direction slider maximum (degrees). */
  windDirectionMax: 359,
  /** Wind direction slider step (degrees). */
  windDirectionStep: 1,
  /** Town width and depth slider minimum (m). */
  townMin: 100,
  /** Town width and depth slider maximum (m). */
  townMax: 400,
  /** Town width and depth slider step (m). */
  townStep: 1,
  /** Traffic and street tree slider maximum (multiplier). */
  multiplierMax: 3,
  /** Traffic and street tree slider step (multiplier). */
  multiplierStep: 0.05,
  /** Weather intensity slider step. */
  intensityStep: 0.01,
  /** Leaf amount slider step, 0-1 fraction. */
  leafAmountStep: 0.01,
  /** Leaf size slider minimum. */
  leafSizeMin: 0.5,
  /** Leaf size slider maximum. */
  leafSizeMax: 3,
  /** Leaf size slider step. */
  leafSizeStep: 0.1,
  /** Picking a non-clear weather below this intensity lifts it (0-1). */
  weatherLiftBelow: 0.15,
  /** Intensity a non-clear weather is lifted to when below the threshold (0-1). */
  weatherLiftTo: 0.6,
  /** Highest orbit distance from the target, metres. The aircraft altitude band depends on it. */
  maxDistance: 600,
  /** Closest orbit distance from the target, metres. */
  minDistance: 4,
  /** Eye height in street view, metres. */
  eyeHeight: 1.7,
  /** Duration of a camera tween, seconds. */
  tweenSeconds: 1,
  /** How far the orbit target may leave the town bounds, metres. */
  panMargin: 40,
  /** Camera height above which a tap selects a whole block, metres. */
  blockEditHeightM: 200,
  /** Lowest orbit angle from straight up, radians (keeps the camera above the ground). */
  maxPolarAngle: Math.PI / 2.05,
  /** OrbitControls damping factor (0-1). */
  dampingFactor: 0.08,
  /** Highest orbit target height, metres. */
  targetHeightMax: 40,
  /** Street walk speed, metres per second. */
  walkSpeed: 2.5,
  /** Street run speed (Shift), metres per second. */
  walkRunSpeed: 6,
  /** Street mouse look: radians per pixel. */
  lookSensitivity: 0.004,
  /** Street pitch limit, radians (up and down). */
  pitchLimit: 1.2,
  /** Whole-map framing margin on the town width (factor). */
  fitMargin: 1.06,
  /** Overview camera direction from the target (unnormalised: up, back). */
  overviewDirection: [0, 1.75, 0.45] as const,
  /** Height of the invisible block-edit pick plane, metres (above every roof). */
  pickHeightM: 150,
  /** Height of block-edit decals above the ground, metres (over roofs, below the pick plane). */
  decalHeightM: 0.3,
  /** Pointer movement above which a click is a drag, pixels. */
  tapSlopPx: 6,
} as const;

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
} as const;

/** Audio: levels, ranges and intervals for animals, nature, rain, weather, vehicles, music. */
export const audio = {
  /** Master volume at start, 0-1 (audio/bus.ts defaultVolumes). */
  masterVolumeDefault: 0.8,
  /** Mixer slider levels at start, whole percent 0-100 (ui/SoundMixer.tsx MIXER_DEFAULTS). */
  mixerDefaults: { master: 80, effects: 100, nature: 100, music: 100 },
  /** Camera height above which ground sounds (crickets) go silent, metres (audio/listener.ts AERIAL_HEIGHT_M). */
  aerialHeightM: 45,
  /** Crickets on or off (audio/nature.ts CRICKETS_ENABLED). */
  cricketsEnabled: true,
  /** Clock hour the cricket window opens, 0-24 (audio/nature.ts cricketDensity). */
  cricketStartH: 22,
  /** Clock hour the cricket window closes, end exclusive, 0-24 (audio/nature.ts cricketDensity). */
  cricketEndH: 5,
  /** Cricket density in summer inside the window, 0-1 (audio/nature.ts cricketDensity). */
  cricketSummerDensity: 1,
  /** Cricket density in autumn inside the window, 0-1 (audio/nature.ts cricketDensity). */
  cricketAutumnDensity: 0.5,
  /** Maximum crickets sounding at once (audio/nature.ts CRICKET_MAX). */
  cricketMax: 4,
  /** Nearest distance a cricket is placed from the listener, metres (audio/nature.ts CRICKET_MIN_M). */
  cricketMinM: 10,
  /** Farthest distance a cricket is placed from the listener, metres (audio/nature.ts CRICKET_MAX_M). */
  cricketMaxM: 60,
  /** Output level of one cricket, gain (audio/nature.ts CRICKET_LEVEL). */
  cricketLevel: 0.1,
  /** Seconds between church bell strikes (audio/nature.ts BELL_SPACING_S). */
  bellSpacingS: 3.2,
  /** Maximum hearing distance of the church bell, metres (audio/nature.ts BELL_RANGE_M). */
  bellRangeM: 400,
  /** Output level of the church bell, gain (audio/nature.ts BELL_LEVEL). */
  bellLevel: 0.14,
  /** Distance within which a street tree can rustle, metres (audio/nature.ts RUSTLE_RANGE_M). */
  rustleRangeM: 70,
  /** Output scale of one leaf rustle voice, gain (audio/nature.ts RUSTLE_GAIN). */
  rustleGain: 0.55,
  /** Maximum rain drop emitters around the listener, count (audio/rain.ts MAX_DROP_EMITTERS). */
  maxDropEmitters: 10,
  /** Rain bed emitters at the edge of the rain ring, count (audio/rain.ts BED_EMITTERS). */
  bedEmitters: 4,
  /** Level of puddle plips against tin-roof drops, gain (audio/rain.ts PUDDLE_LEVEL). */
  puddleLevel: 0.3,
  /** Bird call volume, gain (audio/animals.ts BIRD_LEVEL). */
  birdLevel: 1,
  /** Wing-flap volume, gain (audio/animals.ts FLAP_LEVEL). */
  flapLevel: 0.55,
  /** Dog bark volume, gain (audio/animals.ts DOG_LEVEL). */
  dogLevel: 0.5,
  /** Cat meow volume, gain (audio/animals.ts MEOW_LEVEL). */
  meowLevel: 0.55,
  /** Bus and truck air-brake level, gain (audio/vehicles.ts AIR_BRAKE_LEVEL). */
  airBrakeLevel: 0.4,
  /** Overall jet pass level, gain (audio/aircraft.ts JET_GAIN). */
  jetGain: 0.55,
  /** Generative music level, gain (audio/music.ts MUSIC_LEVEL). */
  musicLevel: 0.8,
  /** Music level while thunder ducks it, gain (audio/music.ts DUCK_LEVEL). */
  duckLevel: 0.55,
  /** Thunder loudness multiplier (audio/weather.ts THUNDER_LOUDNESS). */
  thunderLoudness: 2,
} as const;

/** Sky & Environment: sun, clouds, leaves, weather, aircraft, wind. */
export const skyEnvironment = {
  /** Falling leaves (environment/leaves.ts): pool cap, crown focus radius, ground rest, fade and shape scale. */
  leaves: {
    /** Hard cap on falling leaf instances (leaves.ts MAX_LEAVES). */
    maxLeaves: 160,
    /** Crowns spawn leaves within this distance of the camera focus, metres on the ground (leaves.ts FOCUS_RADIUS_DEFAULT). */
    focusRadiusM: 100,
    /** Seconds an autumn leaf lies on the ground before it fades (leaves.ts LEAF_REST_SECONDS). */
    restS: 10,
    /** Leaves shrink to nothing within this distance of the camera, metres (leaves.ts LEAF_NEAR_FADE). */
    nearFadeM: 10,
    /** Leaf silhouette scale: 70% of the earlier 1.3 size (leaves.ts LEAF_SCALE). */
    leafScale: 1.3 * 0.7,
  },
  /** Dusk ramps (environment/sun.ts): sun altitude in degrees, start and full. */
  lights: {
    /** House lamps start to come on below this sun altitude, degrees (sun.ts). */
    houseLampsOnDeg: 4,
    /** House lamps are full at this sun altitude, degrees (sun.ts). */
    houseLampsFullDeg: -2,
    /** Shop lights start to come on below this sun altitude, degrees (sun.ts). */
    shopLightsOnDeg: 2,
    /** Shop lights are full at this sun altitude, degrees (sun.ts). */
    shopLightsFullDeg: -4,
    /** Windows start to light below this sun altitude, degrees (sun.ts). */
    windowsOnDeg: 8,
    /** Windows are full at this sun altitude, degrees (sun.ts). */
    windowsFullDeg: -2,
    /** Global lights-on flag: on when the sun altitude is below this, degrees (sun.ts). */
    lightsOnBelowDeg: 0,
    /** Vehicle headlights reach full strength at this sun altitude, degrees (sun.ts). */
    headlightFullDeg: -8,
  },
  /** Weather caps and limits (weather/*.ts). */
  weather: {
    /** Rain amount at intensity 1 for the rain kind (weatherState.ts RAIN_CAP). */
    rainCapRain: 0.75,
    /** Rain amount at intensity 1 for the storm kind (weatherState.ts RAIN_CAP). */
    rainCapStorm: 1,
    /** Max rain streaks (Rain.ts MAX_STREAKS). */
    maxRainStreaks: 14000,
    /** Max ground ripples (Rain.ts MAX_RIPPLES). */
    maxRainRipples: 280,
    /** Max snowflakes (Snow.ts MAX_FLAKES). */
    maxSnowFlakes: 12000,
    /** Max fog banks (fog.ts MAX_BANKS). */
    maxFogBanks: 48,
    /** Shortest lightning flash, seconds (Lightning.ts FLASH_MIN_S). */
    lightningFlashMinS: 0.15,
    /** Longest lightning flash, seconds (Lightning.ts FLASH_MAX_S). */
    lightningFlashMaxS: 0.4,
    /** Strikes further than this show no bolt, metres (Lightning.ts BOLT_VISIBLE_DISTANCE). */
    boltVisibleM: 700,
  },
  /** Sun and moon disc sizes (sky/state.ts), in sky units. */
  sky: {
    /** Sun disc radius before the disc scale, at zenith base (sky/state.ts OLD_SUN_RADIUS). */
    oldSunRadius: 0.05,
    /** Sun disc growth towards the horizon, fraction (sky/state.ts OLD_SUN_HORIZON_GROWTH). */
    sunHorizonGrowth: 0.55,
    /** Scale of every disc radius (sky/state.ts DISC_SCALE). */
    discScale: 0.4,
    /** Moon disc radius before the disc scale (sky/state.ts OLD_MOON_RADIUS). */
    oldMoonRadius: 0.045,
    /** Sun zenith radius as a fraction of oldSunRadius (sky/state.ts SUN_ZENITH_RADIUS). */
    sunZenithFactor: 0.3,
  },
  /** Clouds (environment/cloudSprites.ts): altitude band, cell size, shadow, drift. */
  clouds: {
    /** Lowest cloud base, metres (cloudSprites.ts CLOUD_BASE_MIN). */
    baseMinM: 70,
    /** Highest cloud base, metres (cloudSprites.ts CLOUD_BASE_MAX). */
    baseMaxM: 100,
    /** Highest cloud top, metres (cloudSprites.ts CLOUD_TOP_MAX). */
    topMaxM: 140,
    /** Mean spacing of cloud clusters, metres (cloudSprites.ts CLOUD_CELL). */
    cellM: 90,
    /** Darkest ground under a cloud, fraction (cloudSprites.ts CLOUD_MAX_DARKNESS). */
    maxDarkness: 0.35,
    /** Cloud drift as a fraction of wind speed (cloudSprites.ts CLOUD_WIND_FACTOR). */
    windFactor: 0.32,
    /** Slowest cloud drift, m/s (cloudSprites.ts CLOUD_MIN_DRIFT). */
    minDriftMs: 1.2,
    /** Fastest cloud drift, m/s (cloudSprites.ts CLOUD_MAX_DRIFT). */
    maxDriftMs: 4,
    /** Cloud clusters in the scene (Town.tsx createClouds count). */
    sceneCount: 10,
  },
} as const;
