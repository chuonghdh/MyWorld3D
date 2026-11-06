// House builder: core volume, facades, roof assembly and party walls (split from house.ts).

import * as THREE from 'three';
import { HouseMesh, HOUSE_FRAME, col, mix, scale, shiftLightness, type Col, type P3 } from './facade/mesh';
import { computeLayout, isFlatRoof, offsetPolygon } from './facade/layout';
import { lookFor } from './facade/presets';
import { makeRng, hashSeed, pick, chance, range } from './facade/rng';
import type { Colors, Ctx } from './facade/parts';
import { groundFacade } from './facade/ground';
import { downpipes, topCornice, upperCurtainWall, upperPierFacade, upperRibbons } from './facade/upper';
import { buildRoof } from './facade/roof';
import { REAR_FLUSH_SETBACK, rearElevation } from './facade/rear';
import { SURFACE, roofSurfaceId } from './surface';
import { AWNING_COLORS, BASE_STONE, BRICK_LIKE_WALLS, DOOR_COLORS, IRONWORK, SHOPFRONT_COLORS } from './palette';
import { PARTY_GAP, HouseParams, NO_SHUTTER_KINDS, roofColors, deckColor } from './houseParams';

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
  // Corner lot with a neighbour behind it: the rear is set back and stays inside the lot (see rearSetback).
  const rearSetback = !fl.back && fl.front && (fl.left || fl.right) ? REAR_FLUSH_SETBACK : 0;
  m.limits = {
    xmin: -lay.W / 2 - (fl.left ? 1.5 : 0),
    xmax: lay.W / 2 + (fl.right ? 1.5 : 0),
    zmin: -lay.D / 2 - (fl.back ? 1.5 : rearSetback > 0 ? 0 : 1.2),
    zmax: lay.D / 2 + (fl.front ? 1.5 : 0),
  };

  const wallHex = params.wallColor || lay.spec.defaultWall;
  const wall = shiftLightness(wallHex, (rng() * 2 - 1) * 0.04);
  const brick = BRICK_LIKE_WALLS.includes(wallHex.toLowerCase()) || kind === 'canal' || kind === 'brownstone';
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
    deck: deckColor(lay.roof, kind, makeRng(hashSeed(seed, lay.preset, 'roofTone'))),
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
  roofSurface = roofSurfaceId(roofSurface, lay.wallTop);

  const ctx: Ctx = {
    ...lay,
    m,
    rng,
    rngGlass,
    look,
    c: colors,
    hasShutters: colors.shutter !== null && !NO_SHUTTER_KINDS.includes(kind),
    wallSurface: WALL_SURFACE[kind],
    roofSurface,
    rngRear: makeRng(hashSeed(seed, lay.preset, 'rear')),
    rngSign: makeRng(hashSeed(seed, lay.preset, 'sign')),
    rngDetail: makeRng(hashSeed(seed, lay.preset, 'detail')),
    avenue: corner || params.avenue === true,
    sharedCourtyard: params.sharedCourtyard === true,
    rearSetback,
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
  const capSurface = isFlatRoof(ctx.roof) ? roofSurfaceId(SURFACE.ROOF_FLAT, ctx.wallTop) : SURFACE.PLAIN;
  m.frame = HOUSE_FRAME;
  const ring = (poly: [number, number][], y: number): P3[] => poly.map(([x, z]) => [x, y, z] as P3);
  // A set-back rear (ctx.rearSetback) moves that wall inward; other party walls keep 4 cm.
  const inset = (e: (typeof edges)[number]): number => (e.side === 'back' && !e.facade ? 0.04 + ctx.rearSetback : 0.04);
  const upper = offsetPolygon(edges, edges.map((e) => (e.facade ? look.r : inset(e))));
  const tower = ctx.spec.kind === 'tower';
  const sideColor = (i: number): Col => (edges[i].side === 'back' && !edges[i].facade ? c.rear : c.party);
  const walls = (a: P3[], b: P3[], cap: Col | null, capId: number = SURFACE.PLAIN): void => {
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
    if (cap) m.withSurface(capId, () => m.poly('body', b, cap, interior));
  };
  if (tower) {
    const lobby = offsetPolygon(edges, edges.map((e) => (e.facade ? 1.0 : inset(e))));
    m.addSolid(lobby, 0, ctx.groundH);
    m.addSolid(upper, ctx.groundH, ctx.wallTop);
    walls(ring(lobby, 0), ring(lobby, ctx.groundH), null);
    walls(ring(upper, ctx.groundH), ring(upper, ctx.wallTop), c.deck, capSurface);
    m.poly('body', ring(upper, ctx.groundH), col('#d9d6cf'), [0, ctx.groundH + 1, 0]);
  } else {
    m.addSolid(upper, 0, ctx.wallTop);
    walls(ring(upper, 0), ring(upper, ctx.wallTop), c.deck, capSurface);
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
