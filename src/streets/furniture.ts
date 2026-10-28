// Street furniture: lamps (iron + lantern glass), light pools, benches, bollards, bins,
// and traffic signal poles with 3-light heads.

import * as THREE from 'three';
import type { CityLayout, Intersection, TrafficLight } from '../city/layout';
import type { LightAxis } from '../traffic/lights';
import { MeshBuilder, placeMatrix } from './builder';
import { SIDEWALK_TOP } from './surfaces';

export const FURNITURE_COLORS = {
  iron: '#22262a',
  ironLight: '#3a4046',
  wood: '#9a6b43',
  bin: '#2f4f3a',
  binLid: '#243b2c',
  bollardBand: '#c9c2b0',
  signalPole: '#2b2f33',
  signalHousing: '#1d2125',
} as const;

export const LAMP_HEIGHT = 4.5;
/** Lamp pool radius. Small and soft: it should read as light on the paving, not as a disc. */
export const POOL_RADIUS = 4;
const POOL_Y = SIDEWALK_TOP + 0.03;
/** Shop-front light spill sits a hair under the lamp pools so the two never share a plane. */
const SPILL_Y = SIDEWALK_TOP + 0.024;
/** Depth of the spill zone in front of a lit shop, metres. */
const SPILL_DEPTH = 2.4;

// Shared primitive geometries, created once per build and disposed after merging.
interface Prims {
  plinth: THREE.BufferGeometry;
  shaft: THREE.BufferGeometry;
  collar: THREE.BufferGeometry;
  lanternBase: THREE.BufferGeometry;
  lanternGlass: THREE.BufferGeometry;
  lanternRoof: THREE.BufferGeometry;
  finial: THREE.BufferGeometry;
  bollard: THREE.BufferGeometry;
  bollardBand: THREE.BufferGeometry;
  bin: THREE.BufferGeometry;
  binLid: THREE.BufferGeometry;
  signalPole: THREE.BufferGeometry;
}

function makePrims(): Prims {
  return {
    plinth: new THREE.CylinderGeometry(0.12, 0.17, 0.5, 8),
    shaft: new THREE.CylinderGeometry(0.055, 0.08, 3.3, 8),
    collar: new THREE.CylinderGeometry(0.11, 0.11, 0.1, 8),
    // Square lantern: 4-sided cylinders rotated 45 degrees.
    lanternBase: new THREE.CylinderGeometry(0.2, 0.08, 0.15, 4).rotateY(Math.PI / 4),
    lanternGlass: new THREE.CylinderGeometry(0.22, 0.16, 0.42, 4).rotateY(Math.PI / 4),
    lanternRoof: new THREE.ConeGeometry(0.32, 0.22, 4).rotateY(Math.PI / 4),
    finial: new THREE.ConeGeometry(0.04, 0.14, 6),
    bollard: new THREE.CylinderGeometry(0.07, 0.08, 0.85, 8),
    bollardBand: new THREE.CylinderGeometry(0.075, 0.075, 0.08, 8),
    bin: new THREE.CylinderGeometry(0.22, 0.2, 0.85, 10),
    binLid: new THREE.CylinderGeometry(0.24, 0.24, 0.06, 10),
    signalPole: new THREE.CylinderGeometry(0.07, 0.08, 3.4, 8),
  };
}

function disposePrims(p: Prims): void {
  for (const g of Object.values(p)) g.dispose();
}

/** Places a geometry whose origin is its centre so that its base sits at y. */
function addAt(b: MeshBuilder, g: THREE.BufferGeometry, height: number, x: number, y: number, z: number, rotY: number, color: string): void {
  b.geometry(g, placeMatrix(x, y + height / 2, z, rotY), color);
}

function buildLamp(iron: MeshBuilder, glass: MeshBuilder, p: Prims, x: number, z: number, facing: number): void {
  const y = SIDEWALK_TOP;
  const c = FURNITURE_COLORS.iron;
  addAt(iron, p.plinth, 0.5, x, y, z, facing, c);
  addAt(iron, p.shaft, 3.3, x, y + 0.5, z, facing, c);
  addAt(iron, p.collar, 0.1, x, y + 3.8, z, facing, c);
  addAt(iron, p.lanternBase, 0.15, x, y + 3.9, z, facing, c);
  addAt(glass, p.lanternGlass, 0.42, x, y + 4.05, z, facing, '#ffffff');
  addAt(iron, p.lanternRoof, 0.22, x, y + 4.47, z, facing, c);
  addAt(iron, p.finial, 0.14, x, y + 4.66, z, facing, c);
}

