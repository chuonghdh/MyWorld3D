// The 3D town: streetscape, blocks of houses or monuments, trees, sky, wind, leaves and traffic.
// Everything is derived from the store (layout settings and overrides) plus per-frame simulation
// (see useTownFrame); the heavy parts live in the useTown* hooks next to this file.
import { useEffect, useMemo, useRef, useState } from 'react';
import { type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { getCityLayout } from '../city';
import { setGlassEnvironment } from '../buildings/materials';
import { createWeather } from '../weather';
import { SkyDome } from '../sky';
import {
  createClouds,
  createSmoke,
  createWindUniforms,
  crownDiscsFromGroup,
  getLightingForTime,
  LeafSystem,
  type WindUniforms,
} from '../environment';
import { QUALITY_PRESETS, useWorldStore, type OverrideTarget } from '../store';
import type { Season } from '../core/types';
import { runtime } from './runtime';
import { Selection } from './Selection';
import { AudioBridge } from './audioBridge';
import { sameTarget } from './selectionMath';
import { AMBIENT_GAIN, HEMI_GAIN, SUN_DISTANCE, SUN_GAIN, lightDirection } from './townShadow';
import { lotAt, monumentBaseFor, type BlockPiece } from './townBlocks';
import { NATURE_TYPES, natureItems } from '../streets/natureTrees';
import { useTownPieces } from './useTownPieces';
import { useTownGreenery } from './useTownGreenery';
import { useTownTraffic } from './useTownTraffic';
import { useTownAircraft } from './useTownAircraft';
import { useTownFrame } from './useTownFrame';
import { pavementSurfaces } from '../streets/pavementSurfaces';
import { SHADOW_LAYER } from '../streets/natureTrees';

export { shadowHalfExtent } from './townShadow';
export { monumentBaseFor };

/** Height of sidewalks, courtyards and plazas above the asphalt. */
const CURB = 0.15;

export function Town({ onSelect, selected }: { onSelect: (target: OverrideTarget) => void; selected: OverrideTarget | null }) {
  const settings = useWorldStore((s) => s.settings);
  const storedOrder = useWorldStore((s) => s.blockOrder);
  const storedBase = useWorldStore((s) => s.baseBlockOrder);
  const blockOverrides = useWorldStore((s) => s.blockOverrides);
  const houseOverrides = useWorldStore((s) => s.houseOverrides);
  const treeOverrides = useWorldStore((s) => s.treeOverrides);
  const setBlockOrder = useWorldStore((s) => s.setBlockOrder);
  const swapBlocks = useWorldStore((s) => s.swapBlocks);

  // Generated once per layout key (seed, size, street trees). Traffic density is not part of it.
  const layout = getCityLayout(settings);
  const preset = QUALITY_PRESETS[settings.quality];

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
  // Only broadleaf trees shed leaves; conifers keep their needles.
  const broadleaf = useMemo(
    () => natureItems(layout, settings.seed).filter((t) => !NATURE_TYPES[t.type].evergreen),
    [layout, settings.seed],
  );
  useEffect(() => {
    leaves.setTreePoints(broadleaf.map((t) => ({ x: t.position.x, z: t.position.z })));
  }, [leaves, broadleaf]);

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
  const sunDirRef = useRef(new THREE.Vector3(0, 1, 0));
  const hemiLight = useRef<THREE.HemisphereLight>(null);
  const ambLight = useRef<THREE.AmbientLight>(null);

  const smoke = useMemo(() => createSmoke(), []);
  useEffect(() => () => smoke.dispose(), [smoke]);

  // --- Streets, trees, greenery, traffic, buildings ---------------------------------------
  const { streetscape, treeItems, treeField, greenery, flora } = useTownGreenery({
    layout,
    treeOverrides,
    uniforms,
    seed: settings.seed,
    season: settings.season as Season,
    timeOfDay: settings.timeOfDay,
    lightsOn,
    lighting,
  });
  // Fallen leaves land on the crowns of the city's trees (the Quaternius field or the procedural fallback).
  useEffect(() => {
    leaves.setCrownDiscs(crownDiscsFromGroup(treeField.group));
  }, [leaves, treeField]);
  // Leaves land on pavement surfaces (not vehicle roofs yet).
  const pavement = useMemo(() => pavementSurfaces(layout), [layout]);
  useEffect(() => {
    leaves.setSurfaces(pavement);
  }, [leaves, pavement]);
  // Sound: one reusable frame per render frame; trees feed the leaf-rustle sources.
  const audioBridge = useMemo(() => new AudioBridge(), []);
  const audioTrees = useMemo(() => treeItems.map((t) => ({ x: t.position.x, z: t.position.z, scale: t.scale })), [treeItems]);
  const [hovered, setHovered] = useState<OverrideTarget | null>(null);
  const hover = (t: OverrideTarget | null) => setHovered((p) => (sameTarget(p, t) ? p : t));

  const { traffic, walkers, life, trafficMeshes } = useTownTraffic(
    layout,
    settings.trafficMultiplier * preset.traffic,
    settings.seed,
    lightsOn,
    lighting.sky.headlights,
  );

  const pieces = useTownPieces({ layout, order, base, blockOverrides, houseOverrides, smoke, seed: settings.seed });

  // A new shadow map size needs the old render target released so three allocates a fresh one.
  const shadowMapSize = preset.shadowMap;
  useEffect(() => {
    const light = sunLight.current;
    if (!light) return;
    light.shadow.mapSize.set(shadowMapSize, shadowMapSize);
    light.shadow.map?.dispose();
    light.shadow.map = null;
  }, [shadowMapSize]);
  // Broadleaf shadow copies live on SHADOW_LAYER (streets/natureTrees.ts): only the sun's shadow pass draws them.
  useEffect(() => {
    sunLight.current?.shadow.camera.layers.enable(SHADOW_LAYER);
  }, []);

  // The church bell rings from the Gothic cathedral monument, wherever swapping has put it.
  const church = useMemo(() => {
    for (const p of pieces) {
      if (p.kind !== 'monument') continue;
      const kind = blockOverrides[p.blockId]?.monument ?? monumentBaseFor(p.blockId);
      if (kind === 'gothic-cathedral' && p.lots[0]) return { x: p.lots[0].x, z: p.lots[0].z };
    }
    return null;
  }, [pieces, blockOverrides]);
  const churchRef = useRef(church);
  churchRef.current = church;

  // --- Frame loop ---------------------------------------------------------------------------
  const ground = layout.townBounds;
  const aircraft = useTownAircraft(ground, settings.seed);
  const townSize = Math.max(ground.maxX - ground.minX, ground.maxZ - ground.minZ);

  useTownFrame({
    ground, townSize, lighting, lightsOn, shadowMapSize, uniforms, leaves, clouds, smoke, weather, aircraft,
    traffic, walkers, trafficMeshes, streetscape, life, audioBridge, audioTrees, churchRef, overlay,
    sunLight, sunDirRef, hemiLight, ambLight,
  });

  // --- Lights ---------------------------------------------------------------------------------
  const sunDir = lightDirection(lighting.sun.altitudeDeg > -2 ? lighting.sun : lighting.moon);
  sunDirRef.current.copy(sunDir);
  const sunDistance = SUN_DISTANCE;
  const sky = lighting.sky;
  const sunColor = new THREE.Color(sky.sunColor.r, sky.sunColor.g, sky.sunColor.b);
  const skyColor = new THREE.Color(sky.sky.r, sky.sky.g, sky.sky.b);
  const moonColor = new THREE.Color(sky.moonColor.r, sky.moonColor.g, sky.moonColor.b);
  const nightGround = new THREE.Color('#b9bcb6').lerp(new THREE.Color('#3a4668'), sky.nightness);

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

  function hoverBlock(e: ThreeEvent<PointerEvent>, piece: BlockPiece) {
    e.stopPropagation();
    if (piece.kind === 'monument') return hover({ type: 'block', id: piece.blockId });
    const lot = lotAt(piece.lots, e.point);
    hover(lot ? { type: 'house', id: lot.id } : null);
  }

  function hoverTree(e: ThreeEvent<PointerEvent>) {
    const id = e.instanceId === undefined ? null : treeField.treeIdAt(e.object, e.instanceId);
    if (!id) return;
    e.stopPropagation();
    hover({ type: 'tree', id });
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
        shadow-mapSize-width={shadowMapSize}
        shadow-mapSize-height={shadowMapSize}
        shadow-camera-far={600}
      />

      <primitive object={streetscape.group} />

      {pieces.map((p) => (
        <primitive
          key={p.key}
          object={p.object}
          onClick={(e: ThreeEvent<MouseEvent>) => handleBlockClick(e, p)}
          onPointerMove={(e: ThreeEvent<PointerEvent>) => hoverBlock(e, p)}
          onPointerOut={() => hover(null)}
        />
      ))}

      <primitive
        object={treeField.group}
        position={[0, CURB, 0]}
        onClick={handleTreeClick}
        onPointerMove={hoverTree}
        onPointerOut={() => hover(null)}
      />
      <Selection blocks={pieces} trees={treeItems} selected={selected} hovered={hovered} />
      <primitive object={greenery} position={[0, CURB, 0]} />
      <primitive object={flora.group} position={[0, CURB, 0]} />
      <primitive object={clouds.group} />
      <primitive object={aircraft.group} />
      <primitive object={weather.group} />
      <primitive object={leaves.mesh} />
      <primitive object={leaves.veinMesh} />
      <primitive object={smoke.mesh} />
      <primitive object={trafficMeshes.group} />
      <primitive object={life.group} />
    </>
  );
}
