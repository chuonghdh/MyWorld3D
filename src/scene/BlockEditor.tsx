// Block editor in the scene: tracks the edit mode from the camera height, picks blocks with one tap when the camera
// is high (BLOCK_EDIT_HEIGHT_M), draws the selected block, the hovered block and the merge suggestion boxes, and
// keeps the DOM buttons of the overlay (src/ui/BlockEditOverlay.tsx) over their blocks.
//
// Picking: one invisible plane above every roof (PICK_Y) covering the town, mounted only in block mode. It is the
// first thing a tap ray hits, stops the event (so houses and trees do not react), and the ray is then intersected
// with the ground to find the block. Nothing here allocates in the frame loop.
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useWorldStore } from '../store';
import { uiCamera } from '../config/tuning';
import { editModeForHeight } from './cameraMath';
import { blockAnchors, ANCHOR_SLOTS } from './blockEditAnchors';
import { blockAt, rectIndexAt, type EditLayout, type EditRect } from './blockEditMath';
import { buildHighlightGeometry } from './selectionMath';

/** Height of the pick plane (uiCamera.pickHeightM): above the tallest building, below the block-mode camera. */
const PICK_Y = uiCamera.pickHeightM;
/** Decals float this high (uiCamera.decalHeightM) and ignore depth, so they read over the roofs like a map overlay. */
const DECAL_Y = uiCamera.decalHeightM;
const RENDER_ORDER = 30;
/** A press that moved further than this (px, uiCamera.tapSlopPx) was an orbit drag, not a tap. */
const TAP_SLOP_PX = uiCamera.tapSlopPx;
const SELECT_COLOR = '#e8833a';
const SUGGEST_COLOR = '#4fc3b0';

const GROUND = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

function RectDecal({ rect, color, fill, line }: { rect: EditRect; color: string; fill: number; line: number }) {
  const geos = useMemo(() => {
    const g = buildHighlightGeometry(
      {
        kind: 'rect',
        rect: { x: (rect.minX + rect.maxX) / 2, z: (rect.minZ + rect.maxZ) / 2, facing: 0, width: rect.maxX - rect.minX, depth: rect.maxZ - rect.minZ },
        height: 0,
      },
      DECAL_Y,
    );
    const lines = new THREE.BufferGeometry();
    lines.setAttribute('position', new THREE.Float32BufferAttribute(g.lines, 3));
    const area = new THREE.BufferGeometry();
    area.setAttribute('position', new THREE.Float32BufferAttribute(g.fill.positions, 3));
    area.setIndex(g.fill.indices);
    return { lines, area };
  }, [rect.minX, rect.maxX, rect.minZ, rect.maxZ]);
  useEffect(() => () => {
    geos.lines.dispose();
    geos.area.dispose();
  }, [geos]);
  return (
    <group>
      <mesh geometry={geos.area} renderOrder={RENDER_ORDER} frustumCulled={false}>
        <meshBasicMaterial color={color} transparent opacity={fill} depthTest={false} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      <lineSegments geometry={geos.lines} renderOrder={RENDER_ORDER + 1} frustumCulled={false}>
        <lineBasicMaterial color={color} transparent opacity={line} depthTest={false} depthWrite={false} toneMapped={false} />
      </lineSegments>
    </group>
  );
}

export interface BlockEditorProps {
  layout: EditLayout & { townBounds: EditRect };
  /** Block mode and no other tap tool (Move blocks) active. */
  pickEnabled: boolean;
  /** Bounds of the selected house or merged block, or null. */
  selectedRect: EditRect | null;
  /** Suggestion boxes (null entries are skipped). */
  suggestionRects: readonly (EditRect | null)[];
  /** A tap at a ground point that is not on a suggestion box. */
  onTapGround: (x: number, z: number) => void;
  /** A tap on suggestion box `index`. */
  onApplySuggestion: (index: number) => void;
}

