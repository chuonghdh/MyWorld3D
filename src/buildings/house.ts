// Procedural Western-European houses (DESIGN-3D section 3, v2 contract).
//
// A house fills its lot exactly (width x depth, front at +z). Street facades (params.facades) are
// built as piers and spandrels around genuinely recessed windows, with per-style frames, sills,
// shutters, balconies, cornices and ground floors; other sides are plain party walls with chimney
// flues. Everything is merged into at most three meshes (body, glass, glassLit) that use the shared
// materials, with colour carried in vertex colours. Same params and seed give identical geometry.

import * as THREE from 'three';
import type { Facades, GroundFloorUse, HousePreset, HouseStyle } from '../core/types';
import { HouseMesh, HOUSE_FRAME, col, mix, scale, shiftLightness, type Col, type P3 } from './facade/mesh';
import {
  FALLBACK_PRESET,
  MAX_FLOORS,
  MIN_FLOORS,
  computeLayout,
  offsetPolygon,
  resolvePreset,
} from './facade/layout';
import { ROOF_TYPES, SPECS, lookFor, type RoofType } from './facade/presets';
import { makeRng, hashSeed, pick, chance, range } from './facade/rng';
import type { Colors, Ctx, HouseChimney } from './facade/parts';
import { groundFacade } from './facade/ground';
import { downpipes, topCornice, upperCurtainWall, upperPierFacade, upperRibbons } from './facade/upper';
import { buildRoof } from './facade/roof';
import { rearElevation } from './facade/rear';
import { SURFACE } from './surface';
import {
  AWNING_COLORS,
  BASE_STONE,
  BRICK_PALETTE,
  DOOR_COLORS,
  IRONWORK,
  ROOF_COLORS,
  SHOPFRONT_COLORS,
} from './palette';

/** Distance each non-facade side is pulled in from the lot line (m), so neighbouring walls never share a plane. */
export const PARTY_GAP = 0.025;

export type { RoofType, HouseChimney };
export { ROOF_TYPES, FALLBACK_PRESET, MIN_FLOORS, MAX_FLOORS, resolvePreset };

export const HOUSE_PRESETS: readonly HousePreset[] = [
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
];

export interface HouseParams {
  preset: HousePreset;
  /** Number of storeys including the ground floor, 2 to 8. Values outside the range are clamped. */
  floors: number;
  roof: RoofType;
  style: HouseStyle;
  /** Wall colour as a hex string. */
  wallColor: string;
  /** Shutter colour as a hex string, or null for no shutters (classic style only). */
  shutterColor: string | null;
  /** Lot frontage along local x. Default: preset width. */
  width?: number;
  /** Lot depth along local z. Default: preset depth. */
  depth?: number;
  /** Which sides face a street. Default: front and back. */
  facades?: Facades;
  /** Ground floor use. Default: the preset's. */
  groundFloor?: GroundFloorUse;
  /** Detail variation. Default: 1. */
  seed?: number;
  /** Lot on an avenue: shopfronts may carry blade signs (corner lots always may). Default: false. */
  avenue?: boolean;
  /**
   * The back faces a large courtyard shared by a merged block (seen from far across the garden) instead of a
   * small private yard: the rear elevation gets near-front window rhythm, more balconies, back extensions and
   * washing lines. Default: false (unchanged output).
   */
  sharedCourtyard?: boolean;
}

/** Full, valid params for a preset: its default floors, roof, wall colour and shutters for the style. */
export function defaultHouseParams(preset: HousePreset, style: HouseStyle = 'classic'): HouseParams {
  const s = SPECS[resolvePreset(preset)];
  const modern = style === 'modern';
  return {
    preset,
    floors: s.defaultFloors,
    roof: modern ? s.modernRoof : s.defaultRoof,
    style,
    wallColor: modern ? s.modernWall : s.defaultWall,
    shutterColor: modern ? null : s.defaultShutter,
  };
}

/** Default footprint in metres (x = width, z = depth) for a preset. */
export function houseFootprint(preset: HousePreset): { width: number; depth: number } {
  const s = SPECS[resolvePreset(preset)];
  return { width: s.width, depth: s.depth };
}

