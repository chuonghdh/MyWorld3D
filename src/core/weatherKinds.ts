// Weather kinds, shared by the settings (store, save files) and the weather system. Pure, no imports.
export const WEATHER_KINDS = ['clear', 'cloudy', 'rain', 'storm', 'snow', 'fog'] as const;
export type WeatherKind = (typeof WEATHER_KINDS)[number];
