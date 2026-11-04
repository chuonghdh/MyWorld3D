/** Audio: levels, ranges and intervals for animals, nature, rain, weather, vehicles, music. */
export const audio = {
  /** Master volume at start, 0-1 (audio/bus.ts defaultVolumes). */
  masterVolumeDefault: 0.4,
  /** Per-category gain at start, 0-1, multiplies the category slider (audio/bus.ts defaultVolumes). Unlisted = 1. */
  categoryDefaults: { engine: 0.5, horn: 0.5, indicator: 0.5, voice: 0.6, footstep: 0.45, dog: 0.8, cat: 0.8 },
  /** Mixer slider levels at start, whole percent 0-100 (ui/SoundMixer.tsx MIXER_DEFAULTS). */
  mixerDefaults: { master: 40, effects: 100, nature: 100, music: 100 },
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
  jetGain: 1,
  /** Generative music level, gain (audio/music.ts MUSIC_LEVEL). */
  musicLevel: 0.8,
  /** Music level while thunder ducks it, gain (audio/music.ts DUCK_LEVEL). */
  duckLevel: 0.55,
  /** Thunder loudness multiplier (audio/weather.ts THUNDER_LOUDNESS). */
  thunderLoudness: 2,
} as const;
