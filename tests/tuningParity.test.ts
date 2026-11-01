// Tuning parity baseline (docs/TUNING-PLAN.md section 2, step 1).
// Captures every knob that the plan moves to src/config/tuning.ts, using the literal values in the code NOW.
// Values are read from source text (not imported), so this test works before any value moves and needs no
// production change. When a value moves, the entry switches to the config module; the expected value stays.
import { describe, expect, it } from 'vitest';

// Raw source text of every src and test file, bundled by Vite (no node typings needed).
const RAW = import.meta.glob(['/src/**/*.{ts,tsx}', '/tests/*.ts'], { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>;

function source(rel: string): string {
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
  { id: 'decide distance', file: 'src/traffic/vehicles/constants.ts', name: 'DECIDE_DISTANCE', value: '40' },
  { id: 'left turn speed', file: CONFIG_FILE, name: 'leftTurnSpeed', value: '5.5' },
  { id: 'right turn speed', file: CONFIG_FILE, name: 'rightTurnSpeed', value: '4.5' },
  { id: 'horn cooldown', file: CONFIG_FILE, name: 'hornCooldownS', value: '45' },
  { id: 'horn global gap', file: CONFIG_FILE, name: 'hornGlobalGapS', value: '6' },
  { id: 'horn chance', file: CONFIG_FILE, name: 'hornChance', value: '0.5' },
  { id: 'pigeon count (high)', file: CONFIG_FILE, name: 'pigeonCount', value: '80' },
  { id: 'cat count (high)', file: CONFIG_FILE, name: 'catCount', value: '14' },
  { id: 'squirrel count (high)', file: CONFIG_FILE, name: 'squirrelCount', value: '10' },
  { id: 'butterfly/bee count (high)', file: CONFIG_FILE, name: 'butterflyCount', value: '30' },
  { id: 'walker cap', file: 'src/traffic/walkers/constants.ts', name: 'MAX_WALKERS', value: '480' },
  { id: 'walkers per road', file: 'src/traffic/walkers/constants.ts', name: 'WALKERS_PER_ROAD', value: '22' },
  { id: 'dog cap', file: 'src/traffic/walkers/constants.ts', name: 'MAX_DOGS', value: '120' },
  { id: 'dog share', file: CONFIG_FILE, name: 'dogShare', value: '0.22' },
  { id: 'pair chance', file: 'src/traffic/walkers/constants.ts', name: 'PAIR_CHANCE', value: '0.2' },
  { id: 'walker turn rate', file: 'src/traffic/walkers/constants.ts', name: 'TURN_RATE', value: '7' },
  { id: 'crossing margin', file: 'src/traffic/walkers/constants.ts', name: 'CROSS_MARGIN', value: '2.0' },
  { id: 'give-up wait', file: 'src/traffic/walkers/constants.ts', name: 'GIVE_UP_WAIT', value: '150' },
  { id: 'walker wait distance', file: 'src/traffic/walkers/constants.ts', name: 'WAIT_DIST', value: '0.45' },

  // 2. Life and wildlife (audio half lives in section 6 block)
  { id: 'scare radius', file: 'src/life/birds.ts', name: 'SCARE_RADIUS', value: '4' },

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
  { id: 'shadow leaf fraction (city)', file: CONFIG_FILE, name: 'shadowLeafFraction', value: '0.5' },
  { id: 'courtyard trees min', file: CONFIG_FILE, name: 'courtyardTreeMin', value: '2' },
  { id: 'courtyard trees max', file: CONFIG_FILE, name: 'courtyardTreeMax', value: '6' },
  { id: 'tree spacing', file: 'src/city/streetscape.ts', name: 'TREE_SPACING', value: 'LAMP_SPACING / 2' },
  { id: 'bench chance', file: CONFIG_FILE, name: 'benchChance', value: '0.6' },
  { id: 'tree rate (avenue 1, street 0.35)', file: CONFIG_FILE, name: 'treeRate', value: '{ avenue: 1, street: 0.35 }' },
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
  { id: 'monument chance', file: CONFIG_FILE, name: 'monumentChance', value: '0.1' },
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
  { id: 'aircraft speed min', file: 'src/aircraft/schedule.ts', name: 'SPEED_MIN', value: '40' },
  { id: 'aircraft speed max', file: 'src/aircraft/schedule.ts', name: 'SPEED_MAX', value: '90' },
  { id: 'aircraft altitude max', file: 'src/aircraft/schedule.ts', name: 'ALTITUDE_MAX', value: 'Math.min(300, MAX_CAMERA_HEIGHT - CAMERA_SAFETY_MARGIN)' },
  { id: 'aircraft spawn radius min', file: 'src/aircraft/schedule.ts', name: 'SPAWN_RADIUS_MIN', value: '900' },
  { id: 'aircraft spawn radius max', file: 'src/aircraft/schedule.ts', name: 'SPAWN_RADIUS_MAX', value: '1020' },
  { id: 'sun gain (now sceneQa.sunGain)', file: 'src/scene/townShadow.ts', name: 'SUN_GAIN', value: 'sceneQa.sunGain' },
  { id: 'hemisphere gain (now sceneQa.hemiGain)', file: 'src/scene/townShadow.ts', name: 'HEMI_GAIN', value: 'sceneQa.hemiGain' },
  { id: 'ambient gain (now sceneQa.ambientGain)', file: 'src/scene/townShadow.ts', name: 'AMBIENT_GAIN', value: 'sceneQa.ambientGain' },
  { id: 'location (Hanoi)', file: 'src/environment/sun.ts', name: 'DEFAULT_LOCATION', value: '{ lat: 21.03, lng: 105.85, utcOffsetHours: 7 }' },
  { id: 'default date', file: 'src/environment/sun.ts', name: 'DEFAULT_DATE', value: '{ year: 2026, month: 3, day: 20 }' },

  // 6. Audio
  { id: 'ambient animal interval', file: 'src/audio/animals.ts', name: 'AMBIENT_MEAN_S', value: '9' },
  { id: 'owl interval', file: 'src/audio/animals.ts', name: 'OWL_MEAN_S', value: '28' },
  { id: 'bird call level', file: CONFIG_FILE, name: 'birdLevel', value: '1' },
  { id: 'flap birds min', file: 'src/audio/animals.ts', name: 'FLAP_BIRDS_MIN', value: '3' },
  { id: 'flap birds max', file: 'src/audio/animals.ts', name: 'FLAP_BIRDS_MAX', value: '6' },
  { id: 'flap level', file: CONFIG_FILE, name: 'flapLevel', value: '0.55' },
  { id: 'max flaps', file: 'src/audio/animals.ts', name: 'MAX_FLAPS', value: '3' },
  { id: 'dog bark range', file: 'src/audio/animals.ts', name: 'DOG_RANGE_M', value: '120' },
  { id: 'dog bark mean interval', file: 'src/audio/animals.ts', name: 'DOG_MEAN_S', value: '900' },
  { id: 'max barkers', file: 'src/audio/animals.ts', name: 'MAX_BARKERS', value: '3' },
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
  { id: 'bell pitch', file: 'src/audio/nature.ts', name: 'BELL_HZ', value: '230' },
  { id: 'bell spacing', file: CONFIG_FILE, name: 'bellSpacingS', value: '3.2' },
  { id: 'bell range', file: CONFIG_FILE, name: 'bellRangeM', value: '400' },
  { id: 'bell height', file: 'src/audio/nature.ts', name: 'BELL_Y', value: '25' },
  { id: 'bell level', file: CONFIG_FILE, name: 'bellLevel', value: '0.14' },
  { id: 'rustle range', file: CONFIG_FILE, name: 'rustleRangeM', value: '70' },
  { id: 'rustle interval min', file: 'src/audio/nature.ts', name: 'RUSTLE_INTERVAL_MIN_S', value: '8' },
  { id: 'rustle interval max', file: 'src/audio/nature.ts', name: 'RUSTLE_INTERVAL_MAX_S', value: '12' },
  { id: 'rustle min wind', file: 'src/audio/nature.ts', name: 'RUSTLE_MIN_WIND', value: '1.5' },
  { id: 'rustle gain', file: CONFIG_FILE, name: 'rustleGain', value: '0.55' },
  { id: 'rain drop emitters max', file: CONFIG_FILE, name: 'maxDropEmitters', value: '10' },
  { id: 'rain bed emitters', file: CONFIG_FILE, name: 'bedEmitters', value: '4' },
  { id: 'rain sound on threshold', file: 'src/audio/rain.ts', name: 'RAIN_ON', value: '0.05' },
  { id: 'rain drop min radius', file: 'src/audio/rain.ts', name: 'MIN_RADIUS', value: '3' },
  { id: 'rain drop max radius', file: 'src/audio/rain.ts', name: 'MAX_RADIUS', value: '60' },
  { id: 'puddle level', file: CONFIG_FILE, name: 'puddleLevel', value: '0.3' },
  { id: 'pedestrian rain on', file: 'src/audio/people.ts', name: 'RAIN_ON', value: '0.15' },
  { id: 'pedestrian rain off', file: 'src/audio/people.ts', name: 'RAIN_OFF', value: '0.1' },
  { id: 'thunder max distance', file: 'src/audio/weather.ts', name: 'THUNDER_MAX_PLACE_DISTANCE', value: '450' },
  { id: 'thunder height', file: 'src/audio/weather.ts', name: 'THUNDER_HEIGHT', value: '60' },
  { id: 'thunder loudness', file: CONFIG_FILE, name: 'thunderLoudness', value: '2' },
  { id: 'music level', file: CONFIG_FILE, name: 'musicLevel', value: '0.8' },
  { id: 'music duck level', file: CONFIG_FILE, name: 'duckLevel', value: '0.55' },
  { id: 'music fade', file: 'src/audio/music.ts', name: 'FADE_SECONDS', value: '2' },
  { id: 'engine voices', file: 'src/audio/vehicles.ts', name: 'ENGINE_VOICES', value: '8' },
  { id: 'horn max distance', file: 'src/audio/vehicles.ts', name: 'HORN_MAX_DISTANCE', value: '220' },
  { id: 'horn max concurrent (not exported)', file: 'src/audio/vehicles.ts', name: 'HORN_MAX_CONCURRENT', value: '4' },
  { id: 'air brake level', file: CONFIG_FILE, name: 'airBrakeLevel', value: '0.4' },
  { id: 'jet gain', file: CONFIG_FILE, name: 'jetGain', value: '0.55' },
  { id: 'master volume default', file: CONFIG_FILE, name: 'masterVolumeDefault', value: '0.8' },
  { id: 'mixer defaults', file: CONFIG_FILE, name: 'mixerDefaults', value: '{ master: 80, effects: 100, nature: 100, music: 100 }' },
  { id: 'cricket summer density', file: CONFIG_FILE, name: 'cricketSummerDensity', value: '1' },
  { id: 'cricket autumn density', file: CONFIG_FILE, name: 'cricketAutumnDensity', value: '0.5' },

  // 7. Buildings and city
  { id: 'min floors', file: CONFIG_FILE, name: 'minFloors', value: '2' },
  { id: 'max floors', file: CONFIG_FILE, name: 'maxFloors', value: '8' },
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
  { id: 'camera eye height', file: CONFIG_FILE, name: 'eyeHeight', value: '1.7' },
  { id: 'camera tween seconds', file: CONFIG_FILE, name: 'tweenSeconds', value: '1' },
  { id: 'camera pan margin', file: CONFIG_FILE, name: 'panMargin', value: '40' },
  { id: 'block edit height', file: CONFIG_FILE, name: 'blockEditHeightM', value: '200' },
  { id: 'camera max polar angle', file: CONFIG_FILE, name: 'maxPolarAngle', value: 'Math.PI / 2.05' },
  { id: 'camera damping', file: CONFIG_FILE, name: 'dampingFactor', value: '0.08' },
  { id: 'camera target height max', file: CONFIG_FILE, name: 'targetHeightMax', value: '40' },
  { id: 'street walk speed', file: CONFIG_FILE, name: 'walkSpeed', value: '2.5' },
  { id: 'street run speed', file: CONFIG_FILE, name: 'walkRunSpeed', value: '6' },
  { id: 'street look sensitivity', file: CONFIG_FILE, name: 'lookSensitivity', value: '0.004' },
  { id: 'street pitch limit', file: CONFIG_FILE, name: 'pitchLimit', value: '1.2' },
  { id: 'whole-map fit margin', file: CONFIG_FILE, name: 'fitMargin', value: '1.06' },
  { id: 'block edit pick height', file: CONFIG_FILE, name: 'pickHeightM', value: '150' },
  { id: 'block edit decal height', file: CONFIG_FILE, name: 'decalHeightM', value: '0.3' },
  { id: 'block edit tap slop', file: CONFIG_FILE, name: 'tapSlopPx', value: '6' },

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
  { id: 'vehicle car spec', file: 'src/traffic/vehicles/constants.ts', fragment: 'car: { cruiseSpeed: 11,' },
  { id: 'vehicle bus spec', file: 'src/traffic/vehicles/constants.ts', fragment: 'bus: { cruiseSpeed: 8,' },
  { id: 'vehicle truck spec', file: 'src/traffic/vehicles/constants.ts', fragment: 'truck: { cruiseSpeed: 9,' },
  { id: 'vehicle motorbike spec', file: 'src/traffic/vehicles/constants.ts', fragment: 'motorbike: { cruiseSpeed: 13,' },
  { id: 'flock 1 (count, alt, speed)', file: 'src/life/birds.ts', fragment: '{ kind: 0, count: 25, alt: 26, speed: 9 }' },
  { id: 'flock 2 (count, alt, speed)', file: 'src/life/birds.ts', fragment: '{ kind: 1, count: 25, alt: 35, speed: 10.5 }' },
  { id: 'flock 3 (count, alt, speed)', file: 'src/life/birds.ts', fragment: '{ kind: 2, count: 25, alt: 44, speed: 8.5 }' },
  { id: 'gull count (high 2, low 1)', file: 'src/life/birds.ts', fragment: "const gulls = quality === 'low' ? 1 : 2;" },
  { id: 'pigeon count', file: 'src/life/birds.ts', fragment: 'scaledCount(trafficLife.pigeonCount, quality)' },
  { id: 'cat count', file: 'src/life/pets.ts', fragment: 'scaledCount(trafficLife.catCount, quality)' },
  { id: 'squirrel count', file: 'src/life/pets.ts', fragment: 'scaledCount(trafficLife.squirrelCount, quality)' },
  { id: 'butterfly/bee count', file: 'src/life/pets.ts', fragment: 'scaledCount(trafficLife.butterflyCount, quality)' },
  { id: 'bee share', file: 'src/life/pets.ts', fragment: 'Math.floor(n * 0.2)' },
  { id: 'life quality factors', file: 'src/life/common.ts', fragment: "q === 'low' ? 0.4 : q === 'medium' ? 0.7 : 1" },
  { id: 'autumn particle profile (density, size, fall)', file: 'src/environment/seasons.ts', fragment: "density: 1, colors: ['#c8552a', '#d4862a', '#e0b23a', '#a8452a', '#b9a02e']" },
  { id: 'spring petal profile density', file: 'src/environment/seasons.ts', fragment: 'density: 0.85,' },
  { id: 'ground colours by season', file: 'src/sky/state.ts', fragment: "spring: '#8fa86c', summer: '#7f9a5a', autumn: '#9a8c5a', winter: '#dde3e8'" },
  { id: 'lit window share (house default)', file: 'src/buildings/facade/parts.ts', fragment: 'opts.litChance ?? buildings.litWindowShare' },
  { id: 'lit window share (monuments)', file: 'src/buildings/monuments/kit.ts', fragment: 'o.litP ?? buildings.litWindowShareMonument' },
  { id: 'lit window share (ground floor 0.55 / 0.6 / 0.4)', file: 'src/buildings/facade/ground.ts', fragment: '0.55' },
  { id: 'night bloom strength', file: 'src/scene/PostFX.tsx', fragment: 'fx.bloom.strength = (night ? nb.strengthNight : nb.strengthDay) * bloomScale;' },
  { id: 'night bloom threshold', file: 'src/scene/PostFX.tsx', fragment: 'fx.bloom.threshold = night ? nb.thresholdNight : nb.thresholdDay;' },
  { id: 'night bloom radius', file: 'src/scene/PostFX.tsx', fragment: 'fx.bloom.radius = night ? nb.radiusNight : nb.radiusDay;' },
  { id: 'cloud count in scene (value now in config)', file: 'src/config/tuning.ts', fragment: 'sceneCount: 10,' },
  { id: 'cloud count in scene (Town.tsx reads config)', file: 'src/scene/Town.tsx', fragment: 'count: skyEnvironment.clouds.sceneCount, seed: settings.seed' },
  { id: 'rain cap by kind (rain 0.75, storm 1)', file: 'src/weather/weatherState.ts', fragment: 'skyEnvironment.weather.rainCapRain' },
  { id: 'snow cover ramp', file: 'src/weather/weatherState.ts', fragment: 'Math.min(1, 0.25 + 0.9 * i)' },
  { id: 'weather ease table', file: 'src/weather/weatherState.ts', fragment: 'snowCover: [18, 25]' },
  { id: 'fog colours', file: 'src/weather/fog.ts', fragment: "GREY_FOG = new THREE.Color('#aeb4bb')" },
  { id: 'cricket season factor reads config', file: 'src/audio/nature.ts', fragment: "season === 'summer' ? audioTuning.cricketSummerDensity : season === 'autumn' ? audioTuning.cricketAutumnDensity : 0" },
  { id: 'bus master default reads config', file: 'src/audio/bus.ts', fragment: 'master: audioTuning.masterVolumeDefault' },
  { id: 'mixer defaults read config', file: 'src/ui/SoundMixer.tsx', fragment: 'MIXER_DEFAULTS: MixerSettings = audioTuning.mixerDefaults' },
  { id: 'golden glow curve', file: 'src/sky/state.ts', fragment: 'smoothstep(14, 5, alt) * smoothstep(-6, 0, alt)' },
  { id: 'golden phase threshold (6 deg)', file: 'src/environment/sun.ts', fragment: 'if (altDeg < 6) return' },
  { id: 'house lamp ramp', file: 'src/environment/sun.ts', fragment: 'skyEnvironment.lights.houseLampsOnDeg' },
  { id: 'lights on rule', file: 'src/environment/sun.ts', fragment: 'skyEnvironment.lights.lightsOnBelowDeg' },
  { id: 'vehicle headlight level (-altitude / 8)', file: 'src/environment/sun.ts', fragment: 'skyEnvironment.lights.headlightFullDeg' },
  { id: 'leaf spawn fill time (12 s)', file: 'src/environment/leaves.ts', fragment: 'this.limit * this.profile.density) / 12' },
  { id: 'cloud drift wind factor source', file: 'src/environment/cloudSprites.ts', fragment: 'CLOUD_WIND_FACTOR' },
  { id: 'lightning gap formula', file: 'src/weather/Lightning.ts', fragment: '6 - 3.5' },
  { id: 'autumn leaves rest (LEAF_REST_SECONDS used)', file: 'src/environment/leaves.ts', fragment: 'LEAF_REST_SECONDS' },
  { id: 'store defaults read from config uiCamera', file: 'src/store/model.ts', fragment: 'seed: uiCamera.defaultSeed' },
  { id: 'overview direction (tuple, fragment check)', file: CONFIG_FILE, fragment: 'overviewDirection: [0, 1.75, 0.45]' },
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
  { id: 'lab shadow leaf fraction = city', file: LAB_FILE, name: 'shadowLeafFraction', value: '0.5' },
];

/** Duplicate lists (plan section 3): each copy must equal the expected list. */
const DUPLICATE_LISTS = [
  { name: 'HOUSE_PRESETS', prop: 'housePresets', files: ['src/store/model.ts', 'src/buildings/house.ts'], count: 10 },
  { name: 'MONUMENT_KINDS', prop: 'monumentKinds', files: ['src/store/model.ts', 'src/buildings/monument.ts'], count: 10 },
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
  { id: 'house lamps on', file: CONFIG_FILE, name: 'houseLampsOnDeg', value: '4' },
  { id: 'house lamps full', file: CONFIG_FILE, name: 'houseLampsFullDeg', value: '-2' },
  { id: 'shop lights on', file: CONFIG_FILE, name: 'shopLightsOnDeg', value: '2' },
  { id: 'shop lights full', file: CONFIG_FILE, name: 'shopLightsFullDeg', value: '-4' },
  { id: 'windows on', file: CONFIG_FILE, name: 'windowsOnDeg', value: '8' },
  { id: 'windows full', file: CONFIG_FILE, name: 'windowsFullDeg', value: '-2' },
  { id: 'lights on below', file: CONFIG_FILE, name: 'lightsOnBelowDeg', value: '0' },
  { id: 'headlight full', file: CONFIG_FILE, name: 'headlightFullDeg', value: '-8' },
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
  { id: 'LEAF_SCALE reads config', file: 'src/environment/leaves.ts', name: 'LEAF_SCALE', value: 'skyEnvironment.leaves.leafScale' },
  { id: 'MAX_STREAKS reads config', file: 'src/weather/Rain.ts', name: 'MAX_STREAKS', value: 'skyEnvironment.weather.maxRainStreaks' },
  { id: 'MAX_FLAKES reads config', file: 'src/weather/Snow.ts', name: 'MAX_FLAKES', value: 'skyEnvironment.weather.maxSnowFlakes' },
  { id: 'MAX_BANKS reads config', file: 'src/weather/fog.ts', name: 'MAX_BANKS', value: 'skyEnvironment.weather.maxFogBanks' },
  { id: 'BOLT_VISIBLE_DISTANCE reads config', file: 'src/weather/Lightning.ts', name: 'BOLT_VISIBLE_DISTANCE', value: 'skyEnvironment.weather.boltVisibleM' },
  { id: 'CLOUD_CELL reads config', file: 'src/environment/cloudSprites.ts', name: 'CLOUD_CELL', value: 'skyEnvironment.clouds.cellM' },
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
    expect(s).toContain('-altitudeDeg / -skyEnvironment.lights.headlightFullDeg');
  });
});

export const SKY_ASSERTED_COUNT = SKY_CONFIG.length + SKY_CODE.length + 1;

export const ASSERTED_VALUE_COUNT = VALUES.length + FRAGMENTS.length + LAB_MIRROR.length + DUPLICATE_LISTS.length + 1;
