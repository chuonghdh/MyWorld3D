// The 3D town: streetscape, blocks of houses or monuments, trees, sky, wind, leaves and traffic.
// Everything is derived from the store (layout settings and overrides) plus per-frame simulation.
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { generateCity, type Block, type CityLayout, type Lot, type Rect } from '../city';
import { buildHouse, buildMonument, defaultHouseParams, type HouseChimney, type HouseParams } from '../buildings';
import { setGlassEnvironment, setNightLights } from '../buildings/materials';
import { createWeather, applyFogRange } from '../weather';
import { SkyDome } from '../sky';
import { getNightSchedule } from '../environment/sun';
import {
  createClouds,
  createCourtyardGreenery,
  createSmoke,
  createTreeField,
  createWindUniforms,
  getLightingForTime,
  gustStrength,
  LeafSystem,
  triggerGust,
  updateWindUniforms,
  windVector,
  type WindUniforms,
} from '../environment';
import { createStreetscape } from '../streets';
import { createLife } from '../life';
import * as audio from '../audio';
import type { VehicleClass } from '../audio';
import { Pedestrians, VehicleSystem, createTrafficMeshes } from '../traffic';
import {
  MONUMENT_KINDS,
  useWorldStore,
  type BlockOverride,
  type HouseOverride,
  type OverrideTarget,
} from '../store';
import type { MonumentKind, Season } from '../core/types';
import { hashId, runtime } from './runtime';
import { blockPresetFor, lotStyle } from './cityStyle';
import { disposeMerged, mergeByMaterial, type PlacedObject } from './mergeBlock';

/** Height of sidewalks, courtyards and plazas above the asphalt. */
const CURB = 0.15;

// The sun module returns intensities on a 0-1.2 scale; three.js lights are physically based,
// so they are scaled up here to give a bright, warm miniature look.
const SUN_GAIN = 3.4;
const HEMI_GAIN = 3;
const AMBIENT_GAIN = 0.5;

/**
 * Lowest elevation used for the shadow-casting light. Real golden-hour sun is only a few degrees
 * up, which would put every facade in shadow; keeping its colour but lifting its angle reads better.
 */
const MIN_LIGHT_ELEVATION_DEG = 24;

function lightDirection(dir: { x: number; y: number; z: number; altitudeDeg: number }): THREE.Vector3 {
  const alt = THREE.MathUtils.degToRad(Math.max(dir.altitudeDeg, MIN_LIGHT_ELEVATION_DEG));
  const flat = new THREE.Vector2(dir.x, dir.z);
  if (flat.lengthSq() < 1e-6) flat.set(0, 1);
  flat.normalize().multiplyScalar(Math.cos(alt));
  return new THREE.Vector3(flat.x, Math.sin(alt), flat.y);
}

/** Street trees read too small from the top-down camera at their botanical size. */
const TREE_SCALE = 1.35;

/** Monument a block shows before any override. Same rule the scene uses when building it. */
export function monumentBaseFor(blockId: string): MonumentKind {
  return MONUMENT_KINDS[Math.floor(hashId(blockId) * MONUMENT_KINDS.length)];
}

interface LotHit {
  id: string;
  x: number;
  z: number;
  facing: number;
  width: number;
  depth: number;
}

interface BlockPiece {
  key: string;
  blockId: string;
  kind: 'houses' | 'monument';
  object: THREE.Object3D;
  lots: LotHit[];
  /** Chimney pot tops in world coordinates, for the smoke system. */
  chimneys: { x: number; y: number; z: number }[];
  /** Inputs the piece was built from; equal signatures reuse the built geometry. */
  signature: string;
}

function centerOf(r: Rect): { x: number; z: number } {
  return { x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2 };
}

/**
 * Maps each content block to the slot it currently occupies.
 * Slots come from the base order; blockOrder says which content sits in each slot,
 * so a drag-swap moves the houses (or monument) of two blocks with it.
 */
