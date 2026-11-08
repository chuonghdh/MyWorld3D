// Day/night from the local clock (view only; never feeds the engine). Pure mapping hour -> light factors.
import { agentRoom } from '../../config/tuning';

export interface Daylight {
  /** 0 night .. 1 noon. */
  day: number;
  /** Sky backdrop brightness multiplier. */
  sky: number;
  /** Skyline lit-window emissive intensity. */
  windows: number;
  /** Hemisphere fill intensity. */
  fill: number;
}

/** Smooth day curve: 0 before 5:00 and after 21:00, 1 at 13:00. */
export function daylightAt(hour: number): Daylight {
  const h = ((hour % 24) + 24) % 24;
  const day = h <= 5 || h >= 21 ? 0 : Math.sin(((h - 5) / 16) * Math.PI) ** 0.7;
  return { day, sky: 0.8 + day * 1.6, windows: 1.1 - day * 0.8, fill: 0.95 + day * 0.6 };
}

/** Blue hour (fixed) when the clock is not followed. */
export const BLUE_HOUR = daylightAt(19.5);

export function currentDaylight(): Daylight {
  if (!agentRoom.followRealClock) return BLUE_HOUR;
  const d = new Date();
  return daylightAt(d.getHours() + d.getMinutes() / 60);
}
