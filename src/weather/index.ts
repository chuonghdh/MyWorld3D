// Weather controller. One object the scene mounts: createWeather() returns a `group` for the scene
// and update(dt, ctx) which returns the derived values the scene needs (see WeatherOutput).
// Draw calls: rain streaks 1 + ripples 1 + snow 1 + fog banks 1 + bolt 1, each hidden (and so free)
// when its weather is not active; typical rain uses 2, storm 3 during a flash, snow 1-2, fog 1.
import * as THREE from 'three';
import { FogBanks, fogDensityMultiplier, fogTintFor } from './fog';
import { LightningBolt, LightningController, type Thunder } from './Lightning';
import { Rain } from './Rain';
import { Snow } from './Snow';
import { resetSurfaceWeather, setSurfaceWeather } from './wet';
import {
  createValues,
  snapValues,
  stepValues,
  weatherTargets,
  type WeatherKind,
  type WeatherTargets,
  type WeatherValues,
} from './weatherState';

export * from './weatherState';
export { applyFogRange, fogDensityMultiplier } from './fog';
export { attachWeather, weatherUniforms } from './wet';
export { thunderDelay } from './Lightning';

export interface WeatherContext {
  camera: { x: number; y: number; z: number };
  /** Wind vector in m/s (x east, z south), from windVector(). */
  wind: { x: number; z: number };
  /** 0..1 daylight level, e.g. sky.ambientIntensity normalised, or 0 at night. Tints particles and puddles. */
  lightLevel: number;
  /** Sky colour for puddle reflections and fog tint blend (any {r,g,b} in 0..1). */
  skyColor?: { r: number; g: number; b: number };
  /** Drawing buffer height / (2 tan(fov/2)) for snow point size; optional. */
  pixelScale?: number;
}

export interface WeatherOutput {
  kind: WeatherKind;
  intensity: number;
  /** 0..1 eased rain amount. Feed to LifeContext.rain and VisualContext.rain (umbrellas, birds, pets). */
  rain: number;
  /** 0..1 eased surface wetness (also written to the shared uWet uniform). */
  wetness: number;
  /** 0..1 eased snow cover (also written to uSnow). */
  snow: number;
  /** 0..1 eased snowfall. */
  snowfall: number;
  /** Multiply the fog density by this; use applyFogRange(fog, near, far, fogDensityMul) for THREE.Fog. */
  fogDensityMul: number;
  /** Colour to blend scene.fog and the background toward by `fogTintAmount`. Reused object. */
  fogTint: THREE.Color;
  fogTintAmount: number;
  /** 0..1 extra cloud cover wanted (feed to the cloud control). */
  cloudiness: number;
  /** 0..1 lightning flash right now: add to the hemisphere / ambient intensity and the sky colour. */
  flash: number;
  /** Multiply sun and hemisphere intensity by this (<= 1). Already excludes the flash. */
  dim: number;
  /** 0..1 storm amount (eased); drives wind swell. */
  storm: number;
}

export interface WeatherOptions {
  kind?: WeatherKind;
  intensity?: number;
  /** Random function for lightning (tests). */
  random?: () => number;
}

export interface Weather {
  /** Add to the scene once. */
  readonly group: THREE.Group;
  /** Sets the target weather; eases in over seconds. `snap` jumps at once (loading a save). */
  setWeather(kind: WeatherKind, intensity: number, snap?: boolean): void;
  update(dt: number, ctx: WeatherContext): WeatherOutput;
  /** The latest output without advancing. */
  readonly output: WeatherOutput;
  readonly lightning: LightningController;
  /** Thunder claps due this frame (delay already applied); the array is reused between frames. */
  readonly thunder: readonly Thunder[];
  /** Forces a strike (debug); only has a visible effect while the camera is set. */
  strike(distance?: number): void;
  dispose(): void;
}

const NO_SKY = { r: 0.6, g: 0.7, b: 0.85 };

export function createWeather(opts: WeatherOptions = {}): Weather {
  const group = new THREE.Group();
  group.name = 'weather';
  const rain = new Rain();
  const snow = new Snow();
  const banks = new FogBanks();
  const lightning = new LightningController({ random: opts.random });
  const bolt = new LightningBolt(opts.random);
  group.add(rain.group, snow.group, banks.mesh, bolt.mesh);

  let kind: WeatherKind = opts.kind ?? 'clear';
  let intensity = opts.intensity ?? 0.6;
  const targets: WeatherTargets = weatherTargets(kind, intensity);
  const values: WeatherValues = snapValues(createValues(), targets);
  let time = 0;
  let lastCam = { x: 0, z: 0 };
  const thunderBuf: Thunder[] = [];

  const output: WeatherOutput = {
    kind,
    intensity,
    rain: 0,
    wetness: 0,
    snow: 0,
    snowfall: 0,
    fogDensityMul: 1,
    fogTint: new THREE.Color(),
    fogTintAmount: 0,
    cloudiness: 0,
    flash: 0,
    dim: 1,
    storm: 0,
  };

  function fill(): void {
    output.kind = kind;
    output.intensity = intensity;
    output.rain = values.rain;
    output.wetness = values.wet;
    output.snow = values.snowCover;
    output.snowfall = values.snowfall;
    output.cloudiness = values.cloud;
    output.dim = values.dim;
    output.storm = values.storm;
    output.fogDensityMul = fogDensityMultiplier(values.fog, values.rain, values.snowfall);
    output.fogTintAmount = Math.min(1, values.fog * 0.8 + values.rain * 0.3 + values.snowfall * 0.3);
  }
  fill();

  return {
    group,
    output,
    lightning,
    thunder: thunderBuf,
    setWeather(k, i, snap = false) {
      kind = k;
      intensity = Math.min(1, Math.max(0, i));
      weatherTargets(kind, intensity, targets);
      if (snap) snapValues(values, targets);
      if (kind !== 'storm') lightning.clearPending();
    },
    strike(distance) {
      const s = lightning.trigger(distance);
      bolt.place(s, lastCam);
    },
    update(dt, ctx) {
      const step = Math.min(dt, 0.25);
      time += step;
      lastCam = ctx.camera;
      stepValues(values, targets, step);
      fill();

      const hadStrike = lightning.strike;
      lightning.update(step, kind === 'storm' ? values.storm : 0, intensity);
      if (lightning.strike && lightning.strike !== hadStrike) bolt.place(lightning.strike, ctx.camera);
      if (lightning.strike) bolt.setFlash(lightning.flash);
      else bolt.hide();
      output.flash = lightning.flash;
      lightning.takeThunder(thunderBuf); // claps whose delay elapsed this frame, read through `thunder`

      const light = Math.min(1, Math.max(0, ctx.lightLevel));
      const sky = ctx.skyColor ?? NO_SKY;
      rain.update(step, { rain: values.rain, wind: ctx.wind, camera: ctx.camera, light, time });
      snow.update(step, { snow: values.snowfall, wind: ctx.wind, camera: ctx.camera, light, pixelScale: ctx.pixelScale });
      fogTintFor(kind, output.fogTintAmount, light, output.fogTint);
      banks.update(step, { fog: values.fog, wind: ctx.wind, camera: ctx.camera, tint: output.fogTint });
      setSurfaceWeather(values.wet, values.snowCover, sky, light);
      return output;
    },
    dispose() {
      rain.dispose();
      snow.dispose();
      banks.dispose();
      bolt.dispose();
      resetSurfaceWeather();
    },
  };
}
