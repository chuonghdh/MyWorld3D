// Block pieces of the town: houses merged per block (or a monument), cached by their inputs.
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { CityLayout, Lot } from '../city';
import { buildHouse, buildMonument, type HouseChimney } from '../buildings';
import type { BlockOverride, HouseOverride } from '../store';
import { mergeByMaterial, type PlacedObject } from './mergeBlock';
import {
  centerOf,
  disposePiece,
  houseParamsFor,
  lotMatrix,
  monumentBaseFor,
  placeBlocks,
  type BlockPiece,
  type LotHit,
} from './townBlocks';

interface PieceInputs {
  layout: CityLayout;
  order: string[];
  base: string[];
  blockOverrides: Record<string, BlockOverride>;
  houseOverrides: Record<string, HouseOverride>;
  /** Smoke system whose emitters follow the chimneys. */
  smoke: { setEmitters(e: { x: number; y: number; z: number }[], seed: number): void };
  seed: number;
}

export function useTownPieces({ layout, order, base, blockOverrides, houseOverrides, smoke, seed }: PieceInputs): BlockPiece[] {
  // Kept across layouts: a merge or split regenerates the layout, but blocks whose lots did not change keep their
  // built geometry (the lots are part of the signature), so only the merged or split blocks are rebuilt.
  const cache = useRef(new Map<string, BlockPiece>()).current;
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
      const signature = JSON.stringify([offset, bo, houseOv, lots, block.bounds]);
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
        const footprint = [{ id: lot?.id ?? block.id, x: obj.position.x, z: obj.position.z, facing: obj.rotation.y, width, depth }];
        piece = { key: 'm-' + block.id, blockId: block.id, kind, object: obj, lots: footprint, chimneys: [], signature };
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
            height: new THREE.Box3().setFromObject(house).max.y,
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
      seed,
    );
  }, [pieces, smoke, seed]);

  useEffect(() => {
    // Free blocks that left the scene because the layout was regenerated (merged away or split).
    // Pieces rebuilt in place were disposed when replaced; here only blocks whose id is gone are freed.
    const liveIds = new Set(pieces.map((p) => p.blockId));
    for (const [id, p] of cache) {
      if (liveIds.has(id)) continue;
      cache.delete(id);
      disposePiece(p);
    }
    previous.current = pieces;
  }, [pieces, cache]);

  return pieces;
}