/** Total height of the house including its roof (ridge, mansard top or parapet; chimneys and rooftop clutter excluded). */
export function houseHeight(params: HouseParams): number {
  const lay = computeLayout(params);
  return lay.wallTop + lay.roofH;
}

function roofColors(ctx: { roof: RoofType; spec: (typeof SPECS)[keyof typeof SPECS] }, rng: () => number): [Col, Col] {
  const j = (rng() - 0.5) * 0.06;
  switch (ctx.roof) {
    case 'mansard':
      return [shiftLightness(pick(rng, [ROOF_COLORS.slate, '#56606c', '#5b6470']), j), shiftLightness(ROOF_COLORS.zinc, 0.06 + j)];
    case 'low-tiled':
      return [shiftLightness(pick(rng, [ROOF_COLORS.terracotta, '#b8643f', '#a9553a']), j), col(ROOF_COLORS.terracotta)];
    case 'hip':
      return [
        shiftLightness(ctx.spec.kind === 'mediterranean' ? ROOF_COLORS.terracotta : ctx.spec.kind === 'haussmann' ? ROOF_COLORS.zinc : ctx.spec.roofColor, j),
        col(ROOF_COLORS.zinc),
      ];
    case 'gable':
    case 'step-gable': {
      const base = ctx.spec.kind === 'haussmann' ? ROOF_COLORS.slate : ctx.spec.roofColor;
      return [shiftLightness(chance(rng, 0.08) ? ROOF_COLORS.copper : base, j), col(ROOF_COLORS.zinc)];
    }
    default:
      return [shiftLightness(ctx.spec.roofColor, j), col(ROOF_COLORS.zinc)];
  }
}

