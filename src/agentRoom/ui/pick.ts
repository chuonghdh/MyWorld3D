// Pointer picking for 3D objects: hover, and click = pointer down/up within a small move (drag stays orbit).
import type { ThreeEvent } from '@react-three/fiber';
import type { AgentId } from '../model/types';
import { useUi } from './uiStore';

export const CLICK_TOLERANCE_PX = 5;

/** True when the pointer moved at most `tol` px between down and up (pure). */
export function isClick(down: { x: number; y: number } | null, up: { x: number; y: number }, tol = CLICK_TOLERANCE_PX): boolean {
  return !!down && Math.hypot(up.x - down.x, up.y - down.y) <= tol;
}

let downAt: { x: number; y: number } | null = null;

/** Mesh event props; `resolve` maps the event (instanceId for instanced meshes) to an agent. */
export function pickHandlers(resolve: (e: ThreeEvent<PointerEvent>) => AgentId | null) {
  return {
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      const id = resolve(e);
      if (!id) return;
      e.stopPropagation();
      useUi.getState().set({ hovered: id });
      document.body.style.cursor = 'pointer';
    },
    onPointerOut: (e: ThreeEvent<PointerEvent>) => {
      const id = resolve(e);
      if (useUi.getState().hovered === id) useUi.getState().set({ hovered: null });
      document.body.style.cursor = '';
    },
    onPointerDown: (e: ThreeEvent<PointerEvent>) => {
      downAt = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY };
    },
    onPointerUp: (e: ThreeEvent<PointerEvent>) => {
      const id = resolve(e);
      if (!id || !isClick(downAt, { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY })) return;
      e.stopPropagation();
      downAt = null;
      useUi.getState().select(id, true);
    },
  };
}

/** Canvas wrapper onPointerDown: remember where every press started (meshes and empty space). */
export function recordDown(e: { clientX: number; clientY: number }): void {
  downAt = { x: e.clientX, y: e.clientY };
}

/** Canvas onPointerMissed: a real click on empty space clears the selection; a drag does not. */
export function onMissed(e: MouseEvent): void {
  if (e.type === 'click' && isClick(downAt, { x: e.clientX, y: e.clientY })) {
    useUi.getState().set({ selected: null, followId: null });
  }
  downAt = null;
}
