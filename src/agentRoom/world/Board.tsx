// Lead command board beside the hub: a kanban of real tasks on one CanvasTexture. Cards slide to their new column
// (eased in canvas space, redrawn only while something moves or changes). A ship-it bell on top rings on commits.
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Runtime } from '../runtime';
import { BOARD } from './office';
import { BOARD_PX, cardSlots, drawBoard, drawTicker, type Slot } from './boardCanvas';

/** City picture behind the board (public/ asset). Until it loads the board draws its dark background. */
const BOARD_PICTURE = '/agentRoom/city-board.webp';
import { tickerMessages } from './ticker';
import { dampK } from './cameraPresets';
import { agentRoom } from '../../config/tuning';

const FRAME = 0.06;
const DEPTH = 0.06;
const SCREEN_GAP = 0.004; // canvas plane in front of the frame face
const MAX_HZ = 20;
const SLIDE = 6;

export function Board({ rt }: { rt: Runtime }) {
  const canvas = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = BOARD_PX.w * 2;
    c.height = BOARD_PX.h * 2;
    return c;
  }, []);
  const tex = useMemo(() => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }, [canvas]);
  useEffect(() => () => tex.dispose(), [tex]);
  const pos = useRef(new Map<string, { x: number; y: number }>());
  const lastTasks = useRef<unknown>(null);
  const lastAgents = useRef<unknown>(null);
  const lastShip = useRef(-1);
  const acc = useRef(Infinity);
  const lastDraw = useRef(-Infinity);
  const picture = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    let alive = true;
    new THREE.ImageLoader().load(BOARD_PICTURE, (img) => {
      if (!alive) return;
      picture.current = img as HTMLImageElement;
      lastDraw.current = -Infinity; // redraw next frame with the picture
    });
    return () => {
      alive = false;
    };
  }, []);
  const slotsRef = useRef<Map<string, Slot> | null>(null);
  const ring = useRef<THREE.Mesh>(null);
  const ringAge = useRef(99);

  useFrame((_, dt) => {
    const s = rt.state;
    // Bell ring: an expanding, fading halo for 1.2 s after each new commit.
    if (s.shipped.count !== lastShip.current) {
      if (lastShip.current >= 0 && s.shipped.count > lastShip.current) ringAge.current = 0;
      lastShip.current = s.shipped.count;
    }
    ringAge.current += dt;
    if (ring.current) {
      const a = Math.min(1, ringAge.current / 1.2);
      ring.current.scale.setScalar(0.2 + a * 2.2);
      (ring.current.material as THREE.MeshBasicMaterial).opacity = (1 - a) * 0.9;
      ring.current.visible = a < 1;
    }
    acc.current += dt;
    // Card slides step at MAX_HZ; the ticker redraws at its own rate, timed by sim time (paused sim = still ticker).
    const slotsDue = acc.current >= 1 / MAX_HZ;
    const simNow = rt.world.now;
    const tickDue = simNow - lastDraw.current >= 1000 / agentRoom.boardTickerHz;
    if (!slotsDue && !tickDue) return;
    let moving = false;
    if (slotsDue) {
      const slots = cardSlots(s.tasks);
      moving = s.tasks !== lastTasks.current || s.agents !== lastAgents.current || ringAge.current < 0.05;
      lastAgents.current = s.agents;
      const k = dampK(SLIDE, acc.current);
      for (const [id, slot] of slots) {
        const p = pos.current.get(id);
        if (!p) {
          pos.current.set(id, { x: slot.x, y: slot.y - 40 });
          moving = true;
          continue;
        }
        const dx = slot.x - p.x;
        const dy = slot.y - p.y;
        if (Math.abs(dx) + Math.abs(dy) > 0.5) {
          p.x += dx * k;
          p.y += dy * k;
          moving = true;
        } else {
          p.x = slot.x;
          p.y = slot.y;
        }
      }
      acc.current = 0;
      slotsRef.current = slots;
    }
    if (!moving && !tickDue) return;
    const slots = slotsRef.current;
    const g = canvas.getContext('2d');
    if (!g || !slots) return;
    if (moving) lastTasks.current = s.tasks;
    g.setTransform(2, 0, 0, 2, 0, 0);
    drawBoard(g, s.tasks, pos.current, slots, s.shipped, rt.source, Object.values(s.agents), picture.current);
    drawTicker(g, tickerMessages(Object.values(s.agents), s.tasks, s.shipped), simNow, agentRoom.boardTickerPxPerSec);
    lastDraw.current = simNow;
    tex.needsUpdate = true;
  });

  const y = BOARD.bottom + BOARD.h / 2;
  return (
    <group position={[BOARD.x, 0, BOARD.z]} rotation={[0, BOARD.yaw, 0]}>
      <mesh position={[0, y, -DEPTH / 2]} castShadow>
        <boxGeometry args={[BOARD.w + FRAME * 2, BOARD.h + FRAME * 2, DEPTH]} />
        <meshStandardMaterial color="#1a2230" metalness={0.4} roughness={0.4} />
      </mesh>
      <mesh position={[0, y, SCREEN_GAP]}>
        <planeGeometry args={[BOARD.w, BOARD.h]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (BOARD.w / 2 - 0.2), BOARD.bottom / 2, -DEPTH / 2]} castShadow>
          <boxGeometry args={[0.07, BOARD.bottom, 0.07]} />
          <meshStandardMaterial color="#263041" metalness={0.5} />
        </mesh>
      ))}
      {/* Ship-it bell on the frame top, and its ring halo. */}
      <mesh position={[BOARD.w / 2 - 0.25, BOARD.bottom + BOARD.h + FRAME + 0.13, -DEPTH / 2]}>
        <coneGeometry args={[0.13, 0.22, 20, 1, true]} />
        <meshStandardMaterial color="#d9a441" metalness={0.8} roughness={0.25} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={ring} position={[BOARD.w / 2 - 0.25, BOARD.bottom + BOARD.h + FRAME + 0.13, 0.02]} visible={false}>
        <torusGeometry args={[0.25, 0.02, 8, 40]} />
        <meshBasicMaterial color="#f2b46a" transparent depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}
