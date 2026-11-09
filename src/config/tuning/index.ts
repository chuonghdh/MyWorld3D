// Central tuning values (one source of truth). Index and owners: docs/TUNING.md.
// One file per section in this folder. Feature code imports from '../config/tuning' (this index), never from a section file.

export type { HousePreset, MonumentKind, TreeSpecies, Season } from '../../core/types';

export { sceneQa } from './sceneQa';
export { buildings } from './buildings';
export { uiCamera } from './uiCamera';
export { cityStreets } from './cityStreets';
export { trafficLife } from './trafficLife';
export { trafficWalkers } from './trafficWalkers';
export { audio } from './audio';
export { skyEnvironment } from './skyEnvironment';
export { film } from './film';
export { agentRoom } from './agentRoom';