export function buildBench(b: MeshBuilder, x: number, z: number, facing: number): void {
  const y = SIDEWALK_TOP;
  const c = Math.cos(facing), s = Math.sin(facing);
  // local (lx, lz) -> world
  const wx = (lx: number, lz: number) => x + lx * c + lz * s;
  const wz = (lx: number, lz: number) => z - lx * s + lz * c;
  const part = (lx: number, lz: number, y0: number, y1: number, sx: number, sz: number, color: string) =>
    b.boxRot(wx(lx, lz), wz(lx, lz), y + y0, y + y1, sx, sz, facing, color);
  // Iron side frames.
  for (const lx of [-0.72, 0.72]) {
    part(lx, 0.02, 0, 0.42, 0.06, 0.44, FURNITURE_COLORS.iron);
    part(lx, -0.2, 0.42, 0.88, 0.06, 0.06, FURNITURE_COLORS.iron);
  }
  // Wooden seat slats and backrest.
  part(0, 0.12, 0.42, 0.47, 1.7, 0.18, FURNITURE_COLORS.wood);
  part(0, -0.08, 0.42, 0.47, 1.7, 0.18, FURNITURE_COLORS.wood);
  part(0, -0.22, 0.56, 0.7, 1.7, 0.04, FURNITURE_COLORS.wood);
  part(0, -0.22, 0.74, 0.88, 1.7, 0.04, FURNITURE_COLORS.wood);
}

function buildBollard(b: MeshBuilder, p: Prims, x: number, z: number): void {
  addAt(b, p.bollard, 0.85, x, SIDEWALK_TOP, z, 0, FURNITURE_COLORS.ironLight);
  addAt(b, p.bollardBand, 0.08, x, SIDEWALK_TOP + 0.66, z, 0, FURNITURE_COLORS.bollardBand);
}

function buildBin(b: MeshBuilder, p: Prims, x: number, z: number): void {
  addAt(b, p.bin, 0.85, x, SIDEWALK_TOP, z, 0, FURNITURE_COLORS.bin);
  addAt(b, p.binLid, 0.06, x, SIDEWALK_TOP + 0.85, z, 0, FURNITURE_COLORS.binLid);
}

/** One signal head: which light it shows, for which axis, and its three lamp instance indices. */
export interface SignalHead {
  light: TrafficLight;
  axis: LightAxis;
  /** Instance index of the red lamp; yellow is +1, green is +2. */
  index: number;
}

export const SIGNAL_HEAD_Y = 2.75;
const HEAD_OFFSET = 0.3;
const LAMP_SPACING = 0.28;

function findIntersection(light: TrafficLight, intersections: readonly Intersection[]): { cx: number; cz: number; sx: number; sz: number } {
  let best: Intersection | null = null;
  let bestD = Infinity;
  for (const it of intersections) {
    const d = Math.hypot(it.center.x - light.position.x, it.center.z - light.position.z);
    if (d < bestD && d <= Math.max(it.sizeX, it.sizeZ)) {
      best = it;
      bestD = d;
    }
  }
  if (best) return { cx: best.center.x, cz: best.center.z, sx: best.sizeX, sz: best.sizeZ };
  return { cx: light.position.x, cz: light.position.z, sx: 8, sz: 8 };
}

export interface SignalBuild {
  heads: SignalHead[];
  /** Lamp transforms (3 per head): red, yellow, green. */
  lampMatrices: THREE.Matrix4[];
}

/**
 * Four corner poles per signalled intersection. Each pole carries two heads: one facing
 * along z (seen by north-south traffic approaching on that side) and one facing along x.
 */
function buildSignals(layout: CityLayout, b: MeshBuilder, p: Prims): SignalBuild {
  const heads: SignalHead[] = [];
  const lampMatrices: THREE.Matrix4[] = [];
  const y = SIDEWALK_TOP;
  for (const light of layout.trafficLights) {
    const it = findIntersection(light, layout.intersections);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const px = it.cx + sx * (it.sx / 2 + 0.7);
        const pz = it.cz + sz * (it.sz / 2 + 0.7);
        addAt(b, p.signalPole, 3.4, px, y, pz, 0, FURNITURE_COLORS.signalPole);
        const faces: { axis: LightAxis; dx: number; dz: number }[] = [
          { axis: 'ns', dx: 0, dz: sz },
          { axis: 'ew', dx: sx, dz: 0 },
        ];
        for (const f of faces) {
          const angle = Math.atan2(f.dx, f.dz); // local +z faces (dx, dz)
          const hx = px + f.dx * HEAD_OFFSET;
          const hz = pz + f.dz * HEAD_OFFSET;
          const hy = y + SIGNAL_HEAD_Y;
          // Bracket, housing, and a visor over each lamp.
          b.boxRot(px + f.dx * 0.12, pz + f.dz * 0.12, hy + 0.2, hy + 0.28, f.dx ? 0.24 : 0.08, f.dz ? 0.24 : 0.08, 0, FURNITURE_COLORS.signalHousing);
          b.boxRot(hx, hz, hy - 0.46, hy + 0.46, 0.32, 0.22, angle, FURNITURE_COLORS.signalHousing);
          const index = lampMatrices.length;
          for (let k = 0; k < 3; k++) {
            const ly = hy + LAMP_SPACING * (1 - k);
            const vx = hx + f.dx * 0.15, vz = hz + f.dz * 0.15;
            b.boxRot(vx, vz, ly + 0.1, ly + 0.13, 0.24, 0.1, angle, FURNITURE_COLORS.signalHousing);
            // Lamp disc: cylinder axis turned to local z, then yaw to face the approach.
            lampMatrices.push(placeMatrix(hx + f.dx * 0.115, ly, hz + f.dz * 0.115, angle, Math.PI / 2));
          }
          heads.push({ light, axis: f.axis, index });
        }
      }
    }
  }
  return { heads, lampMatrices };
}

