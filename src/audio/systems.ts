// Registry of sound systems. Each lives in its own file and is owned by one agent.
import type { SoundSystemFactory } from './frame';
import { createVehicleSounds } from './vehicles';
import { createPeopleSounds } from './people';
import { createAnimalSounds } from './animals';
import { createNatureSounds } from './nature';
import { createRainSounds } from './rain';
import { createMusic } from './music';
import { createAircraftSounds } from './aircraft';

export const SOUND_SYSTEM_FACTORIES: readonly SoundSystemFactory[] = [
  createVehicleSounds,
  createPeopleSounds,
  createAnimalSounds,
  createNatureSounds,
  createRainSounds,
  createMusic,
  createAircraftSounds,
];
