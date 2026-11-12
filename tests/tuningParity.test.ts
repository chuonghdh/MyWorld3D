// Tuning parity: asserts every knob in src/config/tuning/ keeps the value recorded here (see docs/TUNING.md).
// Values are read from source text (not imported), so this test works before any value moves and needs no
// production change. When a value moves, the entry switches to the config module; the expected value stays.
import { describe, expect, it } from 'vitest';

// Raw source text of every src and test file, bundled by Vite (no node typings needed).
const RAW = import.meta.glob(['/src/**/*.{ts,tsx}', '/tests/*.ts'], { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>;

/** Config path: the section files under src/config/tuning/ read as one text (the old single-file path still names the whole config). */
const CONFIG_DIR = 'src/config/tuning/';
function source(rel: string): string {
  if (rel === 'src/config/tuning.ts') {
    return Object.keys(RAW)
      .filter((k) => k.startsWith(`/${CONFIG_DIR}`))
      .sort()
      .map((k) => RAW[k])
      .join('\n');
  }
  const text = RAW[`/${rel}`];
  if (text === undefined) throw new Error(`${rel}: not found`);
  return text;
}

/** Buildings knobs moved to config: value read from the `buildings` object (property `name`). */
const CONFIG_FILE = 'src/config/tuning.ts';
function propValue(file: string, name: string): string {
  const m = new RegExp(`^[ \\t]*${name}:[ \\t]*(.+?),[ \\t]*$`, 'm').exec(source(file));
  if (!m) throw new Error(`${file}: property ${name} not found`);
  return norm(m[1] ?? '');
}

function norm(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** Right-hand side of the first `const NAME ... = <rhs>;` in a file, whitespace collapsed. */
function rhsOf(file: string, name: string): string {
  const m = new RegExp(`\\bconst\\s+${name}\\b[^=]*=\\s*([^;]*?)\\s*;`).exec(source(file));
  if (!m) throw new Error(`${file}: const ${name} not found`);
  return norm(m[1] ?? '').replace(/,\s*([}\]])/g, '$1');
}

/** Entry asserting the RHS of a named const equals the baseline literal exactly. */
type Entry = { id: string; file: string; name: string; value: string };
/** Entry asserting a literal text fragment exists in a file (inline literals, object and array blocks). */
type Has = { id: string; file: string; fragment: string };

const VALUES: Entry[] = [
  // 1. Traffic and crowd density
  { id: 'density floor', file: CONFIG_FILE, name: 'densityFloor', value: '0.2' },
  { id: 'vehicles per path', file: CONFIG_FILE, name: 'vehiclesPerPath', value: '2' },
  { id: 'spawn min', file: CONFIG_FILE, name: 'spawnMinS', value: '4' },
  { id: 'spawn max', file: CONFIG_FILE, name: 'spawnMaxS', value: '10' },
  { id: 'spawn spacing', file: CONFIG_FILE, name: 'trafficSpawnSpacing', value: '60' },
  { id: 'left turn chance', file: CONFIG_FILE, name: 'turnLeftChance', value: '0.2' },
  { id: 'right turn chance', file: CONFIG_FILE, name: 'turnRightChance', value: '0.2' },
  { id: 'decide distance', file: CONFIG_FILE, name: 'decideDistanceM', value: '40' },
  { id: 'horn ped hold', file: CONFIG_FILE, name: 'hornPedHoldS', value: '5' },
  { id: 'horn queue max', file: CONFIG_FILE, name: 'hornQueueMax', value: '8' },
  { id: 'horn hard brake (m/s^2)', file: CONFIG_FILE, name: 'hornHardBrakeMps2', value: '-3' },
  { id: 'car cruise speed', file: CONFIG_FILE, name: 'carCruiseMps', value: '11' },
  { id: 'bus cruise speed', file: CONFIG_FILE, name: 'busCruiseMps', value: '8' },
  { id: 'truck cruise speed', file: CONFIG_FILE, name: 'truckCruiseMps', value: '9' },
  { id: 'motorbike cruise speed', file: CONFIG_FILE, name: 'motorbikeCruiseMps', value: '13' },
  { id: 'left turn speed', file: CONFIG_FILE, name: 'leftTurnSpeed', value: '5.5' },
  { id: 'right turn speed', file: CONFIG_FILE, name: 'rightTurnSpeed', value: '4.5' },
  { id: 'horn cooldown', file: CONFIG_FILE, name: 'hornCooldownS', value: '45' },
  { id: 'horn global gap', file: CONFIG_FILE, name: 'hornGlobalGapS', value: '6' },
  { id: 'horn chance', file: CONFIG_FILE, name: 'hornChance', value: '0.5' },
  { id: 'pigeon count (high)', file: CONFIG_FILE, name: 'pigeonCount', value: '80' },
  { id: 'cat count (high)', file: CONFIG_FILE, name: 'catCount', value: '14' },
  { id: 'squirrel count (high)', file: CONFIG_FILE, name: 'squirrelCount', value: '10' },
  { id: 'butterfly/bee count (high)', file: CONFIG_FILE, name: 'butterflyCount', value: '30' },
  { id: 'film bird distance', file: CONFIG_FILE, name: 'filmBirdDistanceM', value: '7' },
  { id: 'film bird min distance', file: CONFIG_FILE, name: 'filmBirdMinDistanceM', value: '3' },
  { id: 'film bird scale', file: CONFIG_FILE, name: 'filmBirdScale', value: '2.6' },
  { id: 'people near radius', file: CONFIG_FILE, name: 'nearRadiusM', value: '30' },
  { id: 'people near max instances', file: CONFIG_FILE, name: 'nearMaxInstances', value: '64' },
  { id: 'people near hysteresis', file: CONFIG_FILE, name: 'nearHysteresisM', value: '4' },
  { id: 'people blink interval', file: CONFIG_FILE, name: 'blinkIntervalS', value: '4' },
  { id: 'people ao strength', file: CONFIG_FILE, name: 'aoStrength', value: '0.35' },
  { id: 'people rim strength', file: CONFIG_FILE, name: 'rimStrength', value: '0.25' },
  { id: 'people cloth detail', file: CONFIG_FILE, name: 'clothDetail', value: '0.5' },
  { id: 'child stride cycle', file: CONFIG_FILE, name: 'childStrideCycleM', value: '1.425' },
  { id: 'child cadence wobble', file: CONFIG_FILE, name: 'childCadenceWobble', value: '0.05' },
  { id: 'child swing amp', file: CONFIG_FILE, name: 'childSwingAmp', value: '0.9' },
  { id: 'child swing ease', file: CONFIG_FILE, name: 'childSwingEase', value: '0.35' },
  { id: 'child knee', file: CONFIG_FILE, name: 'childKneeK', value: '1.3' },
  { id: 'child arm swing', file: CONFIG_FILE, name: 'childArmK', value: '0.8' },
  { id: 'child bob', file: CONFIG_FILE, name: 'childBobK', value: '1.6' },
  { id: 'walker cap', file: CONFIG_FILE, name: 'maxWalkers', value: '480' },
  { id: 'walkers per road', file: CONFIG_FILE, name: 'walkersPerRoad', value: '22' },
  { id: 'dog cap', file: CONFIG_FILE, name: 'maxDogs', value: '120' },
  { id: 'dog share', file: CONFIG_FILE, name: 'dogShare', value: '0.22' },
  { id: 'pair chance', file: CONFIG_FILE, name: 'pairChance', value: '0.2' },
  { id: 'walker turn rate', file: 'src/traffic/walkers/constants.ts', name: 'TURN_RATE', value: '7' },
  { id: 'crossing margin', file: CONFIG_FILE, name: 'crossMarginS', value: '2.0' },
  { id: 'give-up wait', file: CONFIG_FILE, name: 'giveUpWaitS', value: '150' },
  { id: 'walker wait distance', file: 'src/traffic/walkers/constants.ts', name: 'WAIT_DIST', value: '0.45' },

  // 2. Life and wildlife (audio half lives in section 6 block)
  { id: 'scare radius', file: CONFIG_FILE, name: 'scareRadiusM', value: '4' },
  { id: 'flock birds per loop', file: CONFIG_FILE, name: 'flockBirdsPerLoop', value: '25' },
  { id: 'flock altitudes (m)', file: CONFIG_FILE, name: 'flockAltM', value: '[26, 35, 44]' },
  { id: 'flock speeds (m/s)', file: CONFIG_FILE, name: 'flockSpeedMps', value: '[9, 10.5, 8.5]' },
  { id: 'gulls high', file: CONFIG_FILE, name: 'gullsHigh', value: '2' },
  { id: 'gulls low', file: CONFIG_FILE, name: 'gullsLow', value: '1' },
  { id: 'bee share', file: CONFIG_FILE, name: 'beeShare', value: '0.2' },

  // 3. Trees and leaves
  { id: 'falling leaf pool', file: CONFIG_FILE, name: 'maxLeaves', value: '160' },
  { id: 'focus radius', file: CONFIG_FILE, name: 'focusRadiusM', value: '100' },
  { id: 'autumn rest seconds', file: CONFIG_FILE, name: 'restS', value: '10' },
  { id: 'near fade distance', file: CONFIG_FILE, name: 'nearFadeM', value: '10' },
  { id: 'autumn red', file: 'src/environment/leafVariety.ts', name: 'AUTUMN_RED', value: "'#b8402a'" },
  { id: 'autumn orange', file: 'src/environment/leafVariety.ts', name: 'AUTUMN_ORANGE', value: "'#d8792c'" },
  { id: 'autumn yellow', file: 'src/environment/leafVariety.ts', name: 'AUTUMN_YELLOW', value: "'#e6b93e'" },
  { id: 'pine share (city)', file: CONFIG_FILE, name: 'pineShare', value: '0.6' },
  { id: 'pine snow onset (city)', file: CONFIG_FILE, name: 'pineSnowUp', value: '[0.85, 0.97]' },
  { id: 'pine snow cap (city)', file: CONFIG_FILE, name: 'pineSnowCover', value: '0.35' },
  { id: 'tree scale (city natureTrees)', file: CONFIG_FILE, name: 'treeScale', value: '1.35' },
  { id: 'tree scale (scene greenery, now cityStreets.treeScale)', file: 'src/scene/useTownGreenery.ts', name: 'TREE_SCALE', value: 'cityStreets.treeScale' },
  { id: 'tree scale config value equals city baseline', file: 'src/config/tuning.ts', name: 'treeScale', value: '1.35' },
  { id: 'cluster extra', file: CONFIG_FILE, name: 'clusterExtra', value: '0.5' },
  { id: 'border depth (city)', file: CONFIG_FILE, name: 'borderDepth', value: '6' },
  { id: 'street wear: asphalt block tone', file: CONFIG_FILE, name: 'roadBlockTone', value: '0.04' },
  { id: 'street wear: asphalt aggregate', file: CONFIG_FILE, name: 'roadAggregate', value: '0.05' },
  { id: 'street wear: worn patch lift', file: CONFIG_FILE, name: 'roadWornLift', value: '0.2' },
  { id: 'street wear: oil stain', file: CONFIG_FILE, name: 'roadOilStain', value: '0.16' },
  { id: 'street wear: patch seam', file: CONFIG_FILE, name: 'roadPatchSeam', value: '0.12' },
  { id: 'street wear: slab joint', file: CONFIG_FILE, name: 'pavingJoint', value: '0.16' },
  { id: 'street wear: kerb base grime', file: CONFIG_FILE, name: 'pavingGrime', value: '0.22' },
  { id: 'street wear: pavement scuff', file: CONFIG_FILE, name: 'pavingWear', value: '0.07' },
  { id: 'street wear: bicycle track', file: CONFIG_FILE, name: 'pavingBikeTrack', value: '0.07' },
  { id: 'street wear: footprint', file: CONFIG_FILE, name: 'pavingFootprint', value: '0.08' },
  { id: 'street wear: pavement stain', file: CONFIG_FILE, name: 'pavingStain', value: '0.12' },
  { id: 'street wear: paver joint width', file: CONFIG_FILE, name: 'pavingJointWidth', value: '0.012' },
  { id: 'street wear: paver edge wear', file: CONFIG_FILE, name: 'pavingEdgeWear', value: '0.05' },
  { id: 'street wear: paver stone tone', file: CONFIG_FILE, name: 'pavingStoneTone', value: '0.05' },
  { id: 'street wear: paver accent share', file: CONFIG_FILE, name: 'pavingAccentShare', value: '0.05' },
  { id: 'street wear: pavement gum spot', file: CONFIG_FILE, name: 'pavingGumSpot', value: '0.12' },
  { id: 'street wear: pavement puddle mark', file: CONFIG_FILE, name: 'pavingPuddleMark', value: '0.05' },
  { id: 'street wear: pavement dirt zone', file: CONFIG_FILE, name: 'pavingDirtZone', value: '0.06' },
  { id: 'street wear: paver accent colours', file: CONFIG_FILE, name: 'pavingAccentColours', value: "['#b3aca4', '#a79d90', '#b7b09a']" },
  { id: 'street wear: paint loss', file: CONFIG_FILE, name: 'paintWear', value: '0.6' },
  { id: 'street wear: paint fade', file: CONFIG_FILE, name: 'paintFade', value: '0.12' },
  { id: 'courtyard trees min', file: CONFIG_FILE, name: 'courtyardTreeMin', value: '2' },
  { id: 'courtyard trees max', file: CONFIG_FILE, name: 'courtyardTreeMax', value: '6' },
  { id: 'tree spacing', file: 'src/city/streetscape.ts', name: 'TREE_SPACING', value: 'LAMP_SPACING / 2' },
  { id: 'bench chance', file: CONFIG_FILE, name: 'benchChance', value: '0.6' },
  { id: 'tree rate (avenue 0.44, street 0.44)', file: CONFIG_FILE, name: 'treeRate', value: '{ avenue: 0.44, street: 0.44 }' },
  { id: 'traffic light timing', file: CONFIG_FILE, name: 'lightTiming', value: '{ cycleSeconds: 40, nsGreenSeconds: 16, ewGreenSeconds: 16, yellowSeconds: 2, allRedSeconds: 2 }' },
  { id: 'snow flake cap', file: CONFIG_FILE, name: 'maxSnowFlakes', value: '12000' },

  // 4. Lights
  { id: 'street lamp spacing', file: CONFIG_FILE, name: 'streetLampSpacing', value: '18' },
  { id: 'signal lamp pitch (local to furniture.ts)', file: 'src/streets/furniture.ts', name: 'SIGNAL_LAMP_PITCH', value: '0.28' },
  { id: 'lamp glass night intensity', file: CONFIG_FILE, name: 'lampGlassNightIntensity', value: '2.4' },
  { id: 'signal on gain', file: CONFIG_FILE, name: 'signalOnGain', value: '2.2' },
  { id: 'signal off gain', file: CONFIG_FILE, name: 'signalOffGain', value: '0.1' },
  { id: 'night emissive (house walls)', file: CONFIG_FILE, name: 'nightEmissive', value: '1.15' },
  { id: 'lit window colour', file: CONFIG_FILE, name: 'litWindowColor', value: "'#ffcf7a'" },
  { id: 'sign night emissive', file: CONFIG_FILE, name: 'signNightEmissive', value: '1.0' },
  { id: 'monument share', file: CONFIG_FILE, name: 'monumentShare', value: '0.2' },
  { id: 'headlight glow cap', file: 'src/traffic/vehicleMeshes.ts', name: 'GLOW_CAP', value: '640' },

  // 5. Weather and sky
  { id: 'rain streaks cap', file: CONFIG_FILE, name: 'maxRainStreaks', value: '14000' },
  { id: 'rain ripples cap', file: CONFIG_FILE, name: 'maxRainRipples', value: '280' },
  { id: 'fog banks cap', file: CONFIG_FILE, name: 'maxFogBanks', value: '48' },
  { id: 'lightning flash min', file: CONFIG_FILE, name: 'lightningFlashMinS', value: '0.15' },
  { id: 'lightning flash max', file: CONFIG_FILE, name: 'lightningFlashMaxS', value: '0.4' },
  { id: 'bolt visible distance', file: CONFIG_FILE, name: 'boltVisibleM', value: '700' },
  { id: 'cloud base min', file: CONFIG_FILE, name: 'baseMinM', value: '70' },
  { id: 'cloud base max', file: CONFIG_FILE, name: 'baseMaxM', value: '100' },
  { id: 'cloud top max', file: CONFIG_FILE, name: 'topMaxM', value: '140' },
  { id: 'cloud cell', file: CONFIG_FILE, name: 'cellM', value: '90' },
  { id: 'cloud shadow darkness', file: CONFIG_FILE, name: 'maxDarkness', value: '0.35' },
  { id: 'cloud wind factor', file: CONFIG_FILE, name: 'windFactor', value: '0.32' },
  { id: 'cloud min drift', file: CONFIG_FILE, name: 'minDriftMs', value: '1.2' },
  { id: 'cloud max drift', file: CONFIG_FILE, name: 'maxDriftMs', value: '4' },
  { id: 'day length (seconds)', file: CONFIG_FILE, name: 'dayLengthS', value: '24 * 60' },
  { id: 'gust attack', file: 'src/environment/wind.ts', name: 'GUST_ATTACK_S', value: '0.6' },
  { id: 'gust decay', file: 'src/environment/wind.ts', name: 'GUST_DECAY_TAU_S', value: '3' },
  { id: 'turbulence amplitude', file: 'src/environment/wind.ts', name: 'TURBULENCE_AMPLITUDE', value: '0.25' },
  { id: 'flights per day min', file: 'src/aircraft/schedule.ts', name: 'FLIGHTS_PER_DAY_MIN', value: '24' },
  { id: 'flights per day max', file: 'src/aircraft/schedule.ts', name: 'FLIGHTS_PER_DAY_MAX', value: '24' },
  { id: 'aircraft speed min', file: 'src/aircraft/schedule.ts', name: 'SPEED_MIN', value: '22.4' },
  { id: 'aircraft speed max', file: 'src/aircraft/schedule.ts', name: 'SPEED_MAX', value: '50.4' },
  { id: 'aircraft altitude max', file: 'src/aircraft/schedule.ts', name: 'ALTITUDE_MAX', value: 'Math.min(300, MAX_CAMERA_HEIGHT - CAMERA_SAFETY_MARGIN)' },
  { id: 'aircraft spawn radius min', file: 'src/aircraft/schedule.ts', name: 'SPAWN_RADIUS_MIN', value: '900' },
  { id: 'aircraft spawn radius max', file: 'src/aircraft/schedule.ts', name: 'SPAWN_RADIUS_MAX', value: '1020' },
  { id: 'sun gain (now sceneQa.sunGain)', file: 'src/scene/townShadow.ts', name: 'SUN_GAIN', value: 'sceneQa.sunGain' },
  { id: 'hemisphere gain (now sceneQa.hemiGain)', file: 'src/scene/townShadow.ts', name: 'HEMI_GAIN', value: 'sceneQa.hemiGain' },
  { id: 'ambient gain (now sceneQa.ambientGain)', file: 'src/scene/townShadow.ts', name: 'AMBIENT_GAIN', value: 'sceneQa.ambientGain' },
  { id: 'location (Hanoi)', file: 'src/environment/sun.ts', name: 'DEFAULT_LOCATION', value: '{ lat: 21.03, lng: 105.85, utcOffsetHours: 7 }' },
  { id: 'default date', file: 'src/environment/sun.ts', name: 'DEFAULT_DATE', value: '{ year: 2026, month: 3, day: 20 }' },

  // 6. Audio
  { id: 'ambient animal interval', file: CONFIG_FILE, name: 'ambientMeanS', value: '9' },
  { id: 'owl interval', file: CONFIG_FILE, name: 'owlMeanS', value: '28' },
  { id: 'bird call level', file: CONFIG_FILE, name: 'birdLevel', value: '1' },
  { id: 'flap birds min', file: CONFIG_FILE, name: 'flapBirdsMin', value: '3' },
  { id: 'flap birds max', file: CONFIG_FILE, name: 'flapBirdsMax', value: '6' },
  { id: 'flap level', file: CONFIG_FILE, name: 'flapLevel', value: '0.55' },
  { id: 'max flaps', file: CONFIG_FILE, name: 'maxFlaps', value: '3' },
  { id: 'dog bark range', file: CONFIG_FILE, name: 'dogRangeM', value: '120' },
  { id: 'dog bark mean interval', file: CONFIG_FILE, name: 'dogMeanS', value: '900' },
  { id: 'max barkers', file: CONFIG_FILE, name: 'maxBarkers', value: '3' },
  { id: 'dog level', file: CONFIG_FILE, name: 'dogLevel', value: '0.5' },
  { id: 'meow level', file: CONFIG_FILE, name: 'meowLevel', value: '0.55' },
  { id: 'mixer smoothing', file: 'src/audio/bus.ts', name: 'SMOOTH_S', value: '0.03' },
  { id: 'aerial height', file: CONFIG_FILE, name: 'aerialHeightM', value: '45' },
  { id: 'cricket window start', file: CONFIG_FILE, name: 'cricketStartH', value: '22' },
  { id: 'cricket window end', file: CONFIG_FILE, name: 'cricketEndH', value: '5' },
  { id: 'crickets enabled', file: CONFIG_FILE, name: 'cricketsEnabled', value: 'true' },
  { id: 'cricket max count', file: CONFIG_FILE, name: 'cricketMax', value: '4' },
  { id: 'cricket min distance', file: CONFIG_FILE, name: 'cricketMinM', value: '10' },
  { id: 'cricket max distance', file: CONFIG_FILE, name: 'cricketMaxM', value: '60' },
  { id: 'cricket level', file: CONFIG_FILE, name: 'cricketLevel', value: '0.1' },
  { id: 'bell pitch', file: 'src/audio/natureCore.ts', name: 'BELL_HZ', value: '230' },
  { id: 'bell spacing', file: CONFIG_FILE, name: 'bellSpacingS', value: '3.2' },
  { id: 'bell range', file: CONFIG_FILE, name: 'bellRangeM', value: '400' },
  { id: 'bell height', file: CONFIG_FILE, name: 'bellHeightM', value: '25' },
  { id: 'bell level', file: CONFIG_FILE, name: 'bellLevel', value: '0.14' },
  { id: 'rustle range', file: CONFIG_FILE, name: 'rustleRangeM', value: '70' },
  { id: 'rustle interval min', file: CONFIG_FILE, name: 'rustleIntervalMinS', value: '8' },
  { id: 'rustle interval max', file: CONFIG_FILE, name: 'rustleIntervalMaxS', value: '12' },
  { id: 'rustle min wind', file: CONFIG_FILE, name: 'rustleMinWind', value: '1.5' },
  { id: 'rustle gain', file: CONFIG_FILE, name: 'rustleGain', value: '0.55' },
  { id: 'rain drop emitters max', file: CONFIG_FILE, name: 'maxDropEmitters', value: '10' },
  { id: 'rain bed emitters', file: CONFIG_FILE, name: 'bedEmitters', value: '4' },
  { id: 'rain sound on threshold', file: CONFIG_FILE, name: 'dropRainOn', value: '0.05' },
  { id: 'rain drop min radius', file: CONFIG_FILE, name: 'dropMinRadiusM', value: '3' },
  { id: 'rain drop max radius', file: CONFIG_FILE, name: 'dropMaxRadiusM', value: '60' },
  { id: 'puddle level', file: CONFIG_FILE, name: 'puddleLevel', value: '0.3' },
  { id: 'pedestrian rain on', file: CONFIG_FILE, name: 'pedestrianRainOn', value: '0.15' },
  { id: 'pedestrian rain off', file: CONFIG_FILE, name: 'pedestrianRainOff', value: '0.1' },
  { id: 'thunder max distance', file: CONFIG_FILE, name: 'thunderMaxPlaceDistanceM', value: '450' },
  { id: 'thunder height', file: CONFIG_FILE, name: 'thunderHeightM', value: '60' },
  { id: 'thunder loudness', file: CONFIG_FILE, name: 'thunderLoudness', value: '2' },
  { id: 'music level', file: CONFIG_FILE, name: 'musicLevel', value: '0.8' },
  { id: 'music duck level', file: CONFIG_FILE, name: 'duckLevel', value: '0.55' },
  { id: 'ui cue level', file: CONFIG_FILE, name: 'uiCueLevel', value: '0.35' },
  { id: 'ui cue min gap', file: CONFIG_FILE, name: 'uiCueMinGapS', value: '0.06' },
  { id: 'ui cue ticks', file: CONFIG_FILE, name: 'uiCueTicks', value: '7' },
  { id: 'ui cue duration', file: CONFIG_FILE, name: 'uiCueDurationS', value: '0.26' },
  { id: 'ui cue single tick level', file: CONFIG_FILE, name: 'uiCueTickLevel', value: '0.75' },
  { id: 'music fade', file: CONFIG_FILE, name: 'musicFadeS', value: '2' },
  { id: 'engine voices', file: CONFIG_FILE, name: 'engineVoices', value: '8' },
  { id: 'horn max distance', file: CONFIG_FILE, name: 'hornMaxDistanceM', value: '220' },
  { id: 'horn max concurrent', file: CONFIG_FILE, name: 'hornMaxConcurrent', value: '4' },
  { id: 'air brake level', file: CONFIG_FILE, name: 'airBrakeLevel', value: '0.4' },
  { id: 'jet gain', file: CONFIG_FILE, name: 'jetGain', value: '1' },
  { id: 'master volume default', file: CONFIG_FILE, name: 'masterVolumeDefault', value: '0.4' },
  { id: 'mixer defaults', file: CONFIG_FILE, name: 'mixerDefaults', value: '{ master: 40, effects: 100, nature: 100, music: 100 }' },
  { id: 'cricket summer density', file: CONFIG_FILE, name: 'cricketSummerDensity', value: '1' },
  { id: 'cricket autumn density', file: CONFIG_FILE, name: 'cricketAutumnDensity', value: '0.5' },

  // 7. Buildings and city
  { id: 'min floors', file: CONFIG_FILE, name: 'minFloors', value: '2' },
  { id: 'max floors', file: CONFIG_FILE, name: 'maxFloors', value: '8' },
  { id: 'glass tower max floors', file: CONFIG_FILE, name: 'glassTowerMaxFloors', value: '12' },
  { id: 'roof moss amount', file: CONFIG_FILE, name: 'roofMossAmount', value: '0.9' },
  { id: 'wall weathering amount', file: CONFIG_FILE, name: 'wallWeatheringAmount', value: '0.6' },
  { id: 'trim age amount', file: CONFIG_FILE, name: 'trimAgeAmount', value: '0.84' },
  { id: 'trim top darken', file: CONFIG_FILE, name: 'trimTopDarken', value: '0.6' },
  { id: 'floor range by street class', file: CONFIG_FILE, name: 'floorRange', value: '{ avenue: [5, 7], street: [3, 6] }' },
  // 9. UI & Camera (step 3): store defaults and slider ranges, now in config uiCamera
  { id: 'default seed', file: CONFIG_FILE, name: 'defaultSeed', value: '1' },
  { id: 'default time of day', file: CONFIG_FILE, name: 'defaultTimeOfDay', value: '17.5' },
  { id: 'default wind speed', file: CONFIG_FILE, name: 'defaultWindSpeed', value: '5' },
  { id: 'default wind direction', file: CONFIG_FILE, name: 'defaultWindDirection', value: '315' },
  { id: 'default town width', file: CONFIG_FILE, name: 'defaultTownWidth', value: '217' },
  { id: 'default town depth', file: CONFIG_FILE, name: 'defaultTownDepth', value: '217' },
  { id: 'default traffic multiplier', file: CONFIG_FILE, name: 'defaultTrafficMultiplier', value: '1.75' },
  { id: 'default street tree multiplier', file: CONFIG_FILE, name: 'defaultStreetTreeMultiplier', value: '1' },
  { id: 'default leaf amount', file: CONFIG_FILE, name: 'defaultLeafAmount', value: '1' },
  { id: 'default leaf size', file: CONFIG_FILE, name: 'defaultLeafSize', value: '1' },
  { id: 'default weather intensity', file: CONFIG_FILE, name: 'defaultWeatherIntensity', value: '0.6' },
  { id: 'default quality', file: CONFIG_FILE, name: 'defaultQuality', value: "'high'" },
  { id: 'time slider max', file: CONFIG_FILE, name: 'timeMax', value: '24' },
  { id: 'time slider step', file: CONFIG_FILE, name: 'timeStep', value: '0.25' },
  { id: 'panel shift glide seconds', file: CONFIG_FILE, name: 'panelShiftSeconds', value: '1.5' },
  { id: 'orbit pivot glide seconds', file: CONFIG_FILE, name: 'pivotSeconds', value: '0.8' },
  { id: 'panel slide open seconds', file: CONFIG_FILE, name: 'panelAnimSeconds', value: '0.3' },
  { id: 'panel slide close seconds', file: CONFIG_FILE, name: 'panelCloseSeconds', value: '0.22' },
  { id: 'golden hour button time', file: CONFIG_FILE, name: 'goldenHourTime', value: '18' },
  { id: 'wind slider max', file: CONFIG_FILE, name: 'windSpeedMax', value: '20' },
  { id: 'wind slider step', file: CONFIG_FILE, name: 'windSpeedStep', value: '0.1' },
  { id: 'wind direction slider max', file: CONFIG_FILE, name: 'windDirectionMax', value: '359' },
  { id: 'wind direction slider step', file: CONFIG_FILE, name: 'windDirectionStep', value: '1' },
  { id: 'town slider min', file: CONFIG_FILE, name: 'townMin', value: '100' },
  { id: 'town slider max', file: CONFIG_FILE, name: 'townMax', value: '400' },
  { id: 'town slider step', file: CONFIG_FILE, name: 'townStep', value: '1' },
  { id: 'multiplier slider max', file: CONFIG_FILE, name: 'multiplierMax', value: '3' },
  { id: 'multiplier slider step', file: CONFIG_FILE, name: 'multiplierStep', value: '0.05' },
  { id: 'intensity slider step', file: CONFIG_FILE, name: 'intensityStep', value: '0.01' },
  { id: 'leaf amount slider step', file: CONFIG_FILE, name: 'leafAmountStep', value: '0.01' },
  { id: 'leaf size slider min', file: CONFIG_FILE, name: 'leafSizeMin', value: '0.5' },
  { id: 'leaf size slider max', file: CONFIG_FILE, name: 'leafSizeMax', value: '3' },
  { id: 'leaf size slider step', file: CONFIG_FILE, name: 'leafSizeStep', value: '0.1' },
  { id: 'weather lift threshold', file: CONFIG_FILE, name: 'weatherLiftBelow', value: '0.15' },
  { id: 'weather lift target', file: CONFIG_FILE, name: 'weatherLiftTo', value: '0.6' },

  // 10. Camera and block edit (step 3b): values in uiCamera, moved from scene/cameraMath, CameraRig, cameraInput, BlockEditor
  { id: 'camera max distance (was core/cameraLimits)', file: CONFIG_FILE, name: 'maxDistance', value: '600' },
  { id: 'camera min distance', file: CONFIG_FILE, name: 'minDistance', value: '4' },
  { id: 'camera eye height', file: CONFIG_FILE, name: 'eyeHeight', value: '2.0' },
  { id: 'camera tween seconds', file: CONFIG_FILE, name: 'tweenSeconds', value: '1' },
  { id: 'camera pan margin', file: CONFIG_FILE, name: 'panMargin', value: '40' },
  { id: 'block edit height', file: CONFIG_FILE, name: 'blockEditHeightM', value: '200' },
  { id: 'camera max polar angle', file: CONFIG_FILE, name: 'maxPolarAngle', value: 'Math.PI / 2.05' },
  { id: 'camera damping', file: CONFIG_FILE, name: 'dampingFactor', value: '0.08' },
  { id: 'camera target height max', file: CONFIG_FILE, name: 'targetHeightMax', value: '40' },
  { id: 'street walk speed', file: CONFIG_FILE, name: 'walkSpeed', value: '2.5' },
  { id: 'street run speed', file: CONFIG_FILE, name: 'walkRunSpeed', value: '6' },
  { id: 'street look sensitivity', file: CONFIG_FILE, name: 'lookSensitivity', value: '0.004' },
  { id: 'street pitch limit', file: CONFIG_FILE, name: 'pitchLimit', value: '(80 * Math.PI) / 180' },
  { id: 'street turn speed', file: CONFIG_FILE, name: 'streetTurnSpeed', value: '0.8' },
  { id: 'street pitch speed', file: CONFIG_FILE, name: 'streetPitchSpeed', value: '1.2' },
  { id: 'map move speed low', file: CONFIG_FILE, name: 'mapMoveSpeedLow', value: '15' },
  { id: 'map move speed high', file: CONFIG_FILE, name: 'mapMoveSpeedHigh', value: '40' },
  { id: 'map move speed low height', file: CONFIG_FILE, name: 'mapMoveSpeedLowHeight', value: '25' },
  { id: 'map move speed high height', file: CONFIG_FILE, name: 'mapMoveSpeedHighHeight', value: '400' },
  { id: 'whole-map fit margin', file: CONFIG_FILE, name: 'fitMargin', value: '1.06' },
  { id: 'block edit pick height', file: CONFIG_FILE, name: 'pickHeightM', value: '150' },
  { id: 'block edit decal height', file: CONFIG_FILE, name: 'decalHeightM', value: '0.3' },
  { id: 'block edit tap slop', file: CONFIG_FILE, name: 'tapSlopPx', value: '6' },

  { id: 'lit window share ground', file: CONFIG_FILE, name: 'litWindowShareGround', value: '0.55' },
  { id: 'lit window share ground alt', file: CONFIG_FILE, name: 'litWindowShareGroundAlt', value: '0.6' },
  { id: 'lit window share roof', file: CONFIG_FILE, name: 'litWindowShareRoof', value: '0.4' },
  { id: 'courtyard tree radius', file: CONFIG_FILE, name: 'courtyardTreeRadius', value: '1.5' },
  { id: 'plaza tree spacing', file: CONFIG_FILE, name: 'plazaTreeSpacing', value: '8' },
  { id: 'plaza tree rate', file: CONFIG_FILE, name: 'plazaTreeRate', value: '0.7' },

  // 8. Performance (quality tiers)
  { id: 'quality tiers (now sceneQa.qualityTiers)', file: 'src/store/quality.ts', name: 'QUALITY_PRESETS', value: 'sceneQa.qualityTiers' },
];

/** Literal fragments in code that have no named const (inline values, object or array blocks). */
const FRAGMENTS: Has[] = [
  { id: 'sun gain config', file: 'src/config/tuning.ts', fragment: 'sunGain: 3.4,' },
  { id: 'hemisphere gain config', file: 'src/config/tuning.ts', fragment: 'hemiGain: 3,' },
  { id: 'ambient gain config', file: 'src/config/tuning.ts', fragment: 'ambientGain: 0.5,' },
  { id: 'sun/hemi/ambient gains read config', file: 'src/scene/townShadow.ts', fragment: 'export const SUN_GAIN = sceneQa.sunGain;' },
  { id: 'night bloom config values', file: 'src/config/tuning.ts', fragment: 'strengthNight: 0.5,' },
  { id: 'night bloom read by PostFX', file: 'src/scene/PostFX.tsx', fragment: 'fx.bloom.threshold = night ? nb.thresholdNight : nb.thresholdDay;' },
  { id: 'quality tier values in config', file: 'src/config/tuning.ts', fragment: 'low: { dprMax: 1, shadowMap: 1024, bloom: 0, msaa: 2, traffic: 0.5 },' },
  { id: 'quality presets read config', file: 'src/store/quality.ts', fragment: 'export const QUALITY_PRESETS: Record<QualityTier, QualityPreset> = sceneQa.qualityTiers;' },
  { id: 'traffic density curve (full)', file: 'src/traffic/trafficDensity.ts', fragment: '[0, TRAFFIC_DENSITY_FLOOR], [5, TRAFFIC_DENSITY_FLOOR], [6, 0.35], [7, 0.55], [8, 0.75], [9, 0.9], [10, 0.97], [11, 1], [12, 0.9], [13, 0.8], [15, 0.7], [16, 0.78], [17, 0.88], [18, 0.95], [19, 1], [20, 0.9], [21, 0.7], [22, 0.45], [23, TRAFFIC_DENSITY_FLOOR], [24, TRAFFIC_DENSITY_FLOOR]' },
  { id: 'vehicle car spec uses config', file: 'src/traffic/vehicles/constants.ts', fragment: 'car: { cruiseSpeed: trafficLife.carCruiseMps,' },
  { id: 'vehicle bus spec uses config', file: 'src/traffic/vehicles/constants.ts', fragment: 'bus: { cruiseSpeed: trafficLife.busCruiseMps,' },
  { id: 'horn hold uses config', file: 'src/traffic/vehicles/constants.ts', fragment: 'export const HORN_PED_HOLD_S = trafficLife.hornPedHoldS;' },
  { id: 'vehicle truck spec uses config', file: 'src/traffic/vehicles/constants.ts', fragment: 'truck: { cruiseSpeed: trafficLife.truckCruiseMps,' },
  { id: 'vehicle motorbike spec uses config', file: 'src/traffic/vehicles/constants.ts', fragment: 'motorbike: { cruiseSpeed: trafficLife.motorbikeCruiseMps,' },
  { id: 'flock 1 uses config', file: 'src/life/birds.ts', fragment: '{ kind: 0, count: trafficLife.flockBirdsPerLoop, alt: trafficLife.flockAltM[0], speed: trafficLife.flockSpeedMps[0] }' },
  { id: 'flock 2 uses config', file: 'src/life/birds.ts', fragment: '{ kind: 1, count: trafficLife.flockBirdsPerLoop, alt: trafficLife.flockAltM[1], speed: trafficLife.flockSpeedMps[1] }' },
  { id: 'flock 3 uses config', file: 'src/life/birds.ts', fragment: '{ kind: 2, count: trafficLife.flockBirdsPerLoop, alt: trafficLife.flockAltM[2], speed: trafficLife.flockSpeedMps[2] }' },
  { id: 'gull count reads config', file: 'src/life/birds.ts', fragment: "const gulls = quality === 'low' ? trafficLife.gullsLow : trafficLife.gullsHigh;" },
  { id: 'pigeon count', file: 'src/life/birds.ts', fragment: 'scaledCount(trafficLife.pigeonCount, quality)' },
  { id: 'cat count', file: 'src/life/pets.ts', fragment: 'scaledCount(trafficLife.catCount, quality)' },
  { id: 'squirrel count', file: 'src/life/pets.ts', fragment: 'scaledCount(trafficLife.squirrelCount, quality)' },
  { id: 'butterfly/bee count', file: 'src/life/pets.ts', fragment: 'scaledCount(trafficLife.butterflyCount, quality)' },
  { id: 'film bird distance use', file: 'src/life/filmBird.ts', fragment: 'trafficLife.filmBirdDistanceM' },
  { id: 'film bird min distance use', file: 'src/life/filmBird.ts', fragment: 'trafficLife.filmBirdMinDistanceM' },
  { id: 'film bird scale use', file: 'src/life/filmBird.ts', fragment: 'trafficLife.filmBirdScale' },
  { id: 'child gait use', file: 'src/traffic/people/personGeometry.ts', fragment: 'trafficLife.childStrideCycleM' },
  { id: 'child cadence wobble use', file: 'src/traffic/walkers/resolve.ts', fragment: 'trafficLife.childCadenceWobble' },
  { id: 'bee share reads config', file: 'src/life/pets.ts', fragment: 'Math.floor(n * trafficLife.beeShare)' },
  { id: 'life quality factors', file: 'src/life/common.ts', fragment: "q === 'low' ? 0.4 : q === 'medium' ? 0.7 : 1" },
  { id: 'autumn particle profile (density, size, fall)', file: 'src/environment/seasons.ts', fragment: "density: 1, colors: ['#c8552a', '#d4862a', '#e0b23a', '#a8452a', '#b9a02e']" },
  { id: 'spring petal profile density', file: 'src/environment/seasons.ts', fragment: 'density: 0.85,' },
  { id: 'ground colours by season', file: 'src/sky/state.ts', fragment: "spring: '#8fa86c', summer: '#7f9a5a', autumn: '#9a8c5a', winter: '#dde3e8'" },
  { id: 'lit window share (house default)', file: 'src/buildings/facade/partsCore.ts', fragment: 'opts.litChance ?? buildings.litWindowShare' },
  { id: 'lit window share (monuments)', file: 'src/buildings/monuments/kitStructures.ts', fragment: 'o.litP ?? buildings.litWindowShareMonument' },
  { id: 'lit window share (ground floor 0.55 / 0.6 / 0.4)', file: 'src/buildings/facade/groundShopfront.ts', fragment: '0.55' },
  { id: 'night bloom strength', file: 'src/scene/PostFX.tsx', fragment: 'fx.bloom.strength = (night ? nb.strengthNight : nb.strengthDay) * bloomScale;' },
  { id: 'night bloom threshold', file: 'src/scene/PostFX.tsx', fragment: 'fx.bloom.threshold = night ? nb.thresholdNight : nb.thresholdDay;' },
  { id: 'night bloom radius', file: 'src/scene/PostFX.tsx', fragment: 'fx.bloom.radius = night ? nb.radiusNight : nb.radiusDay;' },
  { id: 'cloud count in scene (value now in config)', file: 'src/config/tuning.ts', fragment: 'sceneCount: 10,' },
  { id: 'cloud count in scene (Town.tsx reads config)', file: 'src/scene/Town.tsx', fragment: 'count: skyEnvironment.clouds.sceneCount, seed: settings.seed' },
  { id: 'aircraft opening tilt reads config', file: 'src/aircraft/schedule.ts', fragment: 'skyEnvironment.aircraft.introTiltDeg' },
  { id: 'rain cap by kind (rain 0.75, storm 1)', file: 'src/weather/weatherState.ts', fragment: 'skyEnvironment.weather.rainCapRain' },
  { id: 'snow cover ramp', file: 'src/weather/weatherState.ts', fragment: 'Math.min(1, 0.25 + 0.9 * i)' },
  { id: 'weather ease table', file: 'src/weather/weatherState.ts', fragment: 'snowCover: [18, 25]' },
  { id: 'fog colours', file: 'src/weather/fog.ts', fragment: "GREY_FOG = new THREE.Color('#aeb4bb')" },
  { id: 'cricket season factor reads config', file: 'src/audio/natureCore.ts', fragment: "season === 'summer' ? audioTuning.cricketSummerDensity : season === 'autumn' ? audioTuning.cricketAutumnDensity : 0" },
  { id: 'bus master default reads config', file: 'src/audio/bus.ts', fragment: 'master: audioTuning.masterVolumeDefault' },
  { id: 'bus category defaults read config', file: 'src/audio/bus.ts', fragment: 'audioTuning.categoryDefaults' },
  { id: 'mixer defaults read config', file: 'src/ui/SoundMixer.tsx', fragment: 'MIXER_DEFAULTS: MixerSettings = audioTuning.mixerDefaults' },
  { id: 'golden glow curve', file: 'src/sky/state.ts', fragment: 'smoothstep(14, 5, alt) * smoothstep(-6, 0, alt)' },
  { id: 'golden phase threshold (6 deg)', file: 'src/environment/sun.ts', fragment: 'if (altDeg < 6) return' },
  { id: 'house lamp ramp', file: 'src/environment/sun.ts', fragment: 'skyEnvironment.lights.houseLampsOnDeg' },
  { id: 'lights on rule', file: 'src/environment/sun.ts', fragment: 'skyEnvironment.lights.lightsOnBelowDeg' },
  { id: 'vehicle headlight level (-altitude / 8)', file: 'src/environment/sun.ts', fragment: 'skyEnvironment.lights.headlightFullDeg' },
  { id: 'deep night ambient reads config', file: 'src/environment/sun.ts', fragment: 'skyEnvironment.night.ambientIntensity' },
  { id: 'golden hour warmth default reads config', file: 'src/environment/sun.ts', fragment: 'warmth: number = skyEnvironment.golden.warmth' },
  { id: 'golden hour warmth blend (override-aware)', file: 'src/environment/sun.ts', fragment: 'const warm = warmth * smoothstep(18, 6, altitudeDeg)' },
  { id: 'night moon fill reads config', file: 'src/environment/sun.ts', fragment: 'skyEnvironment.night.moonFillFactor' },
  { id: 'deep night sky horizon reads config', file: 'src/environment/sun.ts', fragment: 'skyEnvironment.night.skyHorizon' },
  { id: 'deep night zenith reads config', file: 'src/sky/state.ts', fragment: 'skyEnvironment.night.skyZenith' },
  { id: 'leaf spawn fill time (12 s)', file: 'src/environment/leaves.ts', fragment: 'this.limit * this.profile.density) / 12' },
  { id: 'cloud drift wind factor source', file: 'src/environment/cloudLayout.ts', fragment: 'CLOUD_WIND_FACTOR' },
  { id: 'lightning gap formula', file: 'src/weather/Lightning.ts', fragment: '6 - 3.5' },
  { id: 'autumn leaves rest (LEAF_REST_SECONDS used)', file: 'src/environment/leafMotion.ts', fragment: 'LEAF_REST_SECONDS' },
  { id: 'store defaults read from config uiCamera', file: 'src/store/model.ts', fragment: 'seed: uiCamera.defaultSeed' },
  { id: 'overview direction (tuple, fragment check)', file: CONFIG_FILE, fragment: 'overviewDirection: [0, 2.45, 0.63]' },
  { id: 'aircraft ceiling reads config maxDistance', file: 'src/aircraft/schedule.ts', fragment: 'MAX_CAMERA_HEIGHT = uiCamera.maxDistance' },
];

/** Lab copies: the lab must keep its own equal copy (plan section 3, 5). Current lab values, checked against city. */
const LAB_FILE = 'src/dev/treeCompare/labTuning.ts';
const LAB_MIRROR: Entry[] = [
  { id: 'lab pine share = city', file: LAB_FILE, name: 'pineShare', value: '0.6' },
  { id: 'lab pine snow onset = city', file: LAB_FILE, name: 'pineSnowUp', value: '[0.85, 0.97]' },
  { id: 'lab pine snow cap = city', file: LAB_FILE, name: 'pineSnowCover', value: '0.35' },
  { id: 'lab tree scale = city', file: LAB_FILE, name: 'treeScale', value: '1.35' },
  { id: 'lab cluster extra = city', file: LAB_FILE, name: 'clusterExtra', value: '0.5' },
  { id: 'lab border depth = city', file: LAB_FILE, name: 'borderDepth', value: '6' },
];

/** Duplicate lists (plan section 3): each copy must equal the expected list. */
const DUPLICATE_LISTS = [
  { name: 'HOUSE_PRESETS', prop: 'housePresets', files: ['src/store/model.ts', 'src/buildings/houseParams.ts'], count: 10 },
  { name: 'MONUMENT_KINDS', prop: 'monumentKinds', files: ['src/store/model.ts', 'src/buildings/monument.ts'], count: 12 },
];

/** The list owned by config (`buildings.<prop>`), read from source text. */
function configList(prop: string): string[] {
  const m = new RegExp(`\\b${prop}:\\s*\\[([^\\]]*)\\]`).exec(source(CONFIG_FILE));
  if (!m) throw new Error(`${CONFIG_FILE}: list ${prop} not found`);
  return [...(m[1] ?? '').matchAll(/'([^']*)'/g)].map((x) => x[1]);
}

describe('tuning parity baseline (step 1, values read from current code)', () => {
  it.each(VALUES.map((e) => [e.id, e] as const))('%s', (_id, e) => {
    expect(e.file === CONFIG_FILE ? propValue(e.file, e.name) : rhsOf(e.file, e.name)).toBe(e.value);
  });

  it.each(FRAGMENTS.map((e) => [e.id, e] as const))('literal present: %s', (_id, e) => {
    expect(norm(source(e.file))).toContain(norm(e.fragment));
  });

  it.each(LAB_MIRROR.map((e) => [e.id, e] as const))('%s', (_id, e) => {
    expect(propValue(e.file, e.name)).toBe(e.value);
  });

  it.each(DUPLICATE_LISTS.map((d) => [d.name, d] as const))('list %s comes from config, importers re-export it', (_name, d) => {
    expect(configList(d.prop)).toHaveLength(d.count);
    for (const f of d.files) expect(norm(source(f))).toContain(`buildings.${d.prop}`);
  });

  it('existing city layout hash baseline is still in tests (tests/layoutKey.test.ts)', () => {
    expect(source('tests/layoutKey.test.ts')).toContain('cityLayoutKey');
  });

});

// Step 8: Sky & Environment knobs. Config value equals the baseline literal; the moved constant reads from config.
const SKY_CONFIG: Entry[] = [
  { id: 'leaves max', file: CONFIG_FILE, name: 'maxLeaves', value: '160' },
  { id: 'leaves focus radius', file: CONFIG_FILE, name: 'focusRadiusM', value: '100' },
  { id: 'leaves rest', file: CONFIG_FILE, name: 'restS', value: '10' },
  { id: 'leaves near fade', file: CONFIG_FILE, name: 'nearFadeM', value: '10' },
  { id: 'leaf scale', file: CONFIG_FILE, name: 'leafScale', value: '1.3 * 0.7' },
  { id: 'house lamps on', file: CONFIG_FILE, name: 'houseLampsOnDeg', value: '-5.5' },
  { id: 'house lamps full', file: CONFIG_FILE, name: 'houseLampsFullDeg', value: '-7.9' },
  { id: 'shop lights on', file: CONFIG_FILE, name: 'shopLightsOnDeg', value: '-7.9' },
  { id: 'shop lights full', file: CONFIG_FILE, name: 'shopLightsFullDeg', value: '-10.2' },
  { id: 'windows on', file: CONFIG_FILE, name: 'windowsOnDeg', value: '-7.9' },
  { id: 'windows full', file: CONFIG_FILE, name: 'windowsFullDeg', value: '-10.2' },
  { id: 'lights on below', file: CONFIG_FILE, name: 'lightsOnBelowDeg', value: '-7.9' },
  { id: 'night full dark (22:00)', file: CONFIG_FILE, name: 'fullDarkDeg', value: '-52.6' },
  { id: 'headlight on', file: CONFIG_FILE, name: 'headlightOnDeg', value: '-10.2' },
  { id: 'headlight full', file: CONFIG_FILE, name: 'headlightFullDeg', value: '-12.6' },
  { id: 'rain cap rain', file: CONFIG_FILE, name: 'rainCapRain', value: '0.75' },
  { id: 'rain cap storm', file: CONFIG_FILE, name: 'rainCapStorm', value: '1' },
  { id: 'rain streaks cap', file: CONFIG_FILE, name: 'maxRainStreaks', value: '14000' },
  { id: 'rain ripples cap', file: CONFIG_FILE, name: 'maxRainRipples', value: '280' },
  { id: 'snow flake cap', file: CONFIG_FILE, name: 'maxSnowFlakes', value: '12000' },
  { id: 'fog bank cap', file: CONFIG_FILE, name: 'maxFogBanks', value: '48' },
  { id: 'flash min', file: CONFIG_FILE, name: 'lightningFlashMinS', value: '0.15' },
  { id: 'flash max', file: CONFIG_FILE, name: 'lightningFlashMaxS', value: '0.4' },
  { id: 'bolt visible', file: CONFIG_FILE, name: 'boltVisibleM', value: '700' },
  { id: 'sun old radius', file: CONFIG_FILE, name: 'oldSunRadius', value: '0.05' },
  { id: 'sun horizon growth', file: CONFIG_FILE, name: 'sunHorizonGrowth', value: '0.55' },
  { id: 'disc scale', file: CONFIG_FILE, name: 'discScale', value: '0.4' },
  { id: 'moon old radius', file: CONFIG_FILE, name: 'oldMoonRadius', value: '0.045' },
  { id: 'sun zenith factor', file: CONFIG_FILE, name: 'sunZenithFactor', value: '0.3' },
  { id: 'cloud base min', file: CONFIG_FILE, name: 'baseMinM', value: '70' },
  { id: 'cloud base max', file: CONFIG_FILE, name: 'baseMaxM', value: '100' },
  { id: 'cloud top max', file: CONFIG_FILE, name: 'topMaxM', value: '140' },
  { id: 'cloud cell', file: CONFIG_FILE, name: 'cellM', value: '90' },
  { id: 'cloud darkness', file: CONFIG_FILE, name: 'maxDarkness', value: '0.35' },
  { id: 'cloud wind factor', file: CONFIG_FILE, name: 'windFactor', value: '0.32' },
  { id: 'cloud min drift', file: CONFIG_FILE, name: 'minDriftMs', value: '1.2' },
  { id: 'cloud max drift', file: CONFIG_FILE, name: 'maxDriftMs', value: '4' },
];
/** Code side: each moved constant reads its config property (text of the right-hand side). */
const SKY_CODE: Entry[] = [
  { id: 'MAX_LEAVES reads config', file: 'src/environment/leaves.ts', name: 'MAX_LEAVES', value: 'skyEnvironment.leaves.maxLeaves' },
  { id: 'LEAF_SCALE reads config', file: 'src/environment/leafShapes.ts', name: 'LEAF_SCALE', value: 'skyEnvironment.leaves.leafScale' },
  { id: 'MAX_STREAKS reads config', file: 'src/weather/Rain.ts', name: 'MAX_STREAKS', value: 'skyEnvironment.weather.maxRainStreaks' },
  { id: 'MAX_FLAKES reads config', file: 'src/weather/Snow.ts', name: 'MAX_FLAKES', value: 'skyEnvironment.weather.maxSnowFlakes' },
  { id: 'MAX_BANKS reads config', file: 'src/weather/fog.ts', name: 'MAX_BANKS', value: 'skyEnvironment.weather.maxFogBanks' },
  { id: 'BOLT_VISIBLE_DISTANCE reads config', file: 'src/weather/Lightning.ts', name: 'BOLT_VISIBLE_DISTANCE', value: 'skyEnvironment.weather.boltVisibleM' },
  { id: 'CLOUD_CELL reads config', file: 'src/environment/cloudLayout.ts', name: 'CLOUD_CELL', value: 'skyEnvironment.clouds.cellM' },
  { id: 'DISC_SCALE reads config', file: 'src/sky/state.ts', name: 'DISC_SCALE', value: 'skyEnvironment.sky.discScale' },
];
describe('sky and environment knobs in config (step 8)', () => {
  it.each(SKY_CONFIG.map((e) => [e.id, e] as const))('%s', (_id, e) => {
    expect(propValue(e.file, e.name)).toBe(e.value);
  });
  it.each(SKY_CODE.map((e) => [e.id, e] as const))('%s', (_id, e) => {
    expect(rhsOf(e.file, e.name)).toBe(e.value);
  });
  it('sun altitude ramps and lights-on rule read config', () => {
    const s = source('src/environment/sun.ts');
    expect(s).toContain('smoothstep(skyEnvironment.lights.houseLampsOnDeg, skyEnvironment.lights.houseLampsFullDeg, altitudeDeg)');
    expect(s).toContain('altitudeDeg < skyEnvironment.lights.lightsOnBelowDeg');
    expect(s).toContain('(skyEnvironment.lights.headlightOnDeg - altitudeDeg) / (skyEnvironment.lights.headlightOnDeg - skyEnvironment.lights.headlightFullDeg)');
  });
});

export const SKY_ASSERTED_COUNT = SKY_CONFIG.length + SKY_CODE.length + 1;

// Monument knobs (step 9, public buildings review): literal odds and crowd counts moved to the buildings section.
// Config value equals the baseline literal; the monument builder reads it as buildings.<name>.
const MONUMENT_KNOBS: { name: string; file: string; value: string }[] = [
  { name: 'hospitalDormerLitShare', file: 'src/buildings/monuments/civicHospital.ts', value: '0.3' },
  { name: 'hospitalCrowd', file: 'src/buildings/monuments/civicHospital.ts', value: '8' },
  { name: 'fireDoorLitShare', file: 'src/buildings/monuments/civicServices.ts', value: '0.6' },
  { name: 'fireTowerLitShare', file: 'src/buildings/monuments/civicServices.ts', value: '0.25' },
  { name: 'supermarketPaneLitShare', file: 'src/buildings/monuments/civicServices.ts', value: '0.85' },
  { name: 'carParkRowAOccupancy', file: 'src/buildings/monuments/civicServices.ts', value: '0.6' },
  { name: 'carParkRowBOccupancy', file: 'src/buildings/monuments/civicServices.ts', value: '0.55' },
  { name: 'carParkRowBForwardShare', file: 'src/buildings/monuments/civicServices.ts', value: '0.7' },
  { name: 'stadiumCrowd', file: 'src/buildings/monuments/leisureSport.ts', value: '14' },
  { name: 'funfairCrowd', file: 'src/buildings/monuments/leisureFair.ts', value: '22' },
  { name: 'poolLoungerPersonShare', file: 'src/buildings/monuments/leisurePool.ts', value: '0.4' },
  { name: 'poolFacadeLitShare', file: 'src/buildings/monuments/leisurePool.ts', value: '0.5' },
  { name: 'circusCrowd', file: 'src/buildings/monuments/leisureCircus.ts', value: '10' },
  { name: 'circusWagonLitShare', file: 'src/buildings/monuments/leisureCircus.ts', value: '0.5' },
  { name: 'cathedralApseLitShare', file: 'src/buildings/monuments/cultureCathedral.ts', value: '0.4' },
  { name: 'cathedralNaveLitShare', file: 'src/buildings/monuments/cultureCathedral.ts', value: '0.35' },
  { name: 'cathedralWestTowerLitShare', file: 'src/buildings/monuments/cultureCathedral.ts', value: '0.4' },
  { name: 'cathedralCrowd', file: 'src/buildings/monuments/cultureCathedral.ts', value: '12' },
  { name: 'cathedralStonePalette', file: 'src/buildings/monuments/cultureCathedral.ts', value: "['#b3a286', '#a89c88', '#b8a683'] as readonly string[]" },
  { name: 'cathedralStoneJitter', file: 'src/buildings/monuments/cultureCathedral.ts', value: '0.04' },
  { name: 'cathedralRoofJitter', file: 'src/buildings/monuments/cultureCathedral.ts', value: '0.03' },
  { name: 'cathedralRoofSlate', file: 'src/buildings/monuments/cultureCathedral.ts', value: "'#3a414c'" },
  { name: 'cathedralRoofZinc', file: 'src/buildings/monuments/cultureCathedral.ts', value: "'#5d8076'" },
  { name: 'cathedralRoseLitShare', file: 'src/buildings/monuments/cultureCathedral.ts', value: '0.5' },
  { name: 'dinosaurFernCount', file: 'src/buildings/monuments/culturePrehistoric.ts', value: '10' },
  { name: 'theatreAudienceCount', file: 'src/buildings/monuments/cultureTheatre.ts', value: '24' },
  { name: 'theatreDoorLitShare', file: 'src/buildings/monuments/cultureTheatre.ts', value: '1' },
  { name: 'monumentShadowKinds', file: 'src/scene/useTownPieces.ts', value: "['gothic-cathedral'] as readonly MonumentKind[]" },
  { name: 'cityHallWindowLitShare', file: 'src/buildings/monuments/municipal.ts', value: '0.4' },
  { name: 'schoolTreeCount', file: 'src/buildings/monuments/education.ts', value: '6' },
];
describe('monument knobs in config (public buildings review, A1)', () => {
  it.each(MONUMENT_KNOBS.map((e) => [e.name, e] as const))('config value: %s', (_name, e) => {
    expect(propValue(CONFIG_FILE, e.name)).toBe(e.value);
  });
  it.each(MONUMENT_KNOBS.map((e) => [e.name, e] as const))('code reads config: %s', (_name, e) => {
    expect(norm(source(e.file))).toContain(`buildings.${e.name}`);
  });
});

/** Film camera knobs (video P1): config value, and the feature code reads the config object. */
const FILM_FILE = 'src/config/tuning/film.ts';
const FILM_KNOBS: Entry[] = [
  { id: 'film fps', file: FILM_FILE, name: 'fps', value: '30' },
  { id: 'film manual default length', file: FILM_FILE, name: 'manualDefaultSeconds', value: '30' },
  { id: 'film manual min length', file: FILM_FILE, name: 'manualMinSeconds', value: '1' },
  { id: 'film manual max length', file: FILM_FILE, name: 'manualMaxSeconds', value: '60' },
  { id: 'film full HD width', file: FILM_FILE, name: 'width1080', value: '1920' },
  { id: 'film full HD height', file: FILM_FILE, name: 'height1080', value: '1080' },
  { id: 'film video bitrate', file: FILM_FILE, name: 'videoBitrate1080', value: '12000000' },
  { id: 'film audio bitrate', file: FILM_FILE, name: 'audioBitrate', value: '192000' },
  { id: 'film audio peak target', file: FILM_FILE, name: 'audioPeakTargetDb', value: '-3' },
  { id: 'film auto length', file: FILM_FILE, name: 'autoSeconds', value: '60' },
  { id: 'film auto virtual minutes', file: FILM_FILE, name: 'autoVirtualMinutes', value: '60' },
  { id: 'film encoder queue max', file: FILM_FILE, name: 'encodeQueueMax', value: '4' },
  { id: 'film keyframe interval', file: FILM_FILE, name: 'keyframeIntervalS', value: '2' },
];

describe('film camera knobs in config (video P1)', () => {
  it.each(FILM_KNOBS.map((e) => [e.name, e] as const))('config value: %s', (_name, e) => {
    expect(propValue(FILM_FILE, e.name)).toBe(e.value);
  });
  it('film utils read the length limits from config', () => {
    expect(norm(source('src/ui/filmUtils.ts'))).toContain('film.manualMaxSeconds');
  });
  it('film session reads fps from config', () => {
    expect(norm(source('src/ui/filmSession.ts'))).toContain('film.fps');
  });
});

/** Auto film path knobs (video P5): config value, and scene/filmPath.ts reads the config object. */
const FILM_PATH_KNOBS: Entry[] = [
  { id: 'film sky tilt', file: FILM_FILE, name: 'skyTiltDeg', value: '35' },
  { id: 'film perch hold', file: FILM_FILE, name: 'perchHoldSeconds', value: '3' },
  { id: 'film cruise clearance', file: FILM_FILE, name: 'cruiseClearanceM', value: '15' },
  { id: 'film street clearance', file: FILM_FILE, name: 'streetClearanceM', value: '3' },
];

describe('film path knobs in config (video P5)', () => {
  it.each(FILM_PATH_KNOBS.map((e) => [e.name, e] as const))('config value: %s', (_name, e) => {
    expect(propValue(FILM_FILE, e.name)).toBe(e.value);
  });
  it.each(FILM_PATH_KNOBS.map((e) => [e.name, e] as const))('path reads config: %s', (_name, e) => {
    const planner = ['filmPath', 'filmPathPlan', 'filmPathKeys'].map((f) => source(`src/scene/${f}.ts`)).join('\n');
    expect(norm(planner)).toContain(`film.${e.name}`);
  });
});

/** House type thumbnail knobs (House panel carousel): config value, and the renderer reads the config object. */
const SCENE_QA_FILE = 'src/config/tuning/sceneQa.ts';
const HOUSE_THUMB_KNOBS: Entry[] = [
  { id: 'house thumb size', file: SCENE_QA_FILE, name: 'thumbSizePx', value: '256' },
  { id: 'house thumb margin', file: SCENE_QA_FILE, name: 'thumbMargin', value: '1.12' },
  { id: 'house thumb azimuth', file: SCENE_QA_FILE, name: 'thumbAzimuthDeg', value: '35' },
  { id: 'house thumb elevation', file: SCENE_QA_FILE, name: 'thumbElevationDeg', value: '18' },
  { id: 'house thumb fov', file: SCENE_QA_FILE, name: 'thumbFovDeg', value: '28' },
  { id: 'house thumb key light', file: SCENE_QA_FILE, name: 'thumbKeyIntensity', value: '3' },
  { id: 'house thumb fill light', file: SCENE_QA_FILE, name: 'thumbFillIntensity', value: '1.6' },
];

describe('house thumbnail knobs in config', () => {
  it.each(HOUSE_THUMB_KNOBS.map((e) => [e.name, e] as const))('config value: %s', (_name, e) => {
    expect(propValue(SCENE_QA_FILE, e.name)).toBe(e.value);
  });
  it.each(HOUSE_THUMB_KNOBS.map((e) => [e.name, e] as const))('renderer reads config: %s', (_name, e) => {
    expect(norm(source('src/scene/HouseThumbRenderer.tsx'))).toContain(`.${e.name}`);
  });
});

export const ASSERTED_VALUE_COUNT = VALUES.length + FRAGMENTS.length + LAB_MIRROR.length + DUPLICATE_LISTS.length + 1;
