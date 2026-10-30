// Which settings shape the city, and a single-entry cache so the layout is generated once per key.
// Traffic density does not shape the city: it only decides how many spawn points each lane gets,
// which retargetTraffic recomputes without touching blocks, streets or trees.
import { generateCity, spawnPointsFor } from './generate';
import type { CityLayout } from './layout';
import type { WorldSettings } from '../core/types';

/** Traffic density the stable layout is generated at (spawn points are re-derived on top of it). */
export const LAYOUT_TRAFFIC_BASE = 1;

type LayoutInput = Pick<WorldSettings, 'seed' | 'townWidth' | 'townDepth' | 'streetTreeMultiplier' | 'blockMerges'>;

/** Equal keys mean an identical layout. Deliberately ignores trafficMultiplier and every non-layout setting. */
export function cityLayoutKey(s: LayoutInput): string {
  const base = [s.seed, s.townWidth, s.townDepth, s.streetTreeMultiplier].join('|');
  const merges = s.blockMerges ?? [];
  // Merges are appended only when present, so a town without merges keeps its key.
  return merges.length === 0 ? base : `${base}|merges:${JSON.stringify(merges)}`;
}

/** Returns a function that regenerates the city only when cityLayoutKey changes. */
export function createLayoutProvider(generate: (s: WorldSettings) => CityLayout = generateCity) {
  let key: string | null = null;
  let layout: CityLayout | null = null;
  return (settings: WorldSettings): CityLayout => {
    const k = cityLayoutKey(settings);
    if (layout === null || k !== key) {
      layout = generate({ ...settings, trafficMultiplier: LAYOUT_TRAFFIC_BASE });
      key = k;
    }
    return layout;
  };
}

/** Shared by the App shell and the Town so one settings change generates the city once. */
export const getCityLayout = createLayoutProvider();

/** Same city with spawn points for another traffic density. Everything but the lane spawn lists is shared. */
export function retargetTraffic(layout: CityLayout, trafficMultiplier: number): CityLayout {
  return {
    ...layout,
    trafficPaths: layout.trafficPaths.map((p) => ({
      ...p,
      spawnPoints: spawnPointsFor(p.waypoints, trafficMultiplier),
    })),
  };
}
