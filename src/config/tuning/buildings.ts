import type { HousePreset, MonumentKind } from '../../core/types';

/** Buildings: lit-window shares, night emissive, lit colour, sign emissive, floor range, preset and monument lists. */
export const buildings = {
  /** Probability per pane that a house-facade window is lit (0-1). Default for facade/parts.ts. */
  litWindowShare: 0.35,
  /** Probability per window that a monument window is lit (0-1). monuments/kit.ts. */
  litWindowShareMonument: 0.35,
  /** Probability per ground-floor pane that it is lit (0-1). facade/ground.ts. */
  litWindowShareGround: 0.55,
  /** Probability per tower-lobby pane that it is lit (0-1). facade/ground.ts. */
  litWindowShareGroundAlt: 0.6,
  /** Probability per roof-level window that it is lit (0-1). facade/roof.ts. */
  litWindowShareRoof: 0.4,
  /** Night emissive multiplier for house walls and lit glass (materials.ts). */
  nightEmissive: 1.15,
  /** Colour of lit windows (hex, materials.ts). */
  litWindowColor: '#ffcf7a',
  /** Night emissive multiplier for shop signs (signs/index.ts). */
  signNightEmissive: 1.0,
  /** Minimum floors of a house (facade/layout.ts). */
  minFloors: 2,
  /** Maximum floors of a house (facade/layout.ts). */
  maxFloors: 8,
  /** Maximum floors of a glass tower (facade/layout.ts maxFloorsFor). Other presets keep maxFloors. */
  glassTowerMaxFloors: 12,
  /** Moss and lichen strength on house roofs (tiles, slate, zinc, flat membrane), 0-1. Shader uniform uRoofMoss (materials.ts). */
  roofMossAmount: 0.9,
  /** House wall weathering (grime, rain streaks, damp, chipping, sun fade), 0-1. Shader uniform uWallWeather (materials.ts). */
  wallWeatheringAmount: 0.6,
  /** Window trim, sill and lintel ageing: mould and stains on the faces, 0-1. Shader uniform uTrimAge (materials.ts). */
  trimAgeAmount: 0.84,
  /** Darkening of the upward faces of window trims (rain pools), 0-1. Shader uniform uTrimTop (materials.ts). */
  trimTopDarken: 0.6,
  /** House preset choices, in panel order (store and buildings re-export). */
  housePresets: [
    'as-block',
    'original-feuilles',
    'canal-amsterdam',
    'glass-tower',
    'brutalist-concrete',
    'bauhaus',
    'mediterranean',
    'brownstone-ny',
    'nordic-timber',
    'shophouse-asia',
  ] as readonly HousePreset[],
  /** Monument kinds, in panel order (store and buildings re-export). */
  monumentKinds: [
    'hospital',
    'stadium',
    'funfair',
    'swimming-pool',
    'dinosaur-park',
    'supermarket',
    'open-air-theatre',
    'circus',
    'fire-station',
    'gothic-cathedral',
    'city-hall',
    'school',
  ] as readonly MonumentKind[],
  /** City hall: probability per hall window that it is lit (0-1). monuments/municipal.ts. */
  cityHallWindowLitShare: 0.4,
  /** School: number of trees along the playground edge (count). monuments/education.ts. */
  schoolTreeCount: 6,
  /** Hospital: probability per dormer window that it is lit (0-1). monuments/civic.ts. */
  hospitalDormerLitShare: 0.3,
  /** Hospital: number of people on the forecourt crowd. monuments/civic.ts. */
  hospitalCrowd: 8,
  /** Fire station: probability per bay-door pane that it is lit (0-1). monuments/civic.ts. */
  fireDoorLitShare: 0.6,
  /** Fire station: probability per hose-tower window that it is lit (0-1). monuments/civic.ts. */
  fireTowerLitShare: 0.25,
  /** Supermarket: probability per glass pane of the front that it is lit (0-1). monuments/civic.ts. */
  supermarketPaneLitShare: 0.85,
  /** Supermarket: probability per bay that a car stands in row A (0-1). monuments/civic.ts. */
  carParkRowAOccupancy: 0.6,
  /** Supermarket: probability per bay that a car stands in row B (0-1). monuments/civic.ts. */
  carParkRowBOccupancy: 0.55,
  /** Supermarket: probability that a row B car faces the entrance (0-1). monuments/civic.ts. */
  carParkRowBForwardShare: 0.7,
  /** Stadium: number of people on the forecourt crowd. monuments/leisure.ts. */
  stadiumCrowd: 14,
  /** Funfair: number of visitors in the crowd. monuments/leisure.ts. */
  funfairCrowd: 22,
  /** Swimming pool: probability per lounger that a person lies on it (0-1). monuments/leisure.ts. */
  poolLoungerPersonShare: 0.4,
  /** Swimming pool: probability per cabin-facade pane that it is lit (0-1). monuments/leisure.ts. */
  poolFacadeLitShare: 0.5,
  /** Circus: number of people in the crowd by the entrance. monuments/leisure.ts. */
  circusCrowd: 10,
  /** Circus: probability per wagon window that it is lit (0-1). monuments/leisure.ts. */
  circusWagonLitShare: 0.5,
  /** Gothic cathedral: probability per apse and ambulatory window that it is lit (0-1). monuments/culture.ts. */
  cathedralApseLitShare: 0.4,
  /** Gothic cathedral: probability per nave and choir window that it is lit (0-1). monuments/culture.ts. */
  cathedralNaveLitShare: 0.35,
  /** Gothic cathedral: probability per west-tower window that it is lit (0-1). monuments/culture.ts. */
  cathedralWestTowerLitShare: 0.4,
  /** Gothic cathedral: number of people on the parvis crowd. monuments/culture.ts. */
  cathedralCrowd: 12,
  /** Gothic cathedral: wall stone colours to pick from (hex, darker warm stone). monuments/culture.ts. */
  cathedralStonePalette: ['#b3a286', '#a89c88', '#b8a683'] as readonly string[],
  /** Gothic cathedral: per-wall-piece tone spread, HSL lightness (0-0.2). monuments/culture.ts. */
  cathedralStoneJitter: 0.04,
  /** Gothic cathedral: per-roof-piece tone spread, HSL lightness (0-0.2). monuments/culture.ts. */
  cathedralRoofJitter: 0.03,
  /** Gothic cathedral: slate roof colour (hex). monuments/culture.ts. */
  cathedralRoofSlate: '#3a414c',
  /** Gothic cathedral: zinc (patina green) roof colour (hex). monuments/culture.ts. */
  cathedralRoofZinc: '#5d8076',
  /** Monument kinds whose body casts a sun shadow (scene/useTownPieces.ts). Every other monument is shadow-free (shadow budget). */
  monumentShadowKinds: ['gothic-cathedral'] as readonly MonumentKind[],
  /** Gothic cathedral: probability per rose window that its disc is lit at night (0-1). monuments/culture.ts. */
  cathedralRoseLitShare: 0.5,
  /** Dinosaur park: number of ferns scattered on the lawn. monuments/culture.ts. */
  dinosaurFernCount: 10,
  /** Open-air theatre: number of seated people on the cavea. monuments/culture.ts. */
  theatreAudienceCount: 24,
  /** Open-air theatre: probability that the centre opening of the scaenae is lit (0-1). monuments/culture.ts. */
  theatreDoorLitShare: 1,
} as const;
