// Preset table: the character of each house type (DESIGN-3D 3.3), classic and modern.

import type { GroundFloorUse, HousePreset } from '../../core/types';
import { BRICK_COLORS, BRICK_PALETTE, ROOF_COLORS, SHUTTER_COLORS, SHUTTER_PALETTE, TRIM_STONE, WALL_COLORS, WALL_PALETTE } from '../palette';

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

/** Per-style facade recipe derived from preset kind and style. */
export interface Look {
  /** Window reveal depth: glass sits this far behind the facade plane. */
  r: number;
  win: WindowSize;
  frame: FrameKind;
  frameColor: string;
  trim: string;
  surround: boolean;
  hood: 'none' | 'flat' | 'lintel' | 'pediment';
  keystone: boolean;
  stringCourse: boolean;
  balconies: 'haussmann' | 'haussmann-glass' | 'med' | 'shophouse' | 'juliet-glass' | 'none';
  /** Horizontal coursing on the upper walls (timber boards, board-marked concrete). */
  texture: { h: number; gap: number; proj: number } | null;
  cornerBoards: boolean;
  pilasters: boolean;
  cornice: 'stepped' | 'bracketed' | 'simple' | 'coping';
  rustic: { h: number; gap: number; proj: number } | null;
  door: 'arch' | 'transom' | 'stoop' | 'modern';
  groundWin: WindowSize;
  bars: boolean;
  flowerBoxes: boolean;
}

