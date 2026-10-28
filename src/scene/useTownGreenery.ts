// Streetscape, street trees, courtyard greenery and street flora of the town.
import { useEffect, useMemo } from 'react';
import type { CityLayout, Rect } from '../city';
import { setNightClock, setNightLights } from '../buildings/materials';
import { getNightSchedule } from '../environment/sun';
import {
  createCourtyardGreenery,
  createStreetFlora,
  createTreeField,
  setGreenerySeason,
  type getLightingForTime,
  type WindUniforms,
} from '../environment';
import { createStreetscape } from '../streets';
import { useWorldStore, type TreeOverride } from '../store';
import type { Season } from '../core/types';

/** Street trees read too small from the top-down camera at their botanical size. */
const TREE_SCALE = 1.35;

interface GreeneryInputs {
  layout: CityLayout;
  treeOverrides: Record<string, TreeOverride>;
  uniforms: WindUniforms;
  seed: number;
  season: Season;
  timeOfDay: number;
  lightsOn: boolean;
  lighting: ReturnType<typeof getLightingForTime>;
}

export function useTownGreenery({ layout, treeOverrides, uniforms, seed, season, timeOfDay, lightsOn, lighting }: GreeneryInputs) {
  const streetscape = useMemo(() => createStreetscape(layout), [layout]);
  useEffect(() => () => streetscape.dispose(), [streetscape]);

  useEffect(() => {
    const schedule = getNightSchedule(timeOfDay, lighting.sun.altitudeDeg);
    setNightLights(lightsOn);
    setNightClock(timeOfDay);
    streetscape.setNightAmount(schedule.lamps);
  }, [lightsOn, streetscape, timeOfDay, lighting]);

  const treeItems = useMemo(
    () =>
      layout.streetTrees.map((t) => ({
        id: t.id,
        position: t.position,
        species: treeOverrides[t.id]?.species ?? t.species,
        scale: t.scale * TREE_SCALE,
      })),
    [layout, treeOverrides],
  );
  const treeField = useMemo(
    () => createTreeField(treeItems, { season, uniforms, seed }),
    // Season changes go through setSeason below instead of rebuilding.
    [treeItems, uniforms, seed],
  );
  useEffect(() => treeField.setSeason(season), [treeField, season]);
  useEffect(() => () => treeField.dispose(), [treeField]);

  const greenery = useMemo(
    () =>
      createCourtyardGreenery(
        layout.blocks.filter((b) => b.kind === 'houses' && b.courtyard).map((b) => b.courtyard as Rect),
        seed,
      ),
    [layout, seed],
  );
  useEffect(() => setGreenerySeason(greenery, season), [greenery, season]);
  const flora = useMemo(
    () =>
      createStreetFlora(
        layout.streetTrees.map((t) => ({ position: t.position, species: t.species, scale: t.scale * TREE_SCALE, setting: t.setting })),
        layout.blocks.filter((b) => b.kind === 'monument').map((b) => b.bounds),
        { season: useWorldStore.getState().settings.season as Season, seed },
      ),
    [layout, seed],
  );
  useEffect(() => flora.setSeason(season), [flora, season]);
  useEffect(() => () => flora.dispose(), [flora]);

  return { streetscape, treeItems, treeField, greenery, flora };
}
