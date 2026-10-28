// Selection and hover highlight (REVIEW-01 C-3, task 4.2).
// A footprint outline, a soft translucent ground decal and, for houses, a thin bounding frame; a ring for trees.
// Two slots only (selected, hovered): a few line segments and one transparent mesh each, no shadows,
// no post-processing. Geometry is rebuilt only when the target or its placement changes.
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { SIDEWALK_OVERLAY_Y } from '../streets/surfaces';
import {
  buildHighlightGeometry,
  resolveHighlights,
  shapeFor,
  type HighlightShape,
  type SelectionBlock,
  type SelectionTarget,
  type SelectionTree,
} from './selectionMath';

const ACCENT = '#e8833a';
/** Decals sit 1.5 cm above the sidewalk overlay (0.165), 3 cm above the sidewalk (0.15). */
const LIFT_Y = SIDEWALK_OVERLAY_Y + 0.015;
const RENDER_ORDER = 20;

export interface SelectionProps {
  /** Town pieces: BlockPiece[] fits as is (monument pieces must carry one footprint entry in lots). */
  blocks: readonly SelectionBlock[];
  trees: readonly SelectionTree[];
  selected: SelectionTarget | null;
  hovered: SelectionTarget | null;
}

interface HighlightProps {
  shape: HighlightShape | null;
  strong: boolean;
}

function Highlight({ shape, strong }: HighlightProps) {
  const fillMat = useRef<THREE.MeshBasicMaterial>(null);

  const geos = useMemo(() => {
    if (!shape) return null;
    const g = buildHighlightGeometry(shape, LIFT_Y);
    const lines = new THREE.BufferGeometry();
    lines.setAttribute('position', new THREE.Float32BufferAttribute(g.lines, 3));
    const fill = new THREE.BufferGeometry();
    fill.setAttribute('position', new THREE.Float32BufferAttribute(g.fill.positions, 3));
    fill.setIndex(g.fill.indices);
    return { lines, fill };
  }, [shape]);

  useEffect(
    () => () => {
      geos?.lines.dispose();
      geos?.fill.dispose();
    },
    [geos],
  );

  const baseFill = strong ? 0.3 : 0.14;
  useFrame(({ clock }) => {
    // Gentle pulse on the selected decal only.
    if (strong && fillMat.current) fillMat.current.opacity = baseFill + Math.sin(clock.elapsedTime * 3) * 0.06;
  });

  if (!geos) return null;
  return (
    <group renderOrder={RENDER_ORDER}>
      <mesh geometry={geos.fill} renderOrder={RENDER_ORDER} frustumCulled={false}>
        <meshBasicMaterial
          ref={fillMat}
          color={ACCENT}
          transparent
          opacity={baseFill}
          depthWrite={false}
          toneMapped={false}
          side={THREE.DoubleSide}
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-2}
        />
      </mesh>
      <lineSegments geometry={geos.lines} renderOrder={RENDER_ORDER + 1} frustumCulled={false}>
        <lineBasicMaterial color={ACCENT} transparent opacity={strong ? 1 : 0.6} depthWrite={false} toneMapped={false} />
      </lineSegments>
    </group>
  );
}

export function Selection({ blocks, trees, selected, hovered }: SelectionProps) {
  const gl = useThree((s) => s.gl);
  const resolved = resolveHighlights(selected, hovered);
  const selectedShape = useMemo(() => shapeFor(resolved.selected, blocks, trees), [resolved.selected, blocks, trees]);
  const hoverShape = useMemo(() => shapeFor(resolved.hovered, blocks, trees), [resolved.hovered, blocks, trees]);

  // Pointer cursor over anything selectable (the hovered target exists in the scene).
  const overSelectable = hovered !== null && (hoverShape !== null || selectedShape !== null);
  useEffect(() => {
    const el = gl.domElement;
    el.style.cursor = overSelectable ? 'pointer' : '';
    return () => {
      el.style.cursor = '';
    };
  }, [gl, overSelectable]);

  return (
    <>
      <Highlight shape={hoverShape} strong={false} />
      <Highlight shape={selectedShape} strong />
    </>
  );
}
