// Surface heights, colours and widths shared by the ground surfaces, roads and kerbs.
// Heights (metres). Every overlay sits a little above the surface it decorates and is
// drawn with polygonOffset as well, so nothing z-fights at the default camera distance.
// drawn with polygonOffset as well, so nothing z-fights at the default camera distance.
export const GROUND_Y = 0;
export const ASPHALT_TOP = 0.04;
export const PAINT_Y = ASPHALT_TOP + 0.02;
/**
 * Asphalt underlay: the slabs have no bottom faces, so where two slabs meet (road end against
 * intersection) a hairline gap shows whatever lies beneath as dark dashes. This slab, a little wider
 * than each road piece and 1 cm below its top, sits under every seam in the same colour.
 */
export const UNDERLAY_TOP = ASPHALT_TOP - 0.01;
export const SIDEWALK_TOP = 0.15;
export const SIDEWALK_OVERLAY_Y = SIDEWALK_TOP + 0.015;
export const CURB_WIDTH = 0.22;
export const TREE_PIT_SIZE = 1.3;

export const COLORS = {
  grass: '#8c9a6a',
  courtyardGrass: '#86a05e',
  townBase: '#cbbfa8',
  townEdge: '#bfb8aa',
  asphalt: '#4a4a50',
  paint: '#efeee8',
  sidewalk: '#c6cbcf',
  curb: '#c6cbcf',
  plazaLight: '#cad0d3',
  plazaDark: '#b9c0c4',
  plazaBorder: '#a9b0b5',
  gravel: '#d8ccae',
  treePit: '#3b3228',
  treePitEdge: '#8e877b',
} as const;
