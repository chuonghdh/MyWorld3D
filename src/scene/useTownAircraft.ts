// Airliners and their contrails high above the clouds (see src/aircraft).
import { useEffect, useMemo } from 'react';
import type { Rect } from '../city';
import { createAircraft } from '../aircraft';

export function useTownAircraft(ground: Rect, seed: number) {
  const cx = (ground.minX + ground.maxX) / 2;
  const cz = (ground.minZ + ground.maxZ) / 2;
  const aircraft = useMemo(() => createAircraft({ seed, centerX: cx, centerZ: cz }), [seed, cx, cz]);
  useEffect(() => () => aircraft.dispose(), [aircraft]);
  return aircraft;
}
