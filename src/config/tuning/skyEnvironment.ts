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
    // Evening order for the default date (2026-03-20, Hanoi): street lamps 18:30, then house and shop lights
    // and lit windows 18:40, then car headlights 18:50 to 19:00. Clock to altitude: 18:30 = -5.6, 18:40 = -7.9,
    // 18:50 = -10.2, 19:00 = -12.6 deg. Altitude falls about 2.3 deg per 10 min here.
    /** Street lamps (streetscape lamps schedule) start to come on below this sun altitude, degrees: 18:30 (sun.ts). */
    houseLampsOnDeg: -5.5,
    /** Street lamps are full at this sun altitude, degrees: 18:40 (sun.ts). */
    houseLampsFullDeg: -7.9,
    /** Shop lights start to come on below this sun altitude, degrees: 18:40 (sun.ts). Not consumed by the town yet. */
    shopLightsOnDeg: -7.9,
    /** Shop lights are full at this sun altitude, degrees: 18:50 (sun.ts). Not consumed by the town yet. */
    shopLightsFullDeg: -10.2,
    /** Windows start to light below this sun altitude, degrees: 18:40 (sun.ts). Agent Room only; town windows follow lightsOnBelowDeg. */
    windowsOnDeg: -7.9,
    /** Windows are full at this sun altitude, degrees: 18:50 (sun.ts). Agent Room only. */
    windowsFullDeg: -10.2,
    /** Global lights-on flag (town windows, shop signs, night ambience): on when the sun altitude is below this, degrees: 18:40 (sun.ts). */
    lightsOnBelowDeg: -7.9,
    /** Vehicle headlights start to come on below this sun altitude, degrees: 18:50 (sun.ts). */
    headlightOnDeg: -10.2,
    /** Vehicle headlights reach full strength at this sun altitude, degrees: 19:00 (sun.ts). */
    headlightFullDeg: -12.6,
  },
  /** Night light level (environment/sun.ts). */
  night: {
    /** Sun altitude at which darkness is full, degrees: 22:00 on the default date. Darkness rises slowly from 0 deg (sun.ts nightnessFor). */
    fullDarkDeg: -52.6,
    /** Ambient light at full dark (fullDarkDeg), was 0.3. Lower = darker streets and buildings. */
    ambientIntensity: 0.1,
    /** Moon fill light per unit of nightness (was 0.55, then 0.35). Lower = less moon light on the town. */
    moonFillFactor: 0.2,
    /** Sky and fog colour at full dark (fullDarkDeg), was #121a3a, then #0d0f16. Near-black, minimal blue. */
    skyHorizon: '#060709',
    /** Zenith colour at full dark (fullDarkDeg), was #070c22, then #050608. Near-black. */
    skyZenith: '#030304',
  },
  /** Golden hour light on the city (environment/sun.ts getSkyState). */
  golden: {
    /** How far the direct sun colour moves toward warm gold while the sun is low: 0 = off, 1 = full (default 1.0). Full weight at alt about 6 deg, fading out by 18 deg (sun.ts getSkyState). */
    warmth: 1.0,
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
  /** Aircraft (aircraft/schedule.ts): the opening flight. */
  aircraft: {
    /** Opening flight heading, degrees off the screen's side-to-side line, tilted away from the camera (diagonal across the view). */
    introTiltDeg: 8,
  },
} as const;
