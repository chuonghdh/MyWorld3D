// Clothing, hair, skin and dog coat palettes. Tops and trousers change with the season (light colours in
// summer, coats in winter). All lists are hex strings; the shader reads them as uniform arrays.

export type SeasonName = 'spring' | 'summer' | 'autumn' | 'winter';

export const SKIN_COLORS = ['#f6d3b4', '#ecbb92', '#dba479', '#c78a5a', '#b07245', '#8d5a36', '#6b4026', '#4b2d1d'];

/**
 * Hair colours. Indices 0-5 are natural tones (children and teens use only these), 6, 7, 10 and 11 are the
 * greys and whites that elders mostly get (see pedestrians.ts).
 */
export const HAIR_COLORS = [
  '#1d1a19',
  '#3a2a20',
  '#5a3b24',
  '#7d4c2b',
  '#b3541f',
  '#d8b66b',
  '#9c9c9c',
  '#e8e8e6',
  '#2c2c46',
  '#6a3b3b',
  '#c4c4c2',
  '#f6f6f2',
];

/** 16 top colours per season. Saturated enough to read against the cream sidewalk from above. */
export const TOP_COLORS: Record<SeasonName, string[]> = {
  summer: ['#e8624f', '#3d9be0', '#f2c230', '#f1f0e8', '#1fa59a', '#e87ca8', '#8cc63f', '#f08a24', '#8a5cc2', '#d3312c', '#6fd1ae', '#2c4a9c', '#e3b23c', '#5aa9e6', '#16b3c4', '#f5e6c8'],
  spring: ['#e0707c', '#4a9ed6', '#e9c34a', '#e8e4d4', '#2e9e8f', '#c978b0', '#7db84a', '#e8873a', '#7b62b8', '#c4443b', '#68b89a', '#3a5a94', '#d6a63e', '#7aa6c8', '#3d8a6a', '#d9c9a6'],
  autumn: ['#b8502a', '#8a6a2a', '#a8322e', '#4a6a3a', '#c98a2a', '#5a3a2a', '#3a5a7a', '#7a3a4a', '#d0a040', '#6a4a7a', '#2f4f4f', '#9a5a2a', '#c8c0a8', '#4a4a56', '#b04a3a', '#7a7a3a'],
  winter: ['#2d3340', '#23395d', '#7a1f2e', '#2d5a3d', '#b08a58', '#d0a028', '#6a6f78', '#16161a', '#c0392b', '#5a6a3a', '#1f6a72', '#5a3a28', '#5a2a5a', '#d8c9a8', '#4a6a90', '#7a1f4a'],
};

export const PANTS_COLORS: Record<SeasonName, string[]> = {
  summer: ['#5b7fb0', '#3b5b8c', '#e8dcc0', '#b9a27a', '#f0f0ea', '#8a8f6a', '#c9b79a', '#4a4a52', '#a8b8c8', '#d8c9a0', '#7a5a4a', '#2c3a55'],
  spring: ['#3b5b8c', '#2b3a55', '#b39b6e', '#8a7a5a', '#4a4a52', '#6a7a4a', '#d0c4a8', '#3a3a40', '#5a4030', '#7a7a80', '#6b2b3a', '#26344e'],
  autumn: ['#2b3a55', '#3b4a63', '#5a4030', '#3a3a40', '#6a5a3a', '#4a3a2a', '#5a6a3a', '#222226', '#6b2b3a', '#7a6a50', '#2c4a4a', '#4a4a52'],
  winter: ['#22262e', '#2b3a55', '#3a3a40', '#1a1a1e', '#4a3a2e', '#4a4a52', '#2c3a3a', '#5a4030', '#33384a', '#3a2a3a', '#5c5c60', '#26344e'],
};

/** Hats, scarves and bags. */
export const ACCENT_COLORS: Record<SeasonName, string[]> = {
  summer: ['#e0453a', '#f2b632', '#1fa59a', '#8a5cc2', '#2c6a4a', '#f08a24', '#f1f0e8', '#2c4a9c', '#e87ca8', '#d8c9a8', '#7a5a3a', '#b02a3a'],
  spring: ['#d6504a', '#e8b640', '#2e9e8f', '#7b62b8', '#3a7a4a', '#e8873a', '#e8e4d4', '#3a5a94', '#d08ab0', '#d0c4a8', '#7a5a3a', '#a8323a'],
  autumn: ['#a8322e', '#d0a040', '#2f6a5a', '#6a4a7a', '#4a6a3a', '#c9722a', '#9a9a9a', '#2c3a5a', '#b05a6a', '#c8b898', '#5a3a2a', '#8a2a2a'],
  winter: ['#c0392b', '#e8b030', '#1f7a82', '#6a3a7a', '#2d6a3d', '#e0802a', '#e8e8e6', '#23395d', '#e07a9a', '#c8b898', '#5a3a28', '#7a1f2e'],
};

export const DOG_COATS = ['#c58a3c', '#7a4a28', '#2b2a2a', '#e5dccb', '#8c7a66'];

export const PALETTE_SIZES = { skin: 8, hair: 12, top: 16, pants: 12, accent: 12, coat: 5 } as const;