export function BlockEditor({ layout, pickEnabled: pickAllowed, selectedRect, suggestionRects, onTapGround, onApplySuggestion }: BlockEditorProps) {
  // Picking stops while a film is recorded: the picture must not change under the recorder.
  const filming = useWorldStore((s) => s.toggles.filming);
  const pickEnabled = pickAllowed && !filming;
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const lastMode = useRef<string>('');
  const ndc = useRef(new THREE.Vector3());
  const hit = useRef(new THREE.Vector3());
  const [hovered, setHovered] = useState<EditRect | null>(null);

  useFrame(() => {
    // Edit mode follows the camera height; the store is written only when the mode changes.
    const mode = editModeForHeight(camera.position.y);
    if (mode !== lastMode.current) {
      lastMode.current = mode;
      useWorldStore.getState().setEditMode(mode);
    }
    // Keep the DOM buttons over their ground points.
    const w = gl.domElement.clientWidth;
    const h = gl.domElement.clientHeight;
    for (let i = 0; i < ANCHOR_SLOTS; i++) {
      const a = blockAnchors[i];
      if (!a.el) continue;
      const v = ndc.current.set(a.x, 0, a.z).project(camera);
      const visible = v.z < 1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2;
      if (visible !== a.shown) {
        a.el.style.visibility = visible ? 'visible' : 'hidden';
        a.shown = visible;
      }
      if (!visible) continue;
      const sx = ((v.x + 1) / 2) * w;
      const sy = ((1 - v.y) / 2) * h;
      if (Math.abs(sx - a.sx) < 0.5 && Math.abs(sy - a.sy) < 0.5) continue;
      a.sx = sx;
      a.sy = sy;
      a.el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -50%)`;
    }
  });

  useEffect(() => {
    if (!pickEnabled) setHovered(null);
  }, [pickEnabled]);

  const ground = (e: ThreeEvent<PointerEvent | MouseEvent>) => (e.ray.intersectPlane(GROUND, hit.current) ? hit.current : null);

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > TAP_SLOP_PX) return;
    const p = ground(e);
    if (!p) return;
    const i = rectIndexAt(suggestionRects, p.x, p.z);
    if (i >= 0) onApplySuggestion(i);
    else onTapGround(p.x, p.z);
  };

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const p = ground(e);
    const b = p ? blockAt(layout, p.x, p.z) : null;
    const next = b ? b.bounds : null;
    setHovered((prev) => (prev === next ? prev : next));
  };

  useEffect(() => {
    const el = gl.domElement;
    el.style.cursor = pickEnabled && hovered ? 'pointer' : '';
  }, [gl, pickEnabled, hovered]);

  const tb = layout.townBounds;
  const margin = 20;
  return (
    <>
      {pickEnabled && (
        <mesh
          position={[(tb.minX + tb.maxX) / 2, PICK_Y, (tb.minZ + tb.maxZ) / 2]}
          rotation={[-Math.PI / 2, 0, 0]}
          onClick={onClick}
          onPointerMove={onMove}
          onPointerOut={() => setHovered(null)}
        >
          <planeGeometry args={[tb.maxX - tb.minX + margin * 2, tb.maxZ - tb.minZ + margin * 2]} />
          <meshBasicMaterial colorWrite={false} depthWrite={false} depthTest={false} transparent opacity={0} />
        </mesh>
      )}
      {pickEnabled && hovered && hovered !== selectedRect && <RectDecal rect={hovered} color="#ffffff" fill={0.08} line={0.45} />}
      {selectedRect && <RectDecal rect={selectedRect} color={SELECT_COLOR} fill={0.22} line={1} />}
      {suggestionRects.map((r, i) => (r ? <RectDecal key={i} rect={inset(r, 1.5)} color={SUGGEST_COLOR} fill={0.32} line={0.95} /> : null))}
    </>
  );
}

function inset(r: EditRect, d: number): EditRect {
  return { minX: r.minX + d, maxX: r.maxX - d, minZ: r.minZ + d, maxZ: r.maxZ - d };
}
