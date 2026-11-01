// The town's single per-frame update: clock, wind, weather, lights, simulations and sound.
// The call order inside the frame matters (wind before weather, audio update before clearing life events).
import type { MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Rect } from '../city';
import { setBuildingWind } from '../buildings/materials';
import { applyFogRange, type createWeather } from '../weather';
import {
  gustStrength,
  triggerGust,
  updateWindUniforms,
  windVector,
  type createClouds,
  type createSmoke,
  type getLightingForTime,
  type LeafSystem,
  type WindUniforms,
} from '../environment';
import { getLifeEvents as pollLifeEvents, clearLifeEvents, type createLife } from '../life';
import * as audio from '../audio';
import type { Pedestrians, VehicleSystem, createTrafficMeshes } from '../traffic';
import { createStreetscape } from '../streets';
import type { AircraftSystem } from '../aircraft';
import { useWorldStore } from '../store';
import type { Season } from '../core/types';
import { DAY_SECONDS } from '../store/model';
import { runtime } from './runtime';
import type { AudioBridge } from './audioBridge';
import { AMBIENT_GAIN, HEMI_GAIN, SUN_DISTANCE, SUN_GAIN, fitSunShadow } from './townShadow';

/** Everything the frame touches. Rebuilt each render; the callback always sees the latest values. */
export interface TownFrameInputs {
  ground: Rect;
  townSize: number;
  lighting: ReturnType<typeof getLightingForTime>;
  lightsOn: boolean;
  shadowMapSize: number;
  uniforms: WindUniforms;
  leaves: LeafSystem;
  clouds: ReturnType<typeof createClouds>;
  smoke: ReturnType<typeof createSmoke>;
  weather: ReturnType<typeof createWeather>;
  aircraft: AircraftSystem;
  traffic: VehicleSystem;
  walkers: Pedestrians;
  trafficMeshes: ReturnType<typeof createTrafficMeshes>;
  streetscape: ReturnType<typeof createStreetscape>;
  life: ReturnType<typeof createLife>;
  audioBridge: AudioBridge;
  audioTrees: { x: number; z: number; scale: number }[];
  churchRef: MutableRefObject<{ x: number; z: number } | null>;
  overlay: MutableRefObject<{ cloudiness: number; flash: number }>;
  sunLight: MutableRefObject<THREE.DirectionalLight | null>;
  sunDirRef: MutableRefObject<THREE.Vector3>;
  hemiLight: MutableRefObject<THREE.HemisphereLight | null>;
  ambLight: MutableRefObject<THREE.AmbientLight | null>;
}

const _camDir = new THREE.Vector3();

