// Public API of the traffic simulation: vehicles, signals, pedestrians and their meshes.
export { VehicleSystem, VEHICLE_SPECS } from './vehicles';
export type { VehicleRender, VehicleSystemOptions } from './vehicles';
export { TrafficLightController, lightStateAt, axisForOrientation } from './lights';
export type { LightPhase, LightAxis } from './lights';
export { Pedestrians } from './pedestrians';
export type { PedestrianRender, DogRender, PedestriansOptions } from './pedestrians';
export { createTrafficMeshes } from './meshes';
export type { TrafficMeshes, TrafficMeshOptions, VisualContext } from './meshes';
