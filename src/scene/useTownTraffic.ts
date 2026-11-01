// Vehicles, pedestrians, traffic meshes and ambient life for the town.
import { useEffect, useMemo } from 'react';
import { retargetTraffic, type CityLayout } from '../city';
import { createLife } from '../life';
import { Pedestrians, VehicleSystem, createTrafficMeshes } from '../traffic';
import { useWorldStore } from '../store';

export function useTownTraffic(
  layout: CityLayout,
  trafficMultiplier: number,
  seed: number,
  lightsOn: boolean,
  headlights: number,
) {
  // Only these two follow the slider (and the quality tier's traffic factor); the layout stays put.
  const trafficLayout = useMemo(() => retargetTraffic(layout, trafficMultiplier), [layout, trafficMultiplier]);
  const traffic = useMemo(
    () => new VehicleSystem(trafficLayout, { trafficMultiplier }),
    [trafficLayout, trafficMultiplier],
  );
  const walkers = useMemo(
    () =>
      new Pedestrians(trafficLayout, {
        trafficMultiplier,
        lights: traffic.lights,
        timeOfDay: useWorldStore.getState().settings.timeOfDay,
      }),
    [trafficLayout, trafficMultiplier, traffic],
  );
  // Vehicles hold back while a pedestrian is on the crosswalk ahead, even on green.
  useEffect(() => {
    traffic.setPedestrianSource(() => walkers.getPedestrians());
    return () => traffic.setPedestrianSource(null);
  }, [traffic, walkers]);
  const life = useMemo(() => createLife(layout, { seed }), [layout, seed]);
  useEffect(() => () => life.dispose(), [life]);

  const trafficMeshes = useMemo(() => createTrafficMeshes({ layout }), [layout]);
  useEffect(() => () => trafficMeshes.dispose(), [trafficMeshes]);
  useEffect(() => trafficMeshes.setNight(lightsOn), [trafficMeshes, lightsOn]);
  useEffect(() => trafficMeshes.setHeadlights(headlights), [trafficMeshes, headlights]);

  return { traffic, walkers, life, trafficMeshes };
}