export interface FurnitureBuild {
  iron: MeshBuilder;
  glass: MeshBuilder;
  pools: MeshBuilder;
  signals: SignalBuild;
}

/** Builds all furniture into builders. `poolsAsQuads` = true emits UV quads for a texture. */
export function buildFurniture(layout: CityLayout, poolsAsQuads: boolean): FurnitureBuild {
  const p = makePrims();
  const iron = new MeshBuilder();
  const glass = new MeshBuilder();
  const pools = new MeshBuilder();
  const warm = new THREE.Color('#ffcf7a').multiplyScalar(0.55);

  layout.lamps.forEach((lamp, i) => {
    const { x, z } = lamp.position;
    buildLamp(iron, glass, p, x, z, lamp.facing);
    // Pool shifted a little toward the road the lamp faces.
    const px = x + Math.sin(lamp.facing) * 1.1;
    const pz = z + Math.cos(lamp.facing) * 1.1;
    if (!poolsAsQuads) pools.falloffDisc(px, POOL_Y, pz, POOL_RADIUS, warm);
    else pools.rect(POOL_Y, px - POOL_RADIUS, px + POOL_RADIUS, pz - POOL_RADIUS, pz + POOL_RADIUS, '#ffffff');
    // A bin beside every third lamp, 1.2 m along the curb.
    if (i % 3 === 1) {
      const ax = Math.cos(lamp.facing), az = -Math.sin(lamp.facing);
      buildBin(iron, p, x + ax * 1.2, z + az * 1.2);
    }
  });

  // Lit shop fronts: a soft warm strip of light on the pavement in front of every shop or cafe.
  // Lots face a street at multiples of 90 degrees, so the strip stays an axis-aligned quad
  // (the pool UVs only support those) and shares the pool mesh and material: +0 draw calls.
  for (const lot of layout.lots) {
    if (lot.groundFloor === 'residential') continue;
    const quarter = Math.round(lot.facing / (Math.PI / 2));
    const fx = Math.round(Math.sin(quarter * (Math.PI / 2)));
    const fz = Math.round(Math.cos(quarter * (Math.PI / 2)));
    const along = lot.width * 0.9;
    const cx = lot.position.x + fx * (lot.depth / 2 + SPILL_DEPTH / 2 - 0.2);
    const cz = lot.position.z + fz * (lot.depth / 2 + SPILL_DEPTH / 2 - 0.2);
    const sx = fx !== 0 ? SPILL_DEPTH : along;
    const sz = fz !== 0 ? SPILL_DEPTH : along;
    if (!poolsAsQuads) continue;
    pools.rect(SPILL_Y, cx - sx / 2, cx + sx / 2, cz - sz / 2, cz + sz / 2, '#ffffff');
  }

  for (const bench of layout.benches) buildBench(iron, bench.position.x, bench.position.z, bench.facing);

  // Bollards: two at each end of every crossing, just behind the curb.
  for (const cw of layout.crosswalks) {
    const walkX = cw.orientation === 'horizontal';
    for (const end of [-1, 1]) {
      for (const lat of [-1, 1]) {
        const along = end * (cw.length / 2 + 0.55);
        const across = lat * (cw.width / 2 + 0.35);
        const x = cw.center.x + (walkX ? along : across);
        const z = cw.center.z + (walkX ? across : along);
        buildBollard(iron, p, x, z);
      }
    }
  }

  const signals = buildSignals(layout, iron, p);
  disposePrims(p);
  return { iron, glass, pools, signals };
}

/** Quads built with rect() carry no UVs; add planar UVs spanning each quad for the pool texture. */
export function addPoolUVs(geo: THREE.BufferGeometry): void {
  const pos = geo.getAttribute('position');
  const uv = new Float32Array(pos.count * 2);
  // Each pool is 6 vertices (two triangles) of one square; map its own extent to 0..1.
  for (let q = 0; q < pos.count; q += 6) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = q; i < q + 6; i++) {
      minX = Math.min(minX, pos.getX(i)); maxX = Math.max(maxX, pos.getX(i));
      minZ = Math.min(minZ, pos.getZ(i)); maxZ = Math.max(maxZ, pos.getZ(i));
    }
    for (let i = q; i < q + 6; i++) {
      uv[i * 2] = (pos.getX(i) - minX) / (maxX - minX || 1);
      uv[i * 2 + 1] = (pos.getZ(i) - minZ) / (maxZ - minZ || 1);
    }
  }
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
}
