// Builds the AudioFrame the sound systems consume (see src/audio/frame.ts) from the scene's simulation state.
// All arrays and records are pooled and reused every frame, so the bridge allocates nothing in steady state.

import * as THREE from 'three';
import type { Season } from '../core/types';
import type { AudioAircraft, AudioFrame, AudioHorn, AudioLifeEvent, AudioPedestrian, AudioThunder, AudioTree, AudioVehicle } from '../audio/frame';
import { listenerFromCamera } from '../audio/listener';
import type { PedestrianRender } from '../traffic/pedestrians';
import type { VehicleRender } from '../traffic/vehicles';

/** Same rule as the people meshes: a walker opens an umbrella when its rank is below this share. */
function umbrellaShare(rain: number): number {
  return Math.min(0.92, 0.35 + rain * 0.8);
}

const EMPTY_AIRCRAFT: readonly AudioAircraft[] = [];

export interface AudioBridgeInput {
  dt: number;
  camera: THREE.Camera;
  timeOfDay: number;
  season: Season;
  windSpeed: number;
  gust: number;
  rain: number;
  night: boolean;
  musicEnabled: boolean;
  vehicles: readonly VehicleRender[];
  pedestrians: readonly PedestrianRender[];
  trees: readonly AudioTree[];
  church: { x: number; z: number } | null;
  lifeEvents: readonly AudioLifeEvent[];
  thunder: readonly { angle: number; distance: number; strength: number }[];
  horns: readonly AudioHorn[];
  /** Airliners in the air (pooled by the aircraft system); empty while paused. */
  aircraft?: readonly AudioAircraft[];
}

export class AudioBridge {
  private readonly vehiclePool: AudioVehicle[] = [];
  private readonly pedestrianPool: AudioPedestrian[] = [];
  private readonly thunderPool: AudioThunder[] = [];
  private readonly dir = new THREE.Vector3(0, 0, -1);
  readonly frame: AudioFrame;

  constructor() {
    this.frame = {
      dt: 0,
      listener: listenerFromCamera({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, { x: 0, y: 1, z: 0 }),
      timeOfDay: 12,
      season: 'summer',
      windSpeed: 0,
      gust: 0,
      rain: 0,
      night: false,
      musicEnabled: false,
      vehicles: [],
      pedestrians: [],
      trees: [],
      church: null,
      lifeEvents: [],
      thunder: [],
      horns: [],
    };
  }

  fill(input: AudioBridgeInput): AudioFrame {
    const f = this.frame;
    input.camera.getWorldDirection(this.dir);
    f.listener = listenerFromCamera(input.camera.position, this.dir, input.camera.up);
    f.dt = input.dt;
    f.timeOfDay = input.timeOfDay;
    f.season = input.season;
    f.windSpeed = input.windSpeed;
    f.gust = input.gust;
    f.rain = input.rain;
    f.night = input.night;
    f.musicEnabled = input.musicEnabled;
    f.trees = input.trees;
    f.church = input.church;
    f.lifeEvents = input.lifeEvents;
    f.horns = input.horns;
    f.aircraft = input.aircraft ?? EMPTY_AIRCRAFT;

    // Vehicles.
    const vOut = f.vehicles as AudioVehicle[];
    vOut.length = input.vehicles.length;
    for (let i = 0; i < input.vehicles.length; i++) {
      const v = input.vehicles[i];
      let a = this.vehiclePool[i];
      if (!a) {
        a = { id: 0, x: 0, z: 0, heading: 0, cls: 'car', speed: 0, accel: 0, braking: false, indicator: 0 };
        this.vehiclePool[i] = a;
      }
      a.id = v.id;
      a.x = v.position.x;
      a.z = v.position.z;
      a.heading = v.heading;
      a.cls = v.cls;
      a.speed = Math.max(0, v.speed);
      a.accel = v.accel;
      a.braking = v.braking;
      a.indicator = v.indicator;
      vOut[i] = a;
    }

    // Pedestrians (and the dogs they walk).
    const pOut = f.pedestrians as AudioPedestrian[];
    pOut.length = input.pedestrians.length;
    const share = umbrellaShare(input.rain);
    for (let i = 0; i < input.pedestrians.length; i++) {
      const p = input.pedestrians[i];
      let a = this.pedestrianPool[i];
      if (!a) {
        a = { id: 0, x: 0, z: 0, speed: 0, pose: 0, umbrella: false, dog: null };
        this.pedestrianPool[i] = a;
      }
      a.id = p.id;
      a.x = p.position.x;
      a.z = p.position.z;
      a.speed = p.speed;
      a.pose = p.pose;
      a.umbrella = input.rain > 0.05 && p.umbrellaRank < share;
      if (p.dog) {
        const d = a.dog ?? (a.dog = { x: 0, z: 0, speed: 0 });
        d.x = p.dog.position.x;
        d.z = p.dog.position.z;
        d.speed = p.dog.speed;
      } else {
        a.dog = null;
      }
      pOut[i] = a;
    }

    // Thunder claps due this frame.
    const tOut = f.thunder as AudioThunder[];
    tOut.length = input.thunder.length;
    for (let i = 0; i < input.thunder.length; i++) {
      let a = this.thunderPool[i];
      if (!a) {
        a = { angle: 0, distance: 0, strength: 0 };
        this.thunderPool[i] = a;
      }
      a.angle = input.thunder[i].angle;
      a.distance = input.thunder[i].distance;
      a.strength = input.thunder[i].strength;
      tOut[i] = a;
    }
    return f;
  }
}
