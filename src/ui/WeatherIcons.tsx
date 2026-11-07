import type { ReactNode } from 'react';
import type { WeatherKind } from '../core/weatherKinds';

/** Small line icons for the weather options in the settings panel (same stroke style as SettingsGlyph). */
export function WeatherGlyph({ kind }: { kind: WeatherKind }) {
  return (
    <svg className="mw-seg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {GLYPH_PATHS[kind]}
    </svg>
  );
}

const CLOUD = 'M6.5 14h10a3.5 3.5 0 0 0 .4-7 5.2 5.2 0 0 0-10 1.4A3 3 0 0 0 6.5 14z';

const GLYPH_PATHS: Record<WeatherKind, ReactNode> = {
  clear: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" />
    </>
  ),
  cloudy: <path d="M7 18h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.4 1.6A3.3 3.3 0 0 0 7 18z" />,
  rain: (
    <>
      <path d={CLOUD} />
      <path d="M8 17l-1 2.5M12 17l-1 2.5M16 17l-1 2.5" />
    </>
  ),
  storm: (
    <>
      <path d={CLOUD} />
      <path d="M13 13l-2.5 4h3l-2.5 4" />
    </>
  ),
  snow: <path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9" />,
  fog: <path d="M3 8h18M5 12h14M3 16h18M7 20h10" />,
};