function placeBlocks(layout: CityLayout, order: string[], base: string[]) {
  const byId = new Map<string, Block>(layout.blocks.map((b) => [b.id, b]));
  const placed: { block: Block; offset: { x: number; z: number } }[] = [];
  order.forEach((contentId, i) => {
    const slot = byId.get(base[i] ?? contentId);
    const block = byId.get(contentId);
    if (!slot || !block) return;
    const s = centerOf(slot.bounds);
    const c = centerOf(block.bounds);
    placed.push({ block, offset: { x: s.x - c.x, z: s.z - c.z } });
  });
  return placed;
}

function lotMatrix(lot: Lot, offset: { x: number; z: number }): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(lot.position.x + offset.x, 0, lot.position.z + offset.z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), lot.facing),
    new THREE.Vector3(1, 1, 1),
  );
}

function houseParamsFor(lot: Lot, blockId: string, ov: HouseOverride): HouseParams {
  const style = lotStyle(lot, blockPresetFor(blockId));
  const preset = ov.preset && ov.preset !== 'as-block' ? ov.preset : style.preset;
  const defaults = defaultHouseParams(preset, ov.style ?? 'classic');
  const floors = preset === 'glass-tower' ? Math.max(lot.floors, 7) : lot.floors;
  return {
    ...defaults,
    preset,
    floors: ov.floors ?? floors,
    roof: ov.roof ?? defaults.roof,
    style: ov.style ?? defaults.style,
    wallColor: ov.wallColor ?? style.wallColor,
    shutterColor: ov.shutterColor ?? style.shutterColor,
    width: lot.width,
    depth: lot.depth,
    facades: lot.facades,
    groundFloor: lot.groundFloor,
    seed: lot.seed,
  };
}

/** The lot under a world point, using each lot's rotated footprint plus its street-side protrusion zone. */
function lotAt(lots: readonly LotHit[], p: THREE.Vector3): LotHit | null {
  let best: LotHit | null = null;
  let bestD = Infinity;
  for (const l of lots) {
    const dx = p.x - l.x;
    const dz = p.z - l.z;
    const c = Math.cos(l.facing);
    const s = Math.sin(l.facing);
    const lx = dx * c - dz * s;
    const lz = dx * s + dz * c;
    if (Math.abs(lx) > l.width / 2 + 0.3 || Math.abs(lz) > l.depth / 2 + 1.6) continue;
    const d = dx * dx + dz * dz;
    if (d < bestD) {
      bestD = d;
      best = l;
    }
  }
  return best;
}

function disposePiece(piece: BlockPiece): void {
  if (piece.object instanceof THREE.Group) disposeMerged(piece.object);
}

