// Tuning parity for the audio section (CLAUDE.md: knobs live in src/config/tuning/). Each moved knob must be
// declared in config/tuning/audio.ts with its baseline value, and its feature const must read it
// (`const NAME = audioTuning.key;`). Values are read from source text, as in tests/tuningParity.test.ts.
import { describe, expect, it } from 'vitest';

const RAW = import.meta.glob(['/src/config/tuning/audio.ts', '/src/audio/*.ts'], { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>;
const CONFIG = '/src/config/tuning/audio.ts';

function configValue(key: string): string {
  const m = new RegExp(`^[ \\t]*${key}:[ \\t]*(.+?),[ \\t]*$`, 'm').exec(RAW[CONFIG] ?? '');
  if (!m) throw new Error(`audio.ts: key ${key} not found`);
  return (m[1] ?? '').trim();
}

/** [feature file under src/audio, const name, config key, baseline value] */
const MOVED: [string, string, string, string][] = [
  ['animalsPure.ts', 'MAX_EVENT_SONGS', 'maxEventSongs', '4'],
  ['animalsPure.ts', 'MAX_AMBIENT_SONGS', 'maxAmbientSongs', '3'],
  ['animalsPure.ts', 'AMBIENT_MIN_M', 'ambientMinM', '20'],
  ['animalsPure.ts', 'AMBIENT_MAX_M', 'ambientMaxM', '90'],
  ['animalsPure.ts', 'AMBIENT_MEAN_S', 'ambientMeanS', '9'],
  ['animalsPure.ts', 'OWL_MEAN_S', 'owlMeanS', '28'],
  ['animalsPure.ts', 'BIRD_MAX_M', 'birdMaxM', '160'],
  ['animalsPure.ts', 'FLAP_BIRDS_MIN', 'flapBirdsMin', '3'],
  ['animalsPure.ts', 'FLAP_BIRDS_MAX', 'flapBirdsMax', '6'],
  ['animalsPure.ts', 'MAX_FLAPS', 'maxFlaps', '3'],
  ['animalsPure.ts', 'DOG_RANGE_M', 'dogRangeM', '120'],
  ['animalsPure.ts', 'DOG_MEAN_S', 'dogMeanS', '900'],
  ['animalsPure.ts', 'MAX_BARKERS', 'maxBarkers', '3'],
  ['natureCore.ts', 'RUSTLE_INTERVAL_MIN_S', 'rustleIntervalMinS', '8'],
  ['natureCore.ts', 'RUSTLE_INTERVAL_MAX_S', 'rustleIntervalMaxS', '12'],
  ['natureCore.ts', 'RUSTLE_MIN_WIND', 'rustleMinWind', '1.5'],
  ['natureCore.ts', 'RUSTLE_TREES', 'rustleTrees', '3'],
  ['natureCore.ts', 'RUSTLE_NEAREST', 'rustleNearest', '5'],
  ['natureCore.ts', 'WHISTLE_MIN_WIND', 'whistleMinWind', '8'],
  ['natureCore.ts', 'WHISTLE_FULL_WIND', 'whistleFullWind', '14'],
  ['natureCore.ts', 'WHISTLE_MAX', 'whistleMax', '2'],
  ['natureCore.ts', 'WHISTLE_MIN_M', 'whistleMinM', '15'],
  ['natureCore.ts', 'WHISTLE_MAX_M', 'whistleMaxM', '70'],
  ['vehiclesCore.ts', 'ENGINE_VOICES', 'engineVoices', '8'],
  ['vehiclesCore.ts', 'ENGINE_MAX_DISTANCE', 'engineMaxDistanceM', '120'],
  ['vehiclesCore.ts', 'HORN_MAX_DISTANCE', 'hornMaxDistanceM', '220'],
  ['vehiclesCore.ts', 'HORN_MAX_CONCURRENT', 'hornMaxConcurrent', '4'],
  ['peopleCore.ts', 'CHAT_VOICES', 'chatVoices', '4'],
  ['peopleCore.ts', 'CHAT_MAX_DISTANCE', 'chatMaxDistanceM', '30'],
  ['peopleCore.ts', 'STEP_MAX_DISTANCE', 'stepMaxDistanceM', '28'],
  ['peopleCore.ts', 'UMBRELLA_MAX_DISTANCE', 'umbrellaMaxDistanceM', '25'],
  ['peopleCore.ts', 'RAIN_ON', 'pedestrianRainOn', '0.15'],
  ['peopleCore.ts', 'RAIN_OFF', 'pedestrianRainOff', '0.1'],
  ['aircraft.ts', 'AIRCRAFT_MAX_VOICES', 'aircraftMaxVoices', '2'],
  ['aircraft.ts', 'AIRCRAFT_REF_DISTANCE', 'aircraftRefDistanceM', '250'],
  ['aircraft.ts', 'AIRCRAFT_MAX_DISTANCE', 'aircraftMaxDistanceM', '2500'],
  ['aircraft.ts', 'FADE_IN_S', 'aircraftFadeInS', '3'],
  ['aircraft.ts', 'FADE_OUT_S', 'aircraftFadeOutS', '2.5'],
  ['rain.ts', 'RAIN_ON', 'dropRainOn', '0.05'],
  ['rain.ts', 'MIN_RADIUS', 'dropMinRadiusM', '3'],
  ['rain.ts', 'MAX_RADIUS', 'dropMaxRadiusM', '60'],
  ['weather.ts', 'THUNDER_MAX_PLACE_DISTANCE', 'thunderMaxPlaceDistanceM', '450'],
  ['weather.ts', 'THUNDER_HEIGHT', 'thunderHeightM', '60'],
  ['animalsPure.ts', 'DOG_VEHICLE_M', 'dogVehicleM', '12'],
  ['animalsPure.ts', 'DOG_VEHICLE_SPEED', 'dogVehicleSpeed', '3'],
  ['natureCore.ts', 'RUSTLE_DURATION_MIN_S', 'rustleDurationMinS', '1.6'],
  ['natureCore.ts', 'RUSTLE_DURATION_MAX_S', 'rustleDurationMaxS', '3.4'],
  ['natureCore.ts', 'WHISTLE_Y', 'whistleHeightM', '8'],
  ['natureCore.ts', 'BELL_Y', 'bellHeightM', '25'],
  ['peopleCore.ts', 'STEP_VOICES', 'stepVoices', '5'],
  ['peopleCore.ts', 'UMBRELLA_VOICES', 'umbrellaVoices', '4'],
  ['peopleCore.ts', 'FADE_OUT_S', 'peopleFadeOutS', '0.4'],
  ['vehiclesCore.ts', 'INDICATOR_VOICES', 'indicatorVoices', '6'],
  ['vehiclesCore.ts', 'INDICATOR_MAX_DISTANCE', 'indicatorMaxDistanceM', '60'],
  ['vehiclesCore.ts', 'INDICATOR_HZ', 'indicatorHz', '1.5'],
  ['vehiclesCore.ts', 'FADE_OUT_S', 'vehiclesFadeOutS', '0.5'],
  ['weather.ts', 'THUNDER_LENGTH_SCALE', 'thunderLengthScale', '1.3'],
  ['rain.ts', 'MAX_EVENTS_PER_EMITTER_PER_FRAME', 'maxEventsPerEmitterPerFrame', '8'],
  ['musicMood.ts', 'FADE_SECONDS', 'musicFadeS', '2'],
];

describe('audio knobs read config/tuning/audio.ts', () => {
  it.each(MOVED)('%s %s reads audio.%s (baseline %s)', (file, name, key, value) => {
    const src = RAW[`/src/audio/${file}`] ?? '';
    expect(src).toMatch(new RegExp(`const\\s+${name}\\s*=\\s*audioTuning\\.${key}\\s*;`));
    expect(configValue(key)).toBe(value);
  });
});
