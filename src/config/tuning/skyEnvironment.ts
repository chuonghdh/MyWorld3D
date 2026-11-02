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
