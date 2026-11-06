// Preset specifications: roof, facade and footprint tables (split from presets.ts).

import type { GroundFloorUse, HousePreset } from '../../core/types';
import { BRICK_COLORS, ROOF_COLORS, SHUTTER_COLORS, WALL_COLORS } from '../palette';

export type RoofType =
  | 'mansard'
  | 'flat'
  | 'gable'
  | 'hip'
  | 'cornice'
  | 'parapet'
  | 'terrace'
  | 'low-tiled'
  | 'step-gable';

export const ROOF_TYPES: readonly RoofType[] = [
  'mansard',
  'flat',
  'gable',
  'hip',
  'cornice',
  'parapet',
  'terrace',
  'low-tiled',
  'step-gable',
];

export type ConcretePreset = Exclude<HousePreset, 'as-block'>;

export type FacadeKind =
  | 'haussmann'
  | 'canal'
  | 'tower'
  | 'brutalist'
  | 'bauhaus'
  | 'mediterranean'
  | 'brownstone'
  | 'nordic'
  | 'shophouse';

export type FrameKind = 'french' | 'sash' | 'casement' | 'cross' | 'modern';

export interface WindowSize {
  w: number;
  h: number;
  /** Sill height above the floor. */
  sill: number;
}

export interface PresetSpec {
  kind: FacadeKind;
  width: number;
  depth: number;
  defaultFloors: number;
  defaultRoof: RoofType;
  modernRoof: RoofType;
  defaultWall: string;
  modernWall: string;
  defaultShutter: string | null;
  /** Shutter used when a classic preset without its own shutters is given some (picked on a bare lot). Default: none. */
  fillShutter?: string;
  defaultGround: GroundFloorUse;
  /** Upper floor height. */
  floorH: number;
  /** Target bay width. */
  bay: number;
  roofColor: string;
  /** Roof pitch in degrees for gable roofs. */
  pitch: number;
  /** Gable faces the street (ridge runs front to back). */
  gableToStreet: boolean;
}

export const SPECS: Record<ConcretePreset, PresetSpec> = {
  'original-feuilles': {
    kind: 'haussmann',
    width: 12,
    depth: 12,
    defaultFloors: 6,
    defaultRoof: 'mansard',
    modernRoof: 'mansard',
    defaultWall: WALL_COLORS.cream,
    modernWall: WALL_COLORS.white,
    defaultShutter: SHUTTER_COLORS.grey,
    defaultGround: 'shop',
    floorH: 3.1,
    bay: 2.7,
    roofColor: ROOF_COLORS.slate,
    pitch: 40,
    gableToStreet: false,
  },
  'canal-amsterdam': {
    kind: 'canal',
    width: 6.5,
    depth: 12,
    defaultFloors: 4,
    defaultRoof: 'step-gable',
    modernRoof: 'gable',
    defaultWall: BRICK_COLORS.red,
    modernWall: '#6e3a2c',
    defaultShutter: null,
    fillShutter: SHUTTER_COLORS.sage,
    defaultGround: 'residential',
    floorH: 3.3,
    bay: 2.0,
    roofColor: '#3d4148',
    pitch: 55,
    gableToStreet: true,
  },
  'glass-tower': {
    kind: 'tower',
    width: 14,
    depth: 14,
    defaultFloors: 8,
    defaultRoof: 'flat',
    modernRoof: 'flat',
    defaultWall: WALL_COLORS.stone,
    modernWall: '#9aa3a8',
    defaultShutter: null,
    defaultGround: 'shop',
    floorH: 3.6,
    bay: 1.5,
    roofColor: '#8f9399',
    pitch: 30,
    gableToStreet: false,
  },
  'brutalist-concrete': {
    kind: 'brutalist',
    width: 12,
    depth: 12,
    defaultFloors: 6,
    defaultRoof: 'parapet',
    modernRoof: 'flat',
    defaultWall: '#a3a097',
    modernWall: '#c3bfb4',
    defaultShutter: null,
    defaultGround: 'residential',
    floorH: 3.3,
    bay: 2.6,
    roofColor: '#77756f',
    pitch: 30,
    gableToStreet: false,
  },
  bauhaus: {
    kind: 'bauhaus',
    width: 12,
    depth: 11,
    defaultFloors: 4,
    defaultRoof: 'flat',
    modernRoof: 'flat',
    defaultWall: WALL_COLORS.white,
    modernWall: '#f6f4ee',
    defaultShutter: null,
    defaultGround: 'residential',
    floorH: 3.1,
    bay: 2.5,
    roofColor: '#d8d5cc',
    pitch: 20,
    gableToStreet: false,
  },
  mediterranean: {
    kind: 'mediterranean',
    width: 9,
    depth: 10,
    defaultFloors: 3,
    defaultRoof: 'low-tiled',
    modernRoof: 'terrace',
    defaultWall: WALL_COLORS.peach,
    modernWall: WALL_COLORS.white,
    defaultShutter: SHUTTER_COLORS.blue,
    defaultGround: 'residential',
    floorH: 3.0,
    bay: 2.4,
    roofColor: ROOF_COLORS.terracotta,
    pitch: 20,
    gableToStreet: false,
  },
  'brownstone-ny': {
    kind: 'brownstone',
    width: 7,
    depth: 12,
    defaultFloors: 4,
    defaultRoof: 'cornice',
    modernRoof: 'flat',
    defaultWall: BRICK_COLORS.brown,
    modernWall: '#7d4a36',
    defaultShutter: null,
    fillShutter: SHUTTER_COLORS.grey,
    defaultGround: 'residential',
    floorH: 3.3,
    bay: 2.3,
    roofColor: '#4a4a4a',
    pitch: 30,
    gableToStreet: false,
  },
  'nordic-timber': {
    kind: 'nordic',
    width: 8,
    depth: 10,
    defaultFloors: 3,
    defaultRoof: 'gable',
    modernRoof: 'gable',
    defaultWall: '#b5533c',
    modernWall: '#34322f',
    defaultShutter: null,
    fillShutter: SHUTTER_COLORS.cream,
    defaultGround: 'residential',
    floorH: 2.9,
    bay: 2.4,
    roofColor: '#3b3f46',
    pitch: 48,
    gableToStreet: true,
  },
  'shophouse-asia': {
    kind: 'shophouse',
    width: 5.5,
    depth: 11,
    defaultFloors: 4,
    defaultRoof: 'gable',
    modernRoof: 'flat',
    defaultWall: WALL_COLORS.ochre,
    modernWall: WALL_COLORS.sky,
    defaultShutter: SHUTTER_COLORS.sage,
    defaultGround: 'shop',
    floorH: 3.1,
    bay: 2.4,
    roofColor: ROOF_COLORS.darkTile,
    pitch: 38,
    gableToStreet: true,
  },
};
