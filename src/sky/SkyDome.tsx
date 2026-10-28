// React mount for the sky: the dome, the ground disc beyond the town and the fog-matched horizon.
// Props mirror what the scene already knows (time, season) plus the weather overlay.
import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Season } from '../core/types';
import type { Rgb } from '../environment/sun';
import { createSkyDome } from './dome';
import { createGroundDisc } from './ground';
import { computeSkyState } from './state';

export interface SkyDomeProps {
  timeOfDay: number;
  season: Season;
  /** Weather overlay: cloud cover 0..1. */
  cloudiness?: number;
  /** Weather overlay: lightning flash 0..1 (can change every frame). */
  flash?: number;
  /** Per-frame weather overlay; read every frame so a flash does not re-render the parent. Wins over cloudiness and flash. */
  overlay?: MutableRefObject<{ cloudiness: number; flash: number }>;
  /** Horizon colour; pass the colour of the scene fog so the ground fades into the sky exactly. */
  fogColor?: Rgb;
  /** Distance where the ground starts to fade into the horizon colour. */
  fogNear: number;
  /** Distance where the ground has fully faded (the scene fog far value). */
  fogFar: number;
}

export function SkyDome({ timeOfDay, season, cloudiness = 0.25, flash = 0, overlay, fogColor, fogNear, fogFar }: SkyDomeProps) {
  const dome = useMemo(() => createSkyDome(), []);
  const ground = useMemo(() => createGroundDisc(), []);
  useEffect(
    () => () => {
      dome.dispose();
      ground.dispose();
    },
    [dome, ground],
  );

  const fogKey = fogColor ? `${fogColor.r},${fogColor.g},${fogColor.b}` : '';
  useEffect(() => {
    const v = computeSkyState({ timeOfDay, season, cloudiness, flash, fogColor });
    dome.set(v);
    ground.set(v, fogNear, fogFar);
    // fogColor is tracked through fogKey so a new object with the same values does not recompute.
  }, [dome, ground, timeOfDay, season, cloudiness, flash, fogKey, fogNear, fogFar]);

  const applied = useRef({ cloudiness: -1, flash: -1 });
  useFrame((state) => {
    const o = overlay?.current;
    if (o && (Math.abs(o.cloudiness - applied.current.cloudiness) > 0.005 || Math.abs(o.flash - applied.current.flash) > 0.01)) {
      applied.current = { cloudiness: o.cloudiness, flash: o.flash };
      const v = computeSkyState({ timeOfDay, season, cloudiness: o.cloudiness, flash: o.flash, fogColor });
      dome.set(v);
      ground.set(v, fogNear, fogFar);
    }
    dome.tick(state.clock.elapsedTime);
    ground.follow(state.camera);
  });

  return (
    <>
      <primitive object={dome.mesh} />
      <primitive object={ground.mesh} />
    </>
  );
}