export function lookFor(kind: FacadeKind, modern: boolean): Look {
  const base: Look = {
    r: 0.2,
    win: { w: 1.2, h: 2.2, sill: 0.8 },
    frame: modern ? 'modern' : 'casement',
    frameColor: modern ? '#2b2d30' : '#f2eee6',
    trim: TRIM_STONE,
    surround: !modern,
    hood: modern ? 'none' : 'flat',
    keystone: false,
    stringCourse: !modern,
    balconies: 'none',
    texture: null,
    cornerBoards: false,
    pilasters: false,
    cornice: modern ? 'coping' : 'stepped',
    rustic: null,
    door: modern ? 'modern' : 'transom',
    groundWin: { w: 1.1, h: 1.9, sill: 1.0 },
    bars: false,
    flowerBoxes: false,
  };
  switch (kind) {
    case 'haussmann':
      return {
        ...base,
        r: 0.22,
        win: modern ? { w: 1.45, h: 2.45, sill: 0.1 } : { w: 1.2, h: 2.3, sill: 0.22 },
        frame: modern ? 'modern' : 'french',
        hood: modern ? 'none' : 'pediment',
        stringCourse: true,
        keystone: !modern,
        balconies: modern ? 'haussmann-glass' : 'haussmann',
        rustic: modern ? null : { h: 0.42, gap: 0.05, proj: 0.03 },
        door: modern ? 'modern' : 'arch',
        bars: !modern,
      };
    case 'canal':
      return {
        ...base,
        r: 0.15,
        win: modern ? { w: 1.5, h: 2.45, sill: 0.35 } : { w: 1.05, h: 2.1, sill: 0.75 },
        frame: modern ? 'modern' : 'sash',
        frameColor: modern ? '#26282b' : '#f7f4ee',
        surround: false,
        hood: modern ? 'none' : 'lintel',
        stringCourse: false,
        cornice: modern ? 'coping' : 'simple',
        door: modern ? 'modern' : 'transom',
        flowerBoxes: !modern,
      };
    case 'tower':
      return { ...base, r: 0.15, frame: 'modern', frameColor: modern ? '#1b1d20' : '#5b6168', surround: false, hood: 'none', stringCourse: false, cornice: 'coping', door: 'modern' };
    case 'brutalist':
      return {
        ...base,
        r: modern ? 0.2 : 0.45,
        win: modern ? { w: 1.5, h: 1.5, sill: 0.9 } : { w: 1.5, h: 1.7, sill: 0.8 },
        frame: 'modern',
        frameColor: '#3a3a38',
        surround: false,
        hood: 'none',
        stringCourse: false,
        texture: modern ? null : { h: 0.3, gap: 0.025, proj: 0.015 },
        cornice: 'coping',
        door: 'modern',
      };
    case 'bauhaus':
      return { ...base, r: 0.12, frame: 'modern', frameColor: '#2a2c2f', surround: false, hood: 'none', stringCourse: false, cornice: 'coping', door: 'modern' };
    case 'mediterranean':
      return {
        ...base,
        r: 0.25,
        win: modern ? { w: 1.6, h: 2.3, sill: 0.1 } : { w: 0.95, h: 1.45, sill: 0.95 },
        frame: modern ? 'modern' : 'casement',
        frameColor: modern ? '#3a3a38' : '#f3efe6',
        surround: !modern,
        hood: 'none',
        stringCourse: false,
        balconies: modern ? 'juliet-glass' : 'med',
        cornice: modern ? 'coping' : 'simple',
        door: modern ? 'modern' : 'arch',
        groundWin: { w: 0.95, h: 1.45, sill: 1.0 },
        bars: !modern,
        flowerBoxes: !modern,
      };
    case 'brownstone':
      return {
        ...base,
        r: 0.2,
        win: modern ? { w: 1.5, h: 2.4, sill: 0.4 } : { w: 1.05, h: 2.15, sill: 0.7 },
        frame: modern ? 'modern' : 'sash',
        frameColor: modern ? '#26282b' : '#3a2f28',
        trim: '#b89f86',
        surround: false,
        hood: modern ? 'none' : 'lintel',
        stringCourse: false,
        cornice: modern ? 'coping' : 'bracketed',
        rustic: modern ? null : { h: 0.4, gap: 0.04, proj: 0.025 },
        door: modern ? 'modern' : 'stoop',
        bars: !modern,
      };
    case 'nordic':
      return {
        ...base,
        r: 0.12,
        win: modern ? { w: 1.9, h: 2.2, sill: 0.4 } : { w: 1.0, h: 1.5, sill: 0.85 },
        frame: modern ? 'modern' : 'cross',
        frameColor: modern ? '#1d1e20' : '#f5f2ea',
        trim: modern ? '#2b2a28' : '#f5f2ea',
        surround: !modern,
        hood: modern ? 'none' : 'flat',
        stringCourse: false,
        texture: { h: 0.22, gap: 0.03, proj: 0.018 },
        cornerBoards: true,
        cornice: modern ? 'coping' : 'simple',
        door: modern ? 'modern' : 'transom',
      };
    case 'shophouse':
      return {
        ...base,
        r: 0.18,
        win: modern ? { w: 2.0, h: 2.6, sill: 0.15 } : { w: 1.0, h: 2.0, sill: 0.35 },
        frame: modern ? 'modern' : 'french',
        frameColor: modern ? '#2a2c2f' : '#f4f0e6',
        surround: !modern,
        hood: modern ? 'none' : 'flat',
        balconies: modern ? 'juliet-glass' : 'shophouse',
        pilasters: !modern,
        cornice: modern ? 'coping' : 'simple',
        flowerBoxes: !modern,
      };
  }
}

function uniqueHex(list: readonly string[]): string[] {
  return [...new Set(list.map((c) => c.toLowerCase()))];
}

/** Every wall colour a house can start from: palette, brick and each preset's classic and modern walls. */
export const HOUSE_WALL_OPTIONS: readonly string[] = uniqueHex([
  ...WALL_PALETTE,
  ...BRICK_PALETTE,
  ...Object.values(SPECS).flatMap((s) => [s.defaultWall, s.modernWall]),
]);

/** Every shutter colour a house can start from: palette plus each preset's classic shutter. */
export const HOUSE_SHUTTER_OPTIONS: readonly string[] = uniqueHex([
  ...SHUTTER_PALETTE,
  ...Object.values(SPECS).flatMap((s) => (s.defaultShutter ? [s.defaultShutter] : [])),
]);