export function Town({ onSelect }: { onSelect: (target: OverrideTarget) => void }) {
  const settings = useWorldStore((s) => s.settings);
  const storedOrder = useWorldStore((s) => s.blockOrder);
  const storedBase = useWorldStore((s) => s.baseBlockOrder);
  const blockOverrides = useWorldStore((s) => s.blockOverrides);
  const houseOverrides = useWorldStore((s) => s.houseOverrides);
  const treeOverrides = useWorldStore((s) => s.treeOverrides);
  const setBlockOrder = useWorldStore((s) => s.setBlockOrder);
  const swapBlocks = useWorldStore((s) => s.swapBlocks);

  const layout = useMemo(
    () => generateCity(settings),
    [settings.seed, settings.townWidth, settings.townDepth, settings.streetTreeMultiplier, settings.trafficMultiplier],
  );

  const freshIds = layout.blocks.map((b) => b.id);
  const orderIsFresh = storedBase.length === freshIds.length && freshIds.every((id) => storedBase.includes(id));
  useEffect(() => {
    if (!orderIsFresh) setBlockOrder(freshIds);
    // freshIds is derived from layout; re-running on layout change is intended.
  }, [layout, orderIsFresh]);

  const base = orderIsFresh ? storedBase : freshIds;
  const order = orderIsFresh && storedOrder.length === freshIds.length ? storedOrder : base;

  // --- Environment -------------------------------------------------------------------------
  const uniforms: WindUniforms = useMemo(() => createWindUniforms(10), []);
  const leaves = useMemo(() => new LeafSystem({ bounds: layout.townBounds }), [layout.townBounds]);
  const clouds = useMemo(
    () => createClouds({ area: layout.townBounds, count: 10, seed: settings.seed }),
    [layout.townBounds, settings.seed],
  );
  useEffect(() => {
    leaves.setTreePoints(layout.streetTrees.map((t) => ({ x: t.position.x, z: t.position.z })));
  }, [leaves, layout]);

  const lighting = useMemo(() => getLightingForTime(settings.timeOfDay), [settings.timeOfDay]);
  const lightsOn = lighting.sky.lightsOn;

  // Glass reflects the current sky and sun.
  useEffect(() => {
    const { sky, sun } = lighting;
    setGlassEnvironment(
      new THREE.Color(sky.sky.r, sky.sky.g, sky.sky.b),
      new THREE.Vector3(sun.x, sun.y, sun.z),
      new THREE.Color(sky.sunColor.r, sky.sunColor.g, sky.sunColor.b),
    );
  }, [lighting]);

  const weather = useMemo(() => createWeather(), []);
  useEffect(() => () => weather.dispose(), [weather]);
  const overlay = useRef({ cloudiness: 0.25, flash: 0 });
  const sunLight = useRef<THREE.DirectionalLight>(null);
  const hemiLight = useRef<THREE.HemisphereLight>(null);
  const ambLight = useRef<THREE.AmbientLight>(null);

  const smoke = useMemo(() => createSmoke(), []);
  useEffect(() => () => smoke.dispose(), [smoke]);

  // --- Streets, trees, greenery -----------------------------------------------------------
  const streetscape = useMemo(() => createStreetscape(layout), [layout]);
  useEffect(() => () => streetscape.dispose(), [streetscape]);

  useEffect(() => {
    const schedule = getNightSchedule(settings.timeOfDay, lighting.sun.altitudeDeg);
    setNightLights(lightsOn);
    streetscape.setNightAmount(schedule.lamps);
  }, [lightsOn, streetscape, settings.timeOfDay, lighting]);

  const treeField = useMemo(
    () =>
      createTreeField(
        layout.streetTrees.map((t) => ({
          id: t.id,
          position: t.position,
          species: treeOverrides[t.id]?.species ?? t.species,
          scale: t.scale * TREE_SCALE,
        })),
        { season: settings.season as Season, uniforms, seed: settings.seed },
      ),
    // Season changes go through setSeason below instead of rebuilding.
    [layout, treeOverrides, uniforms, settings.seed],
  );
  useEffect(() => treeField.setSeason(settings.season as Season), [treeField, settings.season]);
  useEffect(() => () => treeField.dispose(), [treeField]);

  const greenery = useMemo(
    () =>
      createCourtyardGreenery(
        layout.blocks.filter((b) => b.kind === 'houses' && b.courtyard).map((b) => b.courtyard as Rect),
        settings.seed,
      ),
    [layout, settings.seed],
  );

  // --- Traffic ------------------------------------------------------------------------------
  const traffic = useMemo(
    () => new VehicleSystem(layout, { trafficMultiplier: settings.trafficMultiplier }),
    [layout, settings.trafficMultiplier],
  );
  const walkers = useMemo(
    () =>
      new Pedestrians(layout, {
        trafficMultiplier: settings.trafficMultiplier,
        lights: traffic.lights,
        timeOfDay: useWorldStore.getState().settings.timeOfDay,
      }),
    [layout, settings.trafficMultiplier, traffic],
  );
  const life = useMemo(() => createLife(layout, { seed: settings.seed }), [layout, settings.seed]);
  useEffect(() => () => life.dispose(), [life]);

  const trafficMeshes = useMemo(() => createTrafficMeshes({ layout }), [layout]);
  useEffect(() => () => trafficMeshes.dispose(), [trafficMeshes]);
  useEffect(() => trafficMeshes.setNight(lightsOn), [trafficMeshes, lightsOn]);

  // --- Buildings, merged per block and cached by their inputs ----------------------------------
  const cache = useMemo(() => new Map<string, BlockPiece>(), [layout]);
  const previous = useRef<BlockPiece[]>([]);

  const pieces: BlockPiece[] = useMemo(() => {
    const lotsByBlock = new Map<string, Lot[]>();
    for (const lot of layout.lots) {
      const list = lotsByBlock.get(lot.blockId) ?? [];
      list.push(lot);
      lotsByBlock.set(lot.blockId, list);
    }

    const out: BlockPiece[] = [];
    for (const { block, offset } of placeBlocks(layout, order, base)) {
      const bo: BlockOverride = blockOverrides[block.id] ?? {};
      const kind = bo.kind ?? block.kind;
      const lots = lotsByBlock.get(block.id) ?? [];
      const houseOv = kind === 'houses' ? lots.map((l) => houseOverrides[l.id] ?? null) : [];
      const signature = JSON.stringify([offset, bo, houseOv]);
      const cached = cache.get(block.id);
      if (cached && cached.signature === signature) {
        out.push(cached);
        continue;
      }

      let piece: BlockPiece;
      if (kind === 'monument') {
        const lot = lots[0];
        const c = centerOf(block.bounds);
        const width = lot ? lot.width : (block.bounds.maxX - block.bounds.minX) * 0.85;
        const depth = lot ? lot.depth : (block.bounds.maxZ - block.bounds.minZ) * 0.85;
        const monumentKind = bo.monument ?? monumentBaseFor(block.id);
        const obj = buildMonument(monumentKind, { width, depth, seed: lot?.seed ?? 1 });
        obj.position.set((lot?.position.x ?? c.x) + offset.x, 0, (lot?.position.z ?? c.z) + offset.z);
        obj.rotation.y = lot?.facing ?? 0;
        piece = { key: 'm-' + block.id, blockId: block.id, kind, object: obj, lots: [], chimneys: [], signature };
      } else {
        const placedHouses: PlacedObject[] = [];
        const hits: LotHit[] = [];
        const chimneys: { x: number; y: number; z: number }[] = [];
        const tip = new THREE.Vector3();
        for (const lot of lots) {
          const params = houseParamsFor(lot, block.id, houseOverrides[lot.id] ?? {});
          const house = buildHouse(params);
          const matrix = lotMatrix(lot, offset);
          placedHouses.push({ object: house, matrix });
          for (const c of (house.userData.chimneys ?? []) as HouseChimney[]) {
            tip.set(c.x, c.y, c.z).applyMatrix4(matrix);
            chimneys.push({ x: tip.x, y: tip.y, z: tip.z });
          }
          hits.push({
            id: lot.id,
            x: lot.position.x + offset.x,
            z: lot.position.z + offset.z,
            facing: lot.facing,
            width: lot.width,
            depth: lot.depth,
          });
        }
        const obj = mergeByMaterial(placedHouses, 'block-' + block.id);
        piece = { key: 'h-' + block.id, blockId: block.id, kind: 'houses', object: obj, lots: hits, chimneys, signature };
      }
      if (cached) disposePiece(cached);
      cache.set(block.id, piece);
      out.push(piece);
    }
    return out;
  }, [layout, order, base, blockOverrides, houseOverrides, cache]);

  useEffect(() => {
    smoke.setEmitters(
      pieces.flatMap((p) => p.chimneys),
      settings.seed,
    );
  }, [pieces, smoke, settings.seed]);

  useEffect(() => {
    // Free blocks that left the scene because the layout was regenerated.
    const live = new Set(pieces);
    for (const p of previous.current) if (!live.has(p) && !cache.has(p.blockId)) disposePiece(p);
    previous.current = pieces;
  }, [pieces, cache]);

  // --- Frame loop ---------------------------------------------------------------------------
  const ground = layout.townBounds;
  const townSize = Math.max(ground.maxX - ground.minX, ground.maxZ - ground.minZ);

  useFrame((state, dt) => {
    const t = state.clock.getElapsedTime();

    // Depth precision: a fixed near plane of 1 m leaves only millimetres of resolution at 300 m, so
    // coplanar details flicker. Tie the clip planes to the distance from the orbit target instead.
    const camDist = state.camera.position.length();
    const persp = state.camera as THREE.PerspectiveCamera;
    const wantNear = THREE.MathUtils.clamp(camDist * 0.05, 0.5, 30);
    const wantFar = Math.max(1200, camDist * 4);
    if (Math.abs(persp.near - wantNear) > persp.near * 0.05 || Math.abs(persp.far - wantFar) > persp.far * 0.05) {
      persp.near = wantNear;
      persp.far = wantFar;
      persp.updateProjectionMatrix();
    }

    while (runtime.wholeMapRequests > 0) {
      runtime.wholeMapRequests--;
      state.camera.position.set(0, townSize * 1.75, townSize * 0.45);
      state.camera.lookAt(0, 0, 0);
    }
    while (runtime.gustRequests > 0) {
      runtime.gustRequests--;
      runtime.gusts = triggerGust(runtime.gusts, t, 6);
    }
    while (runtime.leafDevilRequests > 0) {
      runtime.leafDevilRequests--;
      const x = ground.minX + Math.random() * (ground.maxX - ground.minX);
      const z = ground.minZ + Math.random() * (ground.maxZ - ground.minZ);
      leaves.spawnLeafDevil(x, z);
    }

    const { windSpeed, windDirection, leafAmount, leafSize, season, soundEnabled } = useWorldStore.getState().settings;
    const wind = windVector(t, { speed: windSpeed, direction: windDirection }, runtime.gusts);
    updateWindUniforms(uniforms, t, wind, gustStrength(t, runtime.gusts));

    const st = useWorldStore.getState().settings;
    weather.setWeather(st.weather, st.weatherIntensity);
    const wx = weather.update(dt, {
      camera: state.camera.position,
      wind,
      lightLevel: Math.min(1, lighting.sky.ambientIntensity),
      skyColor: lighting.sky.sky,
    });
    overlay.current.cloudiness = wx.cloudiness;
    overlay.current.flash = wx.flash;
    clouds.setCoverage(wx.cloudiness);
    clouds.setSunlight(Math.min(1, lighting.sky.sunIntensity) * wx.dim);
    applyFogRange(state.scene.fog as THREE.Fog, townSize * 2.2, townSize * 6, wx.fogDensityMul);
    if (sunLight.current) sunLight.current.intensity = lighting.sky.sunIntensity * SUN_GAIN * wx.dim * (1 - 0.5 * wx.flash);
    if (hemiLight.current) hemiLight.current.intensity = lighting.sky.ambientIntensity * HEMI_GAIN * wx.dim + wx.flash * 2.5;
    if (ambLight.current) ambLight.current.intensity = lighting.sky.ambientIntensity * AMBIENT_GAIN * wx.dim;

    clouds.update(dt, wind);
    smoke.update(dt, wind, {
      season: season as Season,
      timeOfDay: useWorldStore.getState().settings.timeOfDay,
      lightsOn,
      sunColor: lighting.sky.sunColor,
      ambient: lighting.sky.ambientIntensity,
    });
    leaves.update(dt, wind, { leafAmount, leafSize, season: season as Season });

    traffic.update(dt);
    walkers.update(dt, { timeOfDay: useWorldStore.getState().settings.timeOfDay, rain: wx.rain });
    const vehicles = traffic.getVehicles();
    trafficMeshes.update(vehicles, walkers.getPedestrians(), {
      time: t,
      night: lightsOn,
      season: season as Season,
      rain: wx.rain,
    });
    streetscape.updateSignals((light, axis) => traffic.lights.phaseOf(light.id, axis));

    // Engine loudness per vehicle class follows the nearest vehicle to the camera.
    const cam = state.camera.position;
    life.update(dt, {
      time: t,
      timeOfDay: useWorldStore.getState().settings.timeOfDay,
      season: season as Season,
      night: lightsOn,
      wind,
      vehicles,
      pedestrians: walkers.getPedestrians(),
      camera: cam,
    });
    trafficMeshes.vehicles.setFocus(cam.x, cam.z);
    const nearest: Record<VehicleClass, number> = { car: 0, bus: 0, truck: 0, motorbike: 0 };
    for (const v of vehicles) {
      const d = Math.hypot(v.position.x - cam.x, v.position.z - cam.z);
      nearest[v.cls] = Math.max(nearest[v.cls], Math.max(0, 1 - d / 150));
    }
    for (const cls of Object.keys(nearest) as VehicleClass[]) audio.setVehicleNearby(cls, nearest[cls]);

    audio.setWind(Math.hypot(wind.x, wind.z));
    audio.setSoundEnabled(soundEnabled);
    audio.tick(dt);
  });

  // --- Lights ---------------------------------------------------------------------------------
  const sunDir = lightDirection(lighting.sun.altitudeDeg > -2 ? lighting.sun : lighting.moon);
  const sunDistance = 220;
  const sky = lighting.sky;
  const sunColor = new THREE.Color(sky.sunColor.r, sky.sunColor.g, sky.sunColor.b);
  const skyColor = new THREE.Color(sky.sky.r, sky.sky.g, sky.sky.b);
  const moonColor = new THREE.Color(sky.moonColor.r, sky.moonColor.g, sky.moonColor.b);
  const nightGround = new THREE.Color('#c9b48e').lerp(new THREE.Color('#3a4668'), sky.nightness);

  function handleBlockClick(e: ThreeEvent<MouseEvent>, piece: BlockPiece) {
    e.stopPropagation();
    if (useWorldStore.getState().toggles.moveBlocks) {
      if (runtime.pendingBlockId === null) {
        runtime.pendingBlockId = piece.blockId;
      } else if (runtime.pendingBlockId !== piece.blockId) {
        swapBlocks(runtime.pendingBlockId, piece.blockId);
        runtime.pendingBlockId = null;
      }
      return;
    }
    if (piece.kind === 'monument') {
      onSelect({ type: 'block', id: piece.blockId });
      return;
    }
    const lot = lotAt(piece.lots, e.point);
    if (lot) onSelect({ type: 'house', id: lot.id });
  }

  function handleTreeClick(e: ThreeEvent<MouseEvent>) {
    if (e.instanceId === undefined) return;
    const id = treeField.treeIdAt(e.object, e.instanceId);
    if (!id) return;
    e.stopPropagation();
    onSelect({ type: 'tree', id });
  }

  return (
    <>
      <fog attach="fog" args={[skyColor, townSize * 2.2, townSize * 6]} />
      <SkyDome
        timeOfDay={settings.timeOfDay}
        season={settings.season as Season}
        overlay={overlay}
        fogColor={sky.sky}
        fogNear={townSize * 2.2}
        fogFar={townSize * 6}
      />
      <ambientLight ref={ambLight} intensity={sky.ambientIntensity * AMBIENT_GAIN} />
      <hemisphereLight ref={hemiLight} args={[skyColor, nightGround, sky.ambientIntensity * HEMI_GAIN]} />
      <directionalLight
        position={[lighting.moon.x * 220, Math.max(lighting.moon.y, 0.3) * 220, lighting.moon.z * 220]}
        color={moonColor}
        intensity={sky.moonFill * SUN_GAIN * 0.5}
      />
      <directionalLight
        ref={sunLight}
        position={[sunDir.x * sunDistance, sunDir.y * sunDistance, sunDir.z * sunDistance]}
        color={sunColor}
        intensity={sky.sunIntensity * SUN_GAIN}
        castShadow
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-townSize / 2 - 20}
        shadow-camera-right={townSize / 2 + 20}
        shadow-camera-top={townSize / 2 + 20}
        shadow-camera-bottom={-townSize / 2 - 20}
        shadow-camera-far={600}
      />

      <primitive object={streetscape.group} />

      {pieces.map((p) => (
        <primitive key={p.key} object={p.object} onClick={(e: ThreeEvent<MouseEvent>) => handleBlockClick(e, p)} />
      ))}

      <primitive object={treeField.group} position={[0, CURB, 0]} onClick={handleTreeClick} />
      <primitive object={greenery} position={[0, CURB, 0]} />
      <primitive object={clouds.group} />
      <primitive object={weather.group} />
      <primitive object={leaves.mesh} />
      <primitive object={smoke.mesh} />
      <primitive object={trafficMeshes.group} />
      <primitive object={life.group} />
    </>
  );
}