/** Builds a house with its base at y = 0, centred on x and z, with the front at +z. */
export function buildHouse(params: HouseParams): THREE.Group {
  const lay = computeLayout(params);
  const seed = Number.isFinite(params.seed) ? (params.seed as number) : 1;
  const rng = makeRng(hashSeed(seed, lay.preset, 'geometry'));
  const rngGlass = makeRng(hashSeed(seed, lay.preset, 'glass'));
  const kind = lay.spec.kind;
  const modern = lay.modern;
  const look = lookFor(kind, modern);
  const m = new HouseMesh();
  // Layering may push a detail outward, but never past the lot line of a side that touches a neighbour
  // (street sides may project, rear sides may take the existing 1.2 m allowance).
  const fl = lay.facades;
  m.limits = {
    xmin: -lay.W / 2 - (fl.left ? 1.5 : 0),
    xmax: lay.W / 2 + (fl.right ? 1.5 : 0),
    zmin: -lay.D / 2 - (fl.back ? 1.5 : 1.2),
    zmax: lay.D / 2 + (fl.front ? 1.5 : 0),
  };

  const wallHex = params.wallColor || lay.spec.defaultWall;
  const wall = shiftLightness(wallHex, (rng() * 2 - 1) * 0.04);
  const brick = BRICK_PALETTE.includes(wallHex) || kind === 'canal' || kind === 'brownstone';
  const trim: Col = kind === 'haussmann' && !modern ? shiftLightness(wallHex, 0.05) : col(look.trim);
  const [roof, roofTop] = roofColors(lay, rng);
  const colors: Colors = {
    wall,
    party: mix(scale(wall, 0.84), col('#a9a39a'), 0.3),
    trim,
    cornice: [Math.min(1, trim[0] * 1.06), Math.min(1, trim[1] * 1.06), Math.min(1, trim[2] * 1.06)],
    base: brick ? scale(col(BASE_STONE), 0.85) : col(BASE_STONE),
    frame: col(look.frameColor),
    shutter: !modern && params.shutterColor ? col(params.shutterColor) : null,
    roof,
    roofTop,
    iron: col(IRONWORK),
    door: col(pick(rng, DOOR_COLORS)),
    shop: modern ? col(pick(rng, ['#2a2c2f', '#3a3d40', '#4a4f53'])) : col(pick(rng, SHOPFRONT_COLORS)),
    awning: col(pick(rng, AWNING_COLORS)),
    white: col('#f3efe7'),
    deck: col(lay.roof === 'terrace' ? (kind === 'mediterranean' ? '#c9a184' : '#a58a68') : '#8d8a84'),
    chimney: brick ? scale(wall, 0.9) : shiftLightness(pick(rng, ['#d8ccb4', '#cfc2a8', '#c9b9a0']), 0),
    pot: col('#b5593a'),
    railGlass: col('#c3d4dc'),
    glassTop: shiftLightness('#5a7186', range(rng, -0.04, 0.04)),
    glassBottom: col('#1c2630'),
    green: col(pick(rng, ['#4f7a3a', '#5d8a42', '#3f6b35'])),
    accent: col(pick(rng, ['#c8553d', '#2f5d8a', '#e0b13a'])),
    sign: col(pick(rng, ['#efe3c8', '#d8b45a', '#f4efe3'])),
    rear: scale(mix(wall, col('#a9a39a'), 0.18), 0.94),
  };
  const f = lay.facades;
  const corner = (f.front || f.back) && (f.left || f.right);
  const WALL_SURFACE: Record<typeof kind, number> = {
    haussmann: SURFACE.STONE,
    canal: SURFACE.BRICK,
    tower: SURFACE.PLAIN,
    brutalist: SURFACE.CONCRETE,
    bauhaus: SURFACE.STUCCO,
    mediterranean: SURFACE.STUCCO,
    brownstone: SURFACE.BRICK,
    nordic: SURFACE.TIMBER,
    shophouse: SURFACE.STUCCO,
  };
  const terracotta = kind === 'mediterranean' || kind === 'shophouse';
  let roofSurface: number = SURFACE.PLAIN;
  if (lay.roof === 'mansard') roofSurface = SURFACE.ZINC;
  else if (lay.roof === 'low-tiled') roofSurface = SURFACE.TILE_TERRACOTTA;
  else if (lay.roof === 'gable' || lay.roof === 'hip') roofSurface = terracotta ? SURFACE.TILE_TERRACOTTA : SURFACE.TILE_SLATE;
  else if (lay.roof === 'step-gable') roofSurface = SURFACE.TILE_SLATE;

  const ctx: Ctx = {
    ...lay,
    m,
    rng,
    rngGlass,
    look,
    c: colors,
    hasShutters: colors.shutter !== null && kind !== 'tower' && kind !== 'bauhaus' && kind !== 'brutalist',
    wallSurface: WALL_SURFACE[kind],
    roofSurface,
    rngRear: makeRng(hashSeed(seed, lay.preset, 'rear')),
    rngSign: makeRng(hashSeed(seed, lay.preset, 'sign')),
    rngDetail: makeRng(hashSeed(seed, lay.preset, 'detail')),
    avenue: corner || params.avenue === true,
    sharedCourtyard: params.sharedCourtyard === true,
    chimneyTops: [],
  };

  buildCore(ctx);

  for (const seg of lay.segments) {
    m.frame = seg.frame;
    if (seg.facade) {
      groundFacade(ctx, seg);
      m.frame = seg.frame;
      if (kind === 'tower') upperCurtainWall(ctx, seg);
      else if (kind === 'bauhaus') upperRibbons(ctx, seg);
      else upperPierFacade(ctx, seg);
      topCornice(ctx, seg);
      if (kind !== 'tower') downpipes(ctx, seg);
    } else if (seg.side === 'back') {
      rearElevation(ctx, seg);
    } else {
      partyWall(ctx, seg);
    }
  }
  m.frame = HOUSE_FRAME;
  buildRoof(ctx);

  // Neighbours: every side that is not a street facade touches the next house, whose own wall would sit
  // exactly on the shared lot line. Pull such sides in by PARTY_GAP so the two walls never share a
  // plane (the gap is closed from both houses: each is a closed solid, nothing can be seen through it).
  const gx0 = f.left ? 0 : PARTY_GAP;
  const gx1 = f.right ? 0 : PARTY_GAP;
  const gz0 = f.back ? 0 : PARTY_GAP;
  const gz1 = f.front ? 0 : PARTY_GAP;
  const sx = (lay.W - gx0 - gx1) / lay.W;
  const sz = (lay.D - gz0 - gz1) / lay.D;
  const bx = -lay.W / 2 + gx0 - sx * (-lay.W / 2);
  const bz = -lay.D / 2 + gz0 - sz * (-lay.D / 2);
  if (gx0 + gx1 + gz0 + gz1 > 0) {
    m.remapXZ(sx, bx, sz, bz);
    for (const t of ctx.chimneyTops) {
      t.x = t.x * sx + bx;
      t.z = t.z * sz + bz;
    }
  }

  // Fake ground occlusion: darken the bottom 0.8 m by up to 12%.
  m.shade((y) => (y < 0.8 ? 0.88 + 0.12 * Math.max(0, y / 0.8) : 1));

  const group = m.build();
  group.name = `house-${lay.preset}`;
  group.userData = {
    preset: lay.preset,
    floors: lay.floors,
    roof: lay.roof,
    style: params.style,
    height: lay.wallTop + lay.roofH,
    /** Height of the wall head (top of the walls, below the roof). */
    wallTop: lay.wallTop,
    width: lay.W,
    depth: lay.D,
    triangles: m.triangles,
    chimneys: ctx.chimneyTops,
  };
  return group;
}