export function useTownFrame(f: TownFrameInputs): void {
  const { ground, townSize, lighting, lightsOn, shadowMapSize, uniforms, leaves, clouds, smoke, weather, aircraft } = f;
  const { traffic, walkers, trafficMeshes, streetscape, life, audioBridge, audioTrees, churchRef, overlay } = f;
  const { sunLight, sunDirRef, hemiLight, ambLight } = f;

  useFrame((state, frameDt) => {
    const { paused, autoTime } = useWorldStore.getState().toggles;
    // Paused: every simulation sees dt = 0 and a frozen clock; only the camera keeps working.
    const dt = paused ? 0 : frameDt;
    runtime.simTime += dt;
    const t = runtime.simTime;

    if (autoTime && !paused) {
      runtime.pendingHours += (dt * 24) / DAY_SECONDS;
      // Written in small steps: each store write re-renders the town to refresh lights and sky.
      if (runtime.pendingHours >= 0.02) {
        useWorldStore.getState().advanceTime(runtime.pendingHours);
        runtime.pendingHours = 0;
      }
    }

    while (runtime.gustRequests > 0) {
      runtime.gustRequests--;
      runtime.gusts = triggerGust(runtime.gusts, t, 6);
    }
    while (runtime.leafDevilRequests > 0) {
      runtime.leafDevilRequests--;
      const x = ground.minX + Math.random() * (ground.maxX - ground.minX);
      const z = ground.minZ + Math.random() * (ground.maxZ - ground.minZ);
      leaves.spawnLeafDevil(x, z);
    }

    const { windSpeed, windDirection, leafAmount, leafSize, season, soundEnabled } = useWorldStore.getState().settings;
    const wind = windVector(t, { speed: windSpeed, direction: windDirection }, runtime.gusts);
    updateWindUniforms(uniforms, t, wind, gustStrength(t, runtime.gusts));
    setBuildingWind(t, wind, gustStrength(t, runtime.gusts));

    const st = useWorldStore.getState().settings;
    weather.setWeather(st.weather, st.weatherIntensity);
    const wx = weather.update(dt, {
      camera: state.camera.position,
      wind,
      lightLevel: Math.min(1, lighting.sky.ambientIntensity),
      skyColor: lighting.sky.sky,
    });
    trafficMeshes.setSnow(wx.snow);
    overlay.current.cloudiness = wx.cloudiness;
    overlay.current.flash = wx.flash;
    clouds.setCoverage(wx.cloudiness);
    clouds.setSunlight(Math.min(1, lighting.sky.sunIntensity) * wx.dim);
    clouds.setLighting(lighting.sun, lighting.sky.sunColor, lighting.sky.sky, lighting.sky.ambientIntensity * wx.dim);
    applyFogRange(state.scene.fog as THREE.Fog, townSize * 2.2, townSize * 6, wx.fogDensityMul);
    if (sunLight.current) {
      sunLight.current.intensity = lighting.sky.sunIntensity * SUN_GAIN * wx.dim * (1 - 0.5 * wx.flash);
      fitSunShadow(sunLight.current, state.camera, sunDirRef.current, SUN_DISTANCE, ground, shadowMapSize);
    }
    if (hemiLight.current) hemiLight.current.intensity = lighting.sky.ambientIntensity * HEMI_GAIN * wx.dim + wx.flash * 2.5;
    if (ambLight.current) ambLight.current.intensity = lighting.sky.ambientIntensity * AMBIENT_GAIN * wx.dim;

    clouds.update(dt, wind);
    // Airliners follow the simulated clock (frozen while paused); contrails need clear, fair air.
    aircraft.update(t, dt, {
      camera: state.camera.position,
      sunDir: sunDirRef.current,
      sunColor: lighting.sky.sunColor,
      sunIntensity: lighting.sky.sunIntensity * wx.dim,
      ambient: lighting.sky.ambientIntensity * wx.dim,
      night: lightsOn,
      weather: wx,
      wind,
    });
    smoke.update(dt, wind, {
      season: season as Season,
      timeOfDay: useWorldStore.getState().settings.timeOfDay,
      lightsOn,
      sunColor: lighting.sky.sunColor,
      ambient: lighting.sky.ambientIntensity,
    });
    // Crown gates: focus is 12 m ahead on the view direction, the same convention CameraRig uses for its target.
    const camDir = state.camera.getWorldDirection(_camDir);
    leaves.setCameraView(state.camera, { x: state.camera.position.x + camDir.x * 12, z: state.camera.position.z + camDir.z * 12 });
    leaves.update(dt, wind, { leafAmount, leafSize, season: season as Season });

    const clockHour = useWorldStore.getState().settings.timeOfDay;
    traffic.update(dt, { timeOfDay: clockHour });
    walkers.update(dt, { timeOfDay: clockHour, rain: wx.rain });
    const vehicles = traffic.getVehicles();
    trafficMeshes.update(vehicles, walkers.getPedestrians(), {
      time: t,
      night: lightsOn,
      season: season as Season,
      rain: wx.rain,
    });
    streetscape.updateSignals((light, axis) => traffic.lights.phaseOf(light.id, axis));

    const cam = state.camera.position;
    life.update(dt, {
      time: t,
      timeOfDay: useWorldStore.getState().settings.timeOfDay,
      season: season as Season,
      night: lightsOn,
      wind,
      vehicles,
      pedestrians: walkers.getPedestrians(),
      camera: cam,
    });
    trafficMeshes.vehicles.setFocus(cam.x, cam.z);

    // Sound: every source is positional and separate; the frame carries what they need.
    audio.setSoundEnabled(soundEnabled && !paused);
    audio.update(
      audioBridge.fill({
        dt,
        camera: state.camera,
        timeOfDay: useWorldStore.getState().settings.timeOfDay,
        season: season as Season,
        windSpeed: Math.hypot(wind.x, wind.z),
        gust: gustStrength(t, runtime.gusts),
        rain: wx.rain,
        night: lightsOn,
        musicEnabled: useWorldStore.getState().toggles.music,
        vehicles,
        pedestrians: walkers.getPedestrians(),
        trees: audioTrees,
        church: churchRef.current,
        lifeEvents: pollLifeEvents(),
        thunder: weather.thunder,
        horns: traffic.takeHorns(),
        aircraft: paused ? undefined : aircraft.audioSources(),
      }),
    );
    clearLifeEvents();
  });
}
