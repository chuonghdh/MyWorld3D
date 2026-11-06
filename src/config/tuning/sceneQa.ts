/** Scene & QA: quality tiers, lighting gains, night bloom, shadow-side constants, cloud count, house type thumbnails. */
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
  /** House type thumbnails for the House panel carousel (scene/houseThumbs.ts, scene/HouseThumbRenderer.tsx). */
  houseThumbs: {
    /** Render size of one thumbnail, square pixels (about 2x the shown icon size for crispness). */
    thumbSizePx: 256,
    /** Empty space around the house: 1 = the bounds touch the edges, 1.1 = 10 % margin. */
    thumbMargin: 1.12,
    /** Camera angle around the house from the front, degrees (3/4 view). */
    thumbAzimuthDeg: 35,
    /** Camera angle above the horizon, degrees. */
    thumbElevationDeg: 18,
    /** Thumbnail camera vertical field of view, degrees. */
    thumbFovDeg: 28,
    /** Warm key light intensity. */
    thumbKeyIntensity: 3,
    /** Sky and ground fill (hemisphere) light intensity. */
    thumbFillIntensity: 1.6,
  },
} as const;
