// The data contract between the scene (Town.tsx) and the sound systems. The scene builds one
// AudioFrame per render frame and calls audio.update(frame). Units: metres, seconds, radians.
// World axes: x east, y up, z south (Three.js); heading is the yaw of the vehicle's forward axis.

import type { Season } from '../core/types';
import type { AudioBus } from './bus';
import type { ListenerState } from './listener';

export type AudioVehicleClass = 'car' | 'bus' | 'truck' | 'motorbike';

export interface AudioVehicle {
  /** Stable id for the whole life of the vehicle (voice assignment keys on it). */
  id: number;
  x: number;
  z: number;
  heading: number;
  cls: AudioVehicleClass;
  /** m/s, never negative. */
  speed: number;
  /** m/s^2, signed. */
  accel: number;
  braking: boolean;
  /** -1 left, 0 off, 1 right. */
  indicator: -1 | 0 | 1;
}

export interface AudioPedestrian {
  id: number;
  x: number;
  z: number;
  /** m/s. */
  speed: number;
  /** Pose from the people simulation: the numeric POSE_* id (0 walk, 1 stand, 2 chat, 3 sit) or its name. */
  pose: number | string;
  umbrella: boolean;
  dog: { x: number; z: number; speed: number } | null;
}

export interface AudioTree {
  x: number;
  z: number;
  scale: number;
}

export type AudioLifeEventType = 'pigeon-scatter' | 'bird-call' | 'cat-meow';

export interface AudioLifeEvent {
  type: AudioLifeEventType;
  x: number;
  z: number;
}

export interface AudioThunder {
  /** Direction of the strike relative to the listener, radians. */
  angle: number;
  /** Metres. */
  distance: number;
  /** 0..1. */
  strength: number;
}

export interface AudioHorn {
  x: number;
  z: number;
  cls: AudioVehicleClass;
}

export interface AudioFrame {
  /** Seconds since the previous frame. */
  dt: number;
  listener: ListenerState;
  /** Clock hours 0..24. */
  timeOfDay: number;
  season: Season;
  /** m/s. */
  windSpeed: number;
  /** 0..1 gust strength. */
  gust: number;
  /** 0..1 rain intensity. */
  rain: number;
  night: boolean;
  vehicles: readonly AudioVehicle[];
  pedestrians: readonly AudioPedestrian[];
  /** Street trees. */
  trees: readonly AudioTree[];
  church: { x: number; z: number } | null;
  /** Events queued by src/life this frame (see getLifeEvents in src/life/common.ts). */
  lifeEvents: readonly AudioLifeEvent[];
  /** Thunder claps that are due (delay already applied) this frame. */
  thunder: readonly AudioThunder[];
  /** Horn requests from the traffic simulation this frame. */
  horns: readonly AudioHorn[];
  /** Music button state (store toggles.music). The music system fades in/out over 2 s. */
  musicEnabled: boolean;
}

export interface SoundSystem {
  readonly name: string;
  update(frame: AudioFrame): void;
  dispose(): void;
}

export type SoundSystemFactory = (ctx: AudioContext, bus: AudioBus) => SoundSystem;