/** Inner volume: inset by the reveal on facades and a few cm on party walls (for flues). */
function buildCore(ctx: Ctx): void {
  const { m, edges, look, c } = ctx;
  m.frame = HOUSE_FRAME;
  const ring = (poly: [number, number][], y: number): P3[] => poly.map(([x, z]) => [x, y, z] as P3);
  const upper = offsetPolygon(edges, edges.map((e) => (e.facade ? look.r : 0.04)));
  const tower = ctx.spec.kind === 'tower';
  const sideColor = (i: number): Col => (edges[i].side === 'back' && !edges[i].facade ? c.rear : c.party);
  const walls = (a: P3[], b: P3[], cap: Col | null): void => {
    const n = a.length;
    let ix = 0;
    let iy = 0;
    let iz = 0;
    for (const p of [...a, ...b]) {
      ix += p[0];
      iy += p[1];
      iz += p[2];
    }
    const interior: P3 = [ix / (2 * n), iy / (2 * n), iz / (2 * n)];
    m.withSurface(ctx.wallSurface, () => {
      for (let i = 0; i < n; i++) {
        const j = (i - 1 + n) % n;
        m.poly('body', [a[j], a[i], b[i], b[j]], sideColor(i), interior);
      }
    });
    if (cap) m.poly('body', b, cap, interior);
  };
  if (tower) {
    const lobby = offsetPolygon(edges, edges.map((e) => (e.facade ? 1.0 : 0.04)));
    m.addSolid(lobby, 0, ctx.groundH);
    m.addSolid(upper, ctx.groundH, ctx.wallTop);
    walls(ring(lobby, 0), ring(lobby, ctx.groundH), null);
    walls(ring(upper, ctx.groundH), ring(upper, ctx.wallTop), c.deck);
    m.poly('body', ring(upper, ctx.groundH), col('#d9d6cf'), [0, ctx.groundH + 1, 0]);
  } else {
    m.addSolid(upper, 0, ctx.wallTop);
    walls(ring(upper, 0), ring(upper, ctx.wallTop), c.deck);
  }
}

/** Party wall decoration: an occasional faded painted advert. Flues come with the chimneys. */
function partyWall(ctx: Ctx, seg: { L: number; frame: typeof HOUSE_FRAME }): void {
  const { m, rng, wallTop, c } = ctx;
  if (seg.L < 5 || wallTop < 6 || !chance(rng, 0.1)) return;
  m.frame = seg.frame;
  const w = Math.min(seg.L * 0.5, 6);
  const u0 = range(rng, -seg.L / 2 + 0.5, seg.L / 2 - 0.5 - w);
  const y0 = wallTop * range(rng, 0.45, 0.55);
  const h = Math.min(3, wallTop * 0.3);
  const ad = mix(c.party, col(pick(rng, ['#b03a2e', '#24395c', '#c08a2e', '#2f6b4f'])), 0.35);
  m.b(ad, u0, u0 + w, y0, y0 + h, -0.04, -0.02);
  const letters = mix(c.party, col('#f1ece0'), 0.45);
  m.b(letters, u0 + 0.3, u0 + w - 0.3, y0 + h * 0.55, y0 + h * 0.8, -0.02, -0.01);
  m.b(letters, u0 + 0.6, u0 + w * 0.6, y0 + h * 0.2, y0 + h * 0.35, -0.02, -0.01);
}
